import type { Metadata } from 'next';
import Link from 'next/link';
import { WifiOff, ShieldCheck } from 'lucide-react';
import Logo from '@/components/LogoIcon';
import RetryButton from '@/components/pwa/RetryButton';

export const metadata: Metadata = {
  title: 'Offline',
  description: 'You appear to be offline. Reconnect to load live GoodSale listings and escrow updates.',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink-50 px-6 py-12 text-center text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-8 shadow-sm dark:border-ink-800 dark:bg-ink-900">
        <div className="mx-auto mb-6 flex justify-center">
          <Logo iconSize={38} textColorClass="text-ink-900 dark:text-white" />
        </div>

        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
          <WifiOff className="h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
          You&apos;re offline right now
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
          Live prices, inventory, and escrow actions require a connection. Your saved cart and wishlist stay safe on this device.
        </p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <RetryButton />
          <Link
            href="/"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:border-jade-500 hover:text-jade-700 dark:border-ink-700 dark:text-ink-200"
          >
            Open home
          </Link>
        </div>

        <p className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-jade-700 dark:text-jade-300">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Escrow-protected commerce
        </p>
      </div>
    </main>
  );
}
