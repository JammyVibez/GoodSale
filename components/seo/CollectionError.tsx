// components/seo/CollectionError.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { SeoShell } from './SeoShell';

/** Shared error boundary body for the public collection routes. */
export default function CollectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GoodSale] collection route failed', error);
  }, [error]);

  return (
    <SeoShell>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink-900/5 dark:bg-white/10 text-ink-900 dark:text-white">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-ink-900 dark:text-white">This collection could not load</h1>
        <p className="mt-2 text-sm leading-6 text-ink-600 dark:text-ink-300">
          The live catalogue did not respond. Nothing about your account or orders changed — try again, or browse the
          marketplace directly.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full bg-jade-950 dark:bg-ink-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-jade-900 dark:hover:bg-ink-800"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-ink-300 dark:border-ink-700 px-5 py-2.5 text-sm font-semibold text-ink-900 dark:text-ink-100 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            Back to the marketplace
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-ink-400 dark:text-ink-500">Reference: {error.digest}</p>}
      </div>
    </SeoShell>
  );
}
