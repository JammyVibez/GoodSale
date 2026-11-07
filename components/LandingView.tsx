// components/LandingView.tsx
'use client';

/**
 * Marketplace home — the reference layout, driven entirely by live data.
 *
 * Design language: deep-jade hero with gold accents, circular category rail,
 * Flash Deals with a real midnight countdown, a personalised "Recommended for
 * you" rail, a trust strip and a dense catalog. Everything shown (discounts,
 * ratings, stock, countdown) is derived from real rows — a discount badge only
 * renders when the seller set a higher compare-at price.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Star, Heart, ShoppingCart, Zap, ShieldCheck, Truck, Headphones,
  BadgeCheck, ArrowRight, ChevronRight, Sparkles, Store, Flame, Gavel,
  Shirt, Cpu, Smartphone, Laptop, Armchair, Apple, Car, BookOpen, LayoutGrid,
  Package, SlidersHorizontal,
} from 'lucide-react';
import { Product, useDBState } from '../lib/store';
import { isVerifiedSeller } from '@/lib/verification';
import VerifiedBadge from './verification/VerifiedBadge';
import { trackProductMetric } from '@/lib/productMetrics';
import { useWishlist } from '@/lib/hooks/useWishlist';
import { SmartImage } from './ui/SmartImage';
import EmptyState from './ui/EmptyState';
import AdSlot from './AdSlot';

interface LandingViewProps {
  onSelectProduct: (productId: number) => void;
  searchQuery: string;
  onNavigate: (view: string, payload?: any) => void;
  onAddToCart: (productId: number) => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  /** Delivery-location filter, driven by the marketplace header. */
  selectedState: string;
  onSelectState: (state: string) => void;
  wishlistOnly: boolean;
  onWishlistOnlyChange: (value: boolean) => void;
}

type SortMode = 'smart' | 'rating' | 'price_asc' | 'price_desc' | 'newest';

const CATEGORY_META: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  phones: { label: 'Phones & Tablets', Icon: Smartphone },
  laptops: { label: 'Laptops', Icon: Laptop },
  electronics: { label: 'Electronics', Icon: Cpu },
  fashion: { label: 'Fashion', Icon: Shirt },
  furniture: { label: 'Home & Living', Icon: Armchair },
  groceries: { label: 'Groceries', Icon: Apple },
  beauty: { label: 'Beauty', Icon: Sparkles },
  vehicles: { label: 'Vehicles', Icon: Car },
  books: { label: 'Books', Icon: BookOpen },
};

function categoryMeta(category: string) {
  return CATEGORY_META[category.trim().toLowerCase()] || {
    label: category,
    Icon: Package,
  };
}

function naira(value: number): string {
  return `₦${Math.round(Number(value) || 0).toLocaleString()}`;
}

/** Real discount percentage — null unless the compare-at price is genuinely higher. */
function discountPercent(product: Product): number | null {
  const compareAt = Number(product.compareAtPrice) || 0;
  if (!compareAt || compareAt <= product.price) return null;
  return Math.round(((compareAt - product.price) / compareAt) * 100);
}

function useCountdownToMidnight() {
  const read = useCallback(() => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const diff = Math.max(0, end.getTime() - now.getTime());
    return {
      hours: Math.floor(diff / 3.6e6),
      minutes: Math.floor((diff % 3.6e6) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  }, []);
  const [left, setLeft] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setLeft(read()), 1000);
    return () => clearInterval(id);
  }, [read]);
  return left;
}

function Rating({ average, count }: { average: number | null; count: number }) {
  if (!average) {
    return <span className="text-[10px] font-medium text-ink-400">No reviews yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] leading-none">
      <Star className="h-3 w-3 fill-gold-400 text-gold-400" />
      <span className="font-bold text-ink-700 dark:text-ink-200">{average.toFixed(1)}</span>
      <span className="text-ink-400">
        ({count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count})
      </span>
    </span>
  );
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="min-w-[26px] rounded-md bg-jade-900 px-1.5 py-1 text-center text-[11px] font-black tabular-nums leading-none text-white">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-ink-400">{label}</span>
    </span>
  );
}

function ProductCard({
  product,
  rating,
  reviewCount,
  compact = false,
  sellerName,
  sellerVerified = false,
  isFavorite,
  isFeatured = false,
  onToggleFavorite,
  onSelect,
  onAdd,
}: {
  product: Product;
  rating: number | null;
  reviewCount: number;
  compact?: boolean;
  sellerName?: string;
  sellerVerified?: boolean;
  isFeatured?: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const discount = discountPercent(product);
  const lowStock = product.quantity > 0 && product.quantity <= 8;

  useEffect(() => {
    trackProductMetric(product.id, 'impression', true);
  }, [product.id]);

  return (
    <article
      onClick={onSelect}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-ink-150 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-jade-500/30 hover:shadow-lg dark:border-ink-800 dark:bg-ink-900"
    >
      <div className="relative aspect-square overflow-hidden bg-ink-50 dark:bg-ink-950">
        <SmartImage
          src={product.images?.[0]}
          alt={product.title}
          seed={`card-${product.id}`}
          className="h-full w-full"
          imgClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {discount !== null && (
          <span className="absolute left-2 top-2 rounded-md bg-jade-600 px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm">
            -{discount}%
          </span>
        )}
        {discount === null && lowStock && (
          <span className="absolute left-2 top-2 rounded-md bg-jade-700/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
            {product.quantity} left
          </span>
        )}
        {isFeatured && (
          <span className="absolute bottom-2 left-2 rounded-md bg-gold-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-ink-950 shadow-sm">
            Featured
          </span>
        )}

        <button
          type="button"
          aria-label={isFavorite ? 'Remove from wishlist' : 'Save to wishlist'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-ink-500 shadow-sm transition-colors hover:text-jade-600 dark:bg-ink-900/95 dark:text-ink-300"
        >
          <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-jade-500 text-jade-500' : ''}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <h3 className={`line-clamp-2 font-bold leading-snug text-ink-900 dark:text-white ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {product.title}
        </h3>

        {sellerName && (
          <div className="flex min-w-0 items-center gap-1 text-[10px] text-ink-500 dark:text-ink-400">
            <span className="truncate">{sellerName}</span>
            {sellerVerified && (
              <VerifiedBadge
                sellerId={product.sellerId}
                status="VERIFIED"
                variant="icon"
                fallbackName={sellerName}
                className="shrink-0"
              />
            )}
          </div>
        )}

        <div className="mt-auto space-y-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className={`font-black tracking-tight text-ink-900 dark:text-white ${compact ? 'text-[13px]' : 'text-sm'}`}>
              {naira(product.price)}
            </span>
            {discount !== null && (
              <span className="text-[10px] font-medium text-ink-400 line-through">
                {naira(Number(product.compareAtPrice))}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-1">
            <Rating average={rating} count={reviewCount} />
            <button
              type="button"
              aria-label="Add to cart"
              disabled={product.quantity <= 0 || product.stockStatus === 'SOLD' || product.stockStatus === 'UNAVAILABLE' || product.stockStatus === 'OUT_OF_STOCK'}
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-jade-500/10 text-jade-700 transition-all hover:bg-jade-500 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:text-jade-300"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function LandingView({
  onSelectProduct,
  searchQuery,
  onNavigate,
  onAddToCart,
  onOpenAuth,
  selectedState,
  onSelectState,
  wishlistOnly,
  onWishlistOnlyChange,
}: LandingViewProps) {
  const db = useDBState();
  const countdown = useCountdownToMidnight();
  const { favorites, toggle: toggleFavorite } = useWishlist();

  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [dealsOnly, setDealsOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('smart');

  /* ---- indexes ---- */
  const profilesByUserId = useMemo(() => {
    const map = new Map<number, (typeof db.profiles)[number]>();
    for (const profile of db.profiles) map.set(profile.userId, profile);
    return map;
  }, [db.profiles]);

  const usersById = useMemo(() => {
    const map = new Map<number, (typeof db.users)[number]>();
    for (const user of db.users) map.set(user.id, user);
    return map;
  }, [db.users]);

  const reviewStats = useMemo(() => {
    const map = new Map<number, { total: number; count: number }>();
    for (const review of db.reviews) {
      if (!review.productId || !review.rating) continue;
      const entry = map.get(review.productId) || { total: 0, count: 0 };
      entry.total += review.rating;
      entry.count += 1;
      map.set(review.productId, entry);
    }
    const avg = new Map<number, { average: number; count: number }>();
    map.forEach((value, key) => avg.set(key, { average: value.total / value.count, count: value.count }));
    return avg;
  }, [db.reviews]);

  const stateOf = useCallback(
    (sellerId: number) => profilesByUserId.get(sellerId)?.state || '',
    [profilesByUserId]
  );

  const ratingOf = useCallback(
    (productId: number) => reviewStats.get(productId)?.average ?? null,
    [reviewStats]
  );
  const reviewCountOf = useCallback(
    (productId: number) => reviewStats.get(productId)?.count ?? 0,
    [reviewStats]
  );

  /* ---- categories (only real ones, with a representative photo) ---- */
  const categories = useMemo(() => {
    const byCategory = new Map<string, { name: string; count: number; image?: string }>();
    for (const product of db.products) {
      const key = product.category || 'Other';
      const entry = byCategory.get(key) || { name: key, count: 0 };
      entry.count += 1;
      if (!entry.image && product.images?.[0]) entry.image = product.images[0];
      byCategory.set(key, entry);
    }
    return Array.from(byCategory.values()).sort((a, b) => b.count - a.count);
  }, [db.products]);

  /* ---- states with listings ---- */
  const states = useMemo(() => {
    const set = new Set<string>();
    for (const product of db.products) {
      const state = stateOf(product.sellerId);
      if (state) set.add(state);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.products, stateOf]);

  const activeFeaturedIds = useMemo(
    () =>
      new Set(
        db.featuredListings
          .filter(
            (entry) =>
              entry.status === 'ACTIVE' && new Date(entry.expiresAt).getTime() > Date.now()
          )
          .map((entry) => entry.productId)
      ),
    [db.featuredListings]
  );

  const activeVerifiedPlusSellers = useMemo(
    () =>
      new Set(
        db.verifiedPlusSubscriptions
          .filter((entry) => new Date(entry.expiresAt).getTime() > Date.now())
          .map((entry) => entry.userId)
      ),
    [db.verifiedPlusSubscriptions]
  );

  /* ---- filtering ---- */
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = db.products.filter((product) => {
      if (query) {
        const haystack = `${product.title} ${product.description} ${product.category} ${product.brand}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (selectedCategory && product.category.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      if (selectedState && stateOf(product.sellerId) !== selectedState) return false;          if (onlyVerified) {
            const sellerProfile = profilesByUserId.get(product.sellerId);
            const verified = isVerifiedSeller({
              verificationStatus: sellerProfile?.verificationStatus,
              verificationExpiresAt: sellerProfile?.verificationExpiresAt,
            });
            if (!verified) return false;
          }
      if (wishlistOnly && !favorites.includes(product.id)) return false;
      if (dealsOnly && discountPercent(product) === null) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortMode) {
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'rating':
          return (ratingOf(b.id) || 0) - (ratingOf(a.id) || 0);
        default: {
          const score = (product: Product) =>
            (ratingOf(product.id) || 0) * 10 +
            product.viewCount / 100 +
            (['IN_STOCK', 'LOW_STOCK'].includes(product.stockStatus) &&
            activeFeaturedIds.has(product.id)
              ? Number(db.revenueSettings.featuredRankingBoost) || 0
              : 0) +
            (activeVerifiedPlusSellers.has(product.sellerId)
              ? Number(db.revenueSettings.verifiedPlusRankingBoost) || 0
              : 0);
          return score(b) - score(a);
        }
      }
    });
    return list;
  }, [
    db.products, db.revenueSettings, searchQuery, selectedCategory, selectedState, onlyVerified,
    wishlistOnly, dealsOnly, favorites, profilesByUserId, stateOf, sortMode, ratingOf,
    activeFeaturedIds, activeVerifiedPlusSellers,
  ]);

  /* ---- flash deals: real discounts first, then low stock ---- */
  const flashDeals = useMemo(() => {
    const discounted = db.products
      .filter((p) => discountPercent(p) !== null)
      .sort((a, b) => (discountPercent(b) || 0) - (discountPercent(a) || 0))
      .slice(0, 6);
    if (discounted.length >= 3) return discounted;
    const filler = db.products
      .filter((p) => !discounted.some((d) => d.id === p.id))
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 6 - discounted.length);
    return [...discounted, ...filler];
  }, [db.products]);

  /* ---- recommended: personalised by city + wishlist + rating ---- */
  const recommended = useMemo(() => {
    const favoriteCategories = new Set(
      db.products.filter((p) => favorites.includes(p.id)).map((p) => p.category.toLowerCase())
    );
    const buyerState = db.profiles.find((p) => p.userId === db.currentUser?.id)?.state || '';
    const scored = db.products
      .filter((p) => !flashDeals.some((d) => d.id === p.id))
      .map((product) => {
        let score = (ratingOf(product.id) || 3) * 20 + product.viewCount / 20;
        if (buyerState && stateOf(product.sellerId) === buyerState) score += 35;
        if (favoriteCategories.has(product.category.toLowerCase())) score += 45;
        if (product.stockStatus === 'LOW_STOCK') score += 5;
        return { product, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 6).map((s) => s.product);
  }, [db.products, db.profiles, db.currentUser, favorites, flashDeals, ratingOf, stateOf]);

  const auctions = useMemo(() => db.products.filter((p) => p.isAuction).slice(0, 4), [db.products]);

  const verifiedSellers = useMemo(() => {
    return db.users
      .filter((user) => {
        const profile = profilesByUserId.get(user.id);
        return isVerifiedSeller({
          verificationStatus: profile?.verificationStatus,
          verificationExpiresAt: profile?.verificationExpiresAt,
        });
      })
      .slice(0, 6);
  }, [db.users, profilesByUserId]);

  const sellerProps = useCallback(
    (sellerId: number) => {
      const seller = usersById.get(sellerId);
      const profile = profilesByUserId.get(sellerId);
      return {
        sellerName: seller?.fullName || 'GoodSale seller',
        sellerVerified: isVerifiedSeller({
          verificationStatus: profile?.verificationStatus,
          verificationExpiresAt: profile?.verificationExpiresAt,
        }),
      };
    },
    [profilesByUserId, usersById]
  );

  /* ---- hero ---- */
  const heroSlides = useMemo(
    () => [
      {
        eyebrow: 'Best Deals',
        title: 'Shop Smarter.',
        highlight: 'Live Better.',
        body: 'Great products, unbeatable prices, and complete peace of mind.',
        cta: 'Shop Now',
        action: () => {
          setSelectedCategory(null);
          onWishlistOnlyChange(false);
          scrollToId('catalog-section');
        },
      },
      {
        eyebrow: 'Buyer Protection',
        title: 'Your money waits',
        highlight: 'until you confirm.',
        body: 'Every order is escrow-backed. The seller is paid only after you receive what you ordered.',
        cta: 'Browse protected deals',
        action: () => {
          setSelectedCategory(null);
          scrollToId('catalog-section');
        },
      },
      {
        eyebrow: 'Verified Sellers',
        title: 'Real stores.',
        highlight: 'Real reviews.',
        body: `${verifiedSellers.length} verified Nigerian merchants, with reviews tied to real orders.`,
        cta: 'Meet the sellers',
        action: () => scrollToId('sellers-section'),
      },
    ],
    [verifiedSellers.length]
  );

  useEffect(() => {
    const id = setInterval(() => setActiveSlide((s) => (s + 1) % heroSlides.length), 6500);
    return () => clearInterval(id);
  }, [heroSlides.length]);

  const heroImages = useMemo(() => {
    const picks = [...db.products]
      .sort((a, b) => (ratingOf(b.id) || 0) - (ratingOf(a.id) || 0))
      .filter((p) => p.images?.length)
      .slice(0, 6);
    if (!picks.length) return [] as Product[];
    const out: Product[] = [];
    for (let i = 0; i < 3; i += 1) {
      const value = picks[(activeSlide * 3 + i) % picks.length];
      if (value) out.push(value);
    }
    return out;
  }, [db.products, activeSlide, ratingOf]);

  return (
    <div className="min-h-screen bg-white pb-20 transition-colors duration-300 dark:bg-ink-950">
      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative overflow-hidden bg-jade-50 text-ink-900 transition-colors duration-300 dark:bg-jade-950 dark:text-white">
        <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-jade-300/30 blur-3xl dark:bg-jade-500/25" />
        <div aria-hidden className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-gold-300/25 blur-3xl dark:bg-gold-400/10" />

        <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-4 sm:px-6 sm:pb-8 lg:px-8">
          {/* live trust line */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-jade-800 dark:text-jade-200">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-jade-600 dark:text-gold-300" />
              {db.products.length} live listings across {states.length} states
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-jade-600 dark:text-gold-300" />
              Escrow on every order
            </span>
          </div>

          {/* carousel card */}
          <div className="relative overflow-hidden rounded-3xl border border-jade-200 bg-gradient-to-br from-white via-jade-50 to-jade-100 shadow-sm dark:border-white/10 dark:from-jade-800 dark:via-jade-900 dark:to-jade-950 dark:shadow-none">
            <div className="grid items-center gap-4 p-4 sm:p-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="relative z-10">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-600 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white dark:bg-gold-300 dark:text-jade-950">
                  <Flame className="h-3.5 w-3.5" />
                  {heroSlides[activeSlide].eyebrow}
                </span>

                <h1 className="mt-3 font-display text-2xl font-black leading-[1.08] tracking-tight sm:text-3xl lg:text-4xl">
                  {heroSlides[activeSlide].title}
                  <br />
                  <span className="text-jade-600 dark:text-gold-300">{heroSlides[activeSlide].highlight}</span>
                </h1>

                <p className="mt-2 max-w-md text-xs leading-relaxed text-ink-600 dark:text-jade-100/85 sm:text-sm">
                  {heroSlides[activeSlide].body}
                </p>

                <button
                  type="button"
                  onClick={heroSlides[activeSlide].action}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-jade-900/20 transition-all hover:bg-jade-700 active:scale-95 dark:bg-gold-300 dark:text-jade-950 dark:shadow-black/20 dark:hover:bg-gold-200"
                >
                  {heroSlides[activeSlide].cta}
                  <ArrowRight className="h-4 w-4" />
                </button>

                <div className="mt-4 flex items-center gap-1.5">
                  {heroSlides.map((slide, index) => (
                    <button
                      key={slide.eyebrow}
                      type="button"
                      aria-label={`Show ${slide.eyebrow}`}
                      onClick={() => setActiveSlide(index)}
                      className={`h-1.5 rounded-full transition-all ${
                        index === activeSlide
                          ? 'w-6 bg-jade-600 dark:bg-gold-300'
                          : 'w-1.5 bg-ink-300 hover:bg-ink-400 dark:bg-white/35 dark:hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* real product collage + protection seal */}
              <div className="relative hidden h-48 sm:block lg:h-56">
                <div className="absolute inset-0 flex items-end justify-center gap-2">
                  {heroImages.map((product, index) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => onSelectProduct(product.id)}
                      className={`relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lg transition-all hover:-translate-y-1 dark:border-white/20 dark:bg-white/10 dark:shadow-xl ${
                        index === 1 ? 'h-40 w-28 sm:h-44 sm:w-32' : 'h-32 w-24 sm:h-36 sm:w-28'
                      }`}
                    >
                      <SmartImage
                        src={product.images?.[0]}
                        alt={product.title}
                        seed={`hero-${product.id}`}
                        className="h-full w-full"
                      />
                    </button>
                  ))}
                </div>

                <div className="absolute -right-1 top-0 flex flex-col items-center gap-0.5 rounded-xl border border-gold-400/60 bg-white/95 px-2.5 py-2 text-center backdrop-blur dark:border-gold-300/40 dark:bg-jade-950/80">
                  <BadgeCheck className="h-4 w-4 text-gold-500 dark:text-gold-300" />
                  <span className="text-[9px] font-bold leading-tight text-jade-800 dark:text-gold-200">
                    Buyer<br />Protection
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AdSlot placement="HOME" onNavigate={onNavigate} className="mt-4" />

        {/* ───────────────────── Categories ───────────────────── */}
        <section className="mt-5 rounded-3xl border border-ink-150 bg-white p-3 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-sm font-black text-ink-900 dark:text-white">Shop by category</h2>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                scrollToId('catalog-section');
              }}
              className="inline-flex items-center gap-0.5 text-[11px] font-bold text-jade-600 hover:text-jade-700 dark:text-jade-400"
            >
              See all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5">
            {categories.map((category) => {
              const { label, Icon } = categoryMeta(category.name);
              const selected = selectedCategory?.toLowerCase() === category.name.toLowerCase();
              return (
                <button
                  key={category.name}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(selected ? null : category.name);
                    scrollToId('catalog-section');
                  }}
                  className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5"
                >
                  <div
                    className={`grid h-14 w-14 place-items-center overflow-hidden rounded-full ring-2 transition-all sm:h-16 sm:w-16 ${
                      selected
                        ? 'ring-jade-500 shadow-md shadow-jade-500/25'
                        : 'ring-ink-100 group-hover:ring-jade-300 dark:ring-ink-800'
                    } ${category.image ? 'bg-white' : 'bg-jade-500/10 text-jade-600 dark:text-jade-300'}`}
                  >
                    {category.image ? (
                      <SmartImage
                        src={category.image}
                        alt={category.name}
                        seed={`cat-${category.name}`}
                        className="h-full w-full"
                      />
                    ) : (
                      <Icon className="h-6 w-6" />
                    )}
                  </div>
                  <span
                    className={`w-[68px] text-center text-[10px] font-bold leading-tight line-clamp-2 ${
                      selected ? 'text-jade-600 dark:text-jade-400' : 'text-ink-700 dark:text-ink-300'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                onWishlistOnlyChange(false);
                scrollToId('catalog-section');
              }}
              className="flex w-[68px] shrink-0 flex-col items-center gap-1.5"
            >
              <div className="grid h-14 w-14 place-items-center rounded-full bg-jade-600 text-white ring-2 ring-jade-600 sm:h-16 sm:w-16">
                <LayoutGrid className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-bold text-ink-700 dark:text-ink-300">More</span>
            </button>
          </div>
        </section>

        {/* ───────────────────── Flash deals ───────────────────── */}
        {flashDeals.length > 0 && (
          <section className="mt-6" id="flash-deals-section">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold-100 text-gold-600">
                  <Zap className="h-4 w-4 fill-gold-400 text-gold-500" />
                </span>
                <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white sm:text-xl">
                  Flash Deals
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-start gap-1 rounded-lg bg-white px-2 py-1 shadow-sm ring-1 ring-ink-150 dark:bg-ink-900 dark:ring-ink-800">
                  <CountdownBox value={countdown.hours} label="hrs" />
                  <span className="pt-0.5 text-[11px] font-black text-ink-300">:</span>
                  <CountdownBox value={countdown.minutes} label="min" />
                  <span className="pt-0.5 text-[11px] font-black text-ink-300">:</span>
                  <CountdownBox value={countdown.seconds} label="sec" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    setDealsOnly(true);
                    scrollToId('catalog-section');
                  }}
                  className="inline-flex items-center gap-0.5 text-[11px] font-bold text-jade-600 hover:text-jade-700 dark:text-jade-400"
                >
                  See All <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {flashDeals.slice(0, 6).map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  rating={ratingOf(product.id)}
                  reviewCount={reviewCountOf(product.id)}
                  {...sellerProps(product.sellerId)}
                  isFeatured={activeFeaturedIds.has(product.id)}
                  isFavorite={favorites.includes(product.id)}
                  onToggleFavorite={() => toggleFavorite(product.id)}
                  onSelect={() => onSelectProduct(product.id)}
                  onAdd={() => onAddToCart(product.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ───────────────────── Recommended ───────────────────── */}
        {recommended.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-gold-400" />
                <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white sm:text-xl">
                  Recommended for You
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSortMode('rating');
                  scrollToId('catalog-section');
                }}
                className="inline-flex items-center gap-0.5 text-[11px] font-bold text-jade-600 hover:text-jade-700 dark:text-jade-400"
              >
                See All <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {recommended.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  rating={ratingOf(product.id)}
                  reviewCount={reviewCountOf(product.id)}
                  {...sellerProps(product.sellerId)}
                  isFeatured={activeFeaturedIds.has(product.id)}
                  isFavorite={favorites.includes(product.id)}
                  onToggleFavorite={() => toggleFavorite(product.id)}
                  onSelect={() => onSelectProduct(product.id)}
                  onAdd={() => onAddToCart(product.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ───────────────────── Trust strip ───────────────────── */}
        <section className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-ink-150 bg-white p-3 text-ink-900 shadow-sm sm:grid-cols-4 sm:gap-3 sm:p-4 dark:border-jade-800/60 dark:bg-jade-900 dark:text-white dark:shadow-none">
          {[
            { Icon: ShieldCheck, title: 'Secure Payments', body: 'Escrow protected' },
            { Icon: Headphones, title: '24/7 Support', body: 'Real humans' },
            { Icon: BadgeCheck, title: 'Verified Sellers', body: 'ID checked' },
            { Icon: Truck, title: 'Fast Delivery', body: 'Tracked riders' },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-2">
              <item.Icon className="h-6 w-6 shrink-0 text-jade-600 dark:text-gold-300" />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold leading-tight">{item.title}</p>
                <p className="truncate text-[10px] text-ink-500 dark:text-jade-200/80">{item.body}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ───────────────────── Catalog ───────────────────── */}
        <section id="catalog-section" className="mt-7 scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white sm:text-xl">
                {wishlistOnly
                  ? 'Your wishlist'
                  : dealsOnly
                    ? 'Discounted deals'
                    : selectedCategory
                      ? categoryMeta(selectedCategory).label
                      : searchQuery.trim()
                        ? `Results for “${searchQuery.trim()}”`
                        : 'All listings'}
              </h2>
              <p className="text-[11px] text-ink-400">
                {filteredProducts.length} item{filteredProducts.length === 1 ? '' : 's'}
                {selectedState ? ` · ${selectedState}` : ' · across Nigeria'}
                {onlyVerified ? ' · verified sellers only' : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onWishlistOnlyChange(!wishlistOnly)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  wishlistOnly
                    ? 'border-jade-500 bg-jade-500 text-white'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-jade-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${wishlistOnly ? 'fill-white' : ''}`} />
                Wishlist
                {favorites.length > 0 && (
                  <span className={`rounded-full px-1 text-[10px] ${wishlistOnly ? 'bg-white/20' : 'bg-jade-500/10 text-jade-700 dark:text-jade-300'}`}>
                    {favorites.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setDealsOnly((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  dealsOnly
                    ? 'border-jade-500 bg-jade-500 text-white'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-jade-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'
                }`}
              >
                <Flame className={`h-3.5 w-3.5 ${dealsOnly ? 'fill-white' : 'text-gold-500'}`} />
                Deals
              </button>

              <button
                type="button"
                onClick={() => setOnlyVerified((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                  onlyVerified
                    ? 'border-jade-500 bg-jade-500 text-white'
                    : 'border-ink-200 bg-white text-ink-600 hover:border-jade-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'
                }`}
              >
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </button>

              <label className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[11px] font-bold text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300">
                <SlidersHorizontal className="h-3.5 w-3.5 text-ink-400" />
                <select
                  aria-label="Sort listings"
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="cursor-pointer bg-transparent pr-1 outline-none"
                >
                  <option value="smart">Recommended</option>
                  <option value="rating">Top rated</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                  <option value="newest">Newest</option>
                </select>
              </label>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            db.products.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-ink-300 bg-white shadow-sm dark:border-ink-700 dark:bg-ink-900">
                <EmptyState
                  state="empty-cart"
                  icon={<Store />}
                  title="The marketplace is just getting started"
                  description="No listings yet. Create an account to sell the first item — every order is protected by GoodSale escrow."
                  action={
                    <button
                      type="button"
                      onClick={() => onOpenAuth?.('register')}
                      className="inline-flex items-center gap-2 rounded-xl bg-jade-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-jade-500/20 transition-all hover:bg-jade-600"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      List the first item
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="rounded-3xl border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900">
                <EmptyState
                  state="empty-search"
                  icon={<Heart />}
                  title={wishlistOnly ? 'Your wishlist is empty' : 'No products found'}
                  description={
                    wishlistOnly
                      ? 'Tap the heart on any listing to save it here.'
                      : 'Try loosening your search, location or category filters.'
                  }
                />
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  rating={ratingOf(product.id)}
                  reviewCount={reviewCountOf(product.id)}
                  {...sellerProps(product.sellerId)}
                  isFeatured={activeFeaturedIds.has(product.id)}
                  isFavorite={favorites.includes(product.id)}
                  onToggleFavorite={() => toggleFavorite(product.id)}
                  onSelect={() => onSelectProduct(product.id)}
                  onAdd={() => onAddToCart(product.id)}
                  compact
                />
              ))}
            </div>
          )}

          <AdSlot placement="SEARCH" onNavigate={onNavigate} className="mt-6" />
        </section>

        {/* ───────────────────── Auctions (only when live) ───────────────────── */}
        {auctions.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-jade-500/10 text-jade-600 dark:text-jade-300">
                <Gavel className="h-4 w-4" />
              </span>
              <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white">
                Live auctions
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {auctions.map((product) => {
                const auction = db.auctions.find((a) => a.productId === product.id);
                const bids = db.bids.filter((b) => b.auctionId === auction?.id);
                const highest = bids.length ? Math.max(...bids.map((b) => b.amount)) : auction?.startingBid || 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => onSelectProduct(product.id)}
                    className="group overflow-hidden rounded-2xl border border-ink-150 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-ink-800 dark:bg-ink-900"
                  >
                    <div className="relative aspect-square bg-ink-50 dark:bg-ink-950">
                      <SmartImage
                        src={product.images?.[0]}
                        alt={product.title}
                        seed={`auction-${product.id}`}
                        className="h-full w-full"
                        imgClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span className="absolute left-2 top-2 rounded-md bg-jade-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                        Live bid
                      </span>
                    </div>
                    <div className="space-y-1 p-2.5">
                      <h3 className="line-clamp-2 text-xs font-bold text-ink-900 dark:text-white">{product.title}</h3>
                      <p className="text-[11px] font-black text-jade-700 dark:text-jade-300">
                        Highest {naira(highest)}
                      </p>
                      <p className="text-[10px] text-ink-400">{bids.length} bid{bids.length === 1 ? '' : 's'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ───────────────────── Verified stores ───────────────────── */}
        {verifiedSellers.length > 0 && (
          <section id="sellers-section" className="mt-8 scroll-mt-24">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white">
                Verified stores
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-jade-500/10 px-2 py-1 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                <ShieldCheck className="h-3 w-3" /> ID checked
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {verifiedSellers.map((seller) => {
                const profile = profilesByUserId.get(seller.id);
                const listings = db.products.filter((p) => p.sellerId === seller.id).length;
                return (
                  <button
                    key={seller.id}
                    type="button"
                    onClick={() => onNavigate('seller-profile', { sellerId: seller.id })}
                    className="flex w-40 shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-ink-150 bg-white p-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-ink-800 dark:bg-ink-900"
                  >
                    <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-jade-500/10 ring-2 ring-jade-500/20">
                      <SmartImage
                        src={profile?.photoUrl}
                        alt={seller.fullName}
                        seed={`seller-${seller.id}`}
                        className="h-full w-full"
                      />
                    </div>
                    <span className="flex min-w-0 items-center gap-1 text-[11px] font-bold text-ink-900 dark:text-white">
                      <span className="truncate">{seller.fullName}</span>
                      <VerifiedBadge
                        sellerId={seller.id}
                        status={profile?.verificationStatus}
                        expiresAt={profile?.verificationExpiresAt}
                        variant="icon"
                        fallbackName={seller.fullName}
                        className="shrink-0"
                      />
                    </span>
                    <span className="text-[10px] text-ink-400">{listings} listings</span>
                    {profile?.state && <span className="text-[10px] text-ink-400">{profile.state}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Smooth-scroll to a section on the home page. */
function scrollToId(id: string) {
  if (typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
