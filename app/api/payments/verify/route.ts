import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/env';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { reconcilePaystackPayment } from '@/lib/data/payments';

/**
 * Verify a Paystack transaction server-side, then mark the related order paid.
 * POST { reference: string, orderId?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`paystack:verify:${ip}`, 20, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many verification attempts' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
    const orderId = body.orderId != null ? Number(body.orderId) : null;
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
      : null;
    if (!reference || reference.length > 128) {
      return NextResponse.json({ success: false, error: 'Valid reference is required' }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      if (!isDemoMode()) {
        return NextResponse.json(
          { success: false, error: 'Paystack is not configured' },
          { status: 503 }
        );
      }
      if (
        !reference.startsWith('DEMO_') &&
        !reference.startsWith('PAY_REF_') &&
        !/^GS_\d+_/i.test(reference)
      ) {
        return NextResponse.json(
          { success: false, error: 'Invalid demo payment reference' },
          { status: 400 }
        );
      }
      if (!orderId && !(orderIds && orderIds.length)) {
        return NextResponse.json(
          { success: false, error: 'orderId is required to reconcile payment' },
          { status: 400 }
        );
      }
      const reconciliation = await reconcilePaystackPayment({
        orderId,
        orderIds,
        reference,
        amountKobo: null,
        channel: 'demo',
      });

      return NextResponse.json({
        success: Boolean(reconciliation.reconciled),
        demo: true,
        reconciliation,
        data: {
          status: reconciliation.reconciled ? 'success' : 'failed',
          reference,
          amount: null,
          currency: 'NGN',
          paid_at: new Date().toISOString(),
        },
      });
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    const payload = await verifyRes.json();
    if (!verifyRes.ok || !payload?.status || payload?.data?.status !== 'success') {
      logger.warn('Paystack verification failed', {
        reference,
        status: payload?.data?.status,
      });
      return NextResponse.json(
        { success: false, error: 'Payment could not be verified' },
        { status: 402 }
      );
    }

    const metaOrderId =
      orderId ||
      Number(payload.data?.metadata?.order_id || payload.data?.metadata?.orderId || 0) ||
      null;
    const metaOrderIdsRaw = String(payload.data?.metadata?.order_ids || '');
    const metaOrderIds = metaOrderIdsRaw
      ? metaOrderIdsRaw.split(',').map((s: string) => Number(s.trim())).filter((n: number) => n > 0)
      : orderIds;

    const reconciliation = await reconcilePaystackPayment({
      orderId: metaOrderId,
      orderIds: metaOrderIds,
      reference: payload.data.reference,
      amountKobo: payload.data.amount,
      channel: payload.data.channel,
      customerEmail: payload.data.customer?.email,
    });

    return NextResponse.json({
      success: Boolean(reconciliation.reconciled),
      reconciliation,
      data: {
        status: payload.data.status,
        reference: payload.data.reference,
        amount: payload.data.amount,
        currency: payload.data.currency,
        paid_at: payload.data.paid_at,
        channel: payload.data.channel,
        customer: payload.data.customer?.email,
      },
    });
  } catch (error) {
    logger.error('Paystack verify error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Verification failed') },
      { status: 500 }
    );
  }
}
