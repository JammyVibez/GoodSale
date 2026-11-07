import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: 'Supabase not configured', status: 503 as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const admin = createAdminClient();
  if (!admin) return { error: 'Server not configured', status: 503 as const };
  const { data: profile } = await admin.from('profiles').select('id,role').eq('auth_id', user.id).maybeSingle();
  if (!profile || !['ADMIN', 'SUPER_ADMIN'].includes(String(profile.role))) {
    return { error: 'Admin only', status: 403 as const };
  }
  return { admin, profile };
}

/** GET /api/admin/claims — protection claims for review. */
export async function GET() {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    const { data, error } = await ctx.admin
      .from('buyer_protection_claims')
      .select('id,reference,order_id,buyer_id,reason,status,resolution,reviewed_at,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, claims: data || [] });
  } catch (error) {
    logger.error('Admin protection claims failed', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not load claims') }, { status: 500 });
  }
}

/** POST /api/admin/claims { claimId, status, resolution } */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`admin:claims:${ip}`, 30, 60_000);
    if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many attempts' }, { status: 429 });

    const ctx = await requireAdmin();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const body = await req.json().catch(() => ({}));
    const claimId = Number(body.claimId);
    const status = String(body.status || '').toUpperCase();
    const resolution = String(body.resolution || '').trim().slice(0, 1000);
    if (!Number.isInteger(claimId) || !['REVIEWING', 'APPROVED', 'REJECTED', 'CLOSED'].includes(status)) {
      return NextResponse.json({ success: false, error: 'Valid claim decision required' }, { status: 400 });
    }
    if ((status === 'APPROVED' || status === 'REJECTED') && resolution.length < 5) {
      return NextResponse.json({ success: false, error: 'Add a decision note' }, { status: 400 });
    }
    const { data: claim } = await ctx.admin
      .from('buyer_protection_claims')
      .select('id,buyer_id,order_id,reference')
      .eq('id', claimId)
      .maybeSingle();
    if (!claim) return NextResponse.json({ success: false, error: 'Claim not found' }, { status: 404 });

    const { error } = await ctx.admin
      .from('buyer_protection_claims')
      .update({
        status,
        resolution,
        reviewed_by: ctx.profile.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimId);
    if (error) throw new Error(error.message);

    await ctx.admin.from('notifications').insert({
      user_id: claim.buyer_id,
      title: 'GoodSale Protect claim updated',
      message: `${claim.reference}: ${status.toLowerCase()}${resolution ? ` — ${resolution}` : ''}`,
      type: 'ESCROW',
      is_read: false,
    });
    await ctx.admin.from('audit_logs').insert({
      user_id: ctx.profile.id,
      action: 'REVIEW_BUYER_PROTECTION_CLAIM',
      entity_type: 'ORDER',
      entity_id: claim.order_id,
      details: `${claim.reference}: ${status} ${resolution}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Admin claim decision failed', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not update claim') }, { status: 500 });
  }
}
