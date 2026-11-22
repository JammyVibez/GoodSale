// lib/marketplace/discovery.ts
import { OrderStatus, ProductCondition, type Order, type Product } from '@/lib/types';
import { activeFlashSale } from '@/lib/productPricing';
import { discoveryScore } from '@/lib/ranking';
import {
  matchesParsedPriceRange,
  matchesSmartSearchTerms,
  parseSmartSearchQuery,
} from '@/lib/marketplace/search';

export type DiscoverySortMode = 'smart' | 'fastest' | 'rating' | 'price_asc' | 'price_desc' | 'newest';

export interface DiscoveryFilters {
  query?: string;
  category?: string | null;
  state?: string;
  onlyVerified?: boolean;
  dealsOnly?: boolean;
  wishlistOnly?: boolean;
  sameDayOnly?: boolean;
  safeMeetOnly?: boolean;
  splitPayOnly?: boolean;
  videoOnly?: boolean;
  condition?: 'ALL' | ProductCondition;
}

export interface FulfillmentEta {
  tier: 'SAME_DAY' | 'EXPRESS_1_2D' | 'NATIONWIDE';
  label: string;
  shortLabel: string;
  hasSafeMeet: boolean;
  supportsSplitPay: boolean;
  hasVideoDemo: boolean;
}

export interface DiscoveryContext {
  buyerState?: string;
  favorites?: number[];
  sellerStates?: Map<number, string>;
  verifiedSellerIds?: Set<number>;
  ratings?: Map<number, number>;
  featuredProductIds?: Set<number>;
  verifiedPlusSellerIds?: Set<number>;
  featuredBoost?: number;
  verifiedPlusBoost?: number;
}

function normalizeState(state?: string): string {
  return (state || '')
    .trim()
    .toLowerCase()
    .replace(/\s+state$/i, '')
    .replace(/\s+fct$/i, '');
}

export function isSameDayDelivery(product: Product, sellerState?: string, buyerState?: string): boolean {
  const sameState =
    Boolean(normalizeState(sellerState)) &&
    Boolean(normalizeState(buyerState)) &&
    normalizeState(sellerState) === normalizeState(buyerState);
  const fastMethod = ['Express Dispatch', 'Same-Day Rider', 'Instant Courier', 'GOODSALE_PARTNER']
    .some((token) => product.deliveryMethod.toLowerCase().includes(token.toLowerCase()));
  return sameState || (Boolean(normalizeState(sellerState)) && !normalizeState(buyerState) && fastMethod);
}

export function computeFulfillmentEta(
  product: Product,
  sellerState?: string,
  buyerState?: string
): FulfillmentEta {
  const sameDay = isSameDayDelivery(product, sellerState, buyerState);
  const normalizedSeller = (sellerState || '').trim();
  const supportsSplitPay =
    Array.isArray(product.paymentMethods) &&
    product.paymentMethods.some((m) => m.toLowerCase() === 'partial');
  const hasVideoDemo = Boolean(product.videoUrl && product.videoUrl.trim());

  if (sameDay) {
    return {
      tier: 'SAME_DAY',
      label: normalizedSeller ? `Same-day · ${normalizedSeller}` : 'Same-day local rider',
      shortLabel: 'Same-day',
      hasSafeMeet: Boolean(product.pickupAvailable),
      supportsSplitPay,
      hasVideoDemo,
    };
  }

  const cleanState = normalizedSeller.replace(/\s+State$/i, '');
  if (cleanState) {
    return {
      tier: 'EXPRESS_1_2D',
      label: `Ships from ${cleanState} · 1–3d`,
      shortLabel: `From ${cleanState}`,
      hasSafeMeet: Boolean(product.pickupAvailable),
      supportsSplitPay,
      hasVideoDemo,
    };
  }

  return {
    tier: 'NATIONWIDE',
    label: 'Nationwide escrow · 2–4d',
    shortLabel: '2–4 days',
    hasSafeMeet: Boolean(product.pickupAvailable),
    supportsSplitPay,
    hasVideoDemo,
  };
}

export function hasRealDiscount(product: Product): boolean {
  if (activeFlashSale(product)) return true;
  const compareAt = Number(product.compareAtPrice) || 0;
  return compareAt > product.price;
}

export function matchesDiscoveryFilters(
  product: Product,
  filters: DiscoveryFilters,
  ctx: DiscoveryContext
): boolean {
  const sellerState = ctx.sellerStates?.get(product.sellerId) || '';
  const parsed = parseSmartSearchQuery(filters.query || '');

  if (parsed.rawQuery) {
    if (!matchesParsedPriceRange(product, parsed)) return false;
    if (
      parsed.inferredState &&
      normalizeState(sellerState) !== normalizeState(parsed.inferredState)
    ) {
      return false;
    }
    if (
      parsed.inferredCondition &&
      product.condition !== parsed.inferredCondition
    ) {
      return false;
    }
    if (
      parsed.sameDayRequested &&
      !isSameDayDelivery(product, sellerState, ctx.buyerState || parsed.inferredState || filters.state)
    ) {
      return false;
    }
    if (parsed.safeMeetRequested && !product.pickupAvailable) {
      return false;
    }
    if (
      parsed.splitPayRequested &&
      !(product.paymentMethods || []).some((m) => m.toLowerCase() === 'partial')
    ) {
      return false;
    }
    if (parsed.videoRequested && !(product.videoUrl && product.videoUrl.trim())) {
      return false;
    }
    if (parsed.dealsRequested && !hasRealDiscount(product)) {
      return false;
    }
    if (!matchesSmartSearchTerms(product, parsed.textTerms, sellerState)) {
      return false;
    }
  }

  if (filters.category && product.category.toLowerCase() !== filters.category.toLowerCase()) {
    return false;
  }

  if (filters.state && normalizeState(sellerState) !== normalizeState(filters.state)) {
    return false;
  }

  if (filters.onlyVerified && !ctx.verifiedSellerIds?.has(product.sellerId)) {
    return false;
  }

  if (filters.wishlistOnly && !(ctx.favorites || []).includes(product.id)) {
    return false;
  }

  if (filters.dealsOnly && !hasRealDiscount(product)) {
    return false;
  }

  if (filters.sameDayOnly && !isSameDayDelivery(product, sellerState, ctx.buyerState || filters.state)) {
    return false;
  }

  if (filters.safeMeetOnly && !product.pickupAvailable) {
    return false;
  }

  if (
    filters.splitPayOnly &&
    !(product.paymentMethods || []).some((m) => m.toLowerCase() === 'partial')
  ) {
    return false;
  }

  if (filters.videoOnly && !(product.videoUrl && product.videoUrl.trim())) {
    return false;
  }

  if (filters.condition && filters.condition !== 'ALL' && product.condition !== filters.condition) {
    return false;
  }

  return true;
}

export function sortProductsByMode(
  products: Product[],
  mode: DiscoverySortMode,
  ctx: DiscoveryContext
): Product[] {
  const list = [...products];
  const ratingOf = (id: number) => ctx.ratings?.get(id) || 0;
  const rankCtx = {
    ratings: ctx.ratings || new Map<number, number>(),
    featuredProductIds: ctx.featuredProductIds || new Set<number>(),
    verifiedPlusSellerIds: ctx.verifiedPlusSellerIds || new Set<number>(),
    featuredBoost: ctx.featuredBoost ?? 30,
    verifiedPlusBoost: ctx.verifiedPlusBoost ?? 8,
  };

  return list.sort((a, b) => {
    switch (mode) {
      case 'price_asc':
        return a.price - b.price;
      case 'price_desc':
        return b.price - a.price;
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'rating':
        return ratingOf(b.id) - ratingOf(a.id);
      case 'fastest': {
        const aSame = isSameDayDelivery(a, ctx.sellerStates?.get(a.sellerId), ctx.buyerState) ? 2 : a.pickupAvailable ? 1 : 0;
        const bSame = isSameDayDelivery(b, ctx.sellerStates?.get(b.sellerId), ctx.buyerState) ? 2 : b.pickupAvailable ? 1 : 0;
        if (bSame !== aSame) return bSame - aSame;
        return discoveryScore(b, rankCtx) - discoveryScore(a, rankCtx);
      }
      default:
        return discoveryScore(b, rankCtx) - discoveryScore(a, rankCtx);
    }
  });
}

export function getRepeatBuyerPicks(params: {
  buyerOrders: Order[];
  products: Product[];
  maxItems?: number;
}): Product[] {
  const { buyerOrders, products, maxItems = 6 } = params;
  if (!buyerOrders.length || !products.length) return [];

  const productsById = new Map(products.map((p) => [p.id, p]));
  const seenProductIds = new Set<number>();
  const purchasedCategories = new Set<string>();
  const trustedSellerIds = new Set<number>();
  const picks: Product[] = [];

  const sortedOrders = [...buyerOrders]
    .filter((o) =>
      [OrderStatus.DELIVERED_SUCCESS, OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY].includes(o.status)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 1. Direct exact reorders that are still in stock
  for (const order of sortedOrders) {
    trustedSellerIds.add(order.sellerId);
    const prod = productsById.get(order.productId);
    if (!prod) continue;
    purchasedCategories.add(prod.category.toLowerCase());
    if (
      prod.quantity > 0 &&
      ['IN_STOCK', 'LOW_STOCK'].includes(prod.stockStatus) &&
      !seenProductIds.has(prod.id)
    ) {
      seenProductIds.add(prod.id);
      picks.push(prod);
      if (picks.length >= maxItems) return picks;
    }
  }

  // 2. Fresh stock from previously trusted sellers or matching categories
  for (const prod of products) {
    if (seenProductIds.has(prod.id)) continue;
    if (prod.quantity <= 0 || !['IN_STOCK', 'LOW_STOCK'].includes(prod.stockStatus)) continue;
    if (trustedSellerIds.has(prod.sellerId) || purchasedCategories.has(prod.category.toLowerCase())) {
      seenProductIds.add(prod.id);
      picks.push(prod);
      if (picks.length >= maxItems) break;
    }
  }

  return picks;
}
