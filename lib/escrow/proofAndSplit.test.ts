// lib/escrow/proofAndSplit.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus } from '@/lib/types';
import {
  calculateSplitPayBreakdown,
  canBuyerReviewProof,
  canSellerSubmitProof,
  computeInstantPayoutSummary,
  createSubmittedDispatchProof,
  reviewDispatchProofState,
} from './proofAndSplit';

test('calculateSplitPayBreakdown splits deposit and remaining balance cleanly', () => {
  const fixedNow = new Date('2026-11-15T10:00:00.000Z');
  const res = calculateSplitPayBreakdown(
    {
      itemTotal: 100_000,
      deliveryFee: 3_500,
      taxAmount: 1_500,
      protectFee: 1_500,
      pointsDiscount: 500,
      depositPercent: 30,
      remainingDays: 7,
    },
    fixedNow
  );

  assert.equal(res.totalAmount, 106_000);
  assert.equal(res.depositPercent, 30);
  assert.equal(res.depositAmountPaid, 31_800);
  assert.equal(res.balanceRemaining, 74_200);
  assert.equal(res.depositAmountPaid + res.balanceRemaining, res.totalAmount);
  assert.equal(res.dueDateIso, '2026-11-22T10:00:00.000Z');
});

test('calculateSplitPayBreakdown clamps extreme deposit percentages', () => {
  const low = calculateSplitPayBreakdown({ itemTotal: 50_000, deliveryFee: 0, depositPercent: 2 });
  const high = calculateSplitPayBreakdown({ itemTotal: 50_000, deliveryFee: 0, depositPercent: 99 });
  assert.equal(low.depositPercent, 10);
  assert.equal(high.depositPercent, 90);
});

test('pre-dispatch proof lifecycle validates seller upload and buyer review', () => {
  assert.equal(canSellerSubmitProof(OrderStatus.PAID_ESCROW), true);
  assert.equal(canSellerSubmitProof(OrderStatus.PARTIAL_DEPOSIT_PAID), true);
  assert.equal(canSellerSubmitProof(OrderStatus.DELIVERED_SUCCESS), false);

  const submitted = createSubmittedDispatchProof({
    mediaUrl: 'https://cdn.example.com/clip.mp4',
    mediaType: 'video',
    note: 'Serial number and screen test shown',
    sellerId: 12,
    now: new Date('2026-11-15T12:00:00.000Z'),
  });
  assert.equal(submitted.status, 'SUBMITTED');
  assert.equal(
    canBuyerReviewProof({ status: OrderStatus.PAID_ESCROW, dispatchProof: submitted }),
    true
  );

  assert.throws(() =>
    reviewDispatchProofState(submitted, 'CHANGES_REQUESTED', 99, '   ')
  );

  const approved = reviewDispatchProofState(
    submitted,
    'APPROVED',
    99,
    'Looks crisp, please ship!',
    new Date('2026-11-15T12:15:00.000Z')
  );
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.reviewedBy, 99);
  assert.equal(
    canBuyerReviewProof({ status: OrderStatus.PAID_ESCROW, dispatchProof: approved }),
    false
  );
});

test('computeInstantPayoutSummary blocks unsettled split-pay and computes net seller credit', () => {
  const blocked = computeInstantPayoutSummary({
    status: OrderStatus.PARTIAL_DEPOSIT_PAID,
    totalAmount: 100_000,
    deliveryFee: 3_000,
    taxAmount: 1_500,
    protectFee: 1_500,
    balanceRemaining: 70_000,
    isBalanceSettled: false,
  });
  assert.equal(blocked.eligible, false);

  const ready = computeInstantPayoutSummary({
    status: OrderStatus.OUT_FOR_DELIVERY,
    totalAmount: 100_000,
    deliveryFee: 3_000,
    taxAmount: 1_500,
    protectFee: 1_500,
    balanceRemaining: 0,
    isBalanceSettled: true,
  });
  assert.equal(ready.eligible, true);
  assert.equal(ready.netSellerPayout, 94_000);
});
