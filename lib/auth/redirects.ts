// lib/auth/redirects.ts
/**
 * Redirect rules for the authentication / onboarding boundary.
 *
 * Kept as pure functions so the login page, the onboarding screens and tests
 * all agree on where a signed-in account belongs, and so an attacker-supplied
 * `next` value can never send a user off-site.
 */

export type OnboardingSnapshot = {
  onboardingCompletedAt?: string | null;
  wantsSelling?: boolean | null;
  storeOnboardingCompletedAt?: string | null;
};

/** Only internal, non-auth paths are accepted as a post-login destination. */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (raw.includes('\\')) return fallback;
  if (raw === '/auth' || raw.startsWith('/auth?') || raw.startsWith('/auth/')) return fallback;
  return raw;
}

/**
 * Where an authenticated account goes next:
 *  1. onboarding not finished      → guided onboarding (resumes where it stopped)
 *  2. chose selling, no store yet  → seller onboarding
 *  3. finished                     → the requested page, seller dashboard, or
 *                                    the marketplace for buyers
 */
export function postAuthDestination(
  state: OnboardingSnapshot | null | undefined,
  next?: string | null
): string {
  if (!state?.onboardingCompletedAt) return '/onboarding';
  if (state.wantsSelling && !state.storeOnboardingCompletedAt) return '/seller/onboarding';
  return safeNextPath(next, state.wantsSelling ? '/?view=dashboard' : '/');
}
