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
          <h1 className="text-3xl font-black tracking-tight text-[#032214] sm:text-4xl">Sellers on GoodSale</h1>
          <p className="mt-3 text-[15px] leading-7 text-emerald-950/70">
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
                  <article className="flex h-full flex-col rounded-2xl border border-emerald-950/10 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-950/5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef5ef] text-lg font-black text-[#032214]">
                        {store.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={store.logoUrl} alt={`${name} logo`} width={112} height={112} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold text-[#032214]">
                          <Link href={`/sellers/${store.id}`} className="hover:underline">{name}</Link>
                        </h2>
                        <p className="mt-0.5 text-xs text-emerald-950/55">{location || 'Nigeria'}</p>
                        <RatingStars rating={store.rating} count={store.reviewCount} />
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-emerald-950/65">
                      {store.businessDescription || store.bio || `${name} sells on GoodSale with escrow-protected payments.`}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                        {store.verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">✓ Verified</span>}
                        <span className="rounded-full bg-[#f4ead0] px-2 py-0.5 text-[#7a5c12]">
                          {store.productCount} listing{store.productCount === 1 ? '' : 's'}
                        </span>
                      </p>
                      <Link href={`/sellers/${store.id}`} className="text-sm font-semibold text-emerald-800 hover:underline">
                        Storefront →
                      </Link>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-8 rounded-2xl border border-emerald-950/10 bg-white p-6 text-sm text-emerald-950/60">
            Seller storefronts appear here as accounts publish listings.
          </p>
        )}
      </div>
    </SeoShell>
  );
}
