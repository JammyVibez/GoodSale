// lib/offline/vault.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus, ProductCondition, type Order, type Product } from '@/lib/types';
import {
  clearOfflineQueue,
  enqueueOfflineAction,
  readOfflineVault,
  syncOfflineOrders,
  syncOfflineProducts,
  type StorageAdapter,
} from './vault';

function makeMemoryStorage(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

test('offline vault caches buyer delivery PINs while keeping seller view redacted', () => {
  const storage = makeMemoryStorage();
  const orders: Order[] = [
    {
      id: 11,
      orderNumber: 'GS-2026-11',
      buyerId: 5,
      sellerId: 9,
      productId: 40,
      productTitle: 'Camera Lens',
      productImage: 'https://example.com/lens.jpg',
      totalAmount: 185_000,
      discountAmount: 0,
      deliveryFee: 2_000,
      taxAmount: 0,
      paymentMethod: 'ESCROW',
      deliveryMethod: 'GOODSALE_PARTNER',
      deliveryAddress: 'Victoria Island',
      deliveryCity: 'Lagos',
      deliveryState: 'Lagos',
      deliveryPin: '654321',
      qrCodeToken: 'QR-GS-11',
      status: OrderStatus.SHIPPED,
      goodPointsUsed: 0,
      createdAt: '2026-11-15T08:00:00.000Z',
      updatedAt: '2026-11-15T08:00:00.000Z',
    },
  ];

  const buyerSnap = syncOfflineOrders(orders, 5, storage);
  assert.equal(buyerSnap.length, 1);
  assert.equal(buyerSnap[0].deliveryPin, '654321');

  const sellerStorage = makeMemoryStorage();
  const sellerSnap = syncOfflineOrders(orders, 9, sellerStorage);
  assert.equal(sellerSnap[0].deliveryPin, '');
});

test('offline vault snapshots cart/wishlist products and deduplicates queued offline actions', () => {
  const storage = makeMemoryStorage();
  const products: Product[] = [
    {
      id: 40,
      sellerId: 9,
      title: 'Camera Lens',
      description: 'Sharp 50mm',
      category: 'Electronics',
      brand: 'Sony',
      condition: ProductCondition.GOOD,
      price: 180_000,
      quantity: 1,
      stockStatus: 'IN_STOCK',
      images: ['https://example.com/lens.jpg'],
      deliveryMethod: 'Same-Day Rider',
      pickupAvailable: true,
      isAuction: false,
      isNegotiable: true,
      createdAt: '2026-11-15T08:00:00.000Z',
      viewCount: 10,
      likes: 2,
      cartAdds: 1,
    },
  ];

  syncOfflineProducts(products, [40], storage);
  enqueueOfflineAction({ kind: 'CART_ADD', productId: 40 }, storage);
  enqueueOfflineAction({ kind: 'CART_ADD', productId: 40 }, storage);

  const vault = readOfflineVault(storage);
  assert.equal(vault.products.length, 1);
  assert.equal(vault.products[0].title, 'Camera Lens');
  assert.equal(vault.queue.length, 1);
  assert.ok(vault.lastSyncedAt);

  clearOfflineQueue(storage);
  assert.equal(readOfflineVault(storage).queue.length, 0);
});
