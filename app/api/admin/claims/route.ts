import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callRustInternalRpc } from '@/lib/server/rust-rpc';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimitAsync, clientIpFromRequest } from '@/lib/rate-limit';

async function adminContext() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: 'Supabase not configured', status: 503 as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const { data: profile } = await supabase.from('profiles').select('id,role').eq('auth_id', user.id).maybeSingle();
  if (!profile || !['ADMIN', 'SUPER_ADMIN'].includes(String(profile.role))) {
    return { error: 'Admin only', status: 403 as const };
  }
  const admin = createAdminClient();
  if (!admin) return { error: 'Claims service is not configured', status: 503 as const };
  return { supabase, admin, profile };
}

export async function GET() {
  try {
    const ctx = await adminContext();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    const { data, error } = process.env.RUST_BACKEND_URL
      ? await callRustInternalRpc<Record<string, unknown>[]>('admin_list_buyer_protection_claims')
      : await ctx.admin.rpc('admin_list_buyer_protection_claims');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: Number(error.code) || 503 });
    return NextResponse.json({ success: true, claims: data || [] });
  } catch (error) {
    logger.error('Admin protection claims failed', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not load claims') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimitAsync(`admin:claims:${clientIpFromRequest(req)}`, 30, 60_000);
    if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many attempts' }, { status: 429 });

    const ctx = await adminContext();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const body = await req.json().catch(() => null);
    const claimId = Number(body?.claimId);
    const status = String(body?.status || '').toUpperCase();
    const resolution = typeof body?.resolution === 'string' ? body.resolution.trim().slice(0, 1000) : '';
    if (!Number.isSafeInteger(claimId) || claimId <= 0 || !['REVIEWING', 'APPROVED', 'REJECTED', 'CLOSED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Valid claim decision required' }, { status: 400 });
    }
    if (['APPROVED', 'REJECTED'].includes(status) && resolution.length < 5) {
      return NextResponse.json({ success: false, error: 'Add a decision note' }, { status: 400 });
    }

    const args = { p_claim_id: claimId, p_status: status, p_resolution: resolution };
    const { data, error } = process.env.RUST_BACKEND_URL
      ? await callRustInternalRpc<{ success: boolean; claimId: number }>('admin_review_buyer_protection_claim', args)
      : await ctx.admin.rpc('admin_review_buyer_protection_claim', args);
    if (error || !data?.success) {
      const message = error?.message || 'Could not update claim';
      return NextResponse.json({ success: false, error: message }, { status: /not found/i.test(message) ? 404 : Number(error?.code) || 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin claim decision failed', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not update claim') }, { status: 500 });
  }
}
