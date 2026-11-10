import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { ProductCard } from '@/components/seo/ProductCard';
import { SeoShell } from '@/components/seo/SeoShell';
import { getCategoryBySlug, getProductsByCategory } from '@/lib/seo/data';
import { breadcrumbLd, collectionPageLd } from '@/lib/seo/structured';
import { absoluteUrl, truncate } from '@/lib/seo/site';

export const revalidate = 3600;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Category not found', robots: { index: false, follow: false } };

  const title = `${category.name} for sale in Nigeria`;
  const description = truncate(
    `Shop ${category.name.toLowerCase()} on GoodSale from verified sellers. ${category.count} live listing${
      category.count === 1 ? '' : 's'
    } with escrow-protected payments, tracked delivery and real buyer reviews.`,
    155
  );

  return {
    title,
    description,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: {
      title: `${title} | GoodSale`,
      description,
      url: absoluteUrl(`/categories/${category.slug}`),
      siteName: 'GoodSale',
      type: 'website',
      images: [{ url: absoluteUrl(category.sampleImage || '/goodsale-mark.svg'), alt: `${category.name} on GoodSale` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | GoodSale`,
      description,
      images: [absoluteUrl(category.sampleImage || '/goodsale-mark.svg')],
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const products = await getProductsByCategory(category.slug);
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Categories', path: '/categories' },
    { name: category.name, path: `/categories/${category.slug}` },
  ];
  const sellers = [...new Map(products.map((product) => [product.sellerId, product])).values()].slice(0, 8);
  const path = `/categories/${category.slug}`;

  return (
    <SeoShell>
      <JsonLd data={[collectionPageLd(`${category.name} on GoodSale`, `Live ${category.name.toLowerCase()} listings from verified sellers on GoodSale.`, path, products), breadcrumbLd(breadcrumbs)]} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />

        <header className="mt-5 rounded-3xl bg-jade-950 dark:bg-ink-900 px-6 py-9 text-white sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">GoodSale category</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{category.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-jade-50/75">
            Browse {category.count} live {category.name.toLowerCase()} listing{category.count === 1 ? '' : 's'} from sellers
            across Nigeria. Every order is paid through GoodSale escrow, so funds are only released after delivery is
            confirmed. Reviews below each item come from real completed orders only.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-jade-50/80">
            <span className="rounded-full border border-white/15 px-3 py-1">Escrow-protected checkout</span>
            <span className="rounded-full border border-white/15 px-3 py-1">Verified sellers</span>
            <span className="rounded-full border border-white/15 px-3 py-1">Nationwide delivery</span>
          </div>
        </header>

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink-900 dark:text-white">
              {category.count} {category.name.toLowerCase()} listing{category.count === 1 ? '' : 's'}
            </h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Newest listings first. Prices update with the live catalog.</p>
          </div>
          <Link href="/categories" className="hidden text-sm font-semibold text-jade-700 dark:text-jade-300 hover:underline sm:inline">
            All categories →
          </Link>
        </div>

        {products.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} eager={index < 4} />
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 text-sm text-ink-500 dark:text-ink-400">
            No live listings in this category right now. <Link href="/categories" className="font-semibold text-jade-700 dark:text-jade-300 underline">Browse other categories</Link>.
          </p>
        )}

        {sellers.length > 0 && (
          <section aria-labelledby="category-sellers" className="mt-12 rounded-3xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6">
            <h2 id="category-sellers" className="text-xl font-bold text-ink-900 dark:text-white">Sellers in {category.name}</h2>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Visit a storefront to see everything that seller stocks.</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {sellers.map((product) => (
                <li key={product.sellerId}>
                  <Link
                    href={`/sellers/${product.sellerId}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 dark:border-ink-700 px-3 py-1.5 text-sm font-medium transition hover:border-jade-600 dark:hover:border-jade-400 hover:bg-ink-100 dark:hover:bg-ink-800"
                  >
                    {product.sellerName}
                    {product.sellerVerified && <span className="text-jade-700 dark:text-jade-300" aria-label="verified">✓</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </SeoShell>
  );
}
