import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIpFromRequest, rateLimitAsync } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  maskReferralName,
  normalizeReferralCode,
  publicCampaign,
  REFERRAL_CODE_PATTERN,
  referralVisitorHash,
} from '@/lib/referrals/server';

/**
 * Record a real referral-link visit. The raw IP is never stored; the visitor
 * hash is one-way and de-duplicated for 24 hours per code.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimitAsync(
      `referral-click:${clientIpFromRequest(req)}`,
      30,
      60_000
    );
    if (!limited.allowed) {
      return NextResponse.json({ success: false, valid: false }, { status: 429 });
    }

    const body = (await req.json().catch(() => ({}))) as { code?: string };
    const code = normalizeReferralCode(body.code);
    if (!REFERRAL_CODE_PATTERN.test(code)) {
      return NextResponse.json({ success: true, valid: false, error: 'invalid_code' });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, valid: false }, { status: 503 });
    }

    const { data: referrer } = await admin
      .from('profiles')
      .select('id,full_name,is_suspended')
      .ilike('referral_code', code)
      .maybeSingle();
    if (!referrer || referrer.is_suspended) {
      return NextResponse.json({ success: true, valid: false, error: 'invalid_code' });
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

    if (!campaign) {
      return NextResponse.json({
        success: true,
        valid: false,
        code,
        error: 'campaign_unavailable',
      });
    }

    const visitorHash = referralVisitorHash(req);
    const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: existing } = await admin
      .from('referral_clicks')
      .select('id')
      .eq('visitor_hash', visitorHash)
      .eq('code', code)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error } = await admin.from('referral_clicks').insert({
        code,
        campaign_id: campaign.id,
        visitor_hash: visitorHash,
        user_agent: (req.headers.get('user-agent') || '').slice(0, 160),
      });
      if (error) {
        logger.warn('Referral click could not be recorded', { error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      valid: true,
      code,
      referrerLabel: maskReferralName(String(referrer.full_name || '')),
      campaign: publicCampaign(campaign as Record<string, unknown>),
    });
  } catch (error) {
    logger.warn('Referral click route failed', { error: String(error) });
    return NextResponse.json({ success: false, valid: false }, { status: 500 });
  }
}
