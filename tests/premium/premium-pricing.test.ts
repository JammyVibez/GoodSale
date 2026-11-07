import { describe, expect, it } from 'vitest';
import { premiumPaymentReference, resolvePremiumPrice } from '../../lib/premium/server';
import { koboToNaira, nairaToKobo } from '../../lib/productPricing';

const settings = {
  verified_plus_price: 2_500,
  sub_pro_price: 15_000,
  sub_premium_price: 12_500,
  sub_enterprise_price: 85_000,
  premium_duration_days: 30,
};

describe('premium pricing', () => {
  it('uses the admin-configured Verified+ price and duration', () => {
    expect(resolvePremiumPrice(settings, 'VERIFIED_PLUS')).toEqual({
      amount: 2_500,
      amountKobo: 250_000,
      durationDays: 30,
    });
  });

  it('resolves each Business plan from the settings row', () => {
    expect(resolvePremiumPrice(settings, 'BUSINESS', 'PRO')).toEqual({
      amount: 15_000,
      amountKobo: 1_500_000,
      durationDays: 30,
    });
    expect(resolvePremiumPrice(settings, 'BUSINESS', 'PREMIUM')).toEqual({
      amount: 12_500,
      amountKobo: 1_250_000,
      durationDays: 30,
    });
    expect(resolvePremiumPrice(settings, 'BUSINESS', 'ENTERPRISE')).toEqual({
      amount: 85_000,
      amountKobo: 8_500_000,
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

  it('converts Naira and kobo using integer provider amounts', () => {
    expect(nairaToKobo(2_500)).toBe(250_000);
    expect(nairaToKobo(12.34)).toBe(1_234);
    expect(koboToNaira(1_234)).toBe(12.34);
    expect(() => koboToNaira(1.5)).toThrow('integer number of kobo');
  });

  it('creates distinct provider-safe premium references', () => {
    const first = premiumPaymentReference(42);
    const second = premiumPaymentReference(42);
    expect(first.startsWith('GSP_42_')).toBe(true);
    expect(first).not.toBe(second);
    expect(first.length).toBeLessThan(128);
  });
});
