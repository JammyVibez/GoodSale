import { describe, expect, it } from 'vitest';
import { premiumPaymentReference, resolvePremiumPrice } from '../../lib/premium/server';

const settings = {
  verified_plus_price: 10_000,
  sub_pro_price: 15_000,
  sub_premium_price: 35_000,
  sub_enterprise_price: 85_000,
  premium_duration_days: 30,
};

describe('premium pricing', () => {
  it('uses the admin-configured Verified+ price and duration', () => {
    expect(resolvePremiumPrice(settings, 'VERIFIED_PLUS')).toEqual({
      amount: 10_000,
      durationDays: 30,
    });
  });

  it('resolves each Business plan from the settings row', () => {
    expect(resolvePremiumPrice(settings, 'BUSINESS', 'PRO')).toEqual({
      amount: 15_000,
      durationDays: 30,
    });
    expect(resolvePremiumPrice(settings, 'BUSINESS', 'PREMIUM')).toEqual({
      amount: 35_000,
      durationDays: 30,
    });
    expect(resolvePremiumPrice(settings, 'BUSINESS', 'ENTERPRISE')).toEqual({
      amount: 85_000,
      durationDays: 30,
    });
  });

  it('rejects unknown plans and non-positive prices', () => {
    expect(resolvePremiumPrice(settings, 'BUSINESS', 'FREE')).toEqual({
      error: 'Choose a valid Business plan',
    });
    expect(resolvePremiumPrice({ ...settings, verified_plus_price: 0 }, 'VERIFIED_PLUS')).toEqual({
      error: 'This membership is not available for purchase right now',
    });
  });

  it('creates distinct provider-safe premium references', () => {
    const first = premiumPaymentReference(42);
    const second = premiumPaymentReference(42);
    expect(first.startsWith('GSP_42_')).toBe(true);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThan(128);
  });
});
