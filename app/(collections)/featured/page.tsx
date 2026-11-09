import type { Metadata } from 'next';
import { CollectionRoute, collectionMetadata } from '@/components/seo/CollectionRoute';

export const revalidate = 1800;
export const metadata: Metadata = collectionMetadata('featured');

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FeaturedPage({ searchParams }: PageProps) {
  return <CollectionRoute slug="featured" searchParams={await searchParams} />;
}
