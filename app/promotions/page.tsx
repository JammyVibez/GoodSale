import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { ProductCard } from '@/components/seo/ProductCard';
import { SeoShell } from '@/components/seo/SeoShell';
import { getFeaturedProducts } from '@/lib/seo/data';
import { breadcrumbLd, collectionPageLd } from '@/lib/seo/structured';
import { absoluteUrl, truncate } from '@/lib/seo/site';

export const revalidate = 1800;

const title = 'Featured deals and promotions';

function promotionsDescription(count: number, sample?: string): string {
  if (count === 0) {
    return 'See featured GoodSale listings and current seller promotions across Nigeria. Compare live prices, inspect real reviews and buy with escrow protection.';
  }
  return truncate(
    `${count} featured GoodSale listing${count === 1 ? '' : 's'}${sample ? `, including ${sample}` : ''}. Compare live prices, check real buyer reviews and pay with escrow protection.`,
    155
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const products = await getFeaturedProducts();
  const description = promotionsDescription(products.length, products[0]?.title);
  return {
    title,
    description,
    alternates: { canonical: '/promotions' },
    openGraph: {
      title: `${title} | GoodSale`,
      description,
      url: absoluteUrl('/promotions'),
      siteName: 'GoodSale',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: `${title} | GoodSale`, description },
  };
}

export default async function PromotionsPage() {
  const products = await getFeaturedProducts();
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Promotions', path: '/promotions' },
  ];

  return (
    <SeoShell>
      <JsonLd
        data={[
          collectionPageLd(title, promotionsDescription(products.length, products[0]?.title), '/promotions', products),
          breadcrumbLd(breadcrumbs),
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <header className="mt-5 rounded-3xl bg-[#032214] px-6 py-9 text-white sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d4af37]">GoodSale promotions</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Featured deals</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/75">
            Featured listings are promoted by sellers and shown here with their live price and availability. Promotion
            never changes buyer protection: every order still uses GoodSale escrow and the same refund process.
          </p>
        </header>

        <section aria-labelledby="featured-listings" className="mt-8">
          <h2 id="featured-listings" className="text-xl font-bold text-[#032214]">
            Promoted listings
          </h2>
          <p className="mt-1 text-sm text-emerald-950/55">Prices and stock reflect the live catalog at page load.</p>
          {products.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product, index) => (
                <ProductCard key={product.id} product={product} eager={index < 4} />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-emerald-950/10 bg-white p-6 text-sm text-emerald-950/60">
              No promoted listings are active right now. <Link href="/categories" className="font-semibold text-emerald-800 underline">Browse all categories</Link> instead.
            </p>
          )}
        </section>

        <section className="mt-10 rounded-3xl border border-emerald-950/10 bg-white p-6">
          <h2 className="text-lg font-bold text-[#032214]">How promotions work</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-950/65">
            Sellers can feature individual listings to increase visibility. Featured placement is labelled and does not
            alter search rankings, review scores or escrow terms. Always check the seller&apos;s verification badge,
            condition notes and return policy on the product page.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/trust-safety" className="rounded-full bg-[#032214] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#064e3b]">
              Buyer protection
            </Link>
            <Link href="/sellers" className="rounded-full border border-emerald-950/15 px-5 py-2.5 text-sm font-semibold hover:bg-emerald-50">
              Verified sellers
            </Link>
          </div>
        </section>
      </div>
    </SeoShell>
  );
}
