import { describe, expect, it } from 'vitest';
import {
  imagesFor,
  seedBuyers,
  seedProducts,
  seedReviews,
  seedSellers,
  seedSummary,
  thumbUrl,
} from '@/lib/seed/catalog';

const sellers = seedSellers();
const products = seedProducts();
const buyers = seedBuyers();
const reviews = seedReviews();

describe('seeded marketplace — sellers', () => {
  it('creates exactly 20 Nigerian seller accounts', () => {
    expect(sellers).toHaveLength(20);
  });

  it('mixes market stores, registered businesses and individual sellers', () => {
    const kinds = sellers.reduce<Record<string, number>>((acc, s) => {
      acc[s.kind] = (acc[s.kind] || 0) + 1;
      return acc;
    }, {});
    expect(kinds.MARKET_STORE).toBeGreaterThanOrEqual(5);
    expect(kinds.BUSINESS).toBeGreaterThanOrEqual(4);
    expect(kinds.INDIVIDUAL).toBeGreaterThanOrEqual(6);
    expect(Object.keys(kinds).sort()).toEqual(['BUSINESS', 'INDIVIDUAL', 'MARKET_STORE']);
  });

  it('has unique usernames, slugs and emails', () => {
    expect(new Set(sellers.map((s) => s.username)).size).toBe(sellers.length);
    expect(new Set(sellers.map((s) => s.slug)).size).toBe(sellers.length);
    expect(new Set(sellers.map((s) => s.email)).size).toBe(sellers.length);
    for (const seller of sellers) expect(seller.email).toMatch(/@sellers\.goodsale\.ng$/);
  });

  it('spreads across real Nigerian states including Niger State / Minna', () => {
    const states = new Set(sellers.map((s) => s.state));
    expect(states.size).toBeGreaterThanOrEqual(12);
    expect(states.has('Niger State')).toBe(true);
    const minna = sellers.find((s) => s.city === 'Minna');
    expect(minna?.state).toBe('Niger State');
  });

  it('describes every seller well enough to look real', () => {
    for (const seller of sellers) {
      expect(seller.fullName.split(' ').length).toBeGreaterThanOrEqual(2);
      expect(seller.bio.length).toBeGreaterThan(40);
      expect(seller.phone).toMatch(/^\+234 /);
      // Local monogram avatars — never third-party stock faces under Nigerian names.
      expect(seller.photoUrl).toMatch(/^\/api\/avatar\?name=/);
      expect(seller.photoUrl).not.toContain('pravatar');
      expect(seller.trustScore).toBeGreaterThan(60);
      expect(seller.goodPoints).toBeGreaterThan(0);
      expect(seller.joinedDaysAgo).toBeGreaterThan(30);
    }
  });

  it('gives every business storefront real storefront copy', () => {
    const withBusiness = sellers.filter((s) => s.business);
    expect(withBusiness.length).toBeGreaterThanOrEqual(10);
    for (const seller of withBusiness) {
      expect(seller.business!.name.length).toBeGreaterThan(4);
      expect(seller.business!.description.length).toBeGreaterThan(40);
      expect(seller.business!.openingHours).toMatch(/Mon/);
      expect(seller.business!.followers).toBeGreaterThan(100);
      expect(seller.business!.logoUrl).toMatch(/^\/api\/avatar\?name=/);
      expect(seller.role).toMatch(/VERIFIED/);
    }
  });
});

describe('seeded marketplace — products', () => {
  it('creates exactly 100 listings', () => {
    expect(products).toHaveLength(100);
  });

  it('gives every seller listings and unique slugs', () => {
    const bySeller = new Map<string, number>();
    for (const product of products) bySeller.set(product.sellerSlug, (bySeller.get(product.sellerSlug) || 0) + 1);
    expect(bySeller.size).toBe(sellers.length);
    expect(Math.min(...bySeller.values())).toBeGreaterThanOrEqual(5);
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
  });

  it('only references sellers that exist', () => {
    const slugs = new Set(sellers.map((s) => s.slug));
    for (const product of products) expect(slugs.has(product.sellerSlug)).toBe(true);
  });

  it('attaches real product photos to every listing', () => {
    for (const product of products) {
      expect(product.images.length).toBeGreaterThanOrEqual(1);
      for (const url of product.images) {
        expect(url.startsWith('https://')).toBe(true);
        expect(url).toMatch(/\.(jpe?g|png)$/i);
      }
    }
  });

  it('prices, stock and copy are marketplace-realistic', () => {
    for (const product of products) {
      expect(product.price).toBeGreaterThanOrEqual(9000);
      expect(product.price).toBeLessThanOrEqual(500000);
      expect(product.quantity).toBeGreaterThan(0);
      expect(product.title.length).toBeGreaterThan(10);
      expect(product.description.length).toBeGreaterThan(60);
      expect(product.brand.length).toBeGreaterThan(1);
      expect(product.category.length).toBeGreaterThan(2);
      expect(['IN_STOCK', 'LOW_STOCK']).toContain(product.stockStatus);
      expect(product.viewCount).toBeGreaterThan(0);
      expect(product.returnPolicy?.length).toBeGreaterThan(20);
    }
  });

  it('only sets a compare-at price above the real selling price', () => {
    const withCompareAt = products.filter((p) => typeof p.compareAtPrice === 'number');
    expect(withCompareAt.length).toBeGreaterThan(0);
    for (const product of withCompareAt) {
      expect(product.compareAtPrice!).toBeGreaterThan(product.price);
    }
  });

  it('covers a wide spread of categories', () => {
    const categories = new Set(products.map((p) => p.category));
    expect(categories.size).toBeGreaterThanOrEqual(6);
    for (const expected of ['Phones', 'Electronics', 'Fashion', 'Groceries', 'Beauty']) {
      expect(categories.has(expected)).toBe(true);
    }
  });
});

describe('seeded marketplace — buyers and reviews', () => {
  it('creates four verified-looking buyer accounts', () => {
    expect(buyers).toHaveLength(4);
    for (const buyer of buyers) {
      expect(buyer.email).toMatch(/@buyers\.goodsale\.ng$/);
      expect(buyer.photoUrl).toMatch(/^\/api\/avatar\?name=/);
    }
    expect(new Set(buyers.map((b) => b.username)).size).toBe(4);
    // Avatars must be derived from the account's own name, not an external face pool.
    expect(buyers.map((b) => b.photoUrl)).toEqual(
      buyers.map((b) => `/api/avatar?name=${encodeURIComponent(b.fullName)}`)
    );
  });

  it('writes believable reviews that point at real products and buyers', () => {
    expect(reviews.length).toBeGreaterThanOrEqual(40);
    const productSlugs = new Set(products.map((p) => p.slug));
    const buyerSlugs = new Set(buyers.map((b) => b.slug));
    for (const review of reviews) {
      expect(productSlugs.has(review.productSlug)).toBe(true);
      expect(buyerSlugs.has(review.buyerSlug)).toBe(true);
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
      expect(review.comment.length).toBeGreaterThan(40);
      expect(review.daysAgo).toBeGreaterThan(0);
      // Every review names the actual listing, so a review can never describe a
      // product it is not attached to.
      const product = products.find((p) => p.slug === review.productSlug)!;
      const handle = product.title
        .replace(/\s*[—–-]\s*.*$/, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ');
      const named =
        review.comment.includes(handle) ||
        review.comment.toLowerCase().includes(product.category.toLowerCase());
      expect(named).toBe(true);
    }
  });

  it('reads like a real market — mostly positive, with honest criticism mixed in', () => {
    const ratings = reviews.map((r) => r.rating);
    const positive = ratings.filter((r) => r >= 4).length;
    const critical = ratings.filter((r) => r <= 3).length;
    expect(positive / ratings.length).toBeGreaterThan(0.7);
    expect(critical).toBeGreaterThan(0);
    expect(critical / ratings.length).toBeLessThan(0.25);
    expect(new Set(ratings).size).toBeGreaterThanOrEqual(3);
  });

  it('leaves some reviews unanswered and answers others from the seller', () => {
    const replied = reviews.filter((r) => r.sellerReply);
    expect(replied.length).toBeGreaterThan(0);
    expect(replied.length).toBeLessThan(reviews.length);
  });
});

describe('image handling', () => {
  it('serves Wikimedia originals through the thumbnail endpoint', () => {
    const original = 'https://upload.wikimedia.org/wikipedia/commons/1/16/Rice.jpg';
    expect(thumbUrl(original, 1000)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Rice.jpg/1000px-Rice.jpg'
    );
  });

  it('leaves already-thumbnailed and non-Wikimedia URLs alone', () => {
    const thumb = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/Rice.jpg/1280px-Rice.jpg';
    expect(thumbUrl(thumb)).toBe(thumb);
    const avatar = 'https://i.pravatar.cc/300?img=12';
    expect(thumbUrl(avatar)).toBe(avatar);
  });

  it('returns distinct photos per listing and rotates across the category pool', () => {
    const first = imagesFor('smartphone', 0);
    const second = imagesFor('smartphone', 1);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first).not.toEqual(second);
    expect(imagesFor('generator', 0).every((u) => u.includes('/thumb/') || u.includes('thumb.'))).toBe(true);
  });
});

describe('seed summary', () => {
  it('reports the catalog the admin panel displays', () => {
    const summary = seedSummary();
    expect(summary.sellers).toBe(20);
    expect(summary.products).toBe(100);
    expect(summary.buyers).toBe(4);
    expect(summary.reviews).toBe(reviews.length);
    expect(summary.businesses + summary.individualSellers).toBe(20);
    expect(summary.states.length).toBeGreaterThanOrEqual(12);
  });
});
