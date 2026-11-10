import Link from 'next/link';
import type { ReactNode } from 'react';
import Logo from '@/components/LogoIcon';

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
      <header className="sticky top-0 z-40 border-b border-ink-200 dark:border-ink-800 bg-white/85 dark:bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="rounded-xl" aria-label="GoodSale home">
            <Logo
              iconSize={34}
              textColorClass="text-ink-900 dark:text-white"
              subtitleColorClass="text-ink-400 dark:text-ink-500"
              accentClassName="from-jade-500 to-jade-700"
            />
          </Link>
          <nav aria-label="Marketplace" className="hidden items-center gap-6 text-sm font-medium text-ink-700 dark:text-ink-200 md:flex">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-ink-900 dark:hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/"
            className="rounded-full bg-jade-950 dark:bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-jade-900 dark:hover:bg-ink-800"
          >
            Open marketplace
          </Link>
        </div>
        <nav aria-label="Marketplace sections" className="flex gap-5 overflow-x-auto border-t border-ink-200 dark:border-ink-800 px-4 py-2 text-sm md:hidden">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-ink-700 dark:text-ink-200">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="mt-16 border-t border-ink-200 dark:border-ink-800 bg-jade-950 dark:bg-ink-900 text-ink-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo
              iconSize={40}
              wordmarkClassName="text-2xl"
              textColorClass="text-white"
              subtitleColorClass="text-jade-100/55"
              accentClassName="from-gold-300 to-gold-500"
            />
            <p className="mt-3 max-w-md text-sm leading-6 text-jade-100/70">
              Nigeria&apos;s escrow-protected marketplace. Buy from verified sellers with protected payments,
              tracked delivery and real reviews.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-full bg-gold-300 px-5 py-2.5 text-sm font-bold text-ink-950 transition hover:bg-gold-200"
            >
              Start shopping
            </Link>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gold-300">Shop</h2>
            <ul className="mt-3 space-y-2 text-sm text-jade-100/75">
              <li><Link href="/categories" className="hover:text-white">All categories</Link></li>
              <li><Link href="/featured" className="hover:text-white">Featured products</Link></li>
              <li><Link href="/flash-deals" className="hover:text-white">Flash deals</Link></li>
              <li><Link href="/trending" className="hover:text-white">Trending now</Link></li>
              <li><Link href="/best-deals" className="hover:text-white">Best deals</Link></li>
              <li><Link href="/sellers" className="hover:text-white">Verified sellers</Link></li>
              <li><Link href="/promotions" className="hover:text-white">Promotions</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gold-300">GoodSale</h2>
            <ul className="mt-3 space-y-2 text-sm text-jade-100/75">
              <li><Link href="/trust-safety" className="hover:text-white">Trust &amp; Safety</Link></li>
              <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-jade-100/50">
          © {new Date().getFullYear()} GoodSale. Prices in Nigerian Naira. Availability and reviews reflect live listings.
        </div>
      </footer>
    </div>
  );
}
