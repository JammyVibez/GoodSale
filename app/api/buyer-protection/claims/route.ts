import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { profileIdForAuth } from '@/lib/wallet/server';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

const ELIGIBLE = ['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'PARTIAL_DEPOSIT_PAID', 'DELIVERED_SUCCESS'];

async function context() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: 'Supabase not configured', status: 503 as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const admin = createAdminClient();
  if (!admin) return { error: 'Server not configured', status: 503 as const };
  const profileId = await profileIdForAuth(admin, user.id);
  if (!profileId) return { error: 'Profile not found', status: 404 as const };
  return { admin, profileId };
}

/** GET /api/buyer-protection/claims — buyer's own claims (admins also allowed). */
export async function GET() {
  try {
    const ctx = await context();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    const { data, error } = await ctx.admin
      .from('buyer_protection_claims')
      .select('id,reference,order_id,reason,status,resolution,created_at,updated_at')
      .eq('buyer_id', ctx.profileId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, claims: data || [] });
  } catch (error) {
    logger.error('Protection claims lookup failed', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not load claims') }, { status: 500 });
  }
}

/** POST /api/buyer-protection/claims { orderId, reason } — file a paid Protect claim. */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`buyer:protect:${ip}`, 6, 60_000);
    if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many claim attempts' }, { status: 429 });

    const ctx = await context();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const body = await req.json().catch(() => ({}));
    const orderId = Number(body.orderId);
    const reason = String(body.reason || '').trim();
    if (!Number.isInteger(orderId) || orderId <= 0 || reason.length < 15) {
      return NextResponse.json({ success: false, error: 'Order and a 15+ character claim reason are required' }, { status: 400 });
    }

    const { data: order } = await ctx.admin
      .from('orders')
      .select('id,order_number,buyer_id,seller_id,status,has_good_sale_protect')
      .eq('id', orderId)
      .maybeSingle();
    if (!order || Number(order.buyer_id) !== ctx.profileId) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }
    if (!order.has_good_sale_protect) {
      return NextResponse.json({ success: false, error: 'GoodSale Protect was not purchased for this order' }, { status: 400 });
    }
    if (!ELIGIBLE.includes(String(order.status))) {
      return NextResponse.json({ success: false, error: 'This order is not eligible for a protection claim' }, { status: 400 });
    }

    const { data: existing } = await ctx.admin
      .from('buyer_protection_claims')
      .select('id')
      .eq('order_id', orderId)
      .in('status', ['OPEN', 'REVIEWING'])
      .maybeSingle();
    if (existing) return NextResponse.json({ success: false, error: 'A claim is already under review' }, { status: 409 });

    const reference = `GSPC-${Date.now()}-${orderId}`;
    const { data: claim, error } = await ctx.admin
      .from('buyer_protection_claims')
      .insert({ reference, order_id: orderId, buyer_id: ctx.profileId, reason })
      .select('id,reference,status,created_at')
      .single();
    if (error || !claim) throw new Error(error?.message || 'Could not create claim');

    await ctx.admin.from('notifications').insert([
      {
        user_id: ctx.profileId,
        title: 'GoodSale Protect claim received',
        message: `Claim ${reference} is under priority review. The seller has been notified and escrow remains protected.`,
        type: 'ESCROW',
        is_read: false,
      },
      {
        user_id: order.seller_id,
        title: 'GoodSale Protect claim opened',
        message: `Buyer opened claim ${reference} on ${order.order_number}. Review the evidence and respond through support.`,
        type: 'ESCROW',
        is_read: false,
      },
    ]);
    await ctx.admin.from('audit_logs').insert({
      user_id: ctx.profileId,
      action: 'OPEN_BUYER_PROTECTION_CLAIM',
      entity_type: 'ORDER',
      entity_id: orderId,
      details: `${reference}: ${reason.slice(0, 300)}`,
    });

    return NextResponse.json({ success: true, claim });
  } catch (error) {
    logger.error('Protection claim failed', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not file claim') }, { status: 500 });
  }
}
