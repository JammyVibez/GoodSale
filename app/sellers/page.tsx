import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { RatingStars } from '@/components/seo/ProductCard';
import { SeoShell } from '@/components/seo/SeoShell';
import { getPublicStores } from '@/lib/seo/data';
import { breadcrumbLd, webPageLd } from '@/lib/seo/structured';
import { absoluteUrl, truncate } from '@/lib/seo/site';

export const revalidate = 3600;

const title = 'Verified sellers and storefronts';
const description =
  'Browse GoodSale storefronts from verified sellers and registered businesses across Nigeria. See live listings, ratings and locations before you buy with escrow.';

export const metadata: Metadata = {
  title,
  description: truncate(description, 155),
  alternates: { canonical: '/sellers' },
  openGraph: {
    title: `${title} | GoodSale`,
    description: truncate(description, 155),
    url: absoluteUrl('/sellers'),
    siteName: 'GoodSale',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: `${title} | GoodSale`, description: truncate(description, 155) },
};

export default async function SellersPage() {
  const stores = await getPublicStores();
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Sellers', path: '/sellers' },
  ];

  return (
    <SeoShell>
      <JsonLd data={[webPageLd(title, description, '/sellers'), breadcrumbLd(breadcrumbs)]} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <header className="mt-5 max-w-3xl">
          <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-white sm:text-4xl">Sellers on GoodSale</h1>
          <p className="mt-3 text-[15px] leading-7 text-ink-600 dark:text-ink-300">
            Every storefront below belongs to a GoodSale seller account. Verified sellers and registered businesses have
            completed identity checks. Ratings and reviews are shown only when real buyers have left feedback after an
            order.
          </p>
        </header>

        {stores.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stores.map((store) => {
              const name = store.businessName || store.name;
              const location = [store.city, store.state].filter(Boolean).join(', ');
              return (
                <li key={store.id}>
                  <article className="flex h-full flex-col rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink-900/5 dark:hover:shadow-black/30">
                    <div className="flex items-start gap-3">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-jade-50 dark:bg-jade-500/10 text-lg font-black text-ink-900 dark:text-white">
                        {store.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={store.logoUrl} alt={`${name} logo`} width={112} height={112} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold text-ink-900 dark:text-white">
                          <Link href={`/sellers/${store.id}`} className="hover:underline">{name}</Link>
                        </h2>
                        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{location || 'Nigeria'}</p>
                        <RatingStars rating={store.rating} count={store.reviewCount} />
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-ink-600 dark:text-ink-300">
                      {store.businessDescription || store.bio || `${name} sells on GoodSale with escrow-protected payments.`}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                        {store.verified && <span className="rounded-full bg-jade-100 dark:bg-jade-500/15 px-2 py-0.5 text-jade-700 dark:text-jade-300">✓ Verified</span>}
                        <span className="rounded-full bg-gold-100 dark:bg-gold-300/15 px-2 py-0.5 text-gold-700 dark:text-gold-200">
                          {store.productCount} listing{store.productCount === 1 ? '' : 's'}
                        </span>
                      </p>
                      <Link href={`/sellers/${store.id}`} className="text-sm font-semibold text-jade-700 dark:text-jade-300 hover:underline">
                        Storefront →
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-8 rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 text-sm text-ink-500 dark:text-ink-400">
            Seller storefronts appear here as accounts publish listings.
          </p>
        )}
      </div>
    </SeoShell>
  );
}
