import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { ProductCard, RatingStars } from '@/components/seo/ProductCard';
import { SeoShell } from '@/components/seo/SeoShell';
import { getProductById, getProductsByCategory } from '@/lib/seo/data';
import { breadcrumbLd, productLd } from '@/lib/seo/structured';
import { absoluteUrl, naira, truncate } from '@/lib/seo/site';

export const revalidate = 3600;

type PageProps = { params: Promise<{ id: string }> };

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(Number(id));
  if (!product) {
    return { title: 'Listing not found', robots: { index: false, follow: false } };
  }

  const title = `${product.title} — ${naira(product.price)}`;
  const availability = product.inStock ? 'In stock' : 'Out of stock';
  const description = truncate(
    `${product.title} for ${naira(product.price)} from ${product.sellerName} on GoodSale. ${availability}. ${
      product.sellerVerified ? 'Verified seller. ' : ''
    }Escrow-protected payment and delivery in Nigeria.${product.description ? ` ${product.description}` : ''}`,
    160
  );
  const image = product.images[0] ? absoluteUrl(product.images[0]) : absoluteUrl('/goodsale-mark.svg');

  return {
    title,
    description,
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      type: 'website',
      title,
      description,
      url: absoluteUrl(`/products/${product.id}`),
      siteName: 'GoodSale',
      images: [{ url: image, alt: product.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots:
      product.stockStatus === 'UNAVAILABLE'
        ? { index: false, follow: true }
        : {
            index: true,
            follow: true,
            googleBot: {
              index: true,
              follow: true,
              'max-image-preview': 'large',
              'max-snippet': -1,
              'max-video-preview': -1,
            },
          },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProductById(Number(id));
  if (!product) notFound();

  const related = await getProductsByCategory(product.categorySlug);
  const siblings = related.filter((item) => item.id !== product.id).slice(0, 4);
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: product.category, path: `/categories/${product.categorySlug}` },
    { name: product.title, path: `/products/${product.id}` },
  ];
  const savings =
    product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice - product.price : 0;

  return (
    <SeoShell>
      <JsonLd data={[productLd(product), breadcrumbLd(breadcrumbs)]} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-label="Product images" className="min-w-0">
            <div className="overflow-hidden rounded-3xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
              {product.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.images[0]}
                  alt={`${product.title} — main product photo`}
                  width={960}
                  height={960}
                  fetchPriority="high"
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-ink-100 dark:bg-ink-850 text-7xl font-black text-ink-300 dark:text-ink-700" aria-hidden="true">
                  GS
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <ul className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5" aria-label="More product photos">
                {product.images.slice(1, 6).map((image, index) => (
                  <li key={image} className="overflow-hidden rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image}
                      alt={`${product.title} — photo ${index + 2}`}
                      width={240}
                      height={240}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 sm:p-6">
              <Link
                href={`/categories/${product.categorySlug}`}
                className="text-xs font-semibold uppercase tracking-wider text-jade-700 dark:text-jade-300 hover:underline"
              >
                {product.category}
              </Link>
              <h1 className="mt-2 text-2xl font-black leading-tight tracking-tight text-ink-900 dark:text-white sm:text-3xl">
                {product.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <RatingStars rating={product.rating} count={product.reviewCount} />
                <span className="text-xs text-ink-500 dark:text-ink-400">{humanize(product.condition)} condition</span>
              </div>

              <p className="mt-5 flex flex-wrap items-baseline gap-2">
                <span className="text-3xl font-black text-ink-900 dark:text-white">{naira(product.price)}</span>
                {savings > 0 && (
                  <>
                    <span className="text-sm text-ink-400 dark:text-ink-500 line-through">{naira(product.compareAtPrice!)}</span>
                    <span className="rounded-full bg-jade-100 dark:bg-jade-500/15 px-2 py-0.5 text-xs font-bold text-jade-700 dark:text-jade-300">
                      Save {naira(savings)}
                    </span>
                  </>
                )}
              </p>
              <p className="mt-2 text-sm">
                {product.inStock ? (
                  <span className="font-semibold text-jade-700 dark:text-jade-300">
                    In stock{product.quantity <= 5 ? ` — only ${product.quantity} left` : ''}
                  </span>
                ) : (
                  <span className="font-semibold text-amber-700">Currently out of stock</span>
                )}
              </p>

              <Link
                href={`/?product=${product.id}`}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gold-300 px-6 py-3.5 text-base font-extrabold text-ink-950 transition hover:bg-gold-200"
              >
                {product.inStock ? 'Buy with escrow protection' : 'View listing in app'}
              </Link>
              <p className="mt-2 text-center text-xs text-ink-500 dark:text-ink-400">
                Payment is held in escrow until you confirm delivery.
              </p>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-200 dark:border-ink-800 pt-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-400 dark:text-ink-500">Delivery</dt>
                  <dd className="mt-0.5 font-medium">{humanize(product.deliveryMethod)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-400 dark:text-ink-500">Returns</dt>
                  <dd className="mt-0.5 font-medium">{product.returnPolicy ? humanize(product.returnPolicy) : 'Per seller policy'}</dd>
                </div>
                {product.warranty && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink-400 dark:text-ink-500">Warranty</dt>
                    <dd className="mt-0.5 font-medium">{product.warranty}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-400 dark:text-ink-500">Listed</dt>
                  <dd className="mt-0.5 font-medium">
                    {new Date(product.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-3xl border border-ink-200 dark:border-ink-800 bg-jade-50 dark:bg-jade-500/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-jade-700 dark:text-jade-300">Seller</p>
              <Link href={`/sellers/${product.sellerId}`} className="mt-1 block text-lg font-bold text-ink-900 dark:text-white hover:underline">
                {product.sellerName}
              </Link>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                {product.sellerVerified ? 'Verified GoodSale seller' : 'GoodSale seller'}
                {product.sellerCity || product.sellerState
                  ? ` · ${[product.sellerCity, product.sellerState].filter(Boolean).join(', ')}`
                  : ''}
              </p>
              <Link href={`/sellers/${product.sellerId}`} className="mt-3 inline-flex text-sm font-semibold text-jade-700 dark:text-jade-300 hover:underline">
                Visit storefront →
              </Link>
            </div>
          </aside>
        </div>

        <section aria-labelledby="description-heading" className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-3xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6">
            <h2 id="description-heading" className="text-xl font-bold text-ink-900 dark:text-white">About this item</h2>
            <div className="mt-3 whitespace-pre-line text-[15px] leading-7 text-ink-700 dark:text-ink-200">
              {product.description || 'The seller has not added a longer description for this listing yet.'}
            </div>
            <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">Product details</h3>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 border-b border-ink-100 dark:border-ink-800 py-2">
                <dt className="text-ink-500 dark:text-ink-400">Category</dt>
                <dd className="font-medium">{product.category}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-ink-100 dark:border-ink-800 py-2">
                <dt className="text-ink-500 dark:text-ink-400">Condition</dt>
                <dd className="font-medium">{humanize(product.condition)}</dd>
              </div>
              {product.brand && (
                <div className="flex justify-between gap-4 border-b border-ink-100 dark:border-ink-800 py-2">
                  <dt className="text-ink-500 dark:text-ink-400">Brand</dt>
                  <dd className="font-medium">{product.brand}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 border-b border-ink-100 dark:border-ink-800 py-2">
                <dt className="text-ink-500 dark:text-ink-400">Seller</dt>
                <dd className="font-medium">{product.sellerName}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6">
            <h2 id="reviews-heading" className="text-xl font-bold text-ink-900 dark:text-white">Buyer reviews</h2>
            {product.reviewCount > 0 ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-3xl font-black text-ink-900 dark:text-white">{product.rating?.toFixed(1)}</span>
                  <span className="text-sm text-ink-500 dark:text-ink-400">from {product.reviewCount} buyer review{product.reviewCount === 1 ? '' : 's'}</span>
                </div>
                <ul className="mt-4 space-y-4">
                  {product.reviews.slice(0, 5).map((review) => (
                    <li key={review.id} className="border-t border-ink-200 dark:border-ink-800 pt-3">
                      <p className="text-sm font-semibold text-ink-900 dark:text-white">
                        {review.author}
                        <span className="ml-2 font-normal text-gold-500 dark:text-gold-300" aria-label={`${review.rating} out of 5 stars`}>
                          {'★'.repeat(review.rating)}
                        </span>
                      </p>
                      <p className="mt-1 text-sm leading-6 text-ink-600 dark:text-ink-300">{review.comment}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
                No reviews yet. Reviews appear here only after a buyer completes an order and leaves real feedback.
              </p>
            )}
          </div>
        </section>

        {siblings.length > 0 && (
          <section aria-labelledby="related-heading" className="mt-12">
            <div className="flex items-end justify-between gap-4">
              <h2 id="related-heading" className="text-xl font-bold text-ink-900 dark:text-white">
                More in {product.category}
              </h2>
              <Link href={`/categories/${product.categorySlug}`} className="text-sm font-semibold text-jade-700 dark:text-jade-300 hover:underline">
                View category →
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5">
              {siblings.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </SeoShell>
  );
}
