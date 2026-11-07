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

type SubscriptionRow = {
  userId: number;
  plan?: string;
  expiresAt: string;
  status?: string;
};

const PLAN_RANK: Record<BusinessPlan, number> = { PRO: 1, PREMIUM: 2, ENTERPRISE: 3 };

/** The sole entitlement policy used for browser-loaded and server-loaded rows. */
export function resolveSubscriptionEntitlements(
  businessSubscriptions: SubscriptionRow[],
  verifiedPlusSubscriptions: SubscriptionRow[],
  userId: number | null | undefined,
  now = Date.now()
): MembershipEntitlements {
  const none: MembershipEntitlements = {
    verifiedPlus: false,
    business: false,
    businessPlan: null,
    tier: 'NONE',
    expiresAt: null,
    analytics: false,
    businessTools: false,
  };
  if (!userId) return none;

  const isActive = (row: SubscriptionRow) =>
    row.userId === userId &&
    (row.status == null || row.status === 'ACTIVE') &&
    Number.isFinite(new Date(row.expiresAt).getTime()) &&
    new Date(row.expiresAt).getTime() > now;
  const verified = verifiedPlusSubscriptions.filter(isActive).sort(
    (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime()
  )[0];
  const business = businessSubscriptions.filter(isActive).sort((a, b) => {
    const rankB = PLAN_RANK[(b.plan as BusinessPlan) || 'PRO'] || 0;
    const rankA = PLAN_RANK[(a.plan as BusinessPlan) || 'PRO'] || 0;
    return rankB - rankA || new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime();
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

export function businessPlanLabel(plan: BusinessPlan | null): string {
  if (plan === 'ENTERPRISE') return 'Business Enterprise';
  if (plan === 'PREMIUM') return 'Business Premium';
  if (plan === 'PRO') return 'Business Pro';
  return 'Business membership';
}

export function resolveEntitlements(
  db: Pick<GoodSaleDBState, 'businessSubscriptions' | 'verifiedPlusSubscriptions'>,
  userId: number | null | undefined,
  now = Date.now()
): MembershipEntitlements {
  return resolveSubscriptionEntitlements(
    db.businessSubscriptions,
    db.verifiedPlusSubscriptions,
    userId,
    now
  );
}

export function membershipLabel(entitlements: MembershipEntitlements): string {
  if (entitlements.business) return businessPlanLabel(entitlements.businessPlan);
  if (entitlements.verifiedPlus) return 'Verified+ member';
  return 'No paid membership';
}
