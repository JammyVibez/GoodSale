import type { Metadata } from 'next';
import { CollectionRoute, collectionMetadata } from '@/components/seo/CollectionRoute';

export const revalidate = 600;
export const metadata: Metadata = collectionMetadata('new-arrivals');

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewArrivalsPage({ searchParams }: PageProps) {
  return <CollectionRoute slug="new-arrivals" searchParams={await searchParams} />;
}
