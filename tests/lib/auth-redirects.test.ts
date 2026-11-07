import { describe, expect, it } from 'vitest';
import { postAuthDestination, safeNextPath } from '@/lib/auth/redirects';

const completedBuyer = { onboardingCompletedAt: '2026-11-07T09:00:00Z', wantsSelling: false };
const completedSeller = {
  onboardingCompletedAt: '2026-11-07T09:00:00Z',
  wantsSelling: true,
  storeOnboardingCompletedAt: '2026-11-07T09:30:00Z',
};

describe('safeNextPath', () => {
  it('keeps internal paths', () => {
    expect(safeNextPath('/?product=12')).toBe('/?product=12');
    expect(safeNextPath('/track')).toBe('/track');
  });

  it('rejects off-site, protocol-relative and auth-loop targets', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/auth')).toBe('/');
    expect(safeNextPath('/auth/register?next=/settings')).toBe('/');
  });

  it('falls back when nothing is supplied', () => {
    expect(safeNextPath(undefined, '/settings')).toBe('/settings');
    expect(safeNextPath(null)).toBe('/');
  });
});

describe('postAuthDestination', () => {
  it('sends a new account into onboarding', () => {
    expect(postAuthDestination(null)).toBe('/onboarding');
    expect(postAuthDestination({ wantsSelling: true })).toBe('/onboarding');
  });

  it('resumes seller onboarding when selling was chosen but no store exists', () => {
    expect(
      postAuthDestination({ onboardingCompletedAt: '2026-11-07T09:00:00Z', wantsSelling: true })
    ).toBe('/seller/onboarding');
  });

  it('honours a requested deep link for a finished account', () => {
    expect(postAuthDestination(completedBuyer, '/?product=12')).toBe('/?product=12');
  });

  it('routes buyers to the marketplace and sellers to the seller hub', () => {
    expect(postAuthDestination(completedBuyer)).toBe('/');
    expect(postAuthDestination(completedSeller)).toBe('/?view=dashboard');
    expect(postAuthDestination(completedSeller, '/?product=12')).toBe('/?product=12');
  });

  it('never returns an external destination', () => {
    expect(postAuthDestination(completedBuyer, '//evil.example')).toBe('/');
  });
});
