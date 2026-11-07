import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientIpFromRequest } from '@/lib/rate-limit';
import type {
  PublicReferralCampaign,
  ReferralAction,
  AdminReferralCampaign,
} from './types';

export const REFERRAL_CODE_PATTERN = /^[A-Z0-9-]{3,40}$/;

export function normalizeReferralCode(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 40);
}

function referralHashSalt(): string {
  return (
    process.env.REFERRAL_HASH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'goodsale-referral-v1'
  );
}

/** Stable one-way visitor fingerprint. Raw IP addresses are never stored. */
export function referralVisitorHash(req: Request): string {
  const ip = clientIpFromRequest(req);
  const agent = (req.headers.get('user-agent') || '').slice(0, 160);
  return createHash('sha256')
    .update(`${referralHashSalt()}:${ip}:${agent}`)
    .digest('hex');
}

/** One-way signup IP hash used only to flag shared-network referrals. */
export function referralIpHash(req: Request): string | null {
  const ip = clientIpFromRequest(req);
  if (!ip || ip === 'unknown') return null;
  return createHash('sha256')
    .update(`${referralHashSalt()}:signup:${ip}`)
    .digest('hex');
}

/** Safe public label. Never expose a referred user's email or phone. */
export function maskReferralName(name?: string | null): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'New member';
  const first = parts[0].slice(0, 24);
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1].slice(0, 1).toUpperCase()}.`;
}

export function referralLinkFor(origin: string, code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin || 'https://goodsale.ng').replace(/\/+$/, '');
  return `${base}/auth/register?ref=${encodeURIComponent(code)}`;
}

export function publicCampaign(row: Record<string, unknown> | null | undefined): PublicReferralCampaign | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name || 'Referral campaign'),
    description: String(row.description || ''),
    audience: (row.audience as PublicReferralCampaign['audience']) || 'ANY',
    referrerReward: Number(row.referrer_reward ?? 0),
    refereeReward: Number(row.referee_reward ?? 0),
    rewardType: 'GOODSALE_COINS',
    requireEmailVerified: Boolean(row.require_email_verified),
    requireOnboarding: Boolean(row.require_onboarding),
    requireVerifiedReferrer: Boolean(row.require_verified_referrer),
    qualifyingActions: (Array.isArray(row.qualifying_actions)
      ? row.qualifying_actions
      : []) as ReferralAction[],
    startsAt: String(row.starts_at || new Date().toISOString()),
    endsAt: row.ends_at ? String(row.ends_at) : undefined,
    terms: String(row.terms || ''),
  };
}

export function adminCampaign(row: Record<string, unknown>): AdminReferralCampaign {
  const base = publicCampaign(row)!;
  return {
    ...base,
    slug: String(row.slug || ''),
    status: (row.status as AdminReferralCampaign['status']) || 'DRAFT',
    maxRewardsPerUser: Number(row.max_rewards_per_user ?? 0),
    maxRewardsPerCampaign: Number(row.max_rewards_per_campaign ?? 0),
    minReferrerAgeHours: Number(row.min_referrer_age_hours ?? 0),
    disqualifyRefunded: Boolean(row.disqualify_refunded),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function loadActiveReferralCampaign(
  admin: SupabaseClient
): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from('referral_campaigns')
    .select('*')
    .eq('status', 'ACTIVE')
    .in('audience', ['ANY', 'BUYER'])
    .lte('starts_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) || null;
}

export async function profileForAuth(
  admin: SupabaseClient,
  authUserId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from('profiles')
    .select('id,auth_id,full_name,username,email,referral_code,referred_by_id,good_points,role,created_at,is_suspended,onboarding_completed_at,verification_status')
    .eq('auth_id', authUserId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) || null;
}

export function qualificationLabels(campaign: PublicReferralCampaign | null): string[] {
  if (!campaign) return [];
  const labels: string[] = [];
  if (campaign.requireEmailVerified) labels.push('Verify your email address');
  if (campaign.requireOnboarding) labels.push('Complete GoodSale onboarding');
  if (campaign.requireVerifiedReferrer) labels.push('Referrer must be a verified seller');
  for (const action of campaign.qualifyingActions) {
    if (action === 'PURCHASE') labels.push('Complete a first genuine purchase');
    if (action === 'LISTING') labels.push('Publish an approved listing as a verified seller');
    if (action === 'SELLER_SALE') labels.push('Complete a first successful seller sale');
  }
  return labels;
}
