// components/MarketingLanding.tsx
'use client';

import React from 'react';
import {
  ShieldCheck, ArrowRight, Lock, Truck, BadgeCheck, Headphones,
  RotateCcw, Store, ShoppingBag, PackageCheck, Star, ChevronRight, Wallet,
  MapPin, Sparkles, CheckCircle2, Building2, Handshake, Receipt,
  MessageSquare, TrendingUp, Gavel,
} from 'lucide-react';
import { useDBState, UserRole } from '../lib/store';
import LottieAnimation from './ui/LottieAnimation';
import AdSlot from './AdSlot';
import escrowLottie from '../lib/lottie/escrow-shield.json';
import type { Product } from '../lib/types';

interface MarketingLandingProps {
  onNavigate: (view: string, payload?: any) => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onSelectProduct?: (productId: number) => void;
  onSearchChange?: (query: string) => void;
}

/* The four beats of a GoodSale trade, in order. */
const PROCESS = [
  {
    icon: Lock,
    phase: 'Escrow',
    title: 'Your money is held safely',
    body: 'Pay by card, transfer or wallet. GoodSale holds the funds in escrow — the seller never gets paid yet.',
  },
  {
    icon: Handshake,
    phase: 'Buy & Sell',
    title: 'Buy or sell with confidence',
    body: 'Shop verified listings, negotiate in chat, or list your own items in minutes from the Seller Hub.',
  },
  {
    icon: Truck,
    phase: 'Delivery',
    title: 'Tracked delivery or safe pickup',
    body: 'A trusted GoodDispatch courier delivers with live tracking, or you meet at a SafeMeet spot you both approve.',
  },
  {
    icon: ShieldCheck,
    phase: 'Protection',
    title: 'You confirm, then we release',
    body: 'Inspect the item, enter your 6-digit delivery PIN, and only then is the seller paid. Something wrong? Open a dispute.',
  },
];

const PROMISES = [
  { icon: Lock, title: 'Secure payments', body: 'Bank-grade checkout on Paystack. Card details never touch GoodSale.' },
  { icon: ShieldCheck, title: 'Escrow protection', body: 'Funds are held until you confirm delivery with your secret PIN.' },
  { icon: BadgeCheck, title: 'Verified sellers', body: 'Identity-checked merchants and storefronts, with visible trust scores.' },
  { icon: Truck, title: 'Reliable delivery', body: 'Tracked GoodDispatch riders and SafeMeet pickup points nationwide.' },
];

const WHY_TRUST = [
  {
    icon: Lock,
    title: 'Escrow on every order',
    body: 'Funds sit with GoodSale, not the seller, until delivery is confirmed. If something goes wrong, the money is still on the platform and can be refunded.',
  },
  {
    icon: ShieldCheck,
    title: 'Real buyer protection',
    body: 'Inspect before you confirm. If the item is not as described, open a dispute and our desk arbitrates with the chat and tracking record.',
  },
  {
    icon: BadgeCheck,
    title: 'Verified sellers & stores',
    body: 'Sellers complete identity verification before earning a badge. Trust scores, ratings and past reviews are visible on every profile.',
  },
  {
    icon: Receipt,
    title: 'Transparent, low fees',
    body: 'Buyers pay the item price — no hidden per-item platform fee at launch. Sellers see exactly what lands in their wallet.',
  },
  {
    icon: Truck,
    title: 'Delivery you can follow',
    body: 'Live rider tracking, estimated arrival times and a delivery PIN keep everyone accountable from pickup to doorstep.',
  },
  {
    icon: Headphones,
    title: 'Human support',
    body: 'Real Nigerian operators on chat and email — not an endless bot loop — for orders, disputes and payouts.',
  },
];

const AUDIENCES = [
  {
    icon: ShoppingBag,
    role: 'Buyer',
    title: 'Shop with escrow protection',
    body: 'Browse verified listings and pay safely. Your money is released only after you confirm the item arrived as described.',
    points: ['Escrow on every order', 'Tracked delivery & pickup', '90-day return window'],
    cta: 'Shop Securely',
    accent: false,
  },
  {
    icon: Store,
    role: 'Individual Seller',
    title: 'Turn your items into income',
    body: 'List what you have, chat with buyers and get paid the moment delivery is confirmed. No storefront setup required.',
    points: ['List in minutes', 'Payouts to any Nigerian bank', 'Buyer chat & offers'],
    cta: 'Start Selling',
    accent: true,
  },
  {
    icon: Building2,
    role: 'Business Owner',
    title: 'A storefront built for scale',
    body: 'Run a branded store, manage stock and staff, send invoices and reach buyers with ads across the marketplace.',
    points: ['Branded storefront', 'Stock, staff & invoices', 'Business analytics'],
    cta: 'Open a Business',
    accent: false,
  },
];

const CATEGORY_LINKS = [
  { name: 'Fashion', slug: 'fashion' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Phones', slug: 'phones' },
  { name: 'Laptops', slug: 'laptops' },
  { name: 'Furniture', slug: 'furniture' },
  { name: 'Groceries', slug: 'groceries' },
  { name: 'Beauty', slug: 'beauty' },
  { name: 'Vehicles', slug: 'vehicles' },
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
      'Payouts land in my wallet the moment the buyer enters their PIN. I always know what is still in escrow.',
    who: 'Verified merchant',
    where: 'Abuja',
  },
  {
    quote:
      'The delivery PIN flow means I get paid for the trip, not for promises. I take on bigger jobs now.',
    who: 'GoodDispatch rider',
    where: 'Port Harcourt',
  },
];

const FAQS = [
  {
    q: 'What exactly is escrow?',
    a: 'GoodSale holds the buyer’s payment — not the seller — until delivery is confirmed. If something goes wrong, the money is still on the platform and can be refunded or released fairly.',
  },
  {
    q: 'Can I both buy and sell on the same account?',
    a: 'Yes. Every account can buy with escrow protection. To sell, switch your account type to Individual Seller or Business Owner in Settings — you keep full buying access either way.',
  },
  {
    q: 'How fast can a seller withdraw?',
    a: 'As soon as escrow releases into the seller wallet you can request a payout to any Nigerian bank account. Payouts are processed through Paystack transfers.',
  },
  {
    q: 'What if the item never arrives?',
    a: 'Open a dispute before confirming delivery. Our arbitration desk reviews the chat, the tracking record and any evidence, then refunds the buyer or releases the seller.',
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

  const trending = db.products.slice(0, 8);

  const browseCategory = (slug: string) => {
    onSearchChange?.(slug);
    onNavigate('marketplace');
  };

  /* Sellers jump into their hub; buyers are guided to switch account type. */
  const startSelling = () => {
    if (!db.currentUser) {
      onOpenAuth('register');
      return;
    }
    const role = db.currentUser.role;
    const canSell = [
      UserRole.SELLER,
      UserRole.VERIFIED_SELLER,
      UserRole.BUSINESS,
      UserRole.VERIFIED_BUSINESS,
      UserRole.ADMIN,
      UserRole.SUPER_ADMIN,
    ].includes(role);
    onNavigate(canSell ? 'dashboard' : 'settings');
  };

  const shopSecurely = () => onNavigate('marketplace');

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen pb-16 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8 sm:space-y-12">

        {/* ── HERO ───────────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[32px] border border-ink-200 bg-white aurora-bg dark:border-ink-800 dark:bg-ink-900">
          <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-jade-500/10 blur-3xl pointer-events-none" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 p-6 sm:p-10 lg:p-14 items-center">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-jade-500/25 bg-jade-500/10 px-3.5 py-1.5 text-sm font-medium text-jade-700 dark:text-jade-300 animate-slide-up">
                <ShieldCheck className="w-4 h-4" />
                Nigeria&apos;s escrow-backed marketplace
              </span>
              <h1 className="mt-6 font-display font-bold text-4xl sm:text-5xl lg:text-[3.4rem] leading-[1.05] tracking-tight text-ink-900 dark:text-white animate-slide-up stagger-1">
                Buy and sell online
                <br />
                <span className="gradient-text">without the risk.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-ink-600 dark:text-ink-300 animate-slide-up stagger-2">
                GoodSale is a Nigerian marketplace where every payment is held safely in escrow.
                Shop verified sellers, get tracked delivery, and only release your money once the
                item arrives exactly as described.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3 animate-slide-up stagger-3">
                <button
                  type="button"
                  onClick={shopSecurely}
                  className="inline-flex items-center gap-2 rounded-2xl bg-jade-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-jade-500/25 transition-all hover:bg-jade-600 press-scale focus-ring cursor-pointer"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Shop Securely
                </button>
                <button
                  type="button"
                  onClick={startSelling}
                  className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 bg-white px-6 py-3.5 text-sm font-semibold text-ink-800 transition-all hover:border-jade-500/40 hover:bg-jade-500/5 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:bg-ink-800 press-scale focus-ring cursor-pointer"
                >
                  <Store className="w-4 h-4" />
                  Start Selling
                </button>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-ink-500 dark:text-ink-400">
                <span className="inline-flex items-center gap-2">
                  <Lock className="w-4 h-4 text-jade-500" /> Escrow on every order
                </span>
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-jade-500" /> Verified sellers
                </span>
                <span className="inline-flex items-center gap-2">
                  <Truck className="w-4 h-4 text-jade-500" /> Tracked delivery
                </span>
              </div>
            </div>

            {/* Hero visual — the single motion beat plus a live escrow card */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-8 rounded-full bg-jade-500/10 blur-3xl pointer-events-none" />
              <div className="lottie-host w-56 h-56 sm:w-72 sm:h-72">
                <div className="lottie-fallback text-jade-500/40">
                  <ShieldCheck className="w-24 h-24" />
                </div>
                <div className="lottie-layer w-full h-full">
                  <LottieAnimation animationData={escrowLottie} className="w-full h-full" />
                </div>
              </div>

              <div className="absolute -bottom-1 left-0 sm:left-4 rounded-2xl border border-ink-200 bg-white px-5 py-4 shadow-xl dark:border-ink-800 dark:bg-ink-900 animate-slide-up stagger-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Protected in escrow</p>
                    <p className="text-lg font-bold tracking-tight text-ink-900 dark:text-white">
                      ₦{liveStats.escrowHeld.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live numbers, presented quietly */}
          <div className="relative grid grid-cols-2 sm:grid-cols-4 border-t border-ink-200 dark:border-ink-800 divide-x divide-ink-200 dark:divide-ink-800 text-center">
            {[
              { value: liveStats.listings.toLocaleString(), label: 'Live listings' },
              { value: liveStats.traders.toLocaleString(), label: 'Traders' },
              { value: `₦${liveStats.escrowHeld.toLocaleString()}`, label: 'Held in escrow' },
              { value: '100%', label: 'PIN-released' },
            ].map((stat) => (
              <div key={stat.label} className="py-5 px-3">
                <p className="font-display text-xl sm:text-2xl font-bold text-ink-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sponsored: home placement on the public landing page */}
        <AdSlot placement="HOME" onNavigate={onNavigate} />

        {/* ── TRUST STRIP ───────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROMISES.map((p) => (
            <div
              key={p.title}
              className="flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                <p.icon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900 dark:text-white">{p.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{p.body}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── HOW GOODSALE WORKS ────────────────────────────────── */}
        <section>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold text-jade-600 dark:text-jade-400">How GoodSale works</span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink-900 dark:text-white">
              Four steps from payment to protection
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-500 dark:text-ink-400">
              Every trade follows the same safe path: escrow, buy or sell, delivery, protection.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 list-stagger">
            {PROCESS.map((step, i) => (
              <div
                key={step.phase}
                className="relative rounded-3xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                    <step.icon className="w-5 h-5" />
                  </span>
                  <span className="font-display text-2xl font-bold text-ink-200 dark:text-ink-800">
                    {i + 1}
                  </span>
                </div>
                <p className="mt-4 text-xs font-semibold text-jade-600 dark:text-jade-400">{step.phase}</p>
                <p className="mt-1 font-display text-base font-bold text-ink-900 dark:text-white">
                  {step.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={shopSecurely}
              className="inline-flex items-center gap-2 text-sm font-semibold text-jade-600 transition-colors hover:text-jade-700 dark:text-jade-400 dark:hover:text-jade-300 cursor-pointer"
            >
              See it live in the marketplace <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* ── MARKETPLACE PREVIEW ───────────────────────────────── */}
        <section className="rounded-[32px] border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
                Discover the marketplace
              </h2>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                Fresh listings from verified sellers across Nigeria — every one escrow-backed.
              </p>
            </div>
            <button
              type="button"
              onClick={shopSecurely}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition-colors hover:border-jade-500/40 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 cursor-pointer"
            >
              Browse all <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Category quick links */}
          <div className="mt-6 flex flex-wrap gap-2">
            {CATEGORY_LINKS.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                onClick={() => browseCategory(cat.slug)}
                className="rounded-full border border-ink-200 bg-ink-50 px-3.5 py-1.5 text-sm font-medium text-ink-600 transition-all hover:border-jade-500/40 hover:bg-jade-500/5 hover:text-jade-700 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-300 dark:hover:text-jade-300 cursor-pointer"
              >
                {cat.name}
              </button>
            ))}
          </div>

          {trending.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 list-stagger">
              {trending.map((product: Product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() =>
                    onSelectProduct ? onSelectProduct(product.id) : onNavigate('marketplace')
                  }
                  className="group overflow-hidden rounded-3xl border border-ink-200 bg-ink-50 text-left transition-all card-hover dark:border-ink-800 dark:bg-ink-950 focus-ring cursor-pointer"
                >
                  <div className="relative h-40 overflow-hidden bg-ink-100 dark:bg-ink-800">
                    {product.images?.[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={product.images[0]}
                        alt={product.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-ink-300 dark:text-ink-700">
                        <PackageCheck className="w-8 h-8" />
                      </div>
                    )}
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-jade-700 backdrop-blur dark:bg-ink-950/80 dark:text-jade-300">
                      <ShieldCheck className="w-3 h-3" /> Escrow
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-ink-900 dark:text-white">
                      {product.title}
                    </p>
                    <p className="mt-2 text-base font-bold text-jade-600 dark:text-jade-400">
                      ₦{product.price.toLocaleString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-ink-200 bg-ink-50 p-10 text-center dark:border-ink-800 dark:bg-ink-950">
              <PackageCheck className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-700" />
              <p className="mt-3 text-sm font-semibold text-ink-700 dark:text-ink-200">No listings yet</p>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                Be the first to list an item and get the spotlight on the marketplace.
              </p>
              <button
                type="button"
                onClick={startSelling}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-jade-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-jade-600 cursor-pointer"
              >
                Start Selling <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>

        {/* ── WHO IT'S FOR ──────────────────────────────────────── */}
        <section>
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold text-jade-600 dark:text-jade-400">Built for everyone</span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink-900 dark:text-white">
              One platform, three ways to win
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-500 dark:text-ink-400">
              Whether you are shopping, selling a few items, or running a full store, GoodSale adapts to you.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-5 list-stagger">
            {AUDIENCES.map((a) => (
              <div
                key={a.role}
                className={`flex flex-col rounded-3xl border p-6 sm:p-7 ${
                  a.accent
                    ? 'border-jade-500/30 bg-jade-500/[0.04] dark:bg-jade-500/10'
                    : 'border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900'
                }`}
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                  <a.icon className="h-6 w-6" />
                </span>
                <p className="mt-4 text-sm font-semibold text-jade-600 dark:text-jade-400">{a.role}</p>
                <h3 className="mt-1 font-display text-xl font-bold text-ink-900 dark:text-white">
                  {a.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{a.body}</p>
                <ul className="mt-5 space-y-2.5">
                  {a.points.map((point) => (
                    <li key={point} className="flex items-center gap-2.5 text-sm text-ink-700 dark:text-ink-200">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-jade-500" />
                      {point}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() =>
                    a.role === 'Buyer' ? shopSecurely() : startSelling()
                  }
                  className={`mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all press-scale focus-ring cursor-pointer ${
                    a.accent
                      ? 'bg-jade-500 text-white hover:bg-jade-600 shadow-md shadow-jade-500/20'
                      : 'border border-ink-200 bg-white text-ink-800 hover:border-jade-500/40 hover:bg-jade-500/5 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100'
                  }`}
                >
                  {a.cta} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHY TRUST GOODSALE ────────────────────────────────── */}
        <section className="rounded-[32px] border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-10">
          <div className="max-w-2xl">
            <span className="text-sm font-semibold text-jade-600 dark:text-jade-400">Why trust GoodSale</span>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink-900 dark:text-white">
              Safety is the product, not a feature
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-500 dark:text-ink-400">
              Escrow, verification and delivery tracking are built into every order — so both sides can
              trade with total confidence.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {WHY_TRUST.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-ink-200 bg-ink-50 p-5 dark:border-ink-800 dark:bg-ink-950"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink-900 dark:text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl bg-jade-500/5 p-4 dark:bg-jade-500/10">
            <RotateCcw className="h-5 w-5 text-jade-600 dark:text-jade-400" />
            <p className="text-sm font-medium text-ink-700 dark:text-ink-200">
              90-day return window and a real dispute desk on every escrow order.
            </p>
          </div>
        </section>

        {/* ── TESTIMONIALS ──────────────────────────────────────── */}
        <section>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-ink-900 dark:text-white">
              Trusted across Nigeria
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.who + t.where}
                className="flex flex-col gap-4 rounded-3xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900"
              >
                <div className="flex gap-0.5 text-jade-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="star-filled h-4 w-4" />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-auto text-sm text-ink-500 dark:text-ink-400">
                  <span className="font-semibold text-ink-700 dark:text-ink-200">{t.who}</span> · {t.where}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ── TRUST METRICS ─────────────────────────────────────── */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { icon: PackageCheck, label: 'Orders completed', value: db.orders.length },
            { icon: Gavel, label: 'Active auctions', value: db.products.filter((p) => p.isAuction).length },
            { icon: MapPin, label: 'Cities served', value: liveStats.cities },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center gap-4 rounded-2xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                <row.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-2xl font-bold text-ink-900 dark:text-white">
                  {row.value.toLocaleString()}
                </p>
                <p className="text-sm text-ink-500 dark:text-ink-400">{row.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section className="rounded-[32px] border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-8">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
            Questions, answered
          </h2>
          <div className="mt-4 divide-y divide-ink-100 dark:divide-ink-800">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-ink-900 dark:text-white">{f.q}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-[32px] border border-jade-500/20 bg-ink-950 p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-0 aurora-bg opacity-70" />
          <div className="relative">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Ready to trade without the risk?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-ink-300">
              Join GoodSale, list your first item or buy with escrow protection in minutes. Your money
              only moves when you say so.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={shopSecurely}
                className="inline-flex items-center gap-2 rounded-2xl bg-jade-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-jade-500/25 transition-all hover:bg-jade-600 press-scale focus-ring cursor-pointer"
              >
                Shop Securely <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={startSelling}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/10 press-scale focus-ring cursor-pointer"
              >
                Start Selling
              </button>
            </div>
          </div>
        </section>

        {/* Quiet live-activity strip — keeps the page feeling alive without noise */}
        {db.products.length > 0 && (
          <section className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-jade-500 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-jade-500" />
            </span>
            <Sparkles className="h-4 w-4 shrink-0 text-jade-500" />
            <p className="min-w-0 truncate text-sm text-ink-600 dark:text-ink-300">
              Latest: <span className="font-semibold text-ink-900 dark:text-white">{db.products[0].title}</span>
              {' '}just listed for ₦{db.products[0].price.toLocaleString()}
            </p>
            <button
              type="button"
              onClick={shopSecurely}
              className="ml-auto hidden shrink-0 items-center gap-1 text-sm font-semibold text-jade-600 hover:text-jade-700 dark:text-jade-400 sm:inline-flex cursor-pointer"
            >
              View <ChevronRight className="w-4 h-4" />
            </button>
          </section>
        )}

        {/* Support nudge */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-2xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">Need help deciding?</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Chat with a verified seller before you buy.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900 dark:text-white">Grow your store</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Reach more buyers with ads and featured listings.</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
