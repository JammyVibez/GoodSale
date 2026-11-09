// components/seo/CollectionFilters.tsx
'use client';

/**
 * Filter bar for the public listing routes.
 *
 * A plain GET form, so filtering works without client JavaScript; the select
 * controls simply submit it immediately when JS is available.
 */
import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { COLLECTION_SORTS, type CollectionSort } from '@/lib/marketplace/collections';


export interface CollectionFiltersProps {
  basePath: string;
  query: string;
  category: string;
  seller: string;
  state: string;
  availability: string;
  priceMin: string;
  priceMax: string;
  sort: CollectionSort;
  /** The collection's own ordering — kept out of every generated URL. */
  defaultSort: CollectionSort;
  categories: { slug: string; name: string }[];
  sellers: { value: string; label: string }[];
  states: string[];
}

const selectClass =
  'h-9 w-full appearance-none rounded-lg border border-emerald-950/15 bg-white px-2.5 text-[12px] font-medium text-emerald-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15';

const labelClass = 'text-[10px] font-bold uppercase tracking-wide text-emerald-950/45';

export default function CollectionFilters({
  basePath,
  query,
  category,
  seller,
  state,
  availability,
  priceMin,
  priceMax,
  sort,
  defaultSort,
  categories,
  sellers,
  states,
}: CollectionFiltersProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);

  const submit = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (key === 'sort') continue;
      const text = String(value).trim();
      if (!text) continue;
      if (key === 'availability' && text === 'all') continue;
      params.set(key, text);
    }
    const chosenSort = String(data.get('sort') || defaultSort);
    if (chosenSort !== defaultSort) params.set('sort', chosenSort);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  };

  const hasFilters = Boolean(query || category || seller || state || priceMin || priceMax || (availability && availability !== 'all'));

  return (
    <form
      ref={formRef}
      action={basePath}
      method="get"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onChange={() => setDirty(true)}
      aria-label="Filter listings"
      className="rounded-xl border border-emerald-950/10 bg-white p-3"
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <div className="col-span-2">
          <label htmlFor="filter-q" className={labelClass}>Search in results</label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-950/35" aria-hidden="true" />
            <input
              id="filter-q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Brand, model, seller…"
              className="h-9 w-full rounded-lg border border-emerald-950/15 bg-white pl-8 pr-2.5 text-[12px] text-emerald-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
          </div>
        </div>

        <div>
          <label htmlFor="filter-category" className={labelClass}>Category</label>
          <select
            id="filter-category"
            name="category"
            defaultValue={category}
            onChange={submit}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>{item.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-seller" className={labelClass}>Seller</label>
          <select
            id="filter-seller"
            name="seller"
            defaultValue={seller}
            onChange={submit}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">All sellers</option>
            {sellers.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-state" className={labelClass}>Ships from</label>
          <select
            id="filter-state"
            name="state"
            defaultValue={state}
            onChange={submit}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">Anywhere in Nigeria</option>
            {states.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Price (₦)</label>
          <div className="mt-1 flex items-center gap-1">
            <input
              name="priceMin"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              defaultValue={priceMin}
              placeholder="Min"
              aria-label="Minimum price in naira"
              className="h-9 w-full min-w-0 rounded-lg border border-emerald-950/15 bg-white px-2 text-[12px] text-emerald-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
            <span className="text-emerald-950/30" aria-hidden="true">–</span>
            <input
              name="priceMax"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              defaultValue={priceMax}
              placeholder="Max"
              aria-label="Maximum price in naira"
              className="h-9 w-full min-w-0 rounded-lg border border-emerald-950/15 bg-white px-2 text-[12px] text-emerald-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
            />
          </div>
        </div>

        <div>
          <label htmlFor="filter-availability" className={labelClass}>Availability</label>
          <select
            id="filter-availability"
            name="availability"
            defaultValue={availability || 'all'}
            onChange={submit}
            className={`mt-1 ${selectClass}`}
          >
            <option value="all">In and out of stock</option>
            <option value="in">In stock only</option>
            <option value="out">Out of stock</option>
          </select>
        </div>

        <div>
          <label htmlFor="filter-sort" className={labelClass}>Sort by</label>
          <div className="relative mt-1">
            <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-950/35" aria-hidden="true" />
            <select
              id="filter-sort"
              name="sort"
              defaultValue={sort}
              onChange={(event) => {
                setDirty(true);
                const form = formRef.current;
                if (!form) return;
                const params = new URLSearchParams();
                const data = new FormData(form);
                for (const [key, value] of data.entries()) {
                  if (key === 'sort') continue;
                  const text = String(value).trim();
                  if (!text) continue;
                  if (key === 'availability' && text === 'all') continue;
                  params.set(key, text);
                }
                const next = event.target.value;
                if (next !== defaultSort) params.set('sort', next);
                const qs = params.toString();
                startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
              }}
              className={`${selectClass} pl-8`}
            >
              {COLLECTION_SORTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-emerald-950/50" aria-live="polite">
          {pending ? 'Updating results…' : hasFilters ? 'Filters applied to this collection.' : 'All live listings in this collection.'}
        </p>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <a
              href={basePath}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-emerald-950/60 hover:text-emerald-950"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear filters
            </a>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-[#032214] px-4 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#064e3b] disabled:opacity-60"
          >
            {pending ? 'Loading…' : dirty ? 'Apply filters' : 'Apply'}
          </button>
        </div>
      </div>
    </form>
  );
}
