import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

const REFUNDABLE = ['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'PARTIAL_DEPOSIT_PAID'];

/** POST { orderId, reason } — buyer asks for a refund; escrow stays frozen. */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`refund:request:${ip}`, 6, 60_000);
    if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const supabase = await createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const orderId = Number(body.orderId);
    const reason = String(body.reason || '').trim();
    if (!orderId || reason.length < 10) {
      return NextResponse.json({ success: false, error: 'Order and a 10+ character reason are required' }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 503 });

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle();
    if (!profile?.id) return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });

    const { data: order } = await admin
      .from('orders')
      .select('id, order_number, buyer_id, seller_id, total_amount, status')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    if (order.buyer_id !== profile.id) {
      return NextResponse.json({ success: false, error: 'Only the buyer can request this refund' }, { status: 403 });
    }
    if (!REFUNDABLE.includes(String(order.status))) {
      return NextResponse.json({ success: false, error: 'This order is not eligible for a refund request' }, { status: 400 });
    }

    const { data: existing } = await admin
      .from('refunds')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'PENDING')
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ success: false, error: 'A refund request is already under review' }, { status: 409 });
    }

    const { data: tx } = await admin
      .from('payment_transactions')
      .select('transaction_id')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: refund, error } = await admin
      .from('refunds')
      .insert({
        order_id: orderId,
        transaction_id: tx?.transaction_id || `REFUND-${order.order_number}`,
        amount: Number(order.total_amount || 0),
        reason,
        status: 'PENDING',
      })
      .select('id')
      .single();

    if (error || !refund) {
      logger.warn('refund insert failed', { error: error?.message, orderId });
      return NextResponse.json({ success: false, error: 'Could not record the refund request' }, { status: 500 });
    }

    await admin
      .from('orders')
      .update({ status: 'REFUND_REQUESTED', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    await admin.from('notifications').insert([
      {
        user_id: order.seller_id,
        title: 'Refund requested',
        message: `Buyer requested a refund on ${order.order_number}: ${reason}`,
        type: 'ESCROW',
        is_read: false,
      },
      {
        user_id: order.buyer_id,
        title: 'Refund request received',
        message: `Your refund request for ${order.order_number} is under review. Funds remain protected in escrow.`,
        type: 'ESCROW',
        is_read: false,
      },
    ]);

    return NextResponse.json({ success: true, refundId: refund.id });
  } catch (error) {
    logger.error('Refund request error', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not request refund') }, { status: 500 });
  }
}
