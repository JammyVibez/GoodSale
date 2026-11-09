// components/seo/CollectionRoute.tsx
import type { Metadata } from 'next';
import { SeoShell } from './SeoShell';
import CollectionView from './CollectionView';
import { COLLECTIONS, type CollectionSlug } from '@/lib/marketplace/collections';
import { selectCollection } from '@/lib/seo/collections';
import { getFeaturedProductIds, getPublicCategories, getPublicProducts } from '@/lib/seo/data';
import { absoluteUrl, truncate } from '@/lib/seo/site';

type SearchParams = Record<string, string | string[] | undefined>;

export function collectionMetadata(slug: CollectionSlug): Metadata {
  const collection = COLLECTIONS[slug];
  const description = truncate(collection.description, 155);
  return {
    title: collection.title,
    description,
    alternates: { canonical: collection.href },
    openGraph: {
      title: `${collection.title} | GoodSale`,
      description,
      url: absoluteUrl(collection.href),
      siteName: 'GoodSale',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: `${collection.title} | GoodSale`, description },
  };
}

/** Server renderer shared by every public collection route. */
export async function CollectionRoute({ slug, searchParams }: { slug: CollectionSlug; searchParams: SearchParams }) {
  const collection = COLLECTIONS[slug];
  const [products, categories, featuredIds] = await Promise.all([
    getPublicProducts(),
    getPublicCategories(),
    slug === 'featured' ? getFeaturedProductIds() : Promise.resolve<number[]>([]),
  ]);
  const items = selectCollection(slug, products, featuredIds);

  return (
    <SeoShell>
      <CollectionView
        collection={collection}
        products={items}
        categories={categories.map((category) => ({ slug: category.slug, name: category.name }))}
        searchParams={searchParams}
      />
    </SeoShell>
  );
}
