import { describe, expect, it } from 'vitest';
import { computePlatformFee } from '../../lib/fees';

const base = { escrowPercentageFee: 2, escrowMinFee: 100, escrowMaxFee: 15000 };

describe('computePlatformFee (admin-controlled per-item fee)', () => {
  it('is free when the admin toggle is off (launch default)', () => {
    const result = computePlatformFee({ ...base, platformFeeEnabled: false }, 500000);
    expect(result.amount).toBe(0);
    expect(result.enabled).toBe(false);
  });

  it('charges the configured percentage when enabled', () => {
    const result = computePlatformFee({ ...base, platformFeeEnabled: true }, 100000);
    expect(result.amount).toBe(2000);
    expect(result.percentage).toBe(2);
  });

  it('clamps to the minimum fee', () => {
    const result = computePlatformFee({ ...base, platformFeeEnabled: true }, 1000);
    expect(result.amount).toBe(100);
  });

  it('clamps to the maximum fee', () => {
    const result = computePlatformFee({ ...base, platformFeeEnabled: true }, 100_000_000);
    expect(result.amount).toBe(15000);
  });

  it('charges nothing when the percentage is zero even if enabled', () => {
    const result = computePlatformFee(
      { ...base, escrowPercentageFee: 0, platformFeeEnabled: true },
      50000
    );
    expect(result.amount).toBe(0);
  });

  it('is safe with missing settings', () => {
    expect(computePlatformFee(null, 5000).amount).toBe(0);
    expect(computePlatformFee(undefined, 5000).amount).toBe(0);
  });
});
