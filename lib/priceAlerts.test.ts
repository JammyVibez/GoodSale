// lib/priceAlerts.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ProductCondition, type Product } from '@/lib/types';
import {
  GOODSALE_PRICE_ALERTS_KEY,
  defaultPriceDropTarget,
  evaluatePriceDrops,
  readPriceAlerts,
  togglePriceAlertEntry,
  updatePriceAlertThreshold,
  writePriceAlerts,
  type StorageLike,
} from './priceAlerts';

function makeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function makeProduct(id: number, price: number, flashSalePrice?: number): Product {
  return {
    id,
    sellerId: 10,
    title: `Product ${id}`,
    description: 'Clean',
    category: 'Phones',
    brand: 'Apple',
    condition: ProductCondition.NEW,
    price,
    flashSalePrice,
    flashSaleStartsAt: flashSalePrice ? '2026-01-01T00:00:00.000Z' : undefined,
    flashSaleEndsAt: flashSalePrice ? '2030-01-01T00:00:00.000Z' : undefined,
    isNegotiable: false,
    quantity: 5,
    stockStatus: 'IN_STOCK',
    images: ['https://example.com/a.jpg'],
    deliveryMethod: 'Same-Day Rider',
    pickupAvailable: true,
    isAuction: false,
    viewCount: 10,
    createdAt: '2026-11-15T00:00:00.000Z',
  };
}

test('priceAlerts round-trips through storage and evaluates drops without duplicate notifications', () => {
  const storage = makeStorage();
  const target = defaultPriceDropTarget(200_000);
  assert.equal(target, 180_000);

  const added = togglePriceAlertEntry([], 7, 200_000);
  assert.equal(added.added, true);
  assert.equal(added.entry?.threshold, 180_000);

  writePriceAlerts(added.next, storage);
  const loaded = readPriceAlerts(storage);
  assert.equal(loaded.length, 1);
  assert.ok(storage.getItem(GOODSALE_PRICE_ALERTS_KEY)?.includes('180000'));

  const noDrop = evaluatePriceDrops(loaded, [makeProduct(7, 195_000)]);
  assert.equal(noDrop.triggered.length, 0);

  const dropped = evaluatePriceDrops(loaded, [makeProduct(7, 200_000, 170_000)]);
  assert.equal(dropped.triggered.length, 1);
  assert.equal(dropped.triggered[0].effectivePrice, 170_000);

  const repeatCheck = evaluatePriceDrops(dropped.nextEntries, [makeProduct(7, 200_000, 170_000)]);
  assert.equal(repeatCheck.triggered.length, 0);

  const updated = updatePriceAlertThreshold(dropped.nextEntries, 7, 160_000);
  assert.equal(updated[0].threshold, 160_000);
});
