// lib/marketplace/search.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProductCondition, type Product } from '@/lib/types';
import { matchesDiscoveryFilters } from './discovery';
import { parseSmartSearchQuery } from './search';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    sellerId: 10,
    title: 'iPhone 14 Pro 256GB',
    description: 'Factory unlocked, face ID crisp',
    category: 'Phones',
    brand: 'Apple',
    condition: ProductCondition.LIKE_NEW,
    price: 480_000,
    quantity: 2,
    stockStatus: 'IN_STOCK',
    images: ['https://example.com/iphone.jpg'],
    deliveryMethod: 'Same-Day Rider',
    pickupAvailable: true,
    isAuction: false,
    isNegotiable: true,
    createdAt: '2026-11-15T10:00:00.000Z',
    viewCount: 55,
    paymentMethods: ['escrow', 'partial'],
    videoUrl: 'https://cdn.example.com/clip.mp4',
    ...overrides,
  };
}

test('parseSmartSearchQuery extracts price ceilings, state aliases, and speed intents cleanly', () => {
  const parsed = parseSmartSearchQuery('iphone lagos under 500k same day split');
  assert.equal(parsed.maxPrice, 500_000);
  assert.equal(parsed.inferredState, 'Lagos');
  assert.equal(parsed.sameDayRequested, true);
  assert.equal(parsed.splitPayRequested, true);
  assert.deepEqual(parsed.textTerms, ['iphone']);
  assert.ok(parsed.chips.length >= 4);
});

test('matchesDiscoveryFilters executes natural-language smart queries end-to-end', () => {
  const lagosPhone = makeProduct();
  const expensiveAbujaPhone = makeProduct({ id: 2, sellerId: 20, price: 850_000, pickupAvailable: false });
  const ctx = {
    buyerState: 'Lagos',
    sellerStates: new Map([
      [10, 'Lagos State'],
      [20, 'Abuja (FCT)'],
    ]),
  };

  assert.equal(
    matchesDiscoveryFilters(lagosPhone, { query: 'apple lagos under 500k safemeet' }, ctx),
    true
  );
  assert.equal(
    matchesDiscoveryFilters(expensiveAbujaPhone, { query: 'apple lagos under 500k safemeet' }, ctx),
    false
  );
});
