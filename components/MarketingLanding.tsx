// components/MarketingLanding.tsx
'use client';

import React from 'react';
import {
  ShieldCheck, ArrowRight, Lock, Truck, BadgeCheck, Banknote, Clock, Headphones,
  RotateCcw, Store, MessageSquare, Sparkles, TrendingUp, Gavel, ShoppingBag,
  PackageCheck, Camera, Star, ChevronRight, Wallet, Users, MapPin
} from 'lucide-react';
import { useDBState } from '../lib/store';
import LottieAnimation from './ui/LottieAnimation';
import escrowLottie from '../lib/lottie/escrow-shield.json';

interface MarketingLandingProps {
  onNavigate: (view: string, payload?: any) => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onSelectProduct?: (productId: number) => void;
  onSearchChange?: (query: string) => void;
}

const ESCROW_STEPS = [
  {
    icon: ShoppingBag,
    title: 'Buyer pays into escrow',
    body: 'Checkout with Paystack. The money is locked with GoodSale — never sent to the seller yet.',
  },
  {
    icon: Truck,
    title: 'Seller ships, tracked',
    body: 'The merchant or a GoodDispatch rider collects and delivers with live location tracking.',
  },
  {
    icon: Lock,
    title: 'Buyer confirms delivery',
    body: 'The buyer inspects the item and enters their secret 6-digit delivery PIN.',
  },
  {
    icon: Banknote,
    title: 'Seller gets paid',
    body: 'Only then is escrow released — minus the platform fee — straight into the seller wallet.',
  },
];

const PROMISES = [
  { icon: ShieldCheck, title: 'Escrow on every order', body: 'Funds held until delivery is confirmed with a PIN.' },
  { icon: BadgeCheck, title: 'Verified merchants', body: 'KYC-checked sellers and business storefronts.' },
  { icon: RotateCcw, title: '90-day return window', body: 'Dispute desk arbitrates with evidence, fast.' },
  { icon: Headphones, title: 'Human support', body: 'Real operators on chat, not an endless bot loop.' },
];

const CATEGORY_LINKS = [
  { name: 'Fashion', slug: 'fashion', icon: Sparkles },
  { name: 'Electronics', slug: 'electronics', icon: TrendingUp },
  { name: 'Phones', slug: 'phones', icon: MessageSquare },
  { name: 'Laptops', slug: 'laptops', icon: PackageCheck },
  { name: 'Furniture', slug: 'furniture', icon: Store },
  { name: 'Groceries', slug: 'groceries', icon: ShoppingBag },
  { name: 'Beauty', slug: 'beauty', icon: Camera },
  { name: 'Vehicles', slug: 'vehicles', icon: Truck },
];

const TESTIMONIALS = [
  {
    quote:
      'I stopped losing money to no-show deliveries. Escrow holds the cash until I actually hold the item.',
    who: 'Buyer',
    where: 'Lagos',
  },
  {
    quote:
      'Payouts land in the wallet the moment the buyer enters their PIN. I know exactly what is still in escrow.',
    who: 'Verified merchant',
    where: 'Abuja',
  },
  {
    quote:
      'The delivery PIN flow is the reason I take bigger jobs now — I get paid for the trip, not for promises.',
    who: 'GoodDispatch rider',
    where: 'Port Harcourt',
  },
];

const FAQS = [
  {
    q: 'What exactly is escrow?',
    a: 'GoodSale holds the buyer’s payment with us — not with the seller — until delivery is confirmed. If something goes wrong, the money is still on the platform and can be refunded.',
  },
  {
    q: 'How fast can I withdraw?',
    a: 'Once escrow releases into your wallet you can request a payout to any Nigerian bank account any time. Set your preferred mode so settlement goes to your wallet or straight through.',
  },
  {
    q: 'What if the item never arrives?',
    a: 'Open a dispute before confirming delivery. Our arbitration desk reviews the chat, the tracking record, and any evidence, then refunds the buyer or releases the seller.',
  },
];

export default function MarketingLanding({
  onNavigate,
  onOpenAuth,
  onSelectProduct,
  onSearchChange,
}: MarketingLandingProps) {
  const db = useDBState();

  const liveStats = React.useMemo(() => {
    const escrowHeld = db.escrows.reduce(
      (sum, e) => (e.isReleased || e.isRefunded ? sum : sum + e.heldAmount),
      0
    );
    const traderIds = new Set<number>();
    db.products.forEach((p) => traderIds.add(p.sellerId));
    db.orders.forEach((o) => {
      traderIds.add(o.buyerId);
      traderIds.add(o.sellerId);
    });
    return {
      listings: db.products.length,
      traders: traderIds.size,
      escrowHeld,
      cities: new Set(db.products.map((p) => (p as { location?: string }).location || '')).size,
    };
  }, [db]);

  const trending = db.products.slice(0, 4);

  const browseCategory = (slug: string) => {
    onSearchChange?.(slug);
    onNavigate('marketplace');
  };

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen pb-16 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">

        {/* ── HERO ───────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[32px] border border-jade-500/20 aurora-bg animate-aurora bg-ink-950 text-white shadow-2xl">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-jade-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-10 p-6 sm:p-10 lg:p-14 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-jade-500/15 border border-jade-500/25 text-jade-300 text-xs font-bold tracking-wide mb-6 animate-slide-up">
                <ShieldCheck className="w-4 h-4" /> Nigeria&apos;s escrow-backed marketplace
              </span>
              <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl leading-[1.02] tracking-tight animate-slide-up stagger-1">
                Trade with <span className="text-jade-400">zero fear</span>.
                <br />
                Money moves only
                <br />
                when goods do.
              </h1>
              <p className="mt-5 text-base text-ink-300 max-w-xl leading-relaxed animate-slide-up stagger-2">
                GoodSale locks every payment in escrow until the buyer confirms delivery with their
                secret PIN. Verified merchants, tracked GoodDispatch riders and a real dispute desk —
                built for buyers, sellers and couriers across Nigeria.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3 animate-slide-up stagger-3">
                <button
                  type="button"
                  onClick={() => onNavigate('marketplace')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-jade-500 hover:bg-jade-600 text-white text-sm font-extrabold tracking-tight rounded-2xl shadow-lg shadow-jade-500/25 transition-all cursor-pointer press-scale focus-ring"
                >
                  Enter the marketplace
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/15 text-white text-sm font-extrabold tracking-tight rounded-2xl transition-all cursor-pointer press-scale focus-ring"
                >
                  Create a free account
                </button>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-ink-300 font-medium">
                <span className="inline-flex items-center gap-2"><Lock className="w-4 h-4 text-jade-400" /> Funds held until you confirm</span>
                <span className="inline-flex items-center gap-2"><Truck className="w-4 h-4 text-jade-400" /> Live rider tracking</span>
                <span className="inline-flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-jade-400" /> Verified merchants</span>
              </div>
            </div>

            {/* The one hero motion beat: the escrow shield Lottie */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-6 rounded-full bg-jade-500/10 blur-3xl pointer-events-none" />
              <div className="lottie-host w-64 h-64 sm:w-80 sm:h-80">
                <div className="lottie-fallback text-jade-500/40">
                  <ShieldCheck className="w-28 h-28" />
                </div>
                <div className="lottie-layer w-full h-full">
                  <LottieAnimation animationData={escrowLottie} className="w-full h-full" />
                </div>
              </div>
              <div className="absolute -bottom-2 left-2 sm:left-6 bg-white text-ink-900 rounded-2xl px-5 py-4 shadow-xl flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-jade-500/10 flex items-center justify-center text-jade-600">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-ink-500 font-bold">Held in escrow</p>
                  <p className="text-lg font-black font-mono">₦{liveStats.escrowHeld.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative grid grid-cols-2 sm:grid-cols-4 border-t border-white/10 divide-x divide-white/10 text-center">
            <div className="py-5 px-3">
              <p className="font-mono font-black text-2xl text-white">{liveStats.listings.toLocaleString()}</p>
              <p className="text-xs uppercase tracking-wider text-ink-400 font-bold mt-1">Live listings</p>
            </div>
            <div className="py-5 px-3">
              <p className="font-mono font-black text-2xl text-white">{liveStats.traders.toLocaleString()}</p>
              <p className="text-xs uppercase tracking-wider text-ink-400 font-bold mt-1">Traders</p>
            </div>
            <div className="py-5 px-3">
              <p className="font-mono font-black text-2xl text-jade-400">₦{liveStats.escrowHeld.toLocaleString()}</p>
              <p className="text-xs uppercase tracking-wider text-ink-400 font-bold mt-1">Held in escrow</p>
            </div>
            <div className="py-5 px-3">
              <p className="font-mono font-black text-2xl text-white">100%</p>
              <p className="text-xs uppercase tracking-wider text-ink-400 font-bold mt-1">PIN-released</p>
            </div>
          </div>
        </section>

        {/* ── HOW ESCROW WORKS ──────────────────────────────────── */}
        <section className="list-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ESCROW_STEPS.map((step, i) => (
            <div
              key={step.title}
              className="relative bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm"
            >
              <span className="absolute top-5 right-5 font-mono font-black text-3xl text-ink-100 dark:text-ink-800 select-none">
                {i + 1}
              </span>
              <div className="w-11 h-11 rounded-2xl bg-jade-500/10 border border-jade-500/20 flex items-center justify-center text-jade-600 dark:text-jade-400 mb-4">
                <step.icon className="w-5 h-5" />
              </div>
              <p className="font-display font-black text-base text-ink-900 dark:text-white">{step.title}</p>
              <p className="text-sm text-ink-500 mt-2 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </section>

        {/* ── PROMISES ─────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROMISES.map((p) => (
            <div
              key={p.title}
              className="flex items-start gap-3 bg-jade-500/5 dark:bg-jade-500/10 border border-jade-500/20 px-5 py-4 rounded-3xl"
            >
              <span className="w-10 h-10 rounded-xl bg-white dark:bg-ink-900 flex items-center justify-center text-jade-600 dark:text-jade-400 shrink-0">
                <p.icon className="w-5 h-5" />
              </span>
              <div>
                <p className="font-extrabold text-sm text-ink-900 dark:text-white leading-tight">{p.title}</p>
                <p className="text-xs text-ink-500 mt-1">{p.body}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── CATEGORY DOORS ───────────────────────────────────── */}
        <section className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-[32px] p-6 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display font-black text-2xl text-ink-900 dark:text-white tracking-tight">
                Shop by category
              </h2>
              <p className="text-sm text-ink-500 mt-1">
                Every listing is escrow-backed from the first click.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('marketplace')}
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold text-jade-600 dark:text-jade-400 hover:text-jade-700 transition-colors cursor-pointer"
            >
              Browse all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORY_LINKS.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                onClick={() => browseCategory(cat.slug)}
                className="group flex items-center gap-3 rounded-2xl border border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-950 px-4 py-3.5 text-left transition-all hover:border-jade-500/50 hover:bg-jade-500/5 press-scale focus-ring cursor-pointer"
              >
                <span className="w-9 h-9 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 flex items-center justify-center text-jade-600 dark:text-jade-400">
                  <cat.icon className="w-4 h-4" />
                </span>
                <span className="text-sm font-bold text-ink-800 dark:text-ink-100 group-hover:text-jade-700 dark:group-hover:text-jade-300">
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── TRENDING (live data) ─────────────────────────────── */}
        {trending.length > 0 && (
          <section className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-[32px] p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h2 className="font-display font-black text-2xl text-ink-900 dark:text-white tracking-tight">
                Trending right now
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('marketplace')}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-jade-600 dark:text-jade-400 hover:text-jade-700 transition-colors cursor-pointer"
              >
                See the marketplace <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 list-stagger">
              {trending.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() =>
                    onSelectProduct ? onSelectProduct(product.id) : onNavigate('marketplace')
                  }
                  className="group text-left rounded-3xl border border-ink-200 dark:border-ink-800 overflow-hidden bg-ink-50 dark:bg-ink-950 hover:border-jade-500/50 transition-all card-hover cursor-pointer focus-ring"
                >
                  <div className="h-36 overflow-hidden bg-ink-100 dark:bg-ink-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.images?.[0]}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-bold text-ink-900 dark:text-white line-clamp-2 leading-snug">
                      {product.title}
                    </p>
                    <p className="mt-2 font-mono font-black text-jade-600 dark:text-jade-400">
                      ₦{product.price.toLocaleString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── LIVE ACTIVITY ────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-ink-900 border border-ink-800 text-white rounded-[32px] p-6 sm:p-8 relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-40 h-40 bg-jade-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2 h-2 rounded-full bg-jade-500 animate-ping" />
              <span className="text-xs uppercase font-mono font-bold tracking-widest text-jade-400">
                Live marketplace activity
              </span>
            </div>
            <p className="font-display font-black text-2xl leading-tight">
              Escrow verdicts, fresh listings and courier hops — as they happen.
            </p>
            <div className="mt-6 space-y-3">
              {db.products.slice(0, 3).map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-4 rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <span className="w-9 h-9 rounded-xl bg-jade-500/15 text-jade-400 flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{product.title}</p>
                    <p className="text-xs text-ink-400 font-mono">
                      ₦{product.price.toLocaleString()} · escrow protected
                    </p>
                  </div>
                </div>
              ))}
              {db.products.length === 0 && (
                <p className="text-sm text-ink-400">
                  No listings yet — the first seller to list gets the spotlight.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-[32px] p-6 sm:p-8 shadow-sm flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-jade-600 dark:text-jade-400" />
              <h3 className="font-display font-black text-lg text-ink-900 dark:text-white">
                Trust, measured
              </h3>
            </div>
            <div className="space-y-4">
              {[
                { icon: PackageCheck, label: 'Orders completed', value: db.orders.length },
                { icon: Gavel, label: 'Active auctions', value: db.products.filter((p) => (p as { isAuction?: boolean }).isAuction).length },
                { icon: MapPin, label: 'Cities served', value: liveStats.cities },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 text-sm text-ink-500">
                    <row.icon className="w-4 h-4 text-ink-400" /> {row.label}
                  </span>
                  <span className="font-mono font-black text-ink-900 dark:text-white">{row.value}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="mt-auto inline-flex items-center justify-center gap-2 px-5 py-3 bg-ink-900 dark:bg-white text-white dark:text-ink-950 text-sm font-extrabold rounded-2xl transition-all press-scale focus-ring cursor-pointer"
            >
              Get started free
            </button>
          </div>
        </section>

        {/* ── TESTIMONIALS ─────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.who + t.where}
              className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm flex flex-col gap-4"
            >
              <div className="flex gap-0.5 text-jade-500">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-jade-500" />
                ))}
              </div>
              <blockquote className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-2 text-xs text-ink-500 font-mono">
                <Clock className="w-3.5 h-3.5" /> {t.who} · {t.where}
              </figcaption>
            </figure>
          ))}
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-[32px] p-6 sm:p-8 shadow-sm">
          <h2 className="font-display font-black text-2xl text-ink-900 dark:text-white tracking-tight mb-5">
            Questions, answered
          </h2>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                  <span className="text-sm font-bold text-ink-900 dark:text-white">{f.q}</span>
                  <ChevronRight className="w-4 h-4 text-ink-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-500">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[32px] aurora-bg bg-ink-900 border border-jade-500/20 p-8 sm:p-12 text-center">
          <h2 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight">
            Ready to trade without the risk?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-ink-300 max-w-2xl mx-auto leading-relaxed">
            Join GoodSale, list your first item or buy with escrow protection in minutes. Your money
            only moves when you say so.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-jade-500 hover:bg-jade-600 text-white text-sm font-extrabold rounded-2xl shadow-lg shadow-jade-500/25 transition-all press-scale focus-ring cursor-pointer"
            >
              Create your account <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('marketplace')}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/15 text-white text-sm font-extrabold rounded-2xl transition-all press-scale focus-ring cursor-pointer"
            >
              Browse the marketplace
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
