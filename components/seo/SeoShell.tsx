import Link from 'next/link';
import type { ReactNode } from 'react';
import Logo from '@/components/LogoIcon';

const nav = [
  { href: '/categories', label: 'Categories' },
  { href: '/sellers', label: 'Sellers' },
  { href: '/promotions', label: 'Promotions' },
  { href: '/trust-safety', label: 'Trust & Safety' },
];

export function SeoShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fbf9f3] text-[#10231b]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#d4af37] focus:px-4 focus:py-2 focus:font-semibold focus:text-[#032214]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-emerald-950/10 bg-[#fbf9f3]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="rounded-xl" aria-label="GoodSale home">
            <Logo
              iconSize={34}
              textColorClass="text-[#032214]"
              subtitleColorClass="text-emerald-950/45"
              accentClassName="from-jade-500 to-jade-700"
            />
          </Link>
          <nav aria-label="Marketplace" className="hidden items-center gap-6 text-sm font-medium text-emerald-950/75 md:flex">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-[#032214]">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/"
            className="rounded-full bg-[#032214] px-4 py-2 text-sm font-semibold text-[#fbf9f3] transition hover:bg-[#064e3b]"
          >
            Open marketplace
          </Link>
        </div>
        <nav aria-label="Marketplace sections" className="flex gap-5 overflow-x-auto border-t border-emerald-950/10 px-4 py-2 text-sm md:hidden">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap text-emerald-950/75">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer className="mt-16 border-t border-emerald-950/10 bg-[#032214] text-[#e8efe9]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo
              iconSize={40}
              wordmarkClassName="text-2xl"
              textColorClass="text-white"
              subtitleColorClass="text-emerald-100/55"
              accentClassName="from-gold-300 to-gold-500"
            />
            <p className="mt-3 max-w-md text-sm leading-6 text-emerald-100/70">
              Nigeria&apos;s escrow-protected marketplace. Buy from verified sellers with protected payments,
              tracked delivery and real reviews.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-full bg-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#032214] transition hover:bg-[#e6c35a]"
            >
              Start shopping
            </Link>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#d4af37]">Shop</h2>
            <ul className="mt-3 space-y-2 text-sm text-emerald-100/75">
              <li><Link href="/categories" className="hover:text-white">All categories</Link></li>
              <li><Link href="/sellers" className="hover:text-white">Verified sellers</Link></li>
              <li><Link href="/promotions" className="hover:text-white">Featured deals</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#d4af37]">GoodSale</h2>
            <ul className="mt-3 space-y-2 text-sm text-emerald-100/75">
              <li><Link href="/trust-safety" className="hover:text-white">Trust &amp; Safety</Link></li>
              <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-white">Terms</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-emerald-100/50">
          © {new Date().getFullYear()} GoodSale. Prices in Nigerian Naira. Availability and reviews reflect live listings.
        </div>
      </footer>
    </div>
  );
}
