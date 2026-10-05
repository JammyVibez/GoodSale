import type { RevenueSettings } from '@/lib/types';

export type PlatformFeeSettings = Pick<
  RevenueSettings,
  'platformFeeEnabled' | 'escrowPercentageFee' | 'escrowMinFee' | 'escrowMaxFee'
>;

export interface PlatformFeeBreakdown {
  /** Whether the platform is currently charging the per-item fee. */
  enabled: boolean;
  /** The admin-configured per-item percentage (used when enabled). */
  percentage: number;
  /** The amount, in Naira, added to the buyer's order total. */
  amount: number;
}

/**
 * The per-item platform (escrow) fee charged to the buyer at checkout.
 *
 * Launch default is **off**: until an admin turns it on, this returns 0 and
 * buyers pay only for the item plus delivery. When enabled, the admin-set
 * percentage applies, clamped to the configured minimum and maximum.
 */
export function computePlatformFee(
  settings: PlatformFeeSettings | null | undefined,
  itemAmount: number
): PlatformFeeBreakdown {
  const enabled = Boolean(settings?.platformFeeEnabled);
  const percentage = Number(settings?.escrowPercentageFee) || 0;

  if (!enabled || percentage <= 0 || itemAmount <= 0) {
    return { enabled, percentage, amount: 0 };
  }

  const raw = Math.round(itemAmount * (percentage / 100));
  const minFee = Number(settings?.escrowMinFee) || 0;
  const maxFee = Number(settings?.escrowMaxFee) || 0;

  let amount = minFee > 0 ? Math.max(minFee, raw) : raw;
  if (maxFee > 0) amount = Math.min(maxFee, amount);

  return { enabled, percentage, amount };
}
