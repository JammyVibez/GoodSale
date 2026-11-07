import type { GoodSaleDBState } from './types';

export type BusinessPlan = 'PRO' | 'PREMIUM' | 'ENTERPRISE';

export type MembershipEntitlements = {
  verifiedPlus: boolean;
  business: boolean;
  businessPlan: BusinessPlan | null;
  tier: 'NONE' | 'VERIFIED_PLUS' | 'BUSINESS_PRO' | 'BUSINESS_PREMIUM' | 'BUSINESS_ENTERPRISE';
  expiresAt: string | null;
  analytics: boolean;
  businessTools: boolean;
};

const PLAN_RANK: Record<BusinessPlan, number> = { PRO: 1, PREMIUM: 2, ENTERPRISE: 3 };

export function businessPlanLabel(plan: BusinessPlan | null): string {
  if (plan === 'ENTERPRISE') return 'Business Enterprise';
  if (plan === 'PREMIUM') return 'Business Premium';
  if (plan === 'PRO') return 'Business Pro';
  return 'Business membership';
}

/**
 * Resolve paid membership access from server-loaded subscription rows.
 *
 * Paid membership is intentionally separate from identity/business
 * verification. It unlocks analytics and business tooling, not trust badges.
 */
export function resolveEntitlements(
  db: Pick<GoodSaleDBState, 'businessSubscriptions' | 'verifiedPlusSubscriptions'>,
  userId: number | null | undefined,
  now = Date.now()
): MembershipEntitlements {
  if (!userId) {
    return {
      verifiedPlus: false,
      business: false,
      businessPlan: null,
      tier: 'NONE',
      expiresAt: null,
      analytics: false,
      businessTools: false,
    };
  }

  const verified = db.verifiedPlusSubscriptions
    .filter((entry) => entry.userId === userId && new Date(entry.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];

  const business = db.businessSubscriptions
    .filter((entry) => entry.userId === userId && new Date(entry.expiresAt).getTime() > now)
    .sort((a, b) => {
      const rank = PLAN_RANK[(b.plan as BusinessPlan) || 'PRO'] - PLAN_RANK[(a.plan as BusinessPlan) || 'PRO'];
      return rank || new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime();
    })[0];

  const businessPlan = business ? ((business.plan as BusinessPlan) || 'PRO') : null;
  const tier = business
    ? (`BUSINESS_${businessPlan}` as MembershipEntitlements['tier'])
    : verified
      ? 'VERIFIED_PLUS'
      : 'NONE';
  const expiresAt = [verified?.expiresAt, business?.expiresAt]
    .filter(Boolean)
    .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] ?? null;

  return {
    verifiedPlus: Boolean(verified),
    business: Boolean(business),
    businessPlan,
    tier,
    expiresAt,
    analytics: Boolean(verified || business),
    businessTools: Boolean(business),
  };
}

export function membershipLabel(entitlements: MembershipEntitlements): string {
  if (entitlements.business) return businessPlanLabel(entitlements.businessPlan);
  if (entitlements.verifiedPlus) return 'Verified+ member';
  return 'No paid membership';
}
