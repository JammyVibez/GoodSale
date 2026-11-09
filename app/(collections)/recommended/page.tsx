import type { Metadata } from 'next';
import { CollectionRoute, collectionMetadata } from '@/components/seo/CollectionRoute';

export const revalidate = 1800;
export const metadata: Metadata = collectionMetadata('recommended');

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RecommendedPage({ searchParams }: PageProps) {
  return <CollectionRoute slug="recommended" searchParams={await searchParams} />;
}
