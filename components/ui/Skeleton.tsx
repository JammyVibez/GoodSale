// components/ui/Skeleton.tsx
'use client';

import React from 'react';

export interface SkeletonProps {
  className?: string;
}

/**
 * Shimmer skeleton — mirrors the final layout so nothing jumps on load.
 * Use route/segment-sized skeletons; the goodsale-loader Lottie is reserved
 * for full-screen transitions only.
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer rounded-2xl bg-ink-200 dark:bg-ink-800 ${className}`}
    />
  );
}

/** Card-shaped skeleton: media block + title + meta lines. */
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-3xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 ${className}`}
    >
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="mt-4 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-1/2" />
      <Skeleton className="mt-4 h-8 w-full" />
    </div>
  );
}

/** Row-shaped list skeleton: avatar + two text lines. */
export function SkeletonList({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900"
        >
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
