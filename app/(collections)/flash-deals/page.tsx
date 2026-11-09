import type { Metadata } from 'next';
import { CollectionRoute, collectionMetadata } from '@/components/seo/CollectionRoute';

export const revalidate = 300;
export const metadata: Metadata = collectionMetadata('flash-deals');

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FlashDealsPage({ searchParams }: PageProps) {
  return <CollectionRoute slug="flash-deals" searchParams={await searchParams} />;
}
