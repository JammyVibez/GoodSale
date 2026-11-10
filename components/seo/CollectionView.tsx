// components/seo/CollectionView.tsx
import Link from 'next/link';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import { Breadcrumbs } from './Breadcrumbs';
import { JsonLd } from './JsonLd';
import { ProductCard } from './ProductCard';
import CollectionFilters from './CollectionFilters';
import {
  applyFilters,
  sellerOptions,
  sortProducts,
  stateOptions,
  type ListingFilters,
  type PricedProduct,
} from '@/lib/seo/collections';
import {
  COLLECTION_SORTS,
  type CollectionDefinition,
  type CollectionSort,
} from '@/lib/marketplace/collections';
import { naira } from '@/lib/seo/site';
import { breadcrumbLd, collectionPageLd } from '@/lib/seo/structured';

export const COLLECTION_PAGE_SIZE = 24;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function readSort(value: string, fallback: CollectionSort): CollectionSort {
  const match = COLLECTION_SORTS.find((option) => option.value === value);
  return match ? match.value : fallback;
}

function readNumber(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed) return null; // an absent price bound is not ₦0
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function queryString(filters: ListingFilters, sort: CollectionSort, page: number, defaultSort: CollectionSort): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.seller) params.set('seller', filters.seller);
  if (filters.state) params.set('state', filters.state);
  if (filters.availability !== 'all') params.set('availability', filters.availability);
  if (filters.priceMin !== null) params.set('priceMin', String(filters.priceMin));
  if (filters.priceMax !== null) params.set('priceMax', String(filters.priceMax));
  if (sort !== defaultSort) params.set('sort', sort);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export interface CollectionViewProps {
  collection: CollectionDefinition;
  products: PricedProduct[];
  categories: { slug: string; name: string }[];
  searchParams: SearchParams;
}

export default function CollectionView({ collection, products, categories, searchParams }: CollectionViewProps) {
  const filters: ListingFilters = {
    q: first(searchParams.q).slice(0, 120),
    category: first(searchParams.category),
    seller: first(searchParams.seller),
    state: first(searchParams.state),
    availability: (['in', 'out'].includes(first(searchParams.availability))
      ? (first(searchParams.availability) as 'in' | 'out')
      : 'all'),
    priceMin: readNumber(first(searchParams.priceMin)),
    priceMax: readNumber(first(searchParams.priceMax)),
  };
  const sort = readSort(first(searchParams.sort), collection.defaultSort);
  const page = Math.max(1, Math.floor(Number(first(searchParams.page)) || 1));

  const filtered = sortProducts(applyFilters(products, filters), sort);
  const totalPages = Math.max(1, Math.ceil(filtered.length / COLLECTION_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * COLLECTION_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + COLLECTION_PAGE_SIZE);
  const hasFilters = Boolean(
    filters.q || filters.category || filters.seller || filters.state
    || filters.priceMin !== null || filters.priceMax !== null || filters.availability !== 'all'
  );

  const sellers = sellerOptions(products);
  const states = stateOptions(products);
  const fromPrice = products.length ? Math.min(...products.map((item) => item.price)) : 0;
  const inStockCount = products.filter((item) => item.product.inStock).length;
  const sortLabel = COLLECTION_SORTS.find((option) => option.value === sort)?.label || 'Recommended';

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Marketplace', path: '/categories' },
    { name: collection.title, path: collection.href },
  ];

  const pageHref = (target: number) => `${collection.href}${queryString(filters, sort, target, collection.defaultSort)}`;

  const pageNumbers: number[] = [];
  const windowStart = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  for (let index = windowStart; index < windowStart + 5 && index <= totalPages; index += 1) {
    pageNumbers.push(index);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <JsonLd
        data={[
          collectionPageLd(collection.title, collection.description, collection.href, pageItems.map((item) => item.product)),
          breadcrumbLd(breadcrumbs),
        ]}
      />
      <Breadcrumbs items={breadcrumbs} />

      <header className="mt-4 overflow-hidden rounded-2xl bg-jade-950 dark:bg-ink-900 px-5 py-6 text-white sm:px-8 sm:py-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-300">GoodSale · {collection.eyebrow}</p>
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-black tracking-tight sm:text-4xl">{collection.title}</h1>
          <p className="text-[11px] text-jade-100/60">{collection.ordering}</p>
        </div>
        <p className="mt-2.5 max-w-2xl text-[12px] leading-6 text-jade-50/75 sm:text-sm">{collection.description}</p>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px]">
          <div>
            <dt className="text-jade-100/50">Listings</dt>
            <dd className="font-bold">{products.length}</dd>
          </div>
          <div>
            <dt className="text-jade-100/50">In stock</dt>
            <dd className="font-bold">{inStockCount}</dd>
          </div>
          <div>
            <dt className="text-jade-100/50">Sellers</dt>
            <dd className="font-bold">{sellers.length}</dd>
          </div>
          <div>
            <dt className="text-jade-100/50">Ships from</dt>
            <dd className="font-bold">{states.length} state{states.length === 1 ? '' : 's'}</dd>
          </div>
          {fromPrice > 0 && (
            <div>
              <dt className="text-jade-100/50">From</dt>
              <dd className="font-bold">{naira(fromPrice)}</dd>
            </div>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-jade-50/70">
          <span className="rounded-full border border-white/15 px-2.5 py-1">Escrow-protected checkout</span>
          <span className="rounded-full border border-white/15 px-2.5 py-1">Verified seller badges</span>
          <span className="rounded-full border border-white/15 px-2.5 py-1">Tracked delivery</span>
        </div>
      </header>

      <div className="mt-4">
        <CollectionFilters
          basePath={collection.href}
          query={filters.q}
          category={filters.category}
          seller={filters.seller}
          state={filters.state}
          availability={filters.availability}
          priceMin={filters.priceMin !== null ? String(filters.priceMin) : ''}
          priceMax={filters.priceMax !== null ? String(filters.priceMax) : ''}
          sort={sort}
          defaultSort={collection.defaultSort}
          categories={categories}
          sellers={sellers}
          states={states}
        />
      </div>

      <section aria-labelledby="collection-results" className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="collection-results" className="text-lg font-bold text-ink-900 dark:text-white">
              {hasFilters ? 'Matching listings' : 'All listings'}
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400" aria-live="polite">
              {filtered.length === 0
                ? 'Nothing matches these filters.'
                : `Showing ${start + 1}–${start + pageItems.length} of ${filtered.length} · ${sortLabel.toLowerCase()}`}
              {totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ''}
            </p>
          </div>
          {hasFilters && (
            <Link href={collection.href} className="text-[11px] font-semibold text-jade-700 dark:text-jade-300 hover:underline">
              Reset this collection
            </Link>
          )}
        </div>

        {pageItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5">
            {pageItems.map((item, index) => (
              <ProductCard key={item.product.id} product={item.product} eager={index < 5} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-8 text-center">
            <SearchX className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-700" aria-hidden="true" />
            <h3 className="mt-3 text-base font-bold text-ink-900 dark:text-white">
              {products.length === 0 ? 'No live listings in this collection yet' : 'No listings match these filters'}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-ink-500 dark:text-ink-400">
              {products.length === 0
                ? 'This collection fills up as sellers publish qualifying listings. Browse every category in the meantime.'
                : 'Try a wider price range, another category, or clear the seller and location filters.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href={hasFilters ? collection.href : '/categories'}
                className="rounded-full bg-jade-950 dark:bg-ink-900 px-4 py-2 text-[11px] font-bold text-white hover:bg-jade-900 dark:hover:bg-ink-800"
              >
                {hasFilters ? 'Clear filters' : 'Browse categories'}
              </Link>
              <Link
                href="/best-deals"
                className="rounded-full border border-ink-300 dark:border-ink-700 px-4 py-2 text-[11px] font-semibold text-ink-900 dark:text-ink-100 hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                See best deals
              </Link>
            </div>
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
          {currentPage > 1 ? (
            <Link
              href={pageHref(currentPage - 1)}
              rel="prev"
              className="inline-flex items-center gap-1 rounded-lg border border-ink-300 dark:border-ink-700 px-3 py-1.5 text-[11px] font-semibold hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg border border-ink-200 dark:border-ink-800 px-3 py-1.5 text-[11px] font-semibold text-ink-400 dark:text-ink-500">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Previous
            </span>
          )}

          {pageNumbers.map((number) => (
            <Link
              key={number}
              href={pageHref(number)}
              aria-current={number === currentPage ? 'page' : undefined}
              className={`grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-[11px] font-bold ${
                number === currentPage
                  ? 'border-[#032214] bg-jade-950 dark:bg-ink-900 text-white'
                  : 'border-ink-300 dark:border-ink-700 text-ink-900 dark:text-ink-100 hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              {number}
            </Link>
          ))}

          {currentPage < totalPages ? (
            <Link
              href={pageHref(currentPage + 1)}
              rel="next"
              className="inline-flex items-center gap-1 rounded-lg border border-ink-300 dark:border-ink-700 px-3 py-1.5 text-[11px] font-semibold hover:bg-ink-100 dark:hover:bg-ink-800"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg border border-ink-200 dark:border-ink-800 px-3 py-1.5 text-[11px] font-semibold text-ink-400 dark:text-ink-500">
              Next
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
