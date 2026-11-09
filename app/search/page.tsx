import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { ProductCard } from '@/components/seo/ProductCard';
import { SeoShell } from '@/components/seo/SeoShell';
import { getPublicCategories, searchPublicProducts } from '@/lib/seo/data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search the marketplace',
  description: 'Search live GoodSale listings from verified sellers across Nigeria.',
  alternates: { canonical: '/search' },
  robots: { index: false, follow: true },
};

type PageProps = { searchParams: Promise<{ q?: string | string[] }> };

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (raw || '').trim().slice(0, 120);
  const products = await searchPublicProducts(query, 60);
  const categories = products.length === 0 ? await getPublicCategories() : [];

  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Search', path: '/search' },
  ];

  return (
    <SeoShell>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <header className="mt-5 rounded-3xl border border-emerald-950/10 bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-black tracking-tight text-[#032214] sm:text-3xl">
            {query ? `Results for “${query}”` : 'Search GoodSale'}
          </h1>
          <p className="mt-1 text-sm text-emerald-950/55">
            {query
              ? `${products.length} live listing${products.length === 1 ? '' : 's'} matched your search.`
              : 'Search by product, brand or category. Results come from the live marketplace catalog.'}
          </p>
          <form action="/search" method="get" role="search" className="mt-4 flex gap-2">
            <label htmlFor="site-search" className="sr-only">Search listings</label>
            <input
              id="site-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="iPhone, sneakers, generator…"
              className="min-w-0 flex-1 rounded-full border border-emerald-950/15 bg-[#fbf9f3] px-4 py-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
            />
            <button type="submit" className="rounded-full bg-[#032214] px-5 py-3 text-sm font-semibold text-white hover:bg-[#064e3b]">
              Search
            </button>
          </form>
        </header>

        {products.length > 0 ? (
          <section aria-label="Search results" className="mt-8">
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-3xl border border-emerald-950/10 bg-white p-6">
            <h2 className="text-lg font-bold text-[#032214]">{query ? 'No exact matches' : 'Start with a category'}</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-950/60">
              {query
                ? 'Try a shorter search, a brand name, or browse the categories below.'
                : 'Browse live categories to find what you need.'}
            </p>
            {categories.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {categories.slice(0, 20).map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/categories/${category.slug}`}
                      className="inline-flex rounded-full border border-emerald-950/15 px-3 py-1.5 text-sm font-medium hover:border-emerald-800 hover:bg-emerald-50"
                    >
                      {category.name} ({category.count})
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </SeoShell>
  );
}
