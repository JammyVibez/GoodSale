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
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#032214]/5 text-[#032214]">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-[#032214]">This collection could not load</h1>
        <p className="mt-2 text-sm leading-6 text-emerald-950/65">
          The live catalogue did not respond. Nothing about your account or orders changed — try again, or browse the
          marketplace directly.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#032214] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#064e3b]"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-emerald-950/15 px-5 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
          >
            Back to the marketplace
          </Link>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-emerald-950/35">Reference: {error.digest}</p>}
      </div>
    </SeoShell>
  );
}
