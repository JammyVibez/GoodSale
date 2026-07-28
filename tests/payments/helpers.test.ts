import { describe, expect, it } from 'vitest';
import {
  buildPaystackReference,
  parseOrderIdFromReference,
  amountsMatchNaira,
  computeEscrowFee,
  isPayableOrderStatus,
  isAlreadyPaidStatus,
  isTerminalOrderStatus,
} from '../../lib/payments/helpers';

describe('Paystack reference helpers', () => {
  it('builds GS_<orderId>_... references', () => {
    const ref = buildPaystackReference(42, 1_700_000_000_000, 0.123456);
    expect(ref.startsWith('GS_42_')).toBe(true);
    expect(parseOrderIdFromReference(ref)).toBe(42);
  });

  it('rejects invalid order ids', () => {
    expect(() => buildPaystackReference(0)).toThrow(/orderId/);
  });

  it('parses only GS_<id>_ patterns (not timestamps alone)', () => {
    expect(parseOrderIdFromReference('GS_99_abc')).toBe(99);
    expect(parseOrderIdFromReference('PAY_REF_123')).toBeNull();
    expect(parseOrderIdFromReference('')).toBeNull();
  });
});

describe('amount matching', () => {
  it('allows ₦1 tolerance', () => {
    expect(amountsMatchNaira(10000, 1_000_000)).toBe(true);
    expect(amountsMatchNaira(10000, 1_000_050)).toBe(true);
    expect(amountsMatchNaira(10000, 1_001_000)).toBe(false);
  });

  it('treats null amount as match (demo)', () => {
    expect(amountsMatchNaira(5000, null)).toBe(true);
  });
});

describe('escrow fee math', () => {
  it('applies percentage with min/max clamps', () => {
    const small = computeEscrowFee(1000, { pct: 1.5, min: 100, max: 15000, deliveryFee: 0 });
    expect(small.fee).toBe(100);
    expect(small.payout).toBe(900);

    const mid = computeEscrowFee(1_000_000, { pct: 1.5, min: 100, max: 15000, deliveryFee: 6000 });
    expect(mid.fee).toBe(15000);
    expect(mid.payout).toBe(1_000_000 - 6000 - 15000);
  });
});

describe('order status gates', () => {
  it('classifies payable / paid / terminal statuses', () => {
    expect(isPayableOrderStatus('PENDING')).toBe(true);
    expect(isPayableOrderStatus('PAID_ESCROW')).toBe(false);
    expect(isAlreadyPaidStatus('SHIPPED')).toBe(true);
    expect(isTerminalOrderStatus('REFUNDED')).toBe(true);
    expect(isTerminalOrderStatus('DISPUTED')).toBe(false);
  });
});
