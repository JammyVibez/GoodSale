import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { SeoShell } from '@/components/seo/SeoShell';
import { getPublicCategories } from '@/lib/seo/data';
import { breadcrumbLd, webPageLd } from '@/lib/seo/structured';
import { absoluteUrl, truncate } from '@/lib/seo/site';

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

export default async function CategoriesPage() {
  const categories = await getPublicCategories();
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Categories', path: '/categories' },
  ];

  return (
    <SeoShell>
      <JsonLd data={[webPageLd(title, description, '/categories'), breadcrumbLd(breadcrumbs)]} />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <header className="mt-5 max-w-3xl">
          <h1 className="text-3xl font-black tracking-tight text-[#032214] sm:text-4xl">Shop by category</h1>
          <p className="mt-3 text-[15px] leading-7 text-emerald-950/70">
            Every category below is generated from live GoodSale listings. Pick a category to compare prices, inspect
            real buyer reviews and buy from verified sellers with escrow protection.
          </p>
        </header>

        {categories.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="group flex h-full items-center gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-950/5"
                >
                  <span className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f1eee5]">
                    {category.sampleImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={category.sampleImage}
                        alt={`${category.name} listing on GoodSale`}
                        width={160}
                        height={160}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xl font-black text-emerald-950/15" aria-hidden="true">
                        GS
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="block text-lg font-bold text-[#032214] group-hover:underline">{category.name}</span>
                    <span className="mt-1 block text-sm text-emerald-950/55">
                      {category.count} live listing{category.count === 1 ? '' : 's'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 rounded-2xl border border-emerald-950/10 bg-white p-6 text-sm text-emerald-950/60">
            Categories appear here as soon as sellers publish live listings.
          </p>
        )}

        <section className="mt-12 rounded-3xl bg-[#032214] px-6 py-8 text-white sm:px-10">
          <h2 className="text-2xl font-bold">Not sure where to start?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/75">
            Browse verified storefronts or read how GoodSale protects every order before you pay.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/sellers" className="rounded-full bg-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#032214] hover:bg-[#e6c35a]">
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
