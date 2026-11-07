import type { SupabaseClient } from '@supabase/supabase-js';
import type { BusinessPlan, MembershipEntitlements } from '@/lib/entitlements';

type Row = {
  plan?: string | null;
  expires_at?: string | null;
};

/** Server-side entitlement check used by protected seller APIs. */
export async function loadEntitlements(
  admin: SupabaseClient,
  profileId: number
): Promise<MembershipEntitlements> {
  const nowIso = new Date().toISOString();
  const [{ data: businessRows }, { data: verifiedRows }] = await Promise.all([
    admin
      .from('business_subscriptions')
      .select('plan,expires_at')
      .eq('user_id', profileId)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(5),
    admin
      .from('verified_plus_subscriptions')
      .select('expires_at')
      .eq('user_id', profileId)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1),
  ]);

  const rank: Record<BusinessPlan, number> = { PRO: 1, PREMIUM: 2, ENTERPRISE: 3 };
  const business = ((businessRows || []) as Row[]).sort(
    (a, b) => rank[((b.plan as BusinessPlan) || 'PRO')] - rank[((a.plan as BusinessPlan) || 'PRO')]
  )[0];
  const verified = ((verifiedRows || []) as Row[])[0];
  const businessPlan = business ? ((business.plan as BusinessPlan) || 'PRO') : null;
  const tier = business
    ? (`BUSINESS_${businessPlan}` as MembershipEntitlements['tier'])
    : verified
      ? 'VERIFIED_PLUS'
      : 'NONE';
  const expiresAt = [verified?.expires_at, business?.expires_at]
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
