import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { logger, publicErrorMessage } from '@/lib/logger';

/**
 * Paystack webhook receiver.
 * Configure the URL in Paystack dashboard: https://your-domain/api/payments/webhook
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-paystack-signature') || '';
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      logger.error('Paystack webhook received but no secret configured');
      return NextResponse.json({ success: false, error: 'Webhook not configured' }, { status: 503 });
    }

    const hash = createHmac('sha512', secret).update(rawBody).digest('hex');
    const hashBuf = Buffer.from(hash);
    const sigBuf = Buffer.from(signature);

    if (hashBuf.length !== sigBuf.length || !timingSafeEqual(hashBuf, sigBuf)) {
      logger.warn('Invalid Paystack webhook signature');
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    logger.info('Paystack webhook event', {
      event: event?.event,
      reference: event?.data?.reference,
    });

    // Persist / reconcile escrow status here when domain APIs replace the demo store.
    // Acknowledge quickly so Paystack does not retry aggressively.
    return NextResponse.json({ success: true, received: true });
  } catch (error) {
    logger.error('Paystack webhook error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Webhook failed') },
      { status: 500 }
    );
  }
}
