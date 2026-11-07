import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export const WALLET_CURRENCY = 'NGN';

export type WalletSettings = {
  funding_min: number;
  funding_max: number;
  withdrawal_min: number;
  withdrawal_max: number;
  withdrawal_fee: number;
  daily_withdrawal_limit: number;
};

export const DEFAULT_WALLET_SETTINGS: WalletSettings = {
  funding_min: 100,
  funding_max: 500_000,
  withdrawal_min: 1000,
  withdrawal_max: 1_000_000,
  withdrawal_fee: 0,
  daily_withdrawal_limit: 1_000_000,
};

/**
 * Provider availability is derived only from server configuration. The browser
 * receives booleans, never a secret key.
 */
export function getWalletProviderConfig() {
  const paystackSecret = Boolean(process.env.PAYSTACK_SECRET_KEY);
  const paystackPublic = Boolean(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY);
  return {
    provider: 'paystack' as const,
    fundingEnabled: paystackSecret && paystackPublic,
    payoutsEnabled: paystackSecret,
    webhookConfigured: Boolean(
      process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY
    ),
  };
}

export async function loadWalletSettings(
  admin: SupabaseClient
): Promise<WalletSettings> {
  const { data } = await admin
    .from('wallet_settings')
    .select('funding_min,funding_max,withdrawal_min,withdrawal_max,withdrawal_fee,daily_withdrawal_limit')
    .eq('id', 1)
    .maybeSingle();

  if (!data) return { ...DEFAULT_WALLET_SETTINGS };

  return {
    funding_min: Number(data.funding_min ?? DEFAULT_WALLET_SETTINGS.funding_min),
    funding_max: Number(data.funding_max ?? DEFAULT_WALLET_SETTINGS.funding_max),
    withdrawal_min: Number(data.withdrawal_min ?? DEFAULT_WALLET_SETTINGS.withdrawal_min),
    withdrawal_max: Number(data.withdrawal_max ?? DEFAULT_WALLET_SETTINGS.withdrawal_max),
    withdrawal_fee: Number(data.withdrawal_fee ?? 0),
    daily_withdrawal_limit: Number(
      data.daily_withdrawal_limit ?? DEFAULT_WALLET_SETTINGS.daily_withdrawal_limit
    ),
  };
}

/** Resolve the marketplace profile for a Supabase auth user. */
export async function profileIdForAuth(
  admin: SupabaseClient,
  authUserId: string
): Promise<number | null> {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_id', authUserId)
    .maybeSingle();
  return data?.id ? Number(data.id) : null;
}

type PaystackCharge = {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  metadata?: Record<string, unknown> | null;
};

export type FundingCreditResult =
  | { success: true; alreadyCredited: boolean; fundingId: number; reference: string }
  | { success: false; error: string; status: number };

/**
 * Credit a wallet funding intent after a Paystack charge is confirmed.
 *
 * `charge` must come from a signed webhook or a direct Paystack verify call —
 * never from a client callback. Amount, currency, reference and intent identity
 * are re-checked here, and the database RPC is idempotent on provider reference.
 */
export async function creditVerifiedWalletFunding(
  reference: string,
  charge: PaystackCharge | null
): Promise<FundingCreditResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { success: false, error: 'Wallet service is not configured', status: 503 };
  }

  const { data: intent, error: intentError } = await admin
    .from('wallet_funding_intents')
    .select('id,user_id,reference,amount,currency,status,provider')
    .eq('reference', reference)
    .maybeSingle();

  if (intentError) {
    logger.error('Wallet funding intent lookup failed', { error: intentError.message });
    return { success: false, error: 'Could not load funding intent', status: 500 };
  }
  if (!intent) {
    return { success: false, error: 'Funding reference was not created by GoodSale', status: 404 };
  }
  if (intent.status === 'SUCCESS') {
    return {
      success: true,
      alreadyCredited: true,
      fundingId: Number(intent.id),
      reference: String(intent.reference),
    };
  }
  if (intent.status !== 'PENDING') {
    return { success: false, error: 'This funding request is no longer payable', status: 409 };
  }

  let verified = charge;
  if (!verified) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return { success: false, error: 'Paystack is not configured', status: 503 };
    }
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
      }
    );
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.status) {
      logger.warn('Paystack wallet verification failed', { reference });
      return { success: false, error: 'Payment could not be verified', status: 402 };
    }
    verified = payload.data as PaystackCharge;
  }

  if (!verified || verified.status !== 'success') {
    return { success: false, error: 'Payment has not succeeded', status: 402 };
  }

  const providerReference = String(verified.reference || '').trim();
  const expectedKobo = Math.round(Number(intent.amount) * 100);
  if (!providerReference || providerReference !== reference) {
    return { success: false, error: 'Payment reference mismatch', status: 400 };
  }
  if (Number(verified.amount) !== expectedKobo) {
    logger.warn('Wallet funding amount mismatch', {
      reference,
      expectedKobo,
      actual: verified.amount,
    });
    return { success: false, error: 'Payment amount does not match the funding request', status: 400 };
  }
  if (String(verified.currency || 'NGN').toUpperCase() !== String(intent.currency || 'NGN')) {
    return { success: false, error: 'Payment currency mismatch', status: 400 };
  }

  const { data, error } = await admin.rpc('credit_wallet_funding', {
    p_funding_id: intent.id,
    p_provider_reference: providerReference,
    p_channel: verified.channel || null,
  });

  if (error) {
    logger.error('credit_wallet_funding failed', { reference, error: error.message });
    return { success: false, error: 'Payment was verified but the wallet could not be credited', status: 500 };
  }

  return {
    success: true,
    alreadyCredited: Boolean(data?.already_credited),
    fundingId: Number(intent.id),
    reference,
  };
}

export function walletFundingReference(profileId: number): string {
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `GSW_${profileId}_${Date.now()}_${random}`;
}
