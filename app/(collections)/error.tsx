'use client';

import CollectionError from '@/components/seo/CollectionError';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CollectionError error={error} reset={reset} />;
}
