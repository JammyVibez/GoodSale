import { describe, expect, it } from 'vitest';
import { mapProduct, productToRow } from '@/lib/data/mappers';
import type { Product } from '@/lib/types';
import { ProductCondition } from '@/lib/types';

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 7,
    sellerId: 3,
    title: 'Samsung Galaxy A15 128GB',
    description: 'Brand new sealed phone.',
    category: 'Phones',
    brand: 'Samsung',
    condition: ProductCondition.NEW,
    price: 235000,
    isNegotiable: false,
    quantity: 24,
    stockStatus: 'IN_STOCK',
    images: ['https://example.test/a.jpg'],
    deliveryMethod: 'GoodSale Partner delivery',
    pickupAvailable: true,
    isAuction: false,
    viewCount: 12,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('product video mapping', () => {
  it('reads video_url off a row', () => {
    const row = { ...productToRow(baseProduct()), video_url: 'https://cdn.test/clip.mp4' };
    expect(mapProduct(row).videoUrl).toBe('https://cdn.test/clip.mp4');
  });

  it('leaves videoUrl undefined when the column is empty', () => {
    const row = { ...productToRow(baseProduct()), video_url: null };
    expect(mapProduct(row).videoUrl).toBeUndefined();
  });

  it('round-trips photos and the video to a row', () => {
    const product = baseProduct({ videoUrl: 'https://cdn.test/clip.mp4', images: ['a', 'b'] });
    const row = productToRow(product);
    expect(row.video_url).toBe('https://cdn.test/clip.mp4');
    expect(row.images).toEqual(['a', 'b']);
  });

  it('maps a missing video to null on write (clearing it)', () => {
    expect(productToRow(baseProduct()).video_url).toBeNull();
  });
});

describe('compare-at price mapping', () => {
  it('reads compare_at_price off a row', () => {
    const row = { ...productToRow(baseProduct()), compare_at_price: 300000 };
    expect(mapProduct(row).compareAtPrice).toBe(300000);
  });

  it('leaves compareAtPrice undefined when the seller did not set one', () => {
    const row = { ...productToRow(baseProduct()), compare_at_price: null };
    expect(mapProduct(row).compareAtPrice).toBeUndefined();
  });

  it('round-trips the reference price to the row', () => {
    expect(productToRow(baseProduct({ compareAtPrice: 300000 })).compare_at_price).toBe(300000);
    expect(productToRow(baseProduct()).compare_at_price).toBeNull();
  });
});
