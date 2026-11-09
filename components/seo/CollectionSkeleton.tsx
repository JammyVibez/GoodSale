// components/seo/CollectionSkeleton.tsx
import { SeoShell } from './SeoShell';

/** Route-level loading state for the public collection pages. */
export default function CollectionSkeleton() {
  return (
    <SeoShell>
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading listings…</span>

        <div className="h-4 w-40 animate-pulse rounded bg-emerald-950/10" />
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-[#032214]/90 sm:h-44" />

        <div className="mt-4 h-24 animate-pulse rounded-xl bg-white ring-1 ring-emerald-950/10" />

        <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="overflow-hidden rounded-xl border border-emerald-950/10 bg-white">
              <div className="aspect-square w-full animate-pulse bg-emerald-950/10" />
              <div className="space-y-1.5 p-2">
                <div className="h-3 w-11/12 animate-pulse rounded bg-emerald-950/10" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-emerald-950/10" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-emerald-950/10" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-emerald-950/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SeoShell>
  );
}
