import { describe, expect, it } from 'vitest';
import {
  maskReferralName,
  normalizeReferralCode,
  publicCampaign,
  qualificationLabels,
} from '@/lib/referrals/server';

describe('referral helpers', () => {
  it('normalises codes without accepting arbitrary characters', () => {
    expect(normalizeReferralCode(' hamza-gs482 ')).toBe('HAMZA-GS482');
    expect(normalizeReferralCode('bad code!')).toBe('BADCODE');
    expect(normalizeReferralCode(null)).toBe('');
  });

  it('masks referred members instead of exposing their full name', () => {
    expect(maskReferralName('Chidi Okonkwo')).toBe('Chidi O.');
    expect(maskReferralName('  Ada   Nwosu ')).toBe('Ada N.');
    expect(maskReferralName('')).toBe('New member');
  });

  it('maps a campaign without exposing internal database fields', () => {
    const campaign = publicCampaign({
      id: 4,
      name: 'Launch',
      description: 'Invite a friend',
      audience: 'ANY',
      referrer_reward: 500,
      referee_reward: 250,
      require_email_verified: true,
      require_onboarding: true,
      require_verified_referrer: false,
      qualifying_actions: ['PURCHASE', 'LISTING'],
      starts_at: '2026-01-01T00:00:00.000Z',
      terms: 'Promotional coins only.',
      created_by: 99,
    });

    expect(campaign).toMatchObject({
      id: 4,
      referrerReward: 500,
      refereeReward: 250,
      rewardType: 'GOODSALE_COINS',
      qualifyingActions: ['PURCHASE', 'LISTING'],
    });
    expect(campaign).not.toHaveProperty('created_by');
  });

  it('builds honest qualification copy from the configured rules', () => {
    const labels = qualificationLabels({
      id: 1,
      name: 'Launch',
      description: '',
      audience: 'ANY',
      referrerReward: 500,
      refereeReward: 250,
      rewardType: 'GOODSALE_COINS',
      requireEmailVerified: true,
      requireOnboarding: true,
      requireVerifiedReferrer: false,
      qualifyingActions: ['PURCHASE'],
      startsAt: '2026-01-01T00:00:00.000Z',
      terms: '',
    });
    expect(labels).toContain('Verify your email address');
    expect(labels).toContain('Complete GoodSale onboarding');
    expect(labels).toContain('Complete a first genuine purchase');
  });
});
