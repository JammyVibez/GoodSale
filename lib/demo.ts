/**
 * Client-safe demo mode detection.
 * Mirrors lib/env.ts isDemoMode for browser bundles.
 */
export function isDemoMode(): boolean {
  const flag = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (flag === 'true') return true;
  // Default off — real Auth/Storage/Paystack paths only
  return false;
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
