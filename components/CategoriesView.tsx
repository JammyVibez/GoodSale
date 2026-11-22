// components/CategoriesView.tsx
'use client';

/**
 * In-app category directory.
 *
 * Every tile is derived from live listings, so the counts and "from" prices are
 * real. Canonical categories without stock yet are still listed — greyed and
 * non-clickable — so the catalogue reads as complete without sending shoppers
 * into empty results. Tapping a tile opens the marketplace pre-filtered to that
 * category.
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowRight, BadgeCheck, LayoutGrid, Search, ShieldCheck, Store, Truck, X,
} from 'lucide-react';
import { useDBState } from '../lib/store';
import { CATEGORY_META, CURATED_CATEGORIES, categoryMeta, isProductLive } from '@/lib/marketplace/categoryMeta';

interface CategoriesViewProps {
  onNavigate: (view: string, payload?: any) => void;
}

type CategoryEntry = {
  name: string;
  label: string;
  count: number;
  fromPrice: number | null;
  image?: string;
};

function naira(value: number): string {
  return `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`;
}

export default function CategoriesView({ onNavigate }: CategoriesViewProps) {
  const db = useDBState();
  const [query, setQuery] = useState('');

  const entries = useMemo<CategoryEntry[]>(() => {
    const live = new Map<string, CategoryEntry>();

    for (const product of db.products) {
      if (!isProductLive(product)) continue;
      const name = (product.category || 'Other').trim();
      const key = name.toLowerCase();
      const { label } = categoryMeta(name);
      const entry = live.get(key) || { name, label, count: 0, fromPrice: null };
      entry.count += 1;
      if (entry.fromPrice === null || product.price < entry.fromPrice) entry.fromPrice = product.price;
      if (!entry.image && product.images?.[0]) entry.image = product.images[0];
      live.set(key, entry);
    }

    // Canonical categories first when they have stock, then any live category the
    // curated list does not know about, then the still-empty canonical ones.
    const ordered = [...live.values()].sort((a, b) => b.count - a.count);
    const empty = CURATED_CATEGORIES.filter((slug) => !live.has(slug)).map((slug) => ({
      name: slug,
      label: CATEGORY_META[slug].label,
      count: 0,
      fromPrice: null,
    }));

    return [...ordered, ...empty];
  }, [db.products]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.label.toLowerCase().includes(needle) ||
        entry.name.toLowerCase().includes(needle)
    );
  }, [entries, query]);

  const liveCategories = entries.filter((entry) => entry.count > 0).length;
  const liveListings = entries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6">
      {/* Masthead */}
      <section className="relative overflow-hidden rounded-3xl border border-jade-800/40 bg-gradient-to-br from-jade-900 via-jade-950 to-ink-950 px-5 py-7 text-white shadow-[0_24px_60px_-40px_rgba(6,60,40,0.9)] sm:px-8 sm:py-9">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gold-300/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-jade-400/20 blur-3xl" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-200">
            <LayoutGrid className="h-3 w-3" aria-hidden="true" />
            Catalogue
          </span>
          <h1 className="mt-3 font-display text-2xl font-black tracking-tight sm:text-3xl">
            Shop by category
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-6 text-jade-50/75 sm:text-sm">
            Every category is built from live listings by verified sellers. Payment stays in escrow until you
            confirm delivery.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-inset ring-white/15">
              {liveCategories} active {liveCategories === 1 ? 'category' : 'categories'}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-inset ring-white/15">
              {liveListings} live {liveListings === 1 ? 'listing' : 'listings'}
            </span>
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a category…"
            aria-label="Find a category"
            className="h-11 w-full rounded-2xl border border-ink-200 bg-white pl-10 pr-10 text-sm font-medium text-ink-900 shadow-sm outline-none transition placeholder:text-ink-400 focus:border-jade-400 focus:ring-2 focus:ring-jade-500/25 dark:border-ink-800 dark:bg-ink-900 dark:text-white dark:placeholder:text-ink-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear category search"
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-ink-100 text-ink-500 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onNavigate('marketplace')}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-ink-200 bg-white px-4 text-xs font-bold text-ink-800 transition hover:border-jade-300 hover:text-jade-800 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100 dark:hover:border-jade-700"
        >
          All products
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Grid */}
      {results.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((entry) => {
            const { Icon } = categoryMeta(entry.name);
            const disabled = entry.count === 0;
            return (
              <button
                key={entry.name}
                type="button"
                disabled={disabled}
                aria-label={
                  disabled
                    ? `${entry.label} — no live listings yet`
                    : `Browse ${entry.label}, ${entry.count} live listings`
                }
                onClick={() => onNavigate('marketplace', { category: entry.name })}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left transition ${
                  disabled
                    ? 'cursor-default border-dashed border-ink-200 bg-ink-50/60 dark:border-ink-800 dark:bg-ink-900/40'
                    : 'border-ink-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-jade-300 hover:shadow-lg hover:shadow-jade-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade-500/40 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-jade-700'
                }`}
              >
                <span className="relative block aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-jade-100 via-jade-50 to-gold-50 dark:from-jade-950 dark:via-ink-900 dark:to-ink-900">
                  {entry.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`h-full w-full object-cover transition duration-500 ${
                        disabled ? 'opacity-40' : 'group-hover:scale-[1.04]'
                      }`}
                    />
                  ) : (
                    <span className={`grid h-full w-full place-items-center ${disabled ? 'opacity-40' : ''}`}>
                      <Icon className="h-8 w-8 text-jade-500/60 dark:text-jade-400/40" aria-hidden="true" />
                    </span>
                  )}
                  {entry.count > 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-black text-ink-900 shadow-sm backdrop-blur dark:bg-ink-950/90 dark:text-white">
                      {entry.count}
                    </span>
                  )}
                </span>

                <span className="flex items-center gap-2 px-3 py-2.5">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                      disabled
                        ? 'bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500'
                        : 'bg-jade-50 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-[13px] font-bold leading-tight ${
                        disabled ? 'text-ink-400 dark:text-ink-500' : 'text-ink-900 dark:text-white'
                      }`}
                    >
                      {entry.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-ink-500 dark:text-ink-400">
                      {entry.count === 0
                        ? 'Coming soon'
                        : `${entry.count} ${entry.count === 1 ? 'listing' : 'listings'}${
                            entry.fromPrice !== null ? ` · from ${naira(entry.fromPrice)}` : ''
                          }`}
                    </span>
                  </span>
                  {!disabled && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-jade-600 dark:text-ink-600 dark:group-hover:text-jade-300" aria-hidden="true" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 text-center dark:border-ink-800 dark:bg-ink-900">
          <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">No category matches “{query}”.</p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mt-3 rounded-full bg-jade-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-jade-700"
          >
            Show all categories
          </button>
        </div>
      )}

      {/* Trust strip */}
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        {[
          { Icon: ShieldCheck, title: 'Escrow protected', copy: 'Money releases only after delivery' },
          { Icon: BadgeCheck, title: 'Verified sellers', copy: 'ID and store checks before selling' },
          { Icon: Truck, title: 'Nationwide delivery', copy: 'Doorstep or safe-meet handover' },
        ].map(({ Icon, title, copy }) => (
          <div
            key={title}
            className="flex items-start gap-2.5 rounded-2xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-jade-50 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[12px] font-bold text-ink-900 dark:text-white">{title}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-ink-500 dark:text-ink-400">{copy}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Seller CTA */}
      <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl bg-jade-950 px-5 py-4 text-white sm:flex-row sm:items-center dark:bg-ink-900">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15">
            <Store className="h-5 w-5 text-gold-200" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold">Selling something in one of these categories?</p>
            <p className="text-[11px] text-jade-50/70">List it free and reach buyers across Nigeria.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="shrink-0 rounded-full bg-gold-300 px-4 py-2 text-xs font-bold text-ink-950 transition hover:bg-gold-200"
        >
          Start selling
        </button>
      </div>
    </div>
  );
}
