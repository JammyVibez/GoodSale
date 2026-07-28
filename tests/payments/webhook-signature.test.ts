import { describe, expect, it } from 'vitest';
import { createHmac, timingSafeEqual } from 'crypto';

/** Mirrors webhook signature verification used by /api/payments/webhook */
function verifyPaystackSignature(rawBody: string, signature: string, secret: string): boolean {
  const hash = createHmac('sha512', secret).update(rawBody).digest('hex');
  const hashBuf = Buffer.from(hash);
  const sigBuf = Buffer.from(signature);
  if (hashBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(hashBuf, sigBuf);
}

describe('Paystack webhook signature', () => {
  it('accepts a valid HMAC-SHA512 signature', () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'GS_1_x', status: 'success' } });
    const secret = 'sk_test_secret';
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
  });

  it('rejects tampered bodies', () => {
    const body = JSON.stringify({ event: 'charge.success' });
    const secret = 'sk_test_secret';
    const signature = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyPaystackSignature(body + ' ', signature, secret)).toBe(false);
  });
});
