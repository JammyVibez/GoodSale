// components/auth/AuthShell.tsx
'use client';

import Link from 'next/link';
import { Lock, ShieldCheck, Truck } from 'lucide-react';
import Logo, { LogoIcon } from '@/components/LogoIcon';

export function BrandLockup({ compact = false, onPromo = false }: { compact?: boolean; onPromo?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="GoodSale — Nigeria's marketplace"
      className={`inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade-500 focus-visible:ring-offset-2 ${
        onPromo
          ? 'focus-visible:ring-gold-400 focus-visible:ring-offset-[#032214]'
          : 'focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0b0f0d]'
      }`}
    >
      <Logo
        iconSize={compact ? 38 : 44}
        wordmarkClassName={compact ? 'text-lg' : 'text-[1.35rem]'}
        textColorClass={onPromo ? 'text-white' : 'text-ink-950 dark:text-white'}
        subtitleColorClass={onPromo ? 'text-white/55' : 'text-ink-400 dark:text-ink-500'}
        accentClassName={
          onPromo
            ? 'from-gold-300 to-gold-500'
            : 'from-jade-500 to-jade-700 dark:from-jade-300 dark:to-jade-500'
        }
      />
    </Link>
  );
}

const TRUST = [
  { Icon: ShieldCheck, label: 'Verified sellers', detail: 'Reviewed identity' },
  { Icon: Lock, label: 'Secure escrow', detail: 'Funds held until delivery' },
  { Icon: Truck, label: 'Tracked delivery', detail: 'GoodDispatch coverage' },
];

/** The marketing half of the split screen — desktop only, hidden on mobile. */
function PromoPanel() {
  return (
    <aside className="auth-promo relative hidden flex-col justify-between overflow-hidden px-12 py-10 lg:flex xl:px-16">
      {/* fine gold grid wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #f7d34d 1px, transparent 1px), linear-gradient(to bottom, #f7d34d 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(70% 60% at 40% 30%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(70% 60% at 40% 30%, black, transparent)',
        }}
      />

      <div className="relative">
        <BrandLockup onPromo />
        <p className="mt-10 text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-gold-200/80">
          Nigeria&apos;s Marketplace
        </p>
        <h1 className="mt-4 font-display text-[2.9rem] font-extrabold leading-[1.04] tracking-[-0.035em] xl:text-[3.4rem]">
          Nigeria&apos;s
          <br />
          Marketplace.
          <span className="auth-gold-text mt-1.5 block">Buy. Sell. Trust.</span>
        </h1>
        <p className="mt-6 max-w-[27rem] text-[0.95rem] leading-relaxed text-white/70">
          Discover products from verified sellers, talk directly to the people behind every
          listing, and pay through GoodSale escrow — money moves only when the goods do.
        </p>
      </div>

      {/* Product artwork: phone silhouette + gold-rimmed shopping bag. */}
      <div className="relative mt-8 hidden h-[286px] shrink-0 xl:block" aria-hidden="true">
        <div className="auth-ring animate-float absolute left-0 top-6 h-52 w-52 rounded-full" />
        <div className="auth-ring absolute left-10 top-16 h-36 w-36 rounded-full opacity-60" />

        <div className="auth-phone absolute right-2 top-0 h-[272px] w-[146px] rotate-[7deg] overflow-hidden rounded-[26px] p-3">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-300/80" />
            <span className="text-[7px] font-semibold tracking-wide text-white/70">GoodSale</span>
          </div>
          <div className="mt-2 flex items-center gap-1 rounded-full bg-white px-2 py-1">
            <span className="h-1 w-1 rounded-full bg-ink-300" />
            <span className="text-[6px] text-ink-400">Search for products…</span>
          </div>
          <div className="mt-2 rounded-lg bg-jade-900/80 p-2">
            <p className="font-display text-[8px] font-bold leading-tight text-white">
              Shop smarter.
              <br />
              Live better.
            </p>
            <span className="mt-1.5 inline-block rounded-full bg-gold-300 px-1.5 py-[2px] text-[6px] font-bold text-[#2a1d05]">
              Explore shop
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {['Fashion', 'Phones', 'Home', 'More'].map((label) => (
              <div key={label} className="rounded-md bg-white/8 p-1 text-center">
                <span className="mx-auto block h-2.5 w-2.5 rounded-sm bg-gold-300/30" />
                <span className="mt-0.5 block text-[5px] text-white/60">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-md bg-white/90 p-1">
                <span className="block h-8 rounded-sm bg-ink-150" />
                <span className="mt-1 block h-1 w-8 rounded-full bg-ink-300" />
                <span className="mt-0.5 block h-1 w-5 rounded-full bg-jade-500/70" />
              </div>
            ))}
          </div>
        </div>

        {/* bag with gold handle */}
        <div className="absolute bottom-0 left-6 z-10">
          <div className="relative">
            <span className="absolute -top-6 left-1/2 h-9 w-16 -translate-x-1/2 rounded-t-full border-[3px] border-b-0 border-gold-300/75" />
            <div className="auth-bag relative grid h-[118px] w-[108px] place-items-center rounded-[26px]">
              <LogoIcon variant="gold" size={52} />
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-10">
        <ul className="grid grid-cols-3 gap-2.5">
          {TRUST.map(({ Icon, label, detail }) => (
            <li key={label} className="auth-tile rounded-2xl px-3 py-3">
              <Icon className="h-4 w-4 text-gold-300" aria-hidden="true" />
              <p className="mt-2 text-[0.72rem] font-semibold leading-snug text-white">{label}</p>
              <p className="mt-0.5 text-[0.65rem] leading-snug text-white/50">{detail}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex items-center gap-4">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-300/30" />
          <p className="whitespace-nowrap text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-white/40">
            Escrow protected commerce
          </p>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-300/30" />
        </div>
      </div>
    </aside>
  );
}

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-stage min-h-dvh w-full text-ink-950 dark:text-white">
      <div className="mx-auto grid min-h-dvh w-full max-w-[1440px] lg:grid-cols-[1.06fr_minmax(0,1fr)]">
        <PromoPanel />

        <section className="flex min-h-dvh flex-col lg:p-5 xl:p-6">
          <div className="auth-panel auth-hairline relative flex flex-1 flex-col overflow-hidden lg:rounded-[30px]">
            {/* Mobile: compact brand strip + one-line promise, form stays first. */}
            <div className="relative border-b border-ink-150 px-6 pb-5 pt-6 dark:border-white/10 lg:hidden">
              <div className="flex items-center justify-between gap-4">
                <BrandLockup compact />
                <Link
                  href="/"
                  className="rounded-lg text-xs font-semibold text-ink-500 transition-colors hover:text-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:text-white/50 dark:hover:text-white"
                >
                  Browse first
                </Link>
              </div>
              <p className="mt-4 text-sm leading-snug text-ink-600 dark:text-white/60">
                Verified sellers. Escrow payments. Delivery you can track.
              </p>
            </div>

            <div className="relative flex flex-1 flex-col justify-center px-6 py-8 sm:px-10 sm:py-10 xl:px-14 xl:py-12">
              <div className="mx-auto w-full max-w-[25.5rem]">{children}</div>
            </div>

            <div className="relative border-t border-ink-150 px-6 py-4 dark:border-white/10 sm:px-10">
              <p className="text-center text-[0.7rem] leading-relaxed text-ink-400 dark:text-white/35">
                GoodSale never asks for your password or PIN by email, chat or phone.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
