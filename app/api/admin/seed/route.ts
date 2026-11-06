import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import {
  deleteSeededProduct,
  getAdminProfile,
  listSeededCatalog,
  removeSeededCatalog,
  seedCatalog,
  setSeededPassword,
  updateSeededProduct,
  updateSeededSeller,
} from '@/lib/seed/db';

/**
 * Admin-only launch catalog API.
 *
 * GET  → the seeded sellers, their products/fields and the seed totals.
 * POST → { action } — create the seeded catalog, edit a seeded seller or
 *        product, delete a seeded product, reset a seeded account password, or
 *        remove every seeded row again.
 *
 * All writes go through the service-role client and are scoped to rows flagged
 * `is_seeded`, so a real seller's account or listing is never touched.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorize(): Promise<
  | { admin: NonNullable<ReturnType<typeof createAdminClient>> }
  | { response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { response: NextResponse.json({ error: 'Supabase not configured' }, { status: 503 }) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const profile = await getAdminProfile(supabase, user.id);
  if (!profile) {
    return { response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  const admin = createAdminClient();
  if (!admin) {
    return { response: NextResponse.json({ error: 'Service role key is not configured' }, { status: 503 }) };
  }
  return { admin };
}

export async function GET() {
  try {
    const auth = await authorize();
    if ('response' in auth) return auth.response;
    const snapshot = await listSeededCatalog(auth.admin);
    return NextResponse.json({ success: true, ...snapshot });
  } catch (error) {
    logger.error('Seeded catalog load failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load the seeded catalog') },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize();
    if ('response' in auth) return auth.response;
    const { admin } = auth;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || '');

    switch (action) {
      case 'seed': {
        const summary = await seedCatalog(admin, { force: Boolean(body.force) });
        const snapshot = await listSeededCatalog(admin);
        return NextResponse.json({ success: true, summary, ...snapshot });
      }

      case 'remove': {
        const removed = await removeSeededCatalog(admin);
        const snapshot = await listSeededCatalog(admin);
        return NextResponse.json({ success: true, removed, ...snapshot });
      }

      case 'update-seller': {
        const id = Number(body.id);
        if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
        const patch = (body.patch || {}) as Record<string, unknown>;
        const result = await updateSeededSeller(admin, id, patch);
        if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        const snapshot = await listSeededCatalog(admin);
        return NextResponse.json({ success: true, ...snapshot });
      }

      case 'update-product': {
        const id = Number(body.id);
        if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
        const patch = (body.patch || {}) as Record<string, unknown>;
        const result = await updateSeededProduct(admin, id, patch);
        if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        const snapshot = await listSeededCatalog(admin);
        return NextResponse.json({ success: true, ...snapshot });
      }

      case 'delete-product': {
        const id = Number(body.id);
        if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
        const result = await deleteSeededProduct(admin, id);
        if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        const snapshot = await listSeededCatalog(admin);
        return NextResponse.json({ success: true, ...snapshot });
      }

      case 'set-password': {
        const username = String(body.username || '');
        const password = String(body.password || '');
        const result = await setSeededPassword(admin, username, password);
        if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action || '(none)'}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('Seeded catalog action failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'The seeded catalog action failed') },
      { status: 500 }
    );
  }
}
