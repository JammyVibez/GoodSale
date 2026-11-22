// lib/marketplace/discovery.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus, ProductCondition, type Order, type Product } from '@/lib/types';
import {
  computeFulfillmentEta,
  getRepeatBuyerPicks,
  matchesDiscoveryFilters,
  sortProductsByMode,
} from './discovery';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sellerId: 10,
    title: 'Sample Item',
    description: 'Clean unit',
    category: 'Phones',
    brand: 'Apple',
    condition: ProductCondition.GOOD,
    price: 250_000,
    quantity: 3,
    stockStatus: 'IN_STOCK',
    images: ['https://example.com/a.jpg'],
    deliveryMethod: 'Same-Day Rider',
    pickupAvailable: true,
    isAuction: false,
    isNegotiable: true,
    createdAt: '2026-11-10T10:00:00.000Z',
    viewCount: 40,
    likes: 5,
    cartAdds: 2,
    paymentMethods: ['escrow', 'partial'],
    partialPercent: 30,
    partialRemainingDays: 7,
    ...overrides,
  };
}

test('computeFulfillmentEta identifies same-day, video demo, split-pay, and SafeMeet capabilities', () => {
  const prod = makeProduct({ videoUrl: 'https://cdn.example.com/demo.mp4' });
  const sameDay = computeFulfillmentEta(prod, 'Lagos State', 'Lagos');
  assert.equal(sameDay.tier, 'SAME_DAY');
  assert.equal(sameDay.shortLabel, 'Same-day');
  assert.equal(sameDay.hasSafeMeet, true);
  assert.equal(sameDay.supportsSplitPay, true);
  assert.equal(sameDay.hasVideoDemo, true);

  const interstate = computeFulfillmentEta(prod, 'Abuja FCT', 'Lagos State');
  assert.equal(interstate.tier, 'EXPRESS_1_2D');
});

test('matchesDiscoveryFilters filters hyper-local speed, video demos, split-pay, and condition', () => {
  const lagosVideo = makeProduct({
    id: 1,
    sellerId: 10,
    videoUrl: 'https://cdn.example.com/1.mp4',
    condition: ProductCondition.NEW,
  });
  const abujaNoVideo = makeProduct({
    id: 2,
    sellerId: 20,
    pickupAvailable: false,
    paymentMethods: ['escrow'],
    condition: ProductCondition.GOOD,
  });

  const ctx = {
    buyerState: 'Lagos',
    sellerStates: new Map([
      [10, 'Lagos State'],
      [20, 'Abuja'],
    ]),
    verifiedSellerIds: new Set([10]),
  };

  assert.equal(
    matchesDiscoveryFilters(lagosVideo, { sameDayOnly: true, videoOnly: true, splitPayOnly: true, condition: ProductCondition.NEW }, ctx),
    true
  );
  assert.equal(
    matchesDiscoveryFilters(abujaNoVideo, { sameDayOnly: true }, ctx),
    false
  );
  assert.equal(
    matchesDiscoveryFilters(abujaNoVideo, { splitPayOnly: true }, ctx),
    false
  );
});

test('sortProductsByMode fastest puts same-day local and SafeMeet items first', () => {
  const remote = makeProduct({ id: 1, sellerId: 20, pickupAvailable: false, viewCount: 500 });
  const local = makeProduct({ id: 2, sellerId: 10, pickupAvailable: true, viewCount: 10 });
  const sorted = sortProductsByMode([remote, local], 'fastest', {
    buyerState: 'Lagos',
    sellerStates: new Map([
      [10, 'Lagos'],
      [20, 'Rivers'],
    ]),
  });
  assert.equal(sorted[0].id, 2);
});

test('getRepeatBuyerPicks prioritizes in-stock past purchases then trusted seller inventory', () => {
  const p1 = makeProduct({ id: 101, sellerId: 10, category: 'Groceries' });
  const p2 = makeProduct({ id: 102, sellerId: 10, category: 'Electronics' });
  const p3 = makeProduct({ id: 103, sellerId: 99, category: 'Fashion' });

  const orders: Order[] = [
    {
      id: 1,
      orderNumber: 'GS-1',
      buyerId: 5,
      sellerId: 10,
      productId: 101,
      productTitle: p1.title,
      productImage: p1.images[0],
      totalAmount: 10_000,
      discountAmount: 0,
      deliveryFee: 1_000,
      taxAmount: 0,
      paymentMethod: 'ESCROW',
      deliveryMethod: 'GOODSALE_PARTNER',
      deliveryAddress: 'Lekki',
      deliveryCity: 'Lagos',
      deliveryState: 'Lagos',
      deliveryPin: '123456',
      qrCodeToken: 'QR-GS-1',
      status: OrderStatus.DELIVERED_SUCCESS,
      goodPointsUsed: 0,
      createdAt: '2026-11-12T10:00:00.000Z',
      updatedAt: '2026-11-12T10:00:00.000Z',
    },
  ];

  const picks = getRepeatBuyerPicks({ buyerOrders: orders, products: [p3, p2, p1], maxItems: 4 });
  assert.deepEqual(
    picks.map((p) => p.id),
    [101, 102]
  );
});
