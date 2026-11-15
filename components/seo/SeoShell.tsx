import Link from 'next/link';
import type { ReactNode } from 'react';
import Logo from '@/components/LogoIcon';
import SeoHeaderMenu from '@/components/seo/SeoHeaderMenu';

const nav = [
  { href: '/categories', label: 'Categories' },
  { href: '/flash-deals', label: 'Flash deals' },
  { href: '/featured', label: 'Featured' },
  { href: '/best-deals', label: 'Best deals' },
  { href: '/new-arrivals', label: 'New in' },
  { href: '/sellers', label: 'Sellers' },
  { href: '/trust-safety', label: 'Trust & Safety' },
];

export function SeoShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold-300 focus:px-4 focus:py-2 focus:font-semibold focus:text-ink-950"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/90 pt-safe-top backdrop-blur dark:border-ink-800 dark:bg-ink-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="rounded-xl shrink-0" aria-label="GoodSale home">
            <Logo
              iconSize={34}
              textColorClass="text-ink-900 dark:text-white"
              subtitleColorClass="text-ink-400 dark:text-ink-500"
              accentClassName="from-jade-500 to-jade-700"
            />
          </Link>
          <nav aria-label="Marketplace" className="hidden items-center gap-6 text-sm font-medium text-ink-700 dark:text-ink-200 lg:flex">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap transition hover:text-ink-900 dark:hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="whitespace-nowrap rounded-full bg-jade-950 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-jade-900 sm:px-4 sm:text-sm dark:bg-ink-900 dark:hover:bg-ink-800"
            >
              Open app
            </Link>
            <SeoHeaderMenu />
          </div>
        </div>
        <nav aria-label="Marketplace sections" className="flex gap-5 overflow-x-auto border-t border-ink-200 px-4 py-2 text-sm scrollbar-hide lg:hidden dark:border-ink-800">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-ink-700 dark:text-ink-200">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" className="pb-14 pb-safe-bottom">{children}</main>
    </div>
  );
}
