import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, LayoutGrid, ShieldCheck, Truck } from 'lucide-react';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { SeoShell } from '@/components/seo/SeoShell';
import { getPublicCategories } from '@/lib/seo/data';
import { breadcrumbLd, webPageLd } from '@/lib/seo/structured';
import { absoluteUrl, truncate } from '@/lib/seo/site';
import { categoryMeta } from '@/lib/marketplace/categoryMeta';

export const revalidate = 3600;

const title = 'Shop by category';
const description =
  'Browse every GoodSale category — phones, fashion, electronics, home, beauty and more — from verified Nigerian sellers with escrow-protected payments.';

export const metadata: Metadata = {
  title,
  description: truncate(description, 155),
  alternates: { canonical: '/categories' },
  openGraph: {
    title: `${title} | GoodSale`,
    description: truncate(description, 155),
    url: absoluteUrl('/categories'),
    siteName: 'GoodSale',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: `${title} | GoodSale`, description: truncate(description, 155) },
};

const trust = [
  { Icon: ShieldCheck, title: 'Escrow protected', copy: 'Payment releases after delivery' },
  { Icon: BadgeCheck, title: 'Verified sellers', copy: 'ID and store checks before listing' },
  { Icon: Truck, title: 'Nationwide delivery', copy: 'Doorstep or safe-meet handover' },
];

export default async function CategoriesPage() {
  const categories = await getPublicCategories();
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Categories', path: '/categories' },
  ];
  const totalListings = categories.reduce((sum, category) => sum + category.count, 0);

  return (
    <SeoShell>
      <JsonLd data={[webPageLd(title, description, '/categories'), breadcrumbLd(breadcrumbs)]} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />

        {/* Masthead */}
        <header className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-jade-900 via-jade-950 to-ink-950 px-6 py-8 text-white shadow-[0_30px_70px_-50px_rgba(6,60,40,0.95)] sm:px-10 sm:py-11">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-gold-300/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/4 h-60 w-60 rounded-full bg-jade-400/20 blur-3xl" />

          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-200">
              <LayoutGrid className="h-3 w-3" aria-hidden="true" />
              Catalogue
            </span>
            <h1 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-4xl">
              Shop by category
            </h1>
            <p className="mt-3 text-sm leading-7 text-jade-50/80 sm:text-[15px]">
              Every category below is built from live GoodSale listings. Pick one to compare prices, read real
              buyer reviews and buy from verified sellers with escrow protection.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-inset ring-white/15">
                {categories.length} {categories.length === 1 ? 'category' : 'categories'}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-inset ring-white/15">
                {totalListings} live {totalListings === 1 ? 'listing' : 'listings'}
              </span>
              <Link
                href="/"
                className="inline-flex items-center gap-1 rounded-full bg-gold-300 px-3.5 py-1.5 font-bold text-ink-950 transition hover:bg-gold-200"
              >
                Start shopping
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </header>

        {/* Category grid */}
        {categories.length > 0 ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => {
              const { label, Icon } = categoryMeta(category.name);
              return (
                <li key={category.slug}>
                  <Link
                    href={`/categories/${category.slug}`}
                    aria-label={`Browse ${label}, ${category.count} live listing${category.count === 1 ? '' : 's'}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-jade-300 hover:shadow-lg hover:shadow-jade-900/5 dark:border-ink-800 dark:bg-ink-900 dark:hover:border-jade-700"
                  >
                    <span className="relative block aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-jade-100 via-jade-50 to-gold-50 dark:from-jade-950 dark:via-ink-900 dark:to-ink-900">
                      {category.sampleImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={category.sampleImage}
                          alt={`${label} listing on GoodSale`}
                          width={400}
                          height={250}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center">
                          <Icon className="h-8 w-8 text-jade-500/60 dark:text-jade-400/40" aria-hidden="true" />
                        </span>
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-black text-ink-900 shadow-sm backdrop-blur dark:bg-ink-950/90 dark:text-white">
                        {category.count}
                      </span>
                    </span>

                    <span className="flex items-center gap-2 px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-jade-50 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold leading-tight text-ink-900 group-hover:underline dark:text-white">
                          {label}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-500 dark:text-ink-400">
                          {category.count} live listing{category.count === 1 ? '' : 's'}
                        </span>
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-jade-600 dark:text-ink-600 dark:group-hover:text-jade-300"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-8 text-center dark:border-ink-800 dark:bg-ink-900">
            <p className="text-sm font-semibold text-ink-800 dark:text-white">Categories are being stocked.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-500 dark:text-ink-400">
              They appear here as soon as sellers publish live listings.
            </p>
            <Link
              href="/sellers"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-jade-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-jade-700"
            >
              Browse sellers
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        {/* Trust strip */}
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {trust.map(({ Icon, title: heading, copy }) => (
            <div
              key={heading}
              className="flex items-start gap-2.5 rounded-2xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-jade-50 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[12px] font-bold text-ink-900 dark:text-white">{heading}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-ink-500 dark:text-ink-400">{copy}</span>
              </span>
            </div>
          ))}
        </div>

        <section className="mt-4 rounded-3xl bg-jade-950 px-6 py-8 text-white sm:px-10 dark:bg-ink-900">
          <h2 className="text-2xl font-bold">Not sure where to start?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-jade-50/75">
            Browse verified storefronts or read how GoodSale protects every order before you pay.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/sellers" className="rounded-full bg-gold-300 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-gold-200">
              Browse sellers
            </Link>
            <Link href="/trust-safety" className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
              How escrow works
            </Link>
          </div>
        </section>
      </div>
    </SeoShell>
  );
}
