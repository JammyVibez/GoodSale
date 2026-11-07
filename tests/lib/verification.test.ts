import { describe, expect, it } from 'vitest';
import {
  STAGE_META,
  isVerifiedSeller,
  toStage,
  verificationProgress,
  verificationRequirements,
  verificationBenefits,
} from '../../lib/verification';

describe('verification stage mapping', () => {
  it('maps raw application statuses to the seller-visible stage', () => {
    expect(toStage('APPROVED')).toBe('VERIFIED');
    expect(toStage('PENDING')).toBe('PENDING');
    expect(toStage('UNDER_REVIEW')).toBe('UNDER_REVIEW');
    expect(toStage('INFO_REQUIRED')).toBe('INFO_REQUIRED');
    expect(toStage('SUSPENDED')).toBe('SUSPENDED');
    expect(toStage('REVOKED')).toBe('REVOKED');
    expect(toStage('EXPIRED')).toBe('EXPIRED');
    expect(toStage('DRAFT')).toBe('DRAFT');
    expect(toStage(null)).toBe('UNVERIFIED');
    expect(toStage('something-else')).toBe('UNVERIFIED');
  });

  it('only treats the VERIFIED stage as badge-eligible', () => {
    expect(STAGE_META.VERIFIED.publicBadge).toBe(true);
    for (const stage of ['UNVERIFIED', 'DRAFT', 'PENDING', 'UNDER_REVIEW', 'REJECTED', 'INFO_REQUIRED', 'SUSPENDED', 'REVOKED', 'EXPIRED'] as const) {
      expect(STAGE_META[stage].publicBadge).toBe(false);
    }
  });
});

describe('isVerifiedSeller', () => {
  it('never shows a badge without a verified backend status', () => {
    expect(isVerifiedSeller(null)).toBe(false);
    expect(isVerifiedSeller({ verificationStatus: 'PENDING' })).toBe(false);
    expect(isVerifiedSeller({ verificationStatus: 'SUSPENDED' })).toBe(false);
    expect(isVerifiedSeller({ verificationStatus: 'REVOKED' })).toBe(false);
    expect(isVerifiedSeller({ verificationStatus: 'UNVERIFIED' })).toBe(false);
  });

  it('shows the badge for a current verification', () => {
    expect(isVerifiedSeller({ verificationStatus: 'VERIFIED' })).toBe(true);
    expect(
      isVerifiedSeller({
        verificationStatus: 'VERIFIED',
        verificationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
    ).toBe(true);
  });

  it('hides the badge once the verification expires', () => {
    expect(
      isVerifiedSeller({
        verificationStatus: 'VERIFIED',
        verificationExpiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      })
    ).toBe(false);
  });
});

describe('verification requirements', () => {
  const base = {
    stage: 'DRAFT' as const,
    sellerType: 'INDIVIDUAL' as const,
    application: {
      legalName: 'Ada Obi',
      phone: '08031234567',
      state: 'Lagos State',
      city: 'Lagos',
      documentType: 'NIN',
    },
    documents: [{ slot: 'ID_FRONT' }],
    store: { name: 'Ada Store', description: 'Bags', city: 'Lagos' },
    profile: { fullName: 'Ada Obi', phoneNumber: '08031234567' },
  };

  it('marks the required individual checks complete', () => {
    const requirements = verificationRequirements(base);
    const keys = requirements.map((entry) => entry.key);
    expect(keys).toContain('legal_name');
    expect(keys).toContain('id_document');
    expect(requirements.find((entry) => entry.key === 'id_document')?.complete).toBe(true);
    // A selfie is still outstanding.
    expect(requirements.find((entry) => entry.key === 'selfie')?.complete).toBe(false);
  });

  it('adds business requirements only for registered businesses', () => {
    const individual = verificationRequirements(base).map((entry) => entry.key);
    expect(individual).not.toContain('business_registration');

    const business = verificationRequirements({ ...base, sellerType: 'BUSINESS' }).map((entry) => entry.key);
    expect(business).toContain('business_name');
    expect(business).toContain('business_registration');
  });

  it('does not claim store details are complete without a description', () => {
    const requirements = verificationRequirements({ ...base, store: { name: 'Ada Store', city: 'Lagos' } });
    expect(requirements.find((entry) => entry.key === 'store')?.complete).toBe(false);
  });
});

describe('verification progress and benefits', () => {
  it('clamps progress between 0 and 100', () => {
    expect(verificationProgress(0, 0)).toBe(0);
    expect(verificationProgress(3, 6)).toBe(50);
    expect(verificationProgress(9, 6)).toBe(100);
    expect(verificationProgress(-1, 6)).toBe(0);
  });

  it('only marks the badge-related benefits live when verified', () => {
    const draft = verificationBenefits('DRAFT');
    expect(draft.every((benefit) => !benefit.live)).toBe(true);

    const verified = verificationBenefits('VERIFIED');
    expect(verified.find((benefit) => benefit.title.includes('badge'))?.live).toBe(true);
    // Future programmes are never promised as active.
    expect(verified.find((benefit) => benefit.title.toLowerCase().includes('programmes'))?.live).toBe(false);
  });
});
