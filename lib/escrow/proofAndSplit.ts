// lib/escrow/proofAndSplit.ts
import { OrderStatus, type DispatchProof, type Order } from '@/lib/types';

export interface SplitPayInput {
  itemTotal: number;
  deliveryFee: number;
  taxAmount?: number;
  protectFee?: number;
  pointsDiscount?: number;
  depositPercent?: number;
  remainingDays?: number;
}

export interface SplitPayBreakdown {
  totalAmount: number;
  depositPercent: number;
  depositAmountPaid: number;
  balanceRemaining: number;
  remainingDays: number;
  dueDateIso: string;
}

export function clampDepositPercent(percent?: number): number {
  const raw = Number(percent);
  if (!Number.isFinite(raw)) return 30;
  return Math.min(90, Math.max(10, Math.round(raw)));
}

export function calculateSplitPayBreakdown(input: SplitPayInput, now = new Date()): SplitPayBreakdown {
  const itemTotal = Math.max(0, Math.round(Number(input.itemTotal) || 0));
  const deliveryFee = Math.max(0, Math.round(Number(input.deliveryFee) || 0));
  const taxAmount = Math.max(0, Math.round(Number(input.taxAmount) || 0));
  const protectFee = Math.max(0, Math.round(Number(input.protectFee) || 0));
  const pointsDiscount = Math.max(0, Math.round(Number(input.pointsDiscount) || 0));

  const totalAmount = Math.max(0, itemTotal + deliveryFee + taxAmount + protectFee - pointsDiscount);
  const depositPercent = clampDepositPercent(input.depositPercent);
  const depositAmountPaid = Math.min(totalAmount, Math.round(totalAmount * (depositPercent / 100)));
  const balanceRemaining = Math.max(0, totalAmount - depositAmountPaid);
  const remainingDays = Math.min(30, Math.max(1, Math.round(Number(input.remainingDays) || 7)));

  const dueDate = new Date(now.getTime() + remainingDays * 86_400_000);

  return {
    totalAmount,
    depositPercent,
    depositAmountPaid,
    balanceRemaining,
    remainingDays,
    dueDateIso: dueDate.toISOString(),
  };
}

export function canSellerSubmitProof(status: OrderStatus): boolean {
  return [
    OrderStatus.PAID_ESCROW,
    OrderStatus.PARTIAL_DEPOSIT_PAID,
  ].includes(status);
}

export function canBuyerReviewProof(order: Pick<Order, 'status' | 'dispatchProof'>): boolean {
  if (!order.dispatchProof) return false;
  if (![OrderStatus.PAID_ESCROW, OrderStatus.PARTIAL_DEPOSIT_PAID, OrderStatus.SHIPPED].includes(order.status)) {
    return false;
  }
  return order.dispatchProof.status === 'SUBMITTED';
}

export function createSubmittedDispatchProof(params: {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  note?: string;
  sellerId: number;
  now?: Date;
}): DispatchProof {
  const mediaUrl = params.mediaUrl.trim();
  if (!mediaUrl) {
    throw new Error('Condition proof media URL is required.');
  }
  return {
    status: 'SUBMITTED',
    mediaUrl,
    mediaType: params.mediaType,
    note: (params.note || '').trim() || 'Live pre-dispatch condition verification attached.',
    submittedAt: (params.now || new Date()).toISOString(),
    submittedBy: params.sellerId,
  };
}

export function reviewDispatchProofState(
  existing: DispatchProof | undefined,
  decision: 'APPROVED' | 'CHANGES_REQUESTED',
  buyerId: number,
  buyerNote?: string,
  now = new Date()
): DispatchProof {
  if (!existing) {
    throw new Error('No pre-dispatch condition proof has been uploaded yet.');
  }
  if (decision === 'CHANGES_REQUESTED' && !(buyerNote || '').trim()) {
    throw new Error('Please describe what needs a clearer photo or video check.');
  }
  return {
    ...existing,
    status: decision,
    reviewedAt: now.toISOString(),
    reviewedBy: buyerId,
    buyerNote: (buyerNote || '').trim() || undefined,
  };
}

export interface PayoutSummary {
  eligible: boolean;
  reason?: string;
  grossOrderTotal: number;
  deliveryDeduction: number;
  platformFeeDeduction: number;
  protectFeeDeduction: number;
  netSellerPayout: number;
}

export function computeInstantPayoutSummary(order: Pick<
  Order,
  'status' | 'totalAmount' | 'deliveryFee' | 'taxAmount' | 'protectFee' | 'balanceRemaining' | 'isBalanceSettled'
>): PayoutSummary {
  const gross = Math.max(0, Math.round(Number(order.totalAmount) || 0));
  const delivery = Math.max(0, Math.round(Number(order.deliveryFee) || 0));
  const tax = Math.max(0, Math.round(Number(order.taxAmount) || 0));
  const protect = Math.max(0, Math.round(Number(order.protectFee) || 0));
  const netSellerPayout = Math.max(0, gross - delivery - tax - protect);

  const unsettledBalance = Number(order.balanceRemaining || 0) > 0 && !order.isBalanceSettled;
  if (unsettledBalance) {
    return {
      eligible: false,
      reason: 'Split-pay balance must be settled before escrow can be released to the seller.',
      grossOrderTotal: gross,
      deliveryDeduction: delivery,
      platformFeeDeduction: tax,
      protectFeeDeduction: protect,
      netSellerPayout,
    };
  }

  if ([OrderStatus.CANCELLED, OrderStatus.REFUNDED, OrderStatus.DISPUTED, OrderStatus.REFUND_REQUESTED].includes(order.status)) {
    return {
      eligible: false,
      reason: 'Escrow cannot be released while the order is cancelled, refunded, or under dispute.',
      grossOrderTotal: gross,
      deliveryDeduction: delivery,
      platformFeeDeduction: tax,
      protectFeeDeduction: protect,
      netSellerPayout,
    };
  }

  return {
    eligible: true,
    grossOrderTotal: gross,
    deliveryDeduction: delivery,
    platformFeeDeduction: tax,
    protectFeeDeduction: protect,
    netSellerPayout,
  };
}
