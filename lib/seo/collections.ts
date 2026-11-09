/**
 * Server-side collection logic for the public listing routes.
 *
 * Every figure here comes from the live catalogue: a discount exists only when
 * the seller set a higher reference price (or a running flash sale), and
 * "trending" is ordered by real listing views and reviews.
 */
import type { SeoProduct } from './data';
import type { CollectionSlug, CollectionSort } from '@/lib/marketplace/collections';

export interface PricedProduct {
  product: SeoProduct;
  /** What the buyer actually pays right now. */
  price: number;
  /** Reference price to strike through, when one exists. */
  compareAt: number | null;
  /** Whole-number percentage off, or 0. */
  discount: number;
  flashSale: boolean;
}

function flashWindow(product: SeoProduct, now = Date.now()): { price: number; endsAt: string } | null {
  const price = Number(product.flashSalePrice) || 0;
  if (!price || price >= product.price) return null;
  const start = product.flashSaleStartsAt ? new Date(product.flashSaleStartsAt).getTime() : 0;
  const end = product.flashSaleEndsAt ? new Date(product.flashSaleEndsAt).getTime() : NaN;
  if (!Number.isFinite(end) || now < start || now >= end) return null;
  return { price, endsAt: product.flashSaleEndsAt as string };
}

export function priceInfo(product: SeoProduct, now = Date.now()): PricedProduct {
  const flash = flashWindow(product, now);
  if (flash) {
    return {
      product,
      price: flash.price,
      compareAt: product.price,
      discount: Math.max(1, Math.round(((product.price - flash.price) / product.price) * 100)),
      flashSale: true,
    };
  }
  const compareAt = Number(product.compareAtPrice) || 0;
  const discounted = compareAt > product.price;
  return {
    product,
    price: product.price,
    compareAt: discounted ? compareAt : null,
    discount: discounted ? Math.round(((compareAt - product.price) / compareAt) * 100) : 0,
    flashSale: false,
  };
}

/** Soonest flash-sale end across a set of priced products. */
export function soonestFlashEnd(items: PricedProduct[]): string | null {
  const ends = items
    .filter((item) => item.flashSale)
    .map((item) => item.product.flashSaleEndsAt as string)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return ends[0] || null;
}

function trendingScore(item: PricedProduct): number {
  const { product } = item;
  return product.viewCount * 2 + product.reviewCount * 40 + (product.rating || 0) * 30;
}

export function sortProducts(items: PricedProduct[], sort: CollectionSort): PricedProduct[] {
  const list = [...items];
  switch (sort) {
    case 'price_asc':
      return list.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return list.sort((a, b) => b.price - a.price);
    case 'newest':
      return list.sort((a, b) => new Date(b.product.createdAt).getTime() - new Date(a.product.createdAt).getTime());
    case 'discount':
      return list.sort((a, b) => b.discount - a.discount || a.price - b.price);
    case 'rating':
      return list.sort((a, b) => (b.product.rating || 0) - (a.product.rating || 0) || b.product.reviewCount - a.product.reviewCount);
    default:
      return list;
  }
}

/**
 * The products a collection shows.
 *
 * Returns the unranked set (already in catalogue ranking order) — callers apply
 * the buyer's sort on top.
 */
export function selectCollection(
  slug: CollectionSlug,
  products: SeoProduct[],
  featuredIds: number[] = []
): PricedProduct[] {
  const priced = products.map((product) => priceInfo(product));
  switch (slug) {
    case 'featured': {
      const ids = new Set(featuredIds);
      const promoted = priced.filter((item) => ids.has(item.product.id));
      // No paid placement running: keep the page useful with the highest-rated
      // live listings rather than showing an empty collection.
      if (promoted.length > 0) return promoted;
      return priced
        .filter((item) => item.product.inStock)
        .sort((a, b) => (b.product.rating || 0) - (a.product.rating || 0) || b.product.viewCount - a.product.viewCount);
    }
    case 'flash-deals':
      return priced.filter((item) => item.flashSale);
    case 'trending':
      return priced.filter((item) => item.product.inStock).sort((a, b) => trendingScore(b) - trendingScore(a));
    case 'new-arrivals':
      return priced;
    case 'best-deals':
      return priced.filter((item) => item.discount > 0);
    case 'recommended':
    default:
      return priced.filter((item) => item.product.inStock);
  }
}

export interface ListingFilters {
  q: string;
  category: string;
  seller: string;
  state: string;
  availability: 'all' | 'in' | 'out';
  priceMin: number | null;
  priceMax: number | null;
}

export const EMPTY_FILTERS: ListingFilters = {
  q: '',
  category: '',
  seller: '',
  state: '',
  availability: 'all',
  priceMin: null,
  priceMax: null,
};

export function applyFilters(items: PricedProduct[], filters: ListingFilters): PricedProduct[] {
  const terms = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(({ product, price }) => {
    if (terms.length) {
      const haystack = `${product.title} ${product.brand} ${product.category} ${product.sellerName} ${product.sellerCity} ${product.sellerState}`.toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (filters.category && product.categorySlug !== filters.category) return false;
    if (filters.seller && String(product.sellerId) !== filters.seller) return false;
    if (filters.state && product.sellerState !== filters.state) return false;
    if (filters.availability === 'in' && !product.inStock) return false;
    if (filters.availability === 'out' && product.inStock) return false;
    if (filters.priceMin !== null && price < filters.priceMin) return false;
    if (filters.priceMax !== null && price > filters.priceMax) return false;
    return true;
  });
}

export function sellerOptions(items: PricedProduct[]) {
  const map = new Map<string, string>();
  for (const { product } of items) map.set(String(product.sellerId), product.sellerName);
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function stateOptions(items: PricedProduct[]) {
  return [...new Set(items.map(({ product }) => product.sellerState).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
