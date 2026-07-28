/**
 * Pure payment helpers (unit-testable without Next/Supabase).
 */

/** Build Paystack reference: GS_<orderId>_<timestamp>_<rand> */
export function buildPaystackReference(orderId: number, now = Date.now(), rand = Math.random()): string {
  if (!Number.isFinite(orderId) || orderId <= 0) {
    throw new Error('orderId is required for Paystack reference');
  }
  const suffix = rand.toString(36).slice(2, 8);
  return `GS_${orderId}_${now}_${suffix}`;
}

/** Parse order id from GS_<orderId>_... reference */
export function parseOrderIdFromReference(reference: string): number | null {
  if (!reference) return null;
  const match = reference.trim().match(/^GS_(\d+)_/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Amount match with ₦1 (100 kobo) tolerance */
export function amountsMatchNaira(orderTotalNaira: number, amountKobo: number | null | undefined): boolean {
  if (amountKobo == null || amountKobo <= 0) return true;
  return Math.abs(Math.round(orderTotalNaira * 100) - amountKobo) <= 100;
}

export function computeEscrowFee(
  heldAmount: number,
  opts?: { pct?: number; min?: number; max?: number; deliveryFee?: number }
): { fee: number; payout: number } {
  const pct = opts?.pct ?? 1.5;
  const min = opts?.min ?? 100;
  const max = opts?.max ?? 15000;
  const deliveryFee = opts?.deliveryFee ?? 0;
  const raw = heldAmount * (pct / 100);
  const fee = Math.max(min, Math.min(max, raw));
  const payout = Math.max(0, heldAmount - deliveryFee - fee);
  return { fee, payout };
}

export function isPayableOrderStatus(status: string): boolean {
  return [
    'PENDING',
    'PENDING_BANK_TRANSFER',
    'PARTIAL_DEPOSIT_PAID',
    'INVOICE_SENT',
    'COD_PENDING',
  ].includes(status);
}

export function isAlreadyPaidStatus(status: string): boolean {
  return ['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DISPUTED'].includes(status);
}

export function isTerminalOrderStatus(status: string): boolean {
  return ['DELIVERED_SUCCESS', 'REFUNDED', 'CANCELLED'].includes(status);
}
