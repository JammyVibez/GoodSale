import type { Metadata } from 'next';
import { CollectionRoute, collectionMetadata } from '@/components/seo/CollectionRoute';

export const revalidate = 600;
export const metadata: Metadata = collectionMetadata('best-deals');

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BestDealsPage({ searchParams }: PageProps) {
  return <CollectionRoute slug="best-deals" searchParams={await searchParams} />;
}
