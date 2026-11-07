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

export interface OrderPaymentDue {
  /** Naira the buyer must pay right now. */
  amount: number;
  /** Which part of a partial-payment order this charge settles. */
  kind: 'FULL' | 'DEPOSIT' | 'BALANCE';
}

/**
 * Amount a buyer owes for the next payment on an order. A PARTIAL order pays a
 * deposit first and the remaining balance later; every other method is paid in
 * full once. Kept pure so checkout and server reconciliation agree.
 */
export function orderPaymentDue(order: {
  payment_method?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  deposit_percent?: number | string | null;
  balance_remaining?: number | string | null;
}): OrderPaymentDue {
  const total = Math.max(0, Number(order.total_amount) || 0);
  const method = String(order.payment_method || '').toUpperCase();
  const status = String(order.status || '').toUpperCase();
  if (method !== 'PARTIAL') return { amount: total, kind: 'FULL' };
  if (status === 'PARTIAL_DEPOSIT_PAID') {
    const explicit = order.balance_remaining != null ? Number(order.balance_remaining) : NaN;
    if (Number.isFinite(explicit)) return { amount: Math.max(0, explicit), kind: 'BALANCE' };
    const percent = Math.min(100, Math.max(1, Number(order.deposit_percent) || 30));
    return { amount: Math.max(0, total - Math.round((total * percent) / 100)), kind: 'BALANCE' };
  }
  const percent = Math.min(100, Math.max(1, Number(order.deposit_percent) || 30));
  return { amount: Math.round((total * percent) / 100), kind: 'DEPOSIT' };
}
