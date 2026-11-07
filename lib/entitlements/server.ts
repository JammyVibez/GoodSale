import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSubscriptionEntitlements } from '@/lib/entitlements';

/** Server-side entitlement loader uses the same policy as browser-loaded rows. */
export async function loadEntitlements(admin: SupabaseClient, profileId: number) {
  const nowIso = new Date().toISOString();
  const [{ data: businessRows, error: businessError }, { data: verifiedRows, error: verifiedError }] =
    await Promise.all([
      admin
        .from('business_subscriptions')
        .select('user_id,plan,expires_at,status')
        .eq('user_id', profileId)
        .eq('status', 'ACTIVE')
        .gt('expires_at', nowIso)
        .order('expires_at', { ascending: false })
        .limit(10),
      admin
        .from('verified_plus_subscriptions')
        .select('user_id,expires_at,status')
        .eq('user_id', profileId)
        .eq('status', 'ACTIVE')
        .gt('expires_at', nowIso)
        .order('expires_at', { ascending: false })
        .limit(10),
    ]);

  if (businessError) throw new Error(`Business membership lookup failed: ${businessError.message}`);
  if (verifiedError) throw new Error(`Verified+ membership lookup failed: ${verifiedError.message}`);

  return resolveSubscriptionEntitlements(
    (businessRows || []).map((row) => ({
      userId: Number(row.user_id),
      plan: String(row.plan || 'PRO'),
      expiresAt: String(row.expires_at),
      status: String(row.status || 'ACTIVE'),
    })),
    (verifiedRows || []).map((row) => ({
      userId: Number(row.user_id),
      expiresAt: String(row.expires_at),
      status: String(row.status || 'ACTIVE'),
    })),
    profileId
  );
}
