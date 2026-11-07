'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, MapPinned, PackageSearch, ShieldCheck, Truck } from 'lucide-react';
import { toast } from '@/lib/feedback';
import Logo from '@/components/LogoIcon';

export default function TrackLookupPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim().replace(/^#/, '');
    if (value.length < 5) {
      toast.error('Enter a GoodSale tracking ID, order ID or courier number.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/tracking/${encodeURIComponent(value)}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'No shipment matches that tracking ID.');
      }
      router.push(`/track/${encodeURIComponent(payload.data?.trackingId || value)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not find that shipment.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <header className="border-b border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link href="/" className="rounded-xl" aria-label="GoodSale home">
            <Logo iconSize={34} textColorClass="text-ink-900 dark:text-white" />
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-jade-600 px-3.5 py-2 text-[11px] font-bold text-white hover:bg-jade-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Marketplace
          </Link>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-jade-950 via-jade-900 to-jade-800"
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-2xl text-center text-white">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-200">
              <MapPinned className="h-3 w-3" /> GoodSale shipment tracking
            </span>
            <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              Where is your package?
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/70">
              Enter the tracking ID from your order confirmation. You can also use your order ID or a courier reference.
            </p>
          </div>

          <form onSubmit={submit} className="mx-auto mt-8 max-w-xl">
            <div className="rounded-[1.75rem] border border-white/15 bg-white p-2 shadow-2xl shadow-jade-950/30 dark:bg-ink-900 sm:flex sm:items-center sm:gap-2">
              <div className="flex flex-1 items-center gap-2 px-3">
                <PackageSearch className="h-5 w-5 shrink-0 text-ink-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value.toUpperCase())}
                  placeholder="GSD-829174620"
                  aria-label="Tracking ID"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-12 w-full bg-transparent font-mono text-sm font-bold tracking-wide text-ink-900 outline-none placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-300 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-400 px-5 text-xs font-black text-ink-900 shadow-md shadow-gold-400/20 transition-all hover:from-gold-200 hover:to-gold-300 disabled:opacity-60 sm:mt-0 sm:w-auto"
              >
                {loading ? 'Checking…' : 'Track shipment'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="mx-auto mt-8 grid max-w-2xl gap-2 sm:grid-cols-3">
            {[
              { icon: <Truck className="h-4 w-4" />, title: 'Real milestones', text: 'Backend delivery events with real timestamps.' },
              { icon: <MapPinned className="h-4 w-4" />, title: 'Live when available', text: 'Rider GPS appears only while actively shared.' },
              { icon: <ShieldCheck className="h-4 w-4" />, title: 'Private by default', text: 'Personal details stay hidden in public lookup.' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-300">{item.icon}</span>
                <p className="mt-2 text-[11px] font-bold text-ink-800 dark:text-ink-100">{item.title}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-ink-200 bg-white/95 p-4 text-center text-[10px] leading-relaxed text-ink-500 shadow-sm dark:border-ink-800 dark:bg-ink-900/95 dark:text-ink-400">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-jade-600" />
            Buyer and seller contact details, addresses and rider GPS are never shown to anonymous visitors. Sign in with the account that placed or fulfilled the order for the private view.
          </div>
        </div>
      </main>
    </div>
  );
}
