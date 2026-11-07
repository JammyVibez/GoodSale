// components/ui/BrandLoader.tsx
'use client';

import Logo from '@/components/LogoIcon';

interface BrandLoaderProps {
  /** One short line describing what is loading. */
  message?: string;
  /** Renders the loader without the full-page background (inside a panel). */
  embedded?: boolean;
  className?: string;
}

/**
 * The single GoodSale loading moment: the home-page logo lockup, a soft
 * jade halo and a slim indeterminate progress rail. Used for the boot splash,
 * route transitions and full-page account loads so loading never looks like a
 * different product.
 */
export default function BrandLoader({
  message = 'Loading GoodSale…',
  embedded = false,
  className = '',
}: BrandLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={`${
        embedded ? '' : 'brand-loader-stage grid min-h-dvh w-full place-items-center px-6'
      } ${className}`}
    >
      <div className="flex w-full max-w-[20rem] flex-col items-center text-center">
        <div className="relative flex items-center justify-center px-10 py-8">
          <span
            aria-hidden="true"
            className="brand-loader-halo absolute h-40 w-40 rounded-full bg-jade-500/10 blur-2xl dark:bg-jade-400/10"
          />
          <span
            aria-hidden="true"
            className="brand-loader-ring absolute h-28 w-28 rounded-full border border-jade-500/20 dark:border-jade-400/20"
          />
          <span
            aria-hidden="true"
            className="brand-loader-ring brand-loader-ring-delayed absolute h-36 w-36 rounded-full border border-jade-500/10 dark:border-jade-400/10"
          />
          <Logo
            iconSize={46}
            className="relative"
            wordmarkClassName="text-2xl"
            textColorClass="text-ink-950 dark:text-white"
            subtitleColorClass="text-ink-400 dark:text-ink-500"
          />
        </div>

        <p className="mt-3 text-xs font-semibold tracking-wide text-ink-500 dark:text-ink-400">
          {message}
        </p>

        <span
          aria-hidden="true"
          className="relative mt-5 h-1 w-36 overflow-hidden rounded-full bg-ink-200/80 dark:bg-white/10"
        >
          <span className="brand-loader-sweep absolute inset-y-0 w-1/2 rounded-full bg-gradient-to-r from-jade-400 via-jade-500 to-jade-300" />
        </span>
      </div>
    </div>
  );
}
