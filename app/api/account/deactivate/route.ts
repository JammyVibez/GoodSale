import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';

/**
 * Toggles the signed-in user's `profiles.is_suspended` flag. Suspending hides
 * the profile from the marketplace; signing in and reactivating restores it.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const admin = createAdminClient();
    if (!supabase || !admin) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let suspended = true;
    try {
      const body = (await request.json()) as { suspended?: boolean };
      if (typeof body?.suspended === 'boolean') suspended = body.suspended;
    } catch {
      // default to suspending
    }

    const { error } = await admin
      .from('profiles')
      .update({ is_suspended: suspended })
      .eq('auth_id', user.id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, suspended });
  } catch (error) {
    logger.error('Account deactivation failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not update account status') },
      { status: 500 }
    );
  }
}
