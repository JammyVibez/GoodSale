export type ReferralAction = 'PURCHASE' | 'LISTING' | 'SELLER_SALE';

export type ReferralStatus =
  | 'REGISTERED'
  | 'VERIFICATION_PENDING'
  | 'QUALIFIED'
  | 'REWARD_PENDING'
  | 'REWARDED'
  | 'DISQUALIFIED';

export type ReferralRewardStatus = 'PENDING' | 'ISSUED' | 'REVERSED';

export interface PublicReferralCampaign {
  id: number;
  name: string;
  description: string;
  audience: 'ANY' | 'BUYER' | 'SELLER';
  referrerReward: number;
  refereeReward: number;
  rewardType: 'GOODSALE_COINS';
  requireEmailVerified: boolean;
  requireOnboarding: boolean;
  requireVerifiedReferrer: boolean;
  qualifyingActions: ReferralAction[];
  startsAt: string;
  endsAt?: string;
  terms: string;
}

export interface ReferralHistoryItem {
  id: number;
  refereeName: string;
  status: ReferralStatus;
  rewardStatus: 'NOT_EARNED' | 'PENDING' | 'CREDITED' | 'DISQUALIFIED';
  rewardCoins: number;
  createdAt: string;
  qualifiedAt?: string;
  rewardedAt?: string;
  reason?: string;
}

export interface ReferralRewardHistoryItem {
  id: number;
  amount: number;
  status: ReferralRewardStatus;
  reference: string;
  refereeName: string;
  issuedAt?: string;
  createdAt: string;
}

export interface ReferralDashboard {
  code: string;
  link: string;
  coinsBalance: number;
  campaign: PublicReferralCampaign | null;
  stats: {
    invitations: number;
    registered: number;
    qualified: number;
    pendingRewards: number;
    earnedRewards: number;
  };
  history: ReferralHistoryItem[];
  rewards: ReferralRewardHistoryItem[];
  qualification: string[];
  shareText: string;
}

export interface AdminReferralRow {
  id: number;
  code: string;
  status: ReferralStatus;
  refereeName: string;
  referrer: { id: number; name: string; email: string; code: string } | null;
  referee: { id: number; name: string; email: string; role: string } | null;
  campaignId?: number;
  campaignName?: string;
  referrerReward: number;
  refereeReward: number;
  riskScore: number;
  fraudFlags: string[];
  fraudReviewedAt?: string;
  disqualifiedReason?: string;
  createdAt: string;
  qualifiedAt?: string;
  rewardedAt?: string;
  rewardStatus: string;
}

export interface AdminReferralCampaign extends PublicReferralCampaign {
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
  maxRewardsPerUser: number;
  maxRewardsPerCampaign: number;
  minReferrerAgeHours: number;
  disqualifyRefunded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReferralData {
  campaigns: AdminReferralCampaign[];
  referrals: AdminReferralRow[];
  rewards: Array<{
    id: number;
    referralId: number;
    beneficiaryId: number;
    beneficiaryName: string;
    beneficiaryRole: 'REFERRER' | 'REFEREE';
    amount: number;
    status: ReferralRewardStatus;
    reference: string;
    createdAt: string;
    issuedAt?: string;
  }>;
  clicks: Array<{
    id: number;
    code: string;
    campaignId?: number;
    createdAt: string;
  }>;
  analytics: {
    registered: number;
    verification_pending: number;
    qualified: number;
    rewarded: number;
    disqualified: number;
    total: number;
    flagged: number;
    unreviewed_flagged: number;
    coins_issued: number;
    clicks: number;
    clicks_30d: number;
    registered_30d: number;
  };
  audit: Array<{
    id: number;
    action: string;
    entityId?: number;
    details: string;
    createdAt: string;
  }>;
}

export const REFERRAL_ACTION_LABELS: Record<ReferralAction, string> = {
  PURCHASE: 'Complete a first genuine purchase',
  LISTING: 'Publish an approved listing as a verified seller',
  SELLER_SALE: 'Complete a first successful seller sale',
};

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  REGISTERED: 'Registered',
  VERIFICATION_PENDING: 'Verification pending',
  QUALIFIED: 'Qualified',
  REWARD_PENDING: 'Reward pending',
  REWARDED: 'Rewarded',
  DISQUALIFIED: 'Disqualified',
};
