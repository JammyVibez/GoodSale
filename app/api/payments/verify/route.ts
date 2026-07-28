import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/env';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

/**
 * Verify a Paystack transaction server-side before releasing escrow / crediting wallets.
 * POST { reference: string }
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
    if (!reference || reference.length > 128) {
      return NextResponse.json({ success: false, error: 'Valid reference is required' }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;

    // Demo-only mock acceptance when Paystack is not configured
    if (!secret) {
      if (!isDemoMode()) {
        return NextResponse.json(
          { success: false, error: 'Paystack is not configured' },
          { status: 503 }
        );
      }
      if (!reference.startsWith('DEMO_') && !reference.startsWith('PAY_REF_')) {
        return NextResponse.json(
          { success: false, error: 'Invalid demo payment reference' },
          { status: 400 }
        );
      }
      logger.info('Demo payment accepted without Paystack verify', { reference });
      return NextResponse.json({
        success: true,
        demo: true,
        data: {
          status: 'success',
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

    return NextResponse.json({
      success: true,
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
