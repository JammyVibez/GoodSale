import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import {
  maskReferralName,
  profileForAuth,
  publicCampaign,
  qualificationLabels,
  referralLinkFor,
} from '@/lib/referrals/server';
import type {
  ReferralDashboard,
  ReferralHistoryItem,
  ReferralRewardHistoryItem,
  ReferralStatus,
} from '@/lib/referrals/types';

/** The signed-in user's private referral dashboard. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Referral service unavailable' }, { status: 503 });
    }

    const profile = await profileForAuth(admin, user.id);
    if (!profile) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }
    const profileId = Number(profile.id);

    let code = String(profile.referral_code || '').trim();
    if (!code) {
      const { data: generated } = await admin.rpc('generate_referral_code', {
        p_name: String(profile.full_name || ''),
        p_username: String(profile.username || ''),
      });
      if (generated) {
        code = String(generated);
        await admin.from('profiles').update({ referral_code: code }).eq('id', profileId);
      }
    }

    const now = new Date().toISOString();
    const [{ data: referrals }, { data: rewards }, { data: campaign }, { count: clickCount }] =
      await Promise.all([
        admin
          .from('referrals')
          .select(
            'id,referee_name,status,referrer_reward,referee_reward,reward_type,created_at,qualified_at,rewarded_at,disqualified_at,disqualification_reason'
          )
          .eq('referrer_id', profileId)
          .order('created_at', { ascending: false })
          .limit(200),
        admin
          .from('referral_rewards')
          .select('id,referral_id,amount,status,reference,created_at,issued_at')
          .eq('beneficiary_id', profileId)
          .eq('beneficiary_role', 'REFERRER')
          .order('created_at', { ascending: false })
          .limit(200),
        admin
          .from('referral_campaigns')
          .select('*')
          .eq('status', 'ACTIVE')
          .in('audience', ['ANY', 'BUYER'])
          .lte('starts_at', now)
          .or(`ends_at.is.null,ends_at.gt.${now}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        code
          ? admin
              .from('referral_clicks')
              .select('id', { count: 'exact', head: true })
              .eq('code', code)
          : Promise.resolve({ count: 0 }),
      ]);

    const referralRows = (referrals || []) as Record<string, unknown>[];
    const history: ReferralHistoryItem[] = referralRows.map((row) => {
      const status = String(row.status || 'REGISTERED') as ReferralStatus;
      const rewardStatus: ReferralHistoryItem['rewardStatus'] =
        status === 'REWARDED'
          ? 'CREDITED'
          : status === 'DISQUALIFIED'
            ? 'DISQUALIFIED'
            : status === 'QUALIFIED' || status === 'REWARD_PENDING'
              ? 'PENDING'
              : 'NOT_EARNED';
      return {
        id: Number(row.id),
        refereeName: maskReferralName(String(row.referee_name || '')),
        status,
        rewardStatus,
        rewardCoins: Number(row.referrer_reward ?? 0),
        createdAt: String(row.created_at || now),
        qualifiedAt: row.qualified_at ? String(row.qualified_at) : undefined,
        rewardedAt: row.rewarded_at ? String(row.rewarded_at) : undefined,
        reason: row.disqualification_reason ? String(row.disqualification_reason) : undefined,
      };
    });

    const referralById = new Map(referralRows.map((row) => [Number(row.id), row]));
    const rewardHistory: ReferralRewardHistoryItem[] = (
      (rewards || []) as Record<string, unknown>[]
    ).map((row) => {
      const referral = referralById.get(Number(row.referral_id));
      return {
        id: Number(row.id),
        amount: Number(row.amount ?? 0),
        status: row.status as ReferralRewardHistoryItem['status'],
        reference: String(row.reference || ''),
        refereeName: maskReferralName(String(referral?.referee_name || '')),
        issuedAt: row.issued_at ? String(row.issued_at) : undefined,
        createdAt: String(row.created_at || now),
      };
    });

    const publicReferralCampaign = publicCampaign(campaign as Record<string, unknown> | null);
    const registered = referralRows.length;
    const qualified = referralRows.filter((row) =>
      ['QUALIFIED', 'REWARD_PENDING', 'REWARDED'].includes(String(row.status))
    ).length;
    const pendingRewards =
      referralRows
        .filter((row) => ['QUALIFIED', 'REWARD_PENDING'].includes(String(row.status)))
        .reduce((total, row) => total + Number(row.referrer_reward ?? 0), 0) +
      ((rewards || []) as Record<string, unknown>[])
        .filter((row) => row.status === 'PENDING')
        .reduce((total, row) => total + Number(row.amount ?? 0), 0);
    const earnedRewards = ((rewards || []) as Record<string, unknown>[])
      .filter((row) => row.status === 'ISSUED')
      .reduce((total, row) => total + Number(row.amount ?? 0), 0);

    const link = referralLinkFor(req.nextUrl.origin, code);
    const payload: ReferralDashboard = {
      code,
      link,
      coinsBalance: Number(profile.good_points ?? 0),
      campaign: publicReferralCampaign,
      stats: {
        invitations: Number(clickCount || 0),
        registered,
        qualified,
        pendingRewards,
        earnedRewards,
      },
      history,
      rewards: rewardHistory,
      qualification: qualificationLabels(publicReferralCampaign),
      shareText: `Join me on GoodSale — Nigeria's escrow-protected marketplace. Use my referral code ${code}.`,
    };

    return NextResponse.json({ success: true, source: 'server', referral: payload });
  } catch (error) {
    logger.error('Referral dashboard failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load referrals') },
      { status: 500 }
    );
  }
}
