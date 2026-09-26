/**
 * Client-safe demo mode detection.
 * Mirrors lib/env.ts isDemoMode for browser bundles.
 */
export function isDemoMode(): boolean {
  // Mirror of lib/env.ts isDemoMode: opt-in only, never inferred from NODE_ENV.
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export const OWNER_ADMIN_EMAILS = [
  'lightingstar79@gmail.com',
  'admin@goodsale.ng',
] as const;

/** Email-based SUPER_ADMIN elevation is demo-only and must never run in production. */
export function isOwnerAdminEmail(email: string): boolean {
  if (!isDemoMode()) return false;
  return OWNER_ADMIN_EMAILS.includes(
    email.trim().toLowerCase() as (typeof OWNER_ADMIN_EMAILS)[number]
  );
}
