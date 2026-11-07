import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { koboToNaira, nairaToKobo } from '@/lib/productPricing';

export type PremiumProduct = 'VERIFIED_PLUS' | 'BUSINESS';
export type BusinessPlanCode = 'PRO' | 'PREMIUM' | 'ENTERPRISE';

export const BUSINESS_PLAN_CODES: BusinessPlanCode[] = ['PRO', 'PREMIUM', 'ENTERPRISE'];

export type PremiumPrice = {
  amount: number;
  amountKobo: number;
  durationDays: number;
};

export type PremiumActivation =
  | {
      success: true;
      alreadyActive: boolean;
      reference: string;
      product: PremiumProduct;
      planCode: string;
      startsAt?: string;
      expiresAt: string;
    }
  | { success: false; error: string; status: number };

type PaystackCharge = {
  status?: string;
  reference?: string;
  amount?: number;
  amountKobo?: number;
  currency?: string;
  metadata?: Record<string, unknown> | null;
};

export function premiumPaymentReference(profileId: number): string {
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `GSP_${profileId}_${Date.now()}_${random}`;
}

/**
 * Prices and duration come from the admin-owned revenue settings row. They are
 * never accepted from the client.
 */
export function resolvePremiumPrice(
  settings: Record<string, unknown> | null | undefined,
  product: PremiumProduct,
  planCode?: string | null
): PremiumPrice | { error: string } {
  const durationDays = Math.max(1, Number(settings?.premium_duration_days ?? 30));
  let amount = 0;

  if (product === 'VERIFIED_PLUS') {
    amount = Number(settings?.verified_plus_price ?? 2500);
  } else {
    const plan = String(planCode || '').toUpperCase() as BusinessPlanCode;
    if (!BUSINESS_PLAN_CODES.includes(plan)) {
      return { error: 'Choose a valid Business plan' };
    }
    amount =
      plan === 'PRO'
        ? Number(settings?.sub_pro_price ?? 15000)
        : plan === 'PREMIUM'
          ? Number(settings?.sub_premium_price ?? 12500)
          : Number(settings?.sub_enterprise_price ?? 85000);
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'This membership is not available for purchase right now' };
  }

  const amountKobo = nairaToKobo(amount);
  return { amount: koboToNaira(amountKobo), amountKobo, durationDays };
}

export async function loadPremiumPrice(
  admin: SupabaseClient,
  product: PremiumProduct,
  planCode?: string | null
): Promise<PremiumPrice | { error: string }> {
  const { data, error } = await admin
    .from('revenue_settings')
    .select(
      'verified_plus_price,sub_pro_price,sub_premium_price,sub_enterprise_price,premium_duration_days'
    )
    .order('id')
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Premium pricing lookup failed', { error: error.message });
    return { error: 'Could not load membership pricing' };
  }

  return resolvePremiumPrice(data as Record<string, unknown> | null, product, planCode);
}

async function verifyWithPaystack(reference: string): Promise<PaystackCharge | { error: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { error: 'Paystack is not configured' };

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    }
  );
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.status || !payload?.data) {
    logger.warn('Premium payment verification failed', { reference });
    return { error: 'Payment could not be verified' };
  }
  return payload.data as PaystackCharge;
}

/**
 * Verify a subscription charge against the server-created intent and activate
 * it through the idempotent database RPC. This is safe to call from both the
 * authenticated verify route and the signed Paystack webhook.
 */
export async function activateVerifiedPremiumPayment(
  reference: string,
  charge?: PaystackCharge | null
): Promise<PremiumActivation> {
  const admin = createAdminClient();
  if (!admin) {
    return { success: false, error: 'Premium service is not configured', status: 503 };
  }

  const { data: payment, error } = await admin
    .from('premium_subscription_payments')
    .select(
      'id,user_id,product,plan_code,reference,amount,amount_kobo,currency,status,provider_reference,expires_at'
    )
    .eq('reference', reference)
    .maybeSingle();

  if (error) {
    logger.error('Premium payment lookup failed', { reference, error: error.message });
    return { success: false, error: 'Could not load the membership payment', status: 500 };
  }
  if (!payment) {
    return { success: false, error: 'Membership payment was not created by GoodSale', status: 404 };
  }
  if (payment.status === 'SUCCESS') {
    return {
      success: true,
      alreadyActive: true,
      reference: String(payment.reference),
      product: payment.product as PremiumProduct,
      planCode: String(payment.plan_code),
      expiresAt: String(payment.expires_at || ''),
    };
  }
  if (payment.status !== 'PENDING') {
    return { success: false, error: 'This membership payment is no longer payable', status: 409 };
  }

  const verified = charge || (await verifyWithPaystack(reference));
  if ('error' in verified) {
    return { success: false, error: verified.error, status: 402 };
  }
  if (verified.status !== 'success') {
    return { success: false, error: 'Payment has not succeeded', status: 402 };
  }

  const providerReference = String(verified.reference || '').trim();
  if (!providerReference || providerReference !== reference) {
    return { success: false, error: 'Payment reference mismatch', status: 400 };
  }
  const storedAmountKobo = Number(payment.amount_kobo ?? Math.round(Number(payment.amount) * 100));
  if (Number(verified.amount) !== storedAmountKobo) {
    logger.warn('Premium payment amount mismatch', {
      reference,
      expected: storedAmountKobo,
      actual: verified.amount,
    });
    return { success: false, error: 'Payment amount does not match the membership price', status: 400 };
  }
  if (String(verified.currency || 'NGN').toUpperCase() !== String(payment.currency || 'NGN')) {
    return { success: false, error: 'Payment currency does not match', status: 400 };
  }

  const { data, error: activationError } = await admin.rpc('activate_premium_subscription', {
    p_reference: reference,
    p_provider_reference: providerReference,
  });

  if (activationError) {
    logger.error('Premium activation RPC failed', {
      reference,
      error: activationError.message,
    });
    return {
      success: false,
      error: 'Payment was verified but the membership could not be activated',
      status: 500,
    };
  }

  return {
    success: true,
    alreadyActive: Boolean(data?.alreadyActive),
    reference,
    product: (data?.product || payment.product) as PremiumProduct,
    planCode: String(data?.planCode || payment.plan_code),
    startsAt: data?.startsAt ? String(data.startsAt) : undefined,
    expiresAt: String(data?.expiresAt || ''),
  };
}
