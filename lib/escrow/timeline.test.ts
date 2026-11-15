// lib/escrow/timeline.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus, type Order } from '@/lib/types';
import { deriveEscrowTimeline } from './timeline';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    orderNumber: 'GS-20261115-1001',
    buyerId: 10,
    sellerId: 20,
    productId: 30,
    productTitle: 'iPhone 14 Pro 256GB',
    productImage: 'https://example.com/phone.jpg',
    totalAmount: 750_000,
    discountAmount: 0,
    deliveryFee: 3_500,
    taxAmount: 0,
    paymentMethod: 'ESCROW',
    deliveryMethod: 'GOODSALE_PARTNER',
    deliveryAddress: '12 Admiralty Way, Lekki',
    deliveryCity: 'Lagos',
    deliveryState: 'Lagos',
    deliveryPin: '492817',
    qrCodeToken: 'QR-1001',
    status: OrderStatus.PAID_ESCROW,
    goodPointsUsed: 0,
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    ...overrides,
  };
}

test('deriveEscrowTimeline tracks proof submission and PIN readiness accurately', () => {
  const waitingProof = deriveEscrowTimeline({ order: makeOrder() });
  assert.equal(waitingProof.activeStepIndex, 1);
  assert.equal(waitingProof.canApproveProof, false);
  assert.equal(waitingProof.canReleaseWithPin, true);

  const submittedProof = deriveEscrowTimeline({
    order: makeOrder({
      dispatchProof: {
        status: 'SUBMITTED',
        mediaUrl: 'https://example.com/proof.jpg',
        mediaType: 'image',
        submittedAt: '2026-11-15T10:15:00.000Z',
        submittedBy: 20,
      },
    }),
  });
  assert.equal(submittedProof.activeStepIndex, 1);
  assert.equal(submittedProof.canApproveProof, true);
  assert.match(submittedProof.headline, /Review live condition proof/i);

  const outForDelivery = deriveEscrowTimeline({
    order: makeOrder({
      status: OrderStatus.OUT_FOR_DELIVERY,
      dispatchProof: {
        status: 'APPROVED',
        mediaUrl: 'https://example.com/proof.jpg',
        mediaType: 'image',
        submittedAt: '2026-11-15T10:15:00.000Z',
        submittedBy: 20,
        reviewedAt: '2026-11-15T10:20:00.000Z',
        reviewedBy: 10,
      },
    }),
  });
  assert.equal(outForDelivery.activeStepIndex, 3);
  assert.equal(outForDelivery.steps[1].state, 'done');
  assert.equal(outForDelivery.canReleaseWithPin, true);
});

test('deriveEscrowTimeline blocks PIN release for unsettled split-pay and flags disputes', () => {
  const splitPay = deriveEscrowTimeline({
    order: makeOrder({
      status: OrderStatus.PARTIAL_DEPOSIT_PAID,
      depositAmountPaid: 225_000,
      balanceRemaining: 525_000,
      isBalanceSettled: false,
    }),
  });
  assert.equal(splitPay.splitPayPending, true);
  assert.equal(splitPay.canReleaseWithPin, false);
  assert.equal(splitPay.activeStepIndex, 0);

  const disputed = deriveEscrowTimeline({
    order: makeOrder({ status: OrderStatus.DISPUTED }),
  });
  assert.equal(disputed.mode, 'TERMINAL_ISSUE');
  assert.equal(disputed.steps[3].state, 'issue');
});
