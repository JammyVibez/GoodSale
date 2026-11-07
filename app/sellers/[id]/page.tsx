import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { ProductCard } from '@/components/seo/ProductCard';
import { SeoShell } from '@/components/seo/SeoShell';
import { getProductsBySeller, getStoreById } from '@/lib/seo/data';
import { breadcrumbLd, storeLd } from '@/lib/seo/structured';
import { absoluteUrl, truncate } from '@/lib/seo/site';

export const revalidate = 3600;

type PageProps = { params: Promise<{ id: string }> };

function storeName(store: { businessName?: string; name: string }) {
  return store.businessName || store.name;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const store = await getStoreById(Number(id));
  if (!store) return { title: 'Seller not found', robots: { index: false, follow: false } };

  const name = storeName(store);
  const location = [store.city, store.state].filter(Boolean).join(', ');
  const description = truncate(
    store.businessDescription ||
      store.bio ||
      `Shop ${store.productCount} live listing${store.productCount === 1 ? '' : 's'} from ${name}${
        location ? ` in ${location}` : ' in Nigeria'
      } on GoodSale. Escrow-protected payments and real buyer reviews.`,
    155
  );
  const image = store.bannerUrl || store.logoUrl;

  return {
    title: `${name}${store.verified ? ' — verified seller' : ' storefront'}`,
    description,
    alternates: { canonical: `/sellers/${store.id}` },
    openGraph: {
      title: `${name} | GoodSale`,
      description,
      url: absoluteUrl(`/sellers/${store.id}`),
      siteName: 'GoodSale',
      type: 'website',
      images: image ? [{ url: absoluteUrl(image), alt: name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name} | GoodSale`,
      description,
      images: image ? [absoluteUrl(image)] : undefined,
    },
  };
}

export default async function SellerPage({ params }: PageProps) {
  const { id } = await params;
  const store = await getStoreById(Number(id));
  if (!store) notFound();

  const products = await getProductsBySeller(store.id);
  const name = storeName(store);
  const location = [store.city, store.state].filter(Boolean).join(', ');
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Sellers', path: '/sellers' },
    { name, path: `/sellers/${store.id}` },
  ];

  return (
    <SeoShell>
      <JsonLd data={[storeLd(store, products), breadcrumbLd(breadcrumbs)]} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />

        <header className="mt-5 overflow-hidden rounded-3xl border border-emerald-950/10 bg-white">
          <div className="relative h-32 bg-[#032214] sm:h-40">
            {store.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.bannerUrl}
                alt={`${name} storefront banner`}
                width={1200}
                height={320}
                fetchPriority="high"
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="relative px-5 pb-6 sm:px-8">
            <div className="-mt-10 flex flex-wrap items-end gap-4">
              <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-[#eef5ef] text-2xl font-black text-[#032214]">
                {store.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={store.logoUrl} alt={`${name} logo`} width={160} height={160} className="h-full w-full object-cover" />
                ) : (
                  name.slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1 pb-1">
                <h1 className="text-2xl font-black tracking-tight text-[#032214] sm:text-3xl">{name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-emerald-950/60">
                  {store.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      ✓ Verified seller
                    </span>
                  )}
                  {store.business && <span className="rounded-full bg-[#f4ead0] px-2.5 py-0.5 text-xs font-semibold text-[#7a5c12]">Registered business</span>}
                  {location && <span>{location}</span>}
                  <span>{products.length} live listing{products.length === 1 ? '' : 's'}</span>
                </p>
              </div>
              <Link
                href={`/?seller=${store.id}`}
                className="mb-1 rounded-full bg-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#032214] hover:bg-[#e6c35a]"
              >
                Open storefront in app
              </Link>
            </div>

            {(store.businessDescription || store.bio) && (
              <p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-7 text-emerald-950/70">
                {store.businessDescription || store.bio}
              </p>
            )}
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-emerald-950/10 pt-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-emerald-950/45">Member since</dt>
                <dd className="font-medium">
                  {new Date(store.joinedAt).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
                </dd>
              </div>
              {store.businessAddress && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-950/45">Business address</dt>
                  <dd className="font-medium">{store.businessAddress}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wide text-emerald-950/45">Payments</dt>
                <dd className="font-medium">Held in GoodSale escrow</dd>
              </div>
            </dl>
          </div>
        </header>

        <section aria-labelledby="store-listings" className="mt-10">
          <h2 id="store-listings" className="text-xl font-bold text-[#032214]">Listings from {name}</h2>
          {products.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product, index) => (
                <ProductCard key={product.id} product={product} eager={index < 4} />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-emerald-950/10 bg-white p-6 text-sm text-emerald-950/60">
              This seller has no live listings right now. <Link href="/categories" className="font-semibold text-emerald-800 underline">Browse categories</Link> to keep shopping.
            </p>
          )}
        </section>

        <section aria-labelledby="store-reviews" className="mt-10 rounded-3xl border border-emerald-950/10 bg-white p-6">
          <h2 id="store-reviews" className="text-xl font-bold text-[#032214]">Seller reviews</h2>
          {store.reviewCount > 0 ? (
            <>
              <p className="mt-2 text-sm text-emerald-950/60">
                <span className="text-2xl font-black text-[#032214]">{store.rating?.toFixed(1)}</span> / 5 from{' '}
                {store.reviewCount} real review{store.reviewCount === 1 ? '' : 's'}
              </p>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {store.reviews.map((review) => (
                  <li key={review.id} className="rounded-2xl bg-[#f7f5ee] p-4">
                    <p className="text-sm font-semibold text-[#032214]">
                      {review.author}
                      <span className="ml-2 font-normal text-[#b8912c]" aria-label={`${review.rating} out of 5 stars`}>
                        {'★'.repeat(review.rating)}
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-6 text-emerald-950/70">{review.comment}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6 text-emerald-950/60">
              No seller reviews yet. Ratings only appear after real completed orders.
            </p>
          )}
        </section>

        <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#eef5ef] p-6">
          <div>
            <h2 className="text-lg font-bold text-[#032214]">Shopping safely on GoodSale</h2>
            <p className="mt-1 text-sm text-emerald-950/65">Escrow payments, tracked delivery and support on every order.</p>
          </div>
          <Link href="/trust-safety" className="rounded-full bg-[#032214] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#064e3b]">
            How buyer protection works
          </Link>
        </section>
      </div>
    </SeoShell>
  );
}
