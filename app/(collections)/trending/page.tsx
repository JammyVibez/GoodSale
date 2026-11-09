import type { Metadata } from 'next';
import { CollectionRoute, collectionMetadata } from '@/components/seo/CollectionRoute';

export const revalidate = 600;
export const metadata: Metadata = collectionMetadata('trending');

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TrendingPage({ searchParams }: PageProps) {
  return <CollectionRoute slug="trending" searchParams={await searchParams} />;
}
