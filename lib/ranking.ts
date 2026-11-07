/**
 * The single discovery ranking engine used by the live marketplace feed and by
 * server-rendered search/category/promotion pages.
 *
 * Relevance is applied before this module is called. Paid placement and paid
 * membership are additive tie-breakers only, never trust or verification.
 */
export type RankableProduct = {
  id: number;
  sellerId: number;
  viewCount: number;
  stockStatus: string;
  createdAt?: string;
  likes?: number;
  cartAdds?: number;
};

export type RankingContext = {
  ratings: Map<number, number>;
  featuredProductIds: Set<number>;
  verifiedPlusSellerIds: Set<number>;
  featuredBoost: number;
  verifiedPlusBoost: number;
  now?: number;
};

export function discoveryScore(product: RankableProduct, context: RankingContext): number {
  const rating = context.ratings.get(product.id) || 0;
  const created = product.createdAt ? new Date(product.createdAt).getTime() : 0;
  const ageDays = created > 0 ? Math.max(0, (context.now ?? Date.now() - created) / 86_400_000) : 30;
  const recency = Math.max(0, 1 - Math.min(ageDays, 30) / 30) * 4;
  const inStock = ['IN_STOCK', 'LOW_STOCK'].includes(product.stockStatus);
  return (
    rating * 10 +
    Math.max(0, Number(product.viewCount) || 0) / 100 +
    Math.max(0, Number(product.likes) || 0) / 20 +
    Math.max(0, Number(product.cartAdds) || 0) / 10 +
    (inStock ? 5 : 0) +
    (inStock && context.featuredProductIds.has(product.id)
      ? Math.max(0, Number(context.featuredBoost) || 0)
      : 0) +
    (inStock && context.verifiedPlusSellerIds.has(product.sellerId)
      ? Math.max(0, Number(context.verifiedPlusBoost) || 0)
      : 0) +
    recency
  );
}

export function rankProducts<T extends RankableProduct>(products: T[], context: RankingContext): T[] {
  return [...products].sort((a, b) => {
    const score = discoveryScore(b, context) - discoveryScore(a, context);
    if (score !== 0) return score;
    return b.id - a.id;
  });
}
