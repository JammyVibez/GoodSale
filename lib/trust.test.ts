// lib/trust.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '@/lib/data/empty-state';
import { OrderStatus, UserRole, type Order } from '@/lib/types';
import { computeSellerTrust } from './trust';

function makeOrder(id: number, buyerId: number, status: OrderStatus, hasProof: boolean): Order {
  return {
    id,
    orderNumber: `GS-${id}`,
    buyerId,
    sellerId: 10,
    productId: 100,
    productTitle: 'Studio Microphone',
    productImage: 'https://example.com/mic.jpg',
    totalAmount: 95_000,
    discountAmount: 0,
    deliveryFee: 2_500,
    taxAmount: 0,
    paymentMethod: 'ESCROW',
    deliveryMethod: 'GOODSALE_PARTNER',
    deliveryAddress: 'Ikeja',
    deliveryCity: 'Lagos',
    deliveryState: 'Lagos',
    deliveryPin: '123456',
    qrCodeToken: `QR-${id}`,
    status,
    goodPointsUsed: 0,
    createdAt: '2026-11-15T10:00:00.000Z',
    updatedAt: '2026-11-15T10:00:00.000Z',
    dispatchProof: hasProof
      ? {
          status: 'APPROVED',
          mediaUrl: 'https://example.com/proof.jpg',
          mediaType: 'image',
          submittedAt: '2026-11-15T10:05:00.000Z',
          submittedBy: 10,
        }
      : undefined,
  };
}

test('computeSellerTrust produces verifiable scorecard rates and repeat-buyer counts', () => {
  const db = createEmptyState();
  db.users.push({
    id: 10,
    fullName: 'Ada Electronics',
    username: 'ada',
    email: 'ada@example.com',
    phoneNumber: '08000000001',
    role: UserRole.VERIFIED_SELLER,
    referralCode: 'ADA',
    trustScore: 0,
    sellerLevel: 'GOLD',
    goodPoints: 0,
  });
  db.profiles.push({
    userId: 10,
    photoUrl: '',
    coverUrl: '',
    bio: '',
    address: '',
    area: '',
    city: 'Lagos',
    state: 'Lagos',
    deliveryPreference: 'DELIVERY',
    pushEnabled: false,
    emailEnabled: true,
    smsEnabled: false,
    onboardingStep: 6,
    wantsBuying: true,
    wantsSelling: true,
    marketplaceNotifications: true,
    marketingOptIn: false,
    sellerOnboardingStep: 5,
    verificationStatus: 'VERIFIED',
  });
  db.orders.push(
    makeOrder(1, 50, OrderStatus.DELIVERED_SUCCESS, true),
    makeOrder(2, 50, OrderStatus.DELIVERED_SUCCESS, true),
    makeOrder(3, 51, OrderStatus.PAID_ESCROW, false)
  );
  db.reviews.push({
    id: 1,
    reviewerId: 50,
    reviewerName: 'Tunde',
    reviewerPhoto: '',
    revieweeId: 10,
    rating: 5,
    comment: 'Exact item as shown in clip',
    isHelpfulVotes: 2,
    createdAt: '2026-11-15T12:00:00.000Z',
  });

  const trust = computeSellerTrust(db, 10);
  assert.equal(trust.isVerified, true);
  assert.equal(trust.totalOrders, 3);
  assert.equal(trust.completedOrders, 2);
  assert.equal(trust.fulfilmentRate, 100);
  assert.equal(trust.disputeFreeRate, 100);
  assert.equal(trust.proofRate, 67);
  assert.equal(trust.repeatBuyerCount, 1);
  assert.ok(trust.score >= 60);
});
