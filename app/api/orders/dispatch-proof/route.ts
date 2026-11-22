import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import {
  canSellerSubmitProof,
  createSubmittedDispatchProof,
  reviewDispatchProofState,
} from '@/lib/escrow/proofAndSplit';
import { sendPushToProfileIds } from '@/lib/push/server';
import { buildPushPayload } from '@/lib/push/payload';
import type { DispatchProof, OrderStatus } from '@/lib/types';

/**
 * Seller submits live pre-dispatch condition photo/video proof, and buyer
 * approves or requests a fresh proof clip before courier dispatch.
 *
 * POST {
 *   orderId: number,
 *   action: 'SUBMIT' | 'APPROVE' | 'REQUEST_CHANGES',
 *   mediaUrl?: string,
 *   mediaType?: 'image' | 'video',
 *   note?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`order:dispatch-proof:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Database admin client unavailable' }, { status: 503 });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (!profile?.id) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const orderId = Number(body.orderId);
    const action = String(body.action || '').toUpperCase();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ success: false, error: 'Valid orderId is required' }, { status: 400 });
    }

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_number, buyer_id, seller_id, status, dispatch_proof, product_title')
      .eq('id', orderId)
      .maybeSingle();

    if (orderErr || !order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    const actorId = Number(profile.id);
    const sellerId = Number(order.seller_id);
    const buyerId = Number(order.buyer_id);

    let nextProof: DispatchProof;

    if (action === 'SUBMIT') {
      if (actorId !== sellerId) {
        return NextResponse.json({ success: false, error: 'Only the seller can upload condition proof' }, { status: 403 });
      }
      if (!canSellerSubmitProof(String(order.status) as OrderStatus)) {
        return NextResponse.json({ success: false, error: 'Order is not in a pre-dispatch funded state' }, { status: 400 });
      }
      const mediaUrl = String(body.mediaUrl || '').trim();
      const mediaType = body.mediaType === 'video' ? 'video' : 'image';
      const note = typeof body.note === 'string' ? body.note : undefined;
      try {
        nextProof = createSubmittedDispatchProof({
          mediaUrl,
          mediaType,
          note,
          sellerId: actorId,
        });
      } catch (err) {
        return NextResponse.json(
          { success: false, error: err instanceof Error ? err.message : 'Invalid condition proof' },
          { status: 400 }
        );
      }
    } else if (action === 'APPROVE' || action === 'REQUEST_CHANGES') {
      if (actorId !== buyerId) {
        return NextResponse.json({ success: false, error: 'Only the buyer can review condition proof' }, { status: 403 });
      }
      try {
        nextProof = reviewDispatchProofState(
          order.dispatch_proof as DispatchProof | undefined,
          action === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED',
          actorId,
          typeof body.note === 'string' ? body.note : undefined
        );
      } catch (err) {
        return NextResponse.json(
          { success: false, error: err instanceof Error ? err.message : 'Cannot review proof' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    }

    const { error: updateErr } = await admin
      .from('orders')
      .update({
        dispatch_proof: nextProof,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 400 });
    }

    const orderNum = String(order.order_number || `#${orderId}`);
    if (action === 'SUBMIT') {
      void sendPushToProfileIds({
        profileIds: [buyerId],
        category: 'escrow',
        payload: {
          ...buildPushPayload({
            kind: 'ESCROW_STATUS',
            orderNumber: orderNum,
            status: 'SHIPPED',
            recipientRole: 'buyer',
          }),
          title: `Condition proof ready — ${orderNum}`,
          body: 'Seller uploaded live pre-dispatch proof. Inspect and approve before courier pickup.',
          tag: `dispatch-proof-${orderNum}`,
        },
      }).catch(() => {});
    } else if (action === 'APPROVE') {
      void sendPushToProfileIds({
        profileIds: [sellerId],
        category: 'escrow',
        payload: {
          ...buildPushPayload({
            kind: 'ESCROW_STATUS',
            orderNumber: orderNum,
            status: 'DELIVERY_CONFIRMED',
            recipientRole: 'seller',
          }),
          title: `Dispatch proof approved — ${orderNum}`,
          body: 'Buyer approved your pre-dispatch condition proof. Ready for handover.',
          tag: `dispatch-proof-${orderNum}`,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, dispatchProof: nextProof });
  } catch (error) {
    logger.error('Dispatch proof error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Dispatch proof action failed') },
      { status: 500 }
    );
  }
}
