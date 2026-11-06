// components/TrustSafetyView.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  ShieldCheck, ArrowLeft, BadgeCheck, Lock, Truck, KeyRound, RotateCcw,
  Flag, Scale, Building2, Smartphone, Mail, IdCard, Star, MessageSquare,
  CheckCircle2, AlertTriangle, ArrowRight, ChevronRight, Sparkles, FileSearch,
} from 'lucide-react';
import { useDBState } from '../lib/store';
import { createSupportTicket, useTrustCenter } from '../lib/trustCenter';
import { toast } from '@/lib/feedback';
import { computeSellerTrust } from '../lib/trust';
import { OrderStatus, UserRole, VerificationStatus } from '../lib/types';
import { NOTIFICATION_PREFERENCE_META } from '../lib/notificationPrefs';

interface TrustSafetyViewProps {
  onBack?: () => void;
  onNavigate?: (view: string, payload?: unknown) => void;
}

const SECTIONS = [
  { id: 'protection', label: 'Buyer protection' },
  { id: 'verification', label: 'Verification' },
  { id: 'trust-score', label: 'Trust Score' },
  { id: 'standards', label: 'Seller standards' },
  { id: 'reporting', label: 'Report a problem' },
  { id: 'disputes', label: 'Dispute resolution' },
];

const PROTECTION_STEPS = [
  { Icon: Lock, title: 'You pay into escrow', body: 'Card, transfer and partial-deposit payments are held by GoodSale — never sent straight to the seller.' },
  { Icon: BadgeCheck, title: 'Seller fulfils the order', body: 'The seller sees the order as paid and prepares it. Funds stay protected while they do.' },
  { Icon: Truck, title: 'Tracked delivery', body: 'A GoodDispatch courier or your chosen logistics partner carries the item with live status updates.' },
  { Icon: KeyRound, title: 'You confirm with your PIN', body: 'Only your 6-digit delivery PIN — shared when the item is in your hands — completes the order.' },
  { Icon: CheckCircle2, title: 'Seller gets paid', body: 'Released funds move to the seller wallet. If something is wrong, open a dispute before releasing.' },
];

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-jade-600 dark:text-jade-400">{eyebrow}</p>
      <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-3xl">{title}</h2>
      {copy && <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{copy}</p>}
    </div>
  );
}

export default function TrustSafetyView({ onBack, onNavigate }: TrustSafetyViewProps) {
  const db = useDBState();
  const { tickets } = useTrustCenter();
  const [active, setActive] = useState('protection');
  const me = db.currentUser;
  const phoneTicket = me
    ? tickets.find((t) => t.userId === me.id && t.subject.startsWith('Phone verification') && t.status !== 'RESOLVED' && t.status !== 'CLOSED')
    : undefined;

  const stats = useMemo(() => {
    const verifiedSellers = db.users.filter(
      (u) => u.role === UserRole.VERIFIED_SELLER || u.role === UserRole.VERIFIED_BUSINESS
    ).length;
    const delivered = db.orders.filter((o) => o.status === OrderStatus.DELIVERED_SUCCESS).length;
    const disputes = db.disputes.length;
    const resolved = db.disputes.filter((d) => d.resolution !== 'PENDING').length;
    const reviews = db.reviews.filter((r) => r.rating > 0);
    const rating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    return {
      verifiedSellers,
      delivered,
      disputes,
      resolved,
      rating: Number(rating.toFixed(1)),
      reviewCount: reviews.length,
      resolutionRate: disputes ? Math.round((resolved / disputes) * 100) : 100,
    };
  }, [db]);

  const myTrust = useMemo(() => {
    if (!me) return null;
    const isSeller = [UserRole.SELLER, UserRole.VERIFIED_SELLER, UserRole.BUSINESS, UserRole.VERIFIED_BUSINESS].includes(me.role);
    return isSeller ? computeSellerTrust(db, me.id) : null;
  }, [db, me]);

  const pendingVerification = me
    ? db.verifications.find((v) => v.userId === me.id && v.status === VerificationStatus.PENDING)
    : undefined;

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(`ts-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="animate-fade-in bg-ink-50/60 pb-20 dark:bg-ink-950">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ink-200 bg-gradient-to-br from-jade-950 via-jade-900 to-jade-800 text-white dark:border-ink-800">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(212,175,55,0.45), transparent 45%), radial-gradient(circle at 85% 0%, rgba(255,255,255,0.25), transparent 40%)' }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur transition-colors hover:bg-white/20 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300/40 bg-gold-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Trust &amp; Safety Centre
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
              Updated for 2026
            </span>
          </div>
          <h1 className="mt-5 max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]">
            Trade like you can see the whole marketplace.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
            GoodSale is built on escrow, verified identities and public seller performance.
            This centre explains exactly how we protect your money, how a seller earns trust
            and what happens when something goes wrong.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => (onNavigate ? onNavigate(me ? 'support' : 'settings') : undefined)}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-jade-900 transition-transform hover:-translate-y-0.5 cursor-pointer"
            >
              {me ? 'Open support centre' : 'Get protected'} <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onNavigate?.('verification')}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 cursor-pointer"
            >
              <BadgeCheck className="h-4 w-4" /> Get verified
            </button>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Verified sellers', value: stats.verifiedSellers.toLocaleString() },
              { label: 'Orders completed in escrow', value: stats.delivered.toLocaleString() },
              { label: 'Disputes resolved', value: `${stats.resolutionRate}%` },
              { label: 'Average seller rating', value: stats.reviewCount ? `${stats.rating.toFixed(1)} / 5` : 'New' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur">
                <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">{s.label}</dt>
                <dd className="mt-1 font-display text-xl font-bold text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Section nav */}
      <div className="sticky top-0 z-20 border-b border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-950/90">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                active === s.id
                  ? 'bg-jade-500 text-white'
                  : 'text-ink-500 hover:bg-jade-500/10 hover:text-jade-700 dark:text-ink-400 dark:hover:text-jade-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6 lg:px-8">
        {/* Buyer protection */}
        <section id="ts-protection" className="scroll-mt-24">
          <SectionHeading
            eyebrow="GoodSale Buyer Protection"
            title="Your money moves only when the goods do"
            copy="Every escrow order follows the same five checkpoints. Sellers can see funds are committed; buyers keep control until the item is confirmed in hand."
          />

          <div className="mt-8 grid gap-4 lg:grid-cols-5">
            {PROTECTION_STEPS.map((step, index) => (
              <div
                key={step.title}
                className="relative rounded-3xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900"
              >
                <span className="absolute right-4 top-4 font-display text-2xl font-bold text-ink-100 dark:text-ink-800">0{index + 1}</span>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-jade-500/10 text-jade-600 dark:bg-jade-500/15 dark:text-jade-400">
                  <step.Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-bold text-ink-900 dark:text-white">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              {
                Icon: RotateCcw,
                title: 'Cancel before shipment',
                body: 'Change of mind is free until the seller marks the order shipped. Escrow is refunded to your original payment method.',
              },
              {
                Icon: AlertTriangle,
                title: 'Refund after payment',
                body: 'Request a refund from the order in your buyer profile. Funds stay frozen while the seller and support review it.',
              },
              {
                Icon: Scale,
                title: 'Raise a dispute',
                body: 'Item not as described or never arrived? Open a dispute and an admin decides with the delivery and chat evidence.',
              },
            ].map((card) => (
              <div key={card.title} className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                <card.Icon className="h-5 w-5 text-gold-500" />
                <h3 className="mt-3 text-sm font-bold text-ink-900 dark:text-white">{card.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Verification */}
        <section id="ts-verification" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Verification"
            title="Four checks, one visible badge"
            copy="Verification is progressive. Each level unlocks more marketplace trust and is displayed on the seller's storefront and every listing."
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { Icon: Mail, title: 'Email verified', body: 'Confirmed through a secure sign-in link. Required to buy or sell.', tone: 'jade' },
              { Icon: Smartphone, title: 'Phone verified', body: 'Nigerian number confirmed with support. Used for delivery and dispute contact.', tone: 'jade' },
              { Icon: IdCard, title: 'Identity verified', body: 'Government photo ID plus a selfie, reviewed by the trust team. Unlocks the verified seller badge.', tone: 'gold' },
              { Icon: Building2, title: 'Business verified', body: 'CAC registration and business address reviewed. Unlocks the verified business badge.', tone: 'gold' },
            ].map((card) => (
              <div
                key={card.title}
                className={`rounded-3xl border p-5 ${
                  card.tone === 'gold'
                    ? 'border-gold-300/60 bg-gold-50/40 dark:border-gold-500/25 dark:bg-gold-500/5'
                    : 'border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900'
                }`}
              >
                <card.Icon className={`h-5 w-5 ${card.tone === 'gold' ? 'text-gold-600 dark:text-gold-400' : 'text-jade-600 dark:text-jade-400'}`} />
                <h3 className="mt-3 text-sm font-bold text-ink-900 dark:text-white">{card.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{card.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-ink-900 dark:text-white">Email address</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${me ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'}`}>
                  {me ? 'Verified' : 'Not signed in'}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                {me ? `${me.email} is confirmed through GoodSale's secure sign-in.` : 'Sign in to confirm your email through the secure authentication link.'}
              </p>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-ink-900 dark:text-white">Phone number</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${phoneTicket ? 'bg-gold-400/15 text-gold-700 dark:text-gold-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'}`}>
                  {phoneTicket ? 'Under review' : 'Not verified'}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                {me?.phoneNumber ? `${me.phoneNumber} — ` : ''}Phone checks are reviewed manually by the trust team. Automated OTP needs an SMS provider and is not switched on yet.
              </p>
              {phoneTicket ? (
                <p className="mt-2 text-[10px] font-semibold text-gold-700 dark:text-gold-300">Reference {phoneTicket.reference}</p>
              ) : (
                <button
                  onClick={() => {
                    if (!me) { onNavigate?.('settings'); return; }
                    if (!me.phoneNumber) { toast.info('Add a phone number in Settings first.'); onNavigate?.('settings'); return; }
                    const res = createSupportTicket({
                      category: 'ACCOUNT',
                      subject: `Phone verification — ${me.phoneNumber}`,
                      description: `Please verify this phone number for my GoodSale account. Number: ${me.phoneNumber}. Automated OTP is not available yet, so I am requesting a manual trust-team review.`,
                      priority: 'NORMAL',
                    });
                    if (res.error) toast.error(res.error);
                    else toast.success(`Verification requested — reference ${res.ticket?.reference}`);
                  }}
                  className="mt-2 text-[11px] font-bold text-jade-700 hover:text-jade-600 dark:text-jade-300 cursor-pointer"
                >
                  Request phone verification →
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4 rounded-3xl border border-jade-500/25 bg-jade-500/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between dark:border-jade-500/20 dark:bg-jade-500/10">
            <div className="flex items-start gap-3">
              <FileSearch className="mt-0.5 h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
              <div>
                <p className="text-sm font-bold text-ink-900 dark:text-white">
                  {pendingVerification ? 'Your verification is with the trust team' : 'Ready to earn a verified badge?'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  {pendingVerification
                    ? 'We review documents within 48 hours. You will get a notification as soon as a decision is made.'
                    : 'Upload a government ID, a selfie and — for businesses — your CAC certificate. Documents are stored privately and never shown to buyers.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate?.('verification')}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-jade-700 cursor-pointer"
            >
              {pendingVerification ? 'Track application' : 'Start verification'} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        {/* Trust score */}
        <section id="ts-trust-score" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Seller Trust Score"
            title="A score you can audit, not a mystery rating"
            copy="The Trust Score is recalculated from live marketplace records. Five weighted factors, visible to everyone on the storefront."
          />

          <div className="mt-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-3xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-bold text-ink-900 dark:text-white">How the 100 points are earned</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Weight</span>
              </div>
              <ul className="mt-5 space-y-4">
                {[
                  { label: 'Verification', weight: 20, note: 'Identity and business checks passed.' },
                  { label: 'Fulfilment', weight: 25, note: 'Delivered orders vs. cancelled, disputed or refunded.' },
                  { label: 'Ratings', weight: 25, note: 'Average of reviews tied to completed escrow orders.' },
                  { label: 'Engagement', weight: 15, note: 'Buyer conversations the seller replied to.' },
                  { label: 'Reliability', weight: 15, note: 'Low cancellation and dispute rate over their order history.' },
                ].map((f) => (
                  <li key={f.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink-800 dark:text-ink-100">{f.label}</span>
                      <span className="font-bold tabular-nums text-ink-500 dark:text-ink-400">{f.weight} pts</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div className="h-full rounded-full bg-jade-500" style={{ width: `${f.weight * 4}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{f.note}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-2xl bg-ink-50 px-4 py-3 text-[11px] leading-relaxed text-ink-500 dark:bg-ink-950 dark:text-ink-400">
                New sellers start with an honest low score and climb as real orders land. We never seed reviews or inflate points.
              </p>
            </div>

            <div className="rounded-3xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
              {myTrust ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-400">Your live score</p>
                      <p className="mt-1 font-display text-4xl font-bold text-ink-900 dark:text-white">
                        {myTrust.score}<span className="text-lg text-ink-400">/100</span>
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 px-3 py-1.5 text-xs font-bold text-gold-700 dark:text-gold-300">
                      <Star className="h-3.5 w-3.5 fill-current" /> {myTrust.bandLabel}
                    </span>
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                    {[
                      { k: 'Delivered', v: myTrust.completedOrders },
                      { k: 'Reviews', v: myTrust.reviewCount },
                      { k: 'Reply rate', v: `${myTrust.responseRate}%` },
                    ].map((s) => (
                      <div key={s.k} className="rounded-2xl bg-ink-50 px-2 py-3 dark:bg-ink-950">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{s.k}</dt>
                        <dd className="mt-0.5 text-sm font-bold text-ink-900 dark:text-white">{s.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="mt-5 space-y-3">
                    {myTrust.factors.map((f) => (
                      <li key={f.key}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-ink-700 dark:text-ink-200">{f.label}</span>
                          <span className="tabular-nums text-ink-500 dark:text-ink-400">{f.points}/{f.weight}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                          <div className="h-full rounded-full bg-jade-500" style={{ width: `${(f.points / f.weight) * 100}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-ink-400">{f.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onNavigate?.('dashboard')}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-200 px-4 py-2.5 text-xs font-bold text-ink-700 transition-colors hover:border-jade-500/50 hover:text-jade-700 dark:border-ink-700 dark:text-ink-200 dark:hover:text-jade-300 cursor-pointer"
                  >
                    Improve your score in the seller hub <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-ink-900 dark:text-white">See the score on any storefront</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                    Every seller page shows their Trust Score with the same five-factor breakdown.
                    Sellers can also see their own score, reach and buyer intent in the dashboard.
                  </p>
                  <button
                    onClick={() => onNavigate?.('marketplace')}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-jade-700 cursor-pointer"
                  >
                    Browse verified sellers <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
                    Selling already? Open your seller hub to see the score, analytics and verification checklist.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Seller standards */}
        <section id="ts-standards" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Seller standards"
            title="What we expect from every store"
            copy="These standards are enforced through moderation, buyer reports and periodic account reviews. Persistent failure leads to suspension."
          />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'Accurate listings', body: 'Real photos, correct condition, honest specs. No counterfeit or prohibited goods.' },
              { title: 'Stock integrity', body: 'Keep quantities current. Sold and unavailable listings cannot be purchased.' },
              { title: 'Dispatch on time', body: 'Ship within the handling window shown on the listing; update the order status.' },
              { title: 'Respond to buyers', body: 'Reply to order and dispute messages within 48 hours.' },
              { title: 'Honour refunds', body: 'Escrow decisions are final. Never ask a buyer to pay outside GoodSale.' },
              { title: 'Protect data', body: 'Buyer phone numbers and addresses are for fulfilment only — never for marketing.' },
            ].map((s) => (
              <div key={s.title} className="flex gap-3 rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-jade-500" />
                <div>
                  <p className="text-sm font-bold text-ink-900 dark:text-white">{s.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Reporting */}
        <section id="ts-reporting" className="scroll-mt-24">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink-900 text-white dark:bg-white dark:text-ink-950">
                <Flag className="h-4 w-4" />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold text-ink-900 dark:text-white">Report a listing, seller or message</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                Every listing has a report control. Choose a reason, add what you saw and submit —
                the trust team picks it up in the admin safety queue. Your identity is not shown to the seller.
              </p>
              <ol className="mt-4 space-y-2 text-xs text-ink-600 dark:text-ink-300">
                {['Open the listing and select “Report”.', 'Pick the closest reason and describe the issue.', 'We triage within 24 hours; serious listings are hidden immediately.', 'Track updates in your support tickets.'].map((step, i) => (
                  <li key={step} className="flex gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-jade-500/10 text-[10px] font-bold text-jade-600 dark:text-jade-400">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-3xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-jade-500/10 text-jade-600 dark:bg-jade-500/15 dark:text-jade-400">
                <MessageSquare className="h-4 w-4" />
              </span>
              <h3 className="mt-4 font-display text-xl font-bold text-ink-900 dark:text-white">What we alert you about</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                Notifications cover every stage of a transaction. You decide which categories reach you.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {NOTIFICATION_PREFERENCE_META.map((n) => (
                  <span key={n.key} className="rounded-full border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 dark:border-ink-700 dark:text-ink-300">
                    {n.label}
                  </span>
                ))}
              </div>
              <button
                onClick={() => onNavigate?.('settings')}
                className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-jade-700 hover:text-jade-600 dark:text-jade-400 cursor-pointer"
              >
                Manage notification preferences <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* Disputes */}
        <section id="ts-disputes" className="scroll-mt-24">
          <SectionHeading
            eyebrow="Dispute resolution"
            title="Clear timelines, evidence-based decisions"
            copy="Disputes freeze escrow. An administrator reviews the order, chat and delivery trail, then rules for the buyer or the seller."
          />
          <div className="mt-8 overflow-hidden rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
            <table className="w-full text-left text-xs">
              <thead className="bg-ink-50 text-[10px] uppercase tracking-wider text-ink-400 dark:bg-ink-950">
                <tr>
                  <th className="px-4 py-3 font-bold">Stage</th>
                  <th className="px-4 py-3 font-bold">What happens</th>
                  <th className="px-4 py-3 font-bold">Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {[
                  ['Report / request', 'Buyer files a refund or dispute with evidence attached to the order.', 'Immediate'],
                  ['Seller response', 'Seller can reply with fulfilment proof in the support thread.', '48 hours'],
                  ['Admin review', 'Support checks payment, dispatch and chat records.', '2 business days'],
                  ['Decision', 'Escrow is refunded to the buyer or released to the seller.', 'Same day as decision'],
                  ['Appeal', 'Either party may appeal a listing decision with new evidence.', '5 business days'],
                ].map(([stage, what, when]) => (
                  <tr key={stage}>
                    <td className="px-4 py-3 font-semibold text-ink-800 dark:text-ink-100">{stage}</td>
                    <td className="px-4 py-3 text-ink-500 dark:text-ink-400">{what}</td>
                    <td className="px-4 py-3 font-medium text-ink-600 dark:text-ink-300">{when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* CTA */}
        <section className="overflow-hidden rounded-3xl bg-jade-950 p-7 text-white sm:p-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-300">Still unsure?</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">Talk to a human on the trust team.</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                Open a ticket with your order number. Payment, delivery and refund complaints are prioritised.
              </p>
            </div>
            <button
              onClick={() => (onNavigate ? onNavigate(me ? 'support' : 'settings') : undefined)}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-jade-900 transition-transform hover:-translate-y-0.5 cursor-pointer"
            >
              {me ? 'Open a support ticket' : 'Sign in for support'} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
