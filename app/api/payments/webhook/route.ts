import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const MAX_WEBHOOK_BYTES = 256 * 1024;

/**
 * Paystack's signature is calculated over the exact raw request body.
 * Keep this route as a byte-preserving proxy; Rust owns verification and event
 * processing so payout, refund, wallet and premium state changes share one API.
 */
export async function POST(req: NextRequest) {
  const rustBackend = process.env.RUST_BACKEND_URL?.trim().replace(/\/+$/, '');
  if (!rustBackend) {
    return NextResponse.json(
      { success: false, error: 'Webhook processing is not configured.' },
      { status: 503 }
    );
  }

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Webhook payload is too large.' },
      { status: 413 }
    );
  }

  try {
    const rawBody = await req.arrayBuffer();
    if (rawBody.byteLength > MAX_WEBHOOK_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Webhook payload is too large.' },
        { status: 413 }
      );
    }

    const signature = req.headers.get('x-paystack-signature');
    const headers = new Headers({
      'Content-Type': req.headers.get('content-type') || 'application/json',
      Accept: 'application/json',
    });
    if (signature) headers.set('x-paystack-signature', signature);

    const upstream = await fetch(`${rustBackend}/v1/payments/webhook`, {
      method: 'POST',
      headers,
      body: rawBody,
      cache: 'no-store',
    });

    const responseBody = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get('content-type');
    const retryAfter = upstream.headers.get('retry-after');
    const requestId = upstream.headers.get('x-request-id');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    if (retryAfter) responseHeaders.set('Retry-After', retryAfter);
    if (requestId) responseHeaders.set('X-Request-Id', requestId);

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error('Rust Paystack webhook proxy failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Webhook service is temporarily unavailable.' },
      { status: 502 }
    );
  }
}
