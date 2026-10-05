import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';

/** Redeems GoodPoints against the signed-in user's profile balance. */
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

    let cost = 0;
    let reason = 'Redeemed voucher reward';
    try {
      const body = (await request.json()) as { cost?: number; reason?: string };
      cost = Number(body?.cost);
      if (typeof body?.reason === 'string' && body.reason.trim()) reason = body.reason.trim();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!Number.isInteger(cost) || cost <= 0 || cost > 100000) {
      return NextResponse.json({ success: false, error: 'Invalid redemption cost' }, { status: 400 });
    }

    const { data: profileRow } = await admin
      .from('profiles')
      .select('id, good_points')
      .eq('auth_id', user.id)
      .maybeSingle();
    const profile = profileRow as { id: number; good_points: number | null } | null;
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    const balance = profile.good_points ?? 0;
    if (balance < cost) {
      return NextResponse.json(
        { success: false, error: `Insufficient GoodPoints. You need ${cost} GP.` },
        { status: 400 }
      );
    }

    const nextBalance = balance - cost;
    const { error: updateError } = await admin
      .from('profiles')
      .update({ good_points: nextBalance })
      .eq('id', profile.id);
    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 400 });
    }

    await admin.from('good_points_transactions').insert({
      user_id: profile.id,
      points: -cost,
      reason,
    });
    await admin.from('notifications').insert({
      user_id: profile.id,
      title: 'GoodPoints redeemed',
      message: `You redeemed ${cost} GoodPoints. Your reward is ready in Settings → GoodPoints.`,
      type: 'POINTS',
      is_read: false,
    });

    return NextResponse.json({ success: true, balance: nextBalance });
  } catch (error) {
    logger.error('GoodPoints redemption failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not redeem reward') },
      { status: 500 }
    );
  }
}
