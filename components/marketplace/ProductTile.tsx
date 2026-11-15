// components/marketplace/ProductTile.tsx
'use client';

/**
 * The one product card used across the marketplace.
 *
 * Compact by design — it follows the density of the reference designs: a square
 * image, two title lines, rating, price with the struck-through reference and a
 * single delivery/trust line. Quantity, discount and stock badges are all
 * derived from real rows; nothing here is invented.
 */
import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Check,
  Heart,
  Play,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  Zap,
} from 'lucide-react';
import type { Product } from '@/lib/types';
import { activeFlashSale } from '@/lib/productPricing';
import { computeFulfillmentEta } from '@/lib/marketplace/discovery';
import { trackProductMetric } from '@/lib/productMetrics';
import { SmartImage } from '../ui/SmartImage';
import IconButton from '@/components/ui/IconButton';

export type ProductTileBadge = 'featured' | 'trending' | 'flash' | 'new' | null;

export interface ProductTileProps {
  product: Product;
  rating: number | null;
  reviewCount: number;
  sellerName?: string;
  sellerVerified?: boolean;
  sellerState?: string;
  buyerState?: string;
  badge?: ProductTileBadge;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onSelect: () => void;
  onAdd: () => void;
  onQuickBuy?: () => void;
  /** Load the image immediately — use for above-the-fold cards only. */
  eager?: boolean;
  className?: string;
}

function naira(value: number): string {
  return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`;
}

const BADGE_STYLES: Record<Exclude<ProductTileBadge, null>, string> = {
  featured: 'bg-gold-300 text-ink-950',
  trending: 'bg-ink-900/90 text-white dark:bg-white/90 dark:text-ink-950',
  flash: 'bg-jade-600 text-white',
  new: 'bg-white/95 text-jade-700 ring-1 ring-jade-600/20 dark:bg-ink-950/90 dark:text-jade-200',
};

const BADGE_LABELS: Record<Exclude<ProductTileBadge, null>, string> = {
  featured: 'Featured',
  trending: 'Trending',
  flash: 'Flash',
  new: 'New',
};

export default function ProductTile({
  product,
  rating,
  reviewCount,
  sellerName,
  sellerVerified = false,
  sellerState,
  buyerState,
  badge = null,
  isFavorite,
  onToggleFavorite,
  onSelect,
  onAdd,
  onQuickBuy,
  eager = false,
  className = '',
}: ProductTileProps) {
  const [justAdded, setJustAdded] = useState(false);

  const flashSale = activeFlashSale(product);
  const price = flashSale?.price ?? product.price;
  const compareAt = flashSale ? product.price : Number(product.compareAtPrice || 0);
  const discount = flashSale?.discountPercent
    ?? (compareAt > product.price ? Math.round(((compareAt - product.price) / compareAt) * 100) : 0);
  const soldOut =
    product.quantity <= 0 ||
    ['SOLD', 'UNAVAILABLE', 'OUT_OF_STOCK'].includes(product.stockStatus);
  const lowStock = !soldOut && product.quantity <= 8;
  const statusBadge: ProductTileBadge = flashSale ? 'flash' : badge;
  const eta = computeFulfillmentEta(product, sellerState, buyerState);

  useEffect(() => {
    trackProductMetric(product.id, 'impression', true);
  }, [product.id]);

  const handleOptimisticAdd = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (soldOut) return;
    setJustAdded(true);
    onAdd();
    setTimeout(() => setJustAdded(false), 900);
  };

  // One media badge only, top-left, so the image stays calm.
  const topLeftLabel =
    discount > 0 ? `-${discount}%` : statusBadge ? BADGE_LABELS[statusBadge] : null;
  const topLeftStyle =
    discount > 0
      ? 'bg-jade-600 text-white'
      : statusBadge
        ? BADGE_STYLES[statusBadge]
        : '';

  return (
    <article
      onClick={onSelect}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-ink-200/80 bg-white transition-[border-color,box-shadow,transform] duration-150 ease-glide hover:-translate-y-0.5 hover:border-jade-500/45 hover:shadow-[0_10px_24px_-18px_rgba(16,54,38,0.55)] motion-reduce:transform-none motion-reduce:transition-none dark:border-ink-800 dark:bg-ink-900 dark:hover:border-jade-400/40 gs-product-card ${className}`}
    >
      {/* ── media ── */}
      <div className="relative aspect-square w-full overflow-hidden bg-ink-50 dark:bg-ink-950">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          aria-label={`View ${product.title}`}
          className="block h-full w-full focus-ring"
        >
          <SmartImage
            src={product.images?.[0]}
            alt={product.title}
            seed={`tile-${product.id}`}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover transition-transform duration-300 ease-glide group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            loading={eager ? 'eager' : 'lazy'}
          />
        </button>

        {topLeftLabel && (
          <span
            className={`pointer-events-none absolute left-1.5 top-1.5 rounded px-1 py-0.5 text-[9px] font-black uppercase leading-[14px] tracking-wide shadow-sm ${topLeftStyle}`}
          >
            {topLeftLabel}
          </span>
        )}

        <IconButton
          icon={Heart}
          size="sm"
          label={isFavorite ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
          aria-pressed={isFavorite}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          iconClassName={isFavorite ? 'fill-jade-500 text-jade-500 dark:fill-jade-400 dark:text-jade-400' : ''}
          className="absolute right-1 top-1 !h-7 !w-7 !rounded-full !border-transparent !bg-white/85 !text-ink-500 shadow-sm backdrop-blur hover:!text-jade-600 active:scale-90 dark:!bg-ink-950/80 dark:!text-ink-300 dark:hover:!text-jade-300"
        />

        {eta.hasVideoDemo && !soldOut && (
          <span
            aria-label="Video demo available"
            className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full bg-ink-950/70 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm"
          >
            <Play className="h-2 w-2 fill-white" aria-hidden="true" />
            Demo
          </span>
        )}

        {lowStock && !discount && (
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-ink-900/85 px-1 py-0.5 text-[8px] font-bold text-white">
            {product.quantity} left
          </span>
        )}

        {/* Cart / quick-buy sit on the image so the card body stays short.
            Hidden until hover on pointer devices, always tappable on touch. */}
        {!soldOut && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            {onQuickBuy && !product.isAuction && (
              <button
                type="button"
                aria-label={`Quick buy ${product.title}`}
                title="Quick buy"
                onClick={(event) => {
                  event.stopPropagation();
                  onQuickBuy();
                }}
                className="grid h-7 w-7 place-items-center rounded-full bg-gold-300 text-ink-950 shadow-sm transition-transform duration-150 hover:bg-gold-200 active:scale-95 cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Add ${product.title} to cart`}
              title="Add to cart"
              onClick={handleOptimisticAdd}
              className={`grid h-7 w-7 place-items-center rounded-full text-white shadow-sm transition-transform duration-150 active:scale-95 cursor-pointer ${
                justAdded ? 'bg-jade-700 ring-2 ring-jade-300/60' : 'bg-jade-600 hover:bg-jade-700'
              }`}
            >
              {justAdded ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : flashSale ? (
                <Zap className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        )}

        {soldOut && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink-900/80 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
      </div>

      {/* ── body ── */}
      <div className="flex flex-1 flex-col gap-0.5 px-2 pb-2 pt-1.5">
        <h3 className="line-clamp-2 min-h-[2.1rem] text-[11.5px] font-semibold leading-[1.3] text-ink-900 dark:text-ink-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            className="text-left hover:text-jade-700 focus-ring dark:hover:text-jade-300"
          >
            {product.title}
          </button>
        </h3>

        <div className="flex min-h-[13px] items-center gap-1 text-[10px] leading-none">
          {rating ? (
            <>
              <Star className="h-2.5 w-2.5 fill-gold-400 text-gold-400" aria-hidden="true" />
              <span className="font-bold text-ink-700 dark:text-ink-200">{rating.toFixed(1)}</span>
              <span className="truncate text-ink-500 dark:text-ink-400">
                ({reviewCount >= 1000 ? `${(reviewCount / 1000).toFixed(1)}k` : reviewCount})
              </span>
            </>
          ) : (
            <span className="text-ink-400">No reviews yet</span>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-1">
          <span className="text-[13px] font-extrabold leading-4 tracking-tight tabular-nums text-ink-900 dark:text-white">
            {naira(price)}
          </span>
          {discount > 0 && compareAt > price && (
            <span className="text-[9.5px] font-medium tabular-nums text-ink-400 line-through">{naira(compareAt)}</span>
          )}
        </div>

        <p className="flex items-center gap-1 text-[9.5px] leading-tight text-ink-600 dark:text-ink-300">
          {soldOut ? (
            <span className="truncate">Currently unavailable</span>
          ) : (
            <>
              <Truck className="h-2.5 w-2.5 shrink-0 text-jade-600 dark:text-jade-400" aria-hidden="true" />
              <span className="truncate">{eta.shortLabel}</span>
              <ShieldCheck className="h-2.5 w-2.5 shrink-0 text-jade-600/80 dark:text-jade-400/80" aria-hidden="true" />
              {sellerVerified && (
                <span
                  className="ml-auto inline-grid shrink-0 place-items-center text-jade-600 dark:text-jade-300"
                  aria-label={`${sellerName || 'Seller'} is verified`}
                  title={`${sellerName || 'Seller'} is verified`}
                >
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
            </>
          )}
        </p>
      </div>
    </article>
  );
}
