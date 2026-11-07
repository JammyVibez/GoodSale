import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WALLET_SETTINGS,
  getWalletProviderConfig,
  walletFundingReference,
} from '@/lib/wallet/server';

describe('wallet provider configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks funding and payouts unavailable without Paystack keys', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY', '');
    vi.stubEnv('PAYSTACK_SECRET_KEY', '');
    vi.stubEnv('PAYSTACK_WEBHOOK_SECRET', '');

    const config = getWalletProviderConfig();
    expect(config.fundingEnabled).toBe(false);
    expect(config.payoutsEnabled).toBe(false);
    expect(config.webhookConfigured).toBe(false);
  });

  it('requires both public and secret keys for funding', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY', 'pk_test_123');
    vi.stubEnv('PAYSTACK_SECRET_KEY', '');
    expect(getWalletProviderConfig().fundingEnabled).toBe(false);

    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_123');
    expect(getWalletProviderConfig().fundingEnabled).toBe(true);
    expect(getWalletProviderConfig().payoutsEnabled).toBe(true);
  });

  it('keeps funding references unique and scoped to the profile', () => {
    const first = walletFundingReference(42);
    const second = walletFundingReference(42);
    expect(first).toMatch(/^GSW_42_\d+_[A-Z0-9]+$/);
    expect(second).not.toBe(first);
  });

  it('has conservative default limits when settings are missing', () => {
    expect(DEFAULT_WALLET_SETTINGS.withdrawal_min).toBeGreaterThan(0);
    expect(DEFAULT_WALLET_SETTINGS.withdrawal_max).toBeGreaterThan(
      DEFAULT_WALLET_SETTINGS.withdrawal_min
    );
    expect(DEFAULT_WALLET_SETTINGS.daily_withdrawal_limit).toBeGreaterThan(0);
    expect(DEFAULT_WALLET_SETTINGS.withdrawal_fee).toBeGreaterThanOrEqual(0);
  });
});
