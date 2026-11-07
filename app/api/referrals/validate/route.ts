import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIpFromRequest, rateLimitAsync } from '@/lib/rate-limit';
import {
  maskReferralName,
  normalizeReferralCode,
  publicCampaign,
  REFERRAL_CODE_PATTERN,
} from '@/lib/referrals/server';

/** Public, read-only validation for a referral code shown during registration. */
export async function GET(req: NextRequest) {
  const limited = await rateLimitAsync(
    `referral-validate:${clientIpFromRequest(req)}`,
    60,
    10 * 60_000
  );
  if (!limited.allowed) {
    return NextResponse.json(
      { success: false, valid: false, error: 'Too many checks. Try again shortly.' },
      { status: 429 }
    );
  }

  const code = normalizeReferralCode(req.nextUrl.searchParams.get('code'));
  if (!REFERRAL_CODE_PATTERN.test(code)) {
    return NextResponse.json({ success: true, valid: false, code, error: 'invalid_code' });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, valid: false, error: 'Referral service is not configured' },
      { status: 503 }
    );
  }

  const { data: referrer } = await admin
    .from('profiles')
    .select('id,full_name,is_suspended')
    .ilike('referral_code', code)
    .maybeSingle();

  if (!referrer || referrer.is_suspended) {
    return NextResponse.json({ success: true, valid: false, code, error: 'invalid_code' });
  }

  const now = new Date().toISOString();
  const { data: campaign } = await admin
    .from('referral_campaigns')
    .select('*')
    .eq('status', 'ACTIVE')
    .in('audience', ['ANY', 'BUYER'])
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!campaign || (campaign.ends_at && String(campaign.ends_at) <= now)) {
    return NextResponse.json({
      success: true,
      valid: false,
      code,
      error: 'campaign_unavailable',
    });
  }

  return NextResponse.json({
    success: true,
    valid: true,
    code,
    referrerLabel: maskReferralName(String(referrer.full_name || '')),
    campaign: publicCampaign(campaign as Record<string, unknown>),
  });
}
