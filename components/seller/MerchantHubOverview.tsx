// components/seller/MerchantHubOverview.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Landmark,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Shield,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import Meter from '@/components/ui/Meter';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { SmartImage } from '@/components/ui/SmartImage';
import VerifiedBadge from '@/components/verification/VerifiedBadge';
import VerificationStatusChip from '@/components/verification/VerificationStatusChip';
import { isVerifiedSeller, toStage } from '@/lib/verification';
import { OrderStatus } from '@/lib/types';
import type { Business, Order, Product, Profile, User } from '@/lib/types';

export type MerchantHubTab =
  | 'overview'
  | 'analytics'
  | 'orders'
  | 'inventory'
  | 'create_listing'
  | 'shipping'
  | 'barcode_scanner';

export interface MerchantAiInsight {
  salesVelocity?: string;
  growthTip?: string;
  priceAdjustment?: string;
  organicBoostChance?: string;
}

export interface PayoutRecord {
  id: number | string;
  transactionId: string;
  bank: string;
  accountNumber: string;
  amount: number;
  status: string;
  createdAt: string;
}

interface MerchantHubOverviewProps {
  user: User;
  business?: Business;
  profile?: Profile;
  products: Product[];
  orders: Order[];
  users: User[];
  payoutHistory: PayoutRecord[];
  withdrawableEarnings: number;
  escrowHeldSum: number;
  grossEarnings: number;
  totalWithdrawn: number;
  totalVisits: number;
  aiInsight: MerchantAiInsight | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onWithdraw: () => void;
  onTabChange: (tab: MerchantHubTab) => void;
  onOpenSettings: () => void;
}

type ChartMode = 'revenue' | 'orders';
type ChartPeriod = '7days' | '30days';

const DAY_MS = 24 * 60 * 60 * 1000;

const ORDER_LABELS: Record<string, string> = {
  PENDING: 'Awaiting payment',
  PENDING_BANK_TRANSFER: 'Bank transfer pending',
  PARTIAL_DEPOSIT_PAID: 'Deposit paid',
  INVOICE_SENT: 'Invoice sent',
  COD_PENDING: 'Cash on delivery',
  PAID_ESCROW: 'Paid · ready to ship',
  SHIPPED: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED_SUCCESS: 'Completed',
  DISPUTED: 'Disputed',
  REFUND_REQUESTED: 'Refund requested',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
};

const ORDER_TONES: Record<string, string> = {
  PENDING: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  PENDING_BANK_TRANSFER: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  COD_PENDING: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  PARTIAL_DEPOSIT_PAID: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  INVOICE_SENT: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  PAID_ESCROW: 'border-jade-500/30 bg-jade-500/10 text-jade-700 dark:text-jade-300',
  SHIPPED: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  OUT_FOR_DELIVERY: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  DELIVERED_SUCCESS: 'border-jade-600 bg-jade-600 text-white',
  DISPUTED: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  REFUND_REQUESTED: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  REFUNDED: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  CANCELLED: 'border-ink-200 bg-ink-100 text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400',
};

const STOCK_LABELS: Record<string, string> = {
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
  SOLD: 'Sold',
  UNAVAILABLE: 'Unavailable',
};

function naira(value: number): string {
  return `₦${Math.round(value).toLocaleString('en-NG')}`;
}

function compactNaira(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  if (value >= 1_000) return `₦${Math.round(value / 1_000)}k`;
  return `₦${Math.round(value).toLocaleString('en-NG')}`;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function orderDate(order: Order): Date | null {
  const parsed = new Date(order.createdAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countValue(order: Order, mode: ChartMode): number {
  if (mode === 'orders') return 1;
  return Number.isFinite(order.totalAmount) ? order.totalAmount : 0;
}

export default function MerchantHubOverview({
  user,
  business,
  profile,
  products,
  orders,
  users,
  payoutHistory,
  withdrawableEarnings,
  escrowHeldSum,
  grossEarnings,
  totalWithdrawn,
  totalVisits,
  aiInsight,
  isAnalyzing,
  onAnalyze,
  onWithdraw,
  onTabChange,
  onOpenSettings,
}: MerchantHubOverviewProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('revenue');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('7days');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const verified = isVerifiedSeller({
    verificationStatus: profile?.verificationStatus,
    verificationExpiresAt: profile?.verificationExpiresAt,
  });
  const stage = toStage(profile?.verificationStatus);

  const pendingDispatch = orders.filter((order) => order.status === OrderStatus.PAID_ESCROW).length;
  const inTransit = orders.filter(
    (order) =>
      order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY
  ).length;
  const completedOrders = orders.filter((order) => order.status === OrderStatus.DELIVERED_SUCCESS).length;

  const lowStock = products.filter(
    (product) =>
      product.stockStatus !== 'SOLD' &&
      product.stockStatus !== 'UNAVAILABLE' &&
      (product.stockStatus === 'LOW_STOCK' ||
        product.stockStatus === 'OUT_OF_STOCK' ||
        product.quantity <= 3)
  );
  const outOfStock = products.filter((product) => product.stockStatus === 'OUT_OF_STOCK').length;

  const storeName = business?.name || 'My storefront';
  const location = [business?.city || profile?.city, business?.state || profile?.state]
    .filter(Boolean)
    .join(', ');
  const firstName = (user.fullName || user.username || 'there').split(' ')[0];
  const today = startOfDay(new Date());
  const dateLabel = today.toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => {
          const aTime = orderDate(a)?.getTime() ?? 0;
          const bTime = orderDate(b)?.getTime() ?? 0;
          return bTime - aTime;
        })
        .slice(0, 4),
    [orders]
  );

  const spotlightProducts = useMemo(
    () =>
      [...products]
        .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
        .slice(0, 3),
    [products]
  );

  const latestPayouts = useMemo(
    () =>
      [...payoutHistory]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [payoutHistory]
  );

  const storeLink = `/sellers/${user.id}`;

  const attentionItems = useMemo(() => {
    const items: {
      key: string;
      icon: React.ReactNode;
      title: string;
      body: string;
      action: string;
      onClick: () => void;
      tone: 'amber' | 'jade' | 'gold';
    }[] = [];

    if (products.length === 0) {
      items.push({
        key: 'first-listing',
        icon: <Plus className="h-4 w-4" />,
        title: 'Publish your first listing',
        body: 'A storefront with an active listing is the fastest way to your first sale.',
        action: 'Create listing',
        onClick: () => onTabChange('create_listing'),
        tone: 'jade',
      });
    }

    if (pendingDispatch > 0) {
      items.push({
        key: 'dispatch',
        icon: <Truck className="h-4 w-4" />,
        title: `${pendingDispatch} paid order${pendingDispatch === 1 ? '' : 's'} to dispatch`,
        body: 'Buyers are waiting. Add a courier and tracking number to move these orders.',
        action: 'Open orders',
        onClick: () => onTabChange('orders'),
        tone: 'amber',
      });
    }

    if (lowStock.length > 0) {
      items.push({
        key: 'stock',
        icon: <Package className="h-4 w-4" />,
        title: `${lowStock.length} listing${lowStock.length === 1 ? '' : 's'} need stock attention`,
        body: `${outOfStock} out of stock and ${Math.max(0, lowStock.length - outOfStock)} running low.`,
        action: 'Review inventory',
        onClick: () => onTabChange('inventory'),
        tone: 'amber',
      });
    }

    if (!verified) {
      const inReview = stage === 'PENDING' || stage === 'UNDER_REVIEW';
      const needsInfo = stage === 'INFO_REQUIRED';
      const needsAttention = stage === 'REJECTED' || stage === 'SUSPENDED' || stage === 'REVOKED';
      items.push({
        key: 'verification',
        icon: <Shield className="h-4 w-4" />,
        title: inReview
          ? 'Verification is in review'
          : needsInfo
            ? 'Verification needs more information'
            : needsAttention
              ? 'Verification needs your attention'
              : 'Get the GoodSale Verified badge',
        body: inReview
          ? 'Your application is with the review team. No action is needed right now.'
          : needsInfo
            ? 'A reviewer asked for more details. Open the verification centre to see what is missing.'
            : needsAttention
              ? 'Read the reviewer’s reason and update your application in the verification centre.'
              : 'Show buyers that your identity and business documents were checked by GoodSale.',
        action: inReview ? 'View status' : needsInfo || needsAttention ? 'Open verification' : 'Start verification',
        onClick: () => {
          window.location.href = '/seller/verification';
        },
        tone: 'gold',
      });
    }

    if (withdrawableEarnings > 0 && payoutHistory.length === 0) {
      items.push({
        key: 'payout',
        icon: <Landmark className="h-4 w-4" />,
        title: 'Withdraw released earnings',
        body: `${naira(withdrawableEarnings)} is available to settle to your Nigerian bank account.`,
        action: 'Withdraw',
        onClick: onWithdraw,
        tone: 'jade',
      });
    }

    return items.slice(0, 3);
  }, [
    products.length,
    pendingDispatch,
    lowStock.length,
    outOfStock,
    verified,
    stage,
    withdrawableEarnings,
    payoutHistory.length,
    onTabChange,
    onWithdraw,
  ]);

  const chart = useMemo(() => {
    const bucketCount = chartPeriod === '7days' ? 7 : 5;
    const bucketDays = chartPeriod === '7days' ? 1 : 6;
    const rangeDays = bucketCount * bucketDays;

    const startFor = (index: number) => {
      const end = new Date(today.getTime() - (bucketCount - 1 - index) * bucketDays * DAY_MS + DAY_MS);
      return new Date(end.getTime() - bucketDays * DAY_MS);
    };

    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const start = startFor(index);
      const end = new Date(start.getTime() + bucketDays * DAY_MS);
      return {
        start,
        end,
        label:
          bucketDays === 1
            ? start.toLocaleDateString('en-NG', { weekday: 'short' })
            : `${start.getDate()} ${start.toLocaleDateString('en-NG', { month: 'short' })}`,
        value: 0,
      };
    });

    const paidStatuses = new Set<string>([
      OrderStatus.PAID_ESCROW,
      OrderStatus.PARTIAL_DEPOSIT_PAID,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED_SUCCESS,
      OrderStatus.DISPUTED,
      OrderStatus.REFUND_REQUESTED,
    ]);
    const sellableOrders = orders.filter((order) => {
      if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) return false;
      if (chartMode === 'revenue') return paidStatuses.has(order.status);
      return true;
    });

    sellableOrders.forEach((order) => {
      const created = orderDate(order);
      if (!created) return;
      const time = startOfDay(created).getTime();
      const bucket = buckets.findIndex(
        (entry) => time >= entry.start.getTime() && time < entry.end.getTime()
      );
      if (bucket >= 0) buckets[bucket].value += countValue(order, chartMode);
    });

    const currentStart = startFor(0).getTime();
    const previousStart = currentStart - rangeDays * DAY_MS;
    let previousTotal = 0;
    sellableOrders.forEach((order) => {
      const created = orderDate(order);
      if (!created) return;
      const time = startOfDay(created).getTime();
      if (time >= previousStart && time < currentStart) previousTotal += countValue(order, chartMode);
    });

    const total = buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
    const delta = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
    const hasActivity = total > 0;

    return { buckets, total, previousTotal, delta, max, hasActivity, rangeDays };
  }, [orders, chartMode, chartPeriod, today]);

  const readiness = [
    {
      key: 'storefront',
      label: 'Storefront profile',
      done: Boolean(business?.name && (business?.description || business?.logoUrl)),
      hint: !business?.name
        ? 'Add your store name and details.'
        : business.description || business.logoUrl
          ? 'Your store name, logo and description are visible to buyers.'
          : 'Add a description to help buyers trust your store.',
      action: onOpenSettings,
    },
    {
      key: 'verification',
      label: 'GoodSale verification',
      done: verified,
      hint: verified ? 'Your badge is live on your storefront.' : 'Get the badge buyers look for.',
      action: () => {
        window.location.href = '/seller/verification';
      },
    },
    {
      key: 'catalog',
      label: 'Active listing',
      done: products.length > 0,
      hint: products.length > 0 ? `${products.length} listing${products.length === 1 ? '' : 's'} in your catalogue.` : 'Publish something buyers can order.',
      action: () => onTabChange('create_listing'),
    },
    {
      key: 'sale',
      label: 'First completed order',
      done: completedOrders > 0,
      hint:
        completedOrders > 0
          ? `${completedOrders} order${completedOrders === 1 ? '' : 's'} completed and released.`
          : 'Complete a sale to unlock withdrawable earnings.',
      action: () => onTabChange('orders'),
    },
  ];
  const completedChecks = readiness.filter((item) => item.done).length;

  const suggestions = [
    products.length === 0
      ? 'Publish one strong listing with clear photos and a warranty note.'
      : 'Refresh the photos on your most viewed listing to lift buyer interest.',
    pendingDispatch > 0
      ? `Dispatch ${pendingDispatch} paid order${pendingDispatch === 1 ? '' : 's'} today to keep your response time strong.`
      : 'Keep stock levels updated so paid orders never wait on inventory.',
    verified
      ? 'Reply to buyer questions quickly — response speed is visible on your storefront.'
      : 'Complete verification to add the GoodSale Verified badge to your storefront.',
  ];

  const chartWidth = 560;
  const chartHeight = 176;
  const chartLeft = 16;
  const chartRight = chartWidth - 16;
  const chartTop = 16;
  const chartBase = 138;
  const step = chart.buckets.length > 1 ? (chartRight - chartLeft) / (chart.buckets.length - 1) : 0;

  const points = chart.buckets.map((bucket, index) => {
    const ratio = chart.hasActivity ? bucket.value / chart.max : 0;
    return {
      ...bucket,
      x: chartLeft + step * index,
      y: chartBase - ratio * (chartBase - chartTop),
    };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${chartBase} L ${points[0].x} ${chartBase} Z`
    : '';

  const hovered = hoveredPoint !== null ? points[hoveredPoint] : null;

  return (
    <div className="space-y-5">
      {/* PAYOUT / PERFORMANCE HERO */}
      <section className="relative overflow-hidden rounded-[30px] bg-jade-950 text-white shadow-[0_30px_70px_-40px_rgba(3,34,20,0.8)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-jade-500/25 blur-3xl" />
          <div className="absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-gold-400/10 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.28) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-jade-200/70">
                Merchant overview · {dateLabel}
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-[28px]">
                {greetingFor(new Date().getHours())}, {firstName}.
              </h2>
              <p className="mt-1 text-sm text-jade-100/65">
                {storeName}
                {location ? ` · ${location}` : ''}
              </p>

              <div className="mt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-jade-200/60">
                  Available to withdraw
                </p>
                <div className="mt-1.5 flex flex-wrap items-end gap-3">
                  <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight sm:text-[44px]">
                    {naira(withdrawableEarnings)}
                  </span>
                  {escrowHeldSum > 0 && (
                    <span className="mb-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-jade-50">
                      +{compactNaira(escrowHeldSum)} in escrow
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-jade-100/60">
                  Released from {completedOrders} completed order{completedOrders === 1 ? '' : 's'}.
                  Withdrawals stay pending until review and Paystack confirmation.
                </p>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={onWithdraw}
                disabled={withdrawableEarnings <= 0}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold tracking-tight text-jade-950 transition-all duration-200 hover:bg-jade-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Landmark className="h-4 w-4" aria-hidden="true" />
                Withdraw
              </button>
              <Link
                href={storeLink}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/20 px-5 text-sm font-bold tracking-tight text-white transition-colors hover:bg-white/10"
              >
                <Store className="h-4 w-4" aria-hidden="true" />
                Storefront
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-5">
            {[
              { label: 'Pending earnings', value: compactNaira(escrowHeldSum), note: 'Held in escrow' },
              { label: 'To dispatch', value: String(pendingDispatch), note: 'Paid orders' },
              { label: 'Total sales', value: compactNaira(grossEarnings), note: 'Paid order value' },
              { label: 'Withdrawn', value: compactNaira(totalWithdrawn), note: 'Confirmed payouts' },
              { label: 'Store views', value: totalVisits.toLocaleString('en-NG'), note: 'All listings' },
            ].map((stat) => (
              <div key={stat.label} className="bg-jade-950/85 p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-jade-200/55">
                  {stat.label}
                </p>
                <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-white">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-[10px] text-jade-100/45">{stat.note}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-jade-100/55">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Escrow protected — funds release only after the buyer&apos;s delivery PIN is confirmed.
          </p>
        </div>
      </section>

      {/* NEEDS ATTENTION */}
      {attentionItems.length > 0 ? (
        <section aria-labelledby="merchant-attention" className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="merchant-attention" className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-400">
              Needs attention
            </h2>
            <span className="text-[11px] font-semibold text-ink-400">
              {attentionItems.length} open
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {attentionItems.map((item) => {
            const tone =
              item.tone === 'amber'
                ? 'border-amber-500/25 bg-amber-50/70 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-200'
                : item.tone === 'gold'
                  ? 'border-gold-300/40 bg-gold-50/70 text-gold-900 dark:border-gold-300/20 dark:bg-gold-300/5 dark:text-gold-100'
                  : 'border-jade-500/25 bg-jade-50/70 text-jade-900 dark:border-jade-400/20 dark:bg-jade-400/5 dark:text-jade-100';
            const iconTone =
              item.tone === 'amber'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : item.tone === 'gold'
                  ? 'bg-gold-300/25 text-gold-700 dark:text-gold-200'
                  : 'bg-jade-500/15 text-jade-700 dark:text-jade-300';
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={`group flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 text-left transition-all duration-200 ease-glide hover:-translate-y-0.5 ${tone}`}
              >
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconTone}`}>
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold tracking-tight">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed opacity-70">{item.body}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold">
                    {item.action}
                    <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </button>
            );
          })}
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-jade-500/20 bg-jade-50/60 px-4 py-3 text-jade-800 dark:border-jade-400/15 dark:bg-jade-400/5 dark:text-jade-200">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-jade-500/15">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <p className="text-xs font-semibold">
            You&apos;re all caught up — no orders waiting, no stock alerts, and no profile tasks.
          </p>
        </div>
      )}

      {/* PERFORMANCE + COACH */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="flex flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-400">
                Store performance
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2.5">
                <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-ink-950 dark:text-white">
                  {chartMode === 'revenue' ? naira(chart.total) : `${chart.total} orders`}
                </span>
                {chart.delta !== null ? (
                  <span
                    className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      chart.delta >= 0
                        ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                        : 'bg-red-500/10 text-red-700 dark:text-red-300'
                    }`}
                  >
                    {chart.delta >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(chart.delta).toFixed(0)}% vs previous {chart.rangeDays} days
                  </span>
                ) : (
                  <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                    <Minus className="h-3 w-3" />
                    {chart.hasActivity ? 'New activity' : 'No sales yet'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-400">
                {chartMode === 'revenue' ? 'Order value across your store' : 'Orders placed in this period'} · last{' '}
                {chart.rangeDays} days
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                aria-label="Chart metric"
                options={[
                  { value: 'revenue', label: 'Revenue' },
                  { value: 'orders', label: 'Orders' },
                ]}
                value={chartMode}
                onChange={(value) => {
                  setChartMode(value as ChartMode);
                  setHoveredPoint(null);
                }}
              />
              <div className="flex rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
                {(['7days', '30days'] as ChartPeriod[]).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => {
                      setChartPeriod(period);
                      setHoveredPoint(null);
                    }}
                    className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                      chartPeriod === period
                        ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-950 dark:text-white'
                        : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
                    }`}
                  >
                    {period === '7days' ? '7D' : '30D'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative mt-5 flex-1">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="h-44 w-full overflow-visible"
              role="img"
              aria-label={`${chartMode === 'revenue' ? 'Revenue' : 'Orders'} over the last ${chart.rangeDays} days`}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                <linearGradient id="merchantChartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-jade-500)" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="var(--color-jade-500)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[chartTop, (chartTop + chartBase) / 2, chartBase].map((y) => (
                <line
                  key={y}
                  x1={chartLeft}
                  y1={y}
                  x2={chartRight}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                  strokeDasharray={y === chartBase ? undefined : '3 5'}
                  className="text-ink-500"
                />
              ))}

              {chart.hasActivity && areaPath && <path d={areaPath} fill="url(#merchantChartFill)" />}
              <path
                d={
                  chart.hasActivity
                    ? linePath
                    : `M ${chartLeft} ${chartBase} L ${chartRight} ${chartBase}`
                }
                fill="none"
                stroke="var(--color-jade-500)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={chart.hasActivity ? undefined : '6 6'}
                opacity={chart.hasActivity ? 1 : 0.45}
              />

              {points.map((point, index) => (
                <g key={`${point.label}-${index}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hoveredPoint === index ? 5.5 : 3}
                    fill="var(--color-jade-500)"
                    stroke="var(--color-jade-50)"
                    strokeWidth="2"
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredPoint(index)}
                  />
                  <text
                    x={point.x}
                    y={chartHeight - 4}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="9"
                    fontWeight="600"
                    fontFamily="var(--font-mono, monospace)"
                    className="pointer-events-none text-ink-400"
                  >
                    {point.label}
                  </text>
                </g>
              ))}

              {hovered && (
                <g className="pointer-events-none">
                  <rect
                    x={Math.max(chartLeft, Math.min(chartRight - 96, hovered.x - 48))}
                    y={Math.max(0, hovered.y - 38)}
                    width="96"
                    height="26"
                    rx="7"
                    fill="var(--color-ink-950)"
                  />
                  <text
                    x={Math.max(chartLeft, Math.min(chartRight - 96, hovered.x - 48)) + 48}
                    y={Math.max(0, hovered.y - 38) + 16}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="var(--font-mono, monospace)"
                  >
                    {chartMode === 'revenue' ? compactNaira(hovered.value) : `${hovered.value} orders`}
                  </text>
                </g>
              )}
            </svg>

            {!chart.hasActivity && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="rounded-full border border-ink-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-ink-500 backdrop-blur dark:border-ink-700 dark:bg-ink-900/90 dark:text-ink-400">
                  {chartMode === 'revenue'
                    ? 'No paid orders in this period'
                    : 'No orders in this period yet'}
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 text-[11px] text-ink-400 dark:border-ink-800">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-jade-500" />
              Based on your GoodSale order records
            </span>
            <span>
              {chartMode === 'revenue'
                ? 'Revenue counts paid and completed orders'
                : 'Excludes cancelled and refunded orders'}
            </span>
          </div>
        </Card>

        {/* MERCHANT COACH */}
        <Card className="relative overflow-hidden p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-jade-500/10 blur-3xl"
          />
          <div className="relative flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Chip tone="jade" icon={<Sparkles className="h-3.5 w-3.5" />}>
                  Merchant coach
                </Chip>
                <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
                  What to do next
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  A short, practical read on your store — generated from your catalogue and order history.
                </p>
              </div>
            </div>

            <div className="mt-5 flex-1 space-y-3">
              {isAnalyzing ? (
                <div className="flex h-full min-h-[150px] flex-col items-center justify-center gap-2 text-center">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-jade-200 border-t-jade-500 dark:border-ink-700 dark:border-t-jade-400" />
                  <p className="text-xs text-ink-500">Reviewing your catalogue and pricing…</p>
                </div>
              ) : aiInsight ? (
                [
                  ['Sales velocity', aiInsight.salesVelocity],
                  ['Growth move', aiInsight.growthTip],
                  ['Price audit', aiInsight.priceAdjustment],
                  ['Trust', aiInsight.organicBoostChance],
                ]
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-ink-150 bg-ink-50/70 p-3.5 dark:border-ink-800 dark:bg-ink-950/40">
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-400">{label}</p>
                      <p className="mt-1 text-xs font-medium leading-relaxed text-ink-700 dark:text-ink-200">
                        {value}
                      </p>
                    </div>
                  ))
              ) : (
                <ol className="space-y-2.5">
                  {suggestions.map((suggestion, index) => (
                    <li key={suggestion} className="flex gap-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-jade-500/10 font-mono text-[10px] font-bold text-jade-700 dark:text-jade-300">
                        {index + 1}
                      </span>
                      {suggestion}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-5 w-full"
              loading={isAnalyzing}
              onClick={onAnalyze}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiInsight ? 'Run a fresh audit' : 'Audit my store'}
            </Button>
          </div>
        </Card>
      </div>

      {/* ORDERS + INVENTORY */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
            <div>
              <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                Recent orders
              </h3>
              <p className="mt-0.5 text-xs text-ink-400">
                {inTransit > 0
                  ? `${inTransit} order${inTransit === 1 ? '' : 's'} in transit right now`
                  : 'Escrow-protected orders from your store'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTabChange('orders')}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold text-jade-700 transition-colors hover:bg-jade-50 dark:text-jade-300 dark:hover:bg-jade-400/10"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">
                <ReceiptText className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">No orders yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-500">
                Your first escrow order will appear here with its dispatch and delivery steps.
              </p>
              {products.length === 0 && (
                <Button size="sm" className="mt-4" onClick={() => onTabChange('create_listing')}>
                  <Plus className="h-3.5 w-3.5" />
                  Create a listing
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {recentOrders.map((order) => {
                const buyer = users.find((entry) => entry.id === order.buyerId);
                const tone =
                  ORDER_TONES[order.status] ||
                  'border-ink-200 bg-ink-100 text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400';
                return (
                  <li key={order.id} className="flex items-center gap-3.5 px-5 py-3.5">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-ink-150 bg-ink-50 dark:border-ink-800 dark:bg-ink-800">
                      <SmartImage
                        src={order.productImage}
                        alt={order.productTitle}
                        seed={`merchant-order-${order.id}`}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-ink-900 dark:text-white">
                        {order.productTitle}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-ink-400">
                        {order.orderNumber} · {buyer?.fullName || 'Buyer'}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="font-mono text-sm font-semibold tabular-nums text-ink-900 dark:text-white">
                        {naira(order.totalAmount)}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-400">
                        {orderDate(order)?.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <span
                      className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold md:inline-flex ${tone}`}
                    >
                      {ORDER_LABELS[order.status] || order.status.replaceAll('_', ' ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {recentOrders.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-5 py-3 text-[11px] text-ink-400 dark:border-ink-800">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                Escrow releases on buyer PIN
              </span>
              <button
                type="button"
                onClick={() => onTabChange('orders')}
                className="cursor-pointer font-bold text-jade-700 hover:underline dark:text-jade-300"
              >
                Manage orders
              </button>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
            <div>
              <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                Inventory spotlight
              </h3>
              <p className="mt-0.5 text-xs text-ink-400">Your most viewed listings</p>
            </div>
            <button
              type="button"
              onClick={() => onTabChange('inventory')}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold text-jade-700 transition-colors hover:bg-jade-50 dark:text-jade-300 dark:hover:bg-jade-400/10"
            >
              Manage
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {spotlightProducts.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">
                <Package className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">Your catalogue is empty</p>
              <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-ink-500">
                Add a product so buyers can find and order from your store.
              </p>
              <Button size="sm" className="mt-4" onClick={() => onTabChange('create_listing')}>
                <Plus className="h-3.5 w-3.5" />
                New listing
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {spotlightProducts.map((product) => {
                const low =
                  product.stockStatus === 'LOW_STOCK' ||
                  product.stockStatus === 'OUT_OF_STOCK' ||
                  product.quantity <= 3;
                return (
                  <li key={product.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-ink-150 bg-ink-50 dark:border-ink-800 dark:bg-ink-800">
                      <SmartImage
                        src={product.images?.[0]}
                        alt={product.title}
                        seed={`merchant-product-${product.id}`}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-ink-900 dark:text-white">
                        {product.title}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-400">
                        <span className="font-mono">{(product.viewCount || 0).toLocaleString('en-NG')} views</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            low
                              ? 'font-bold text-amber-700 dark:text-amber-300'
                              : 'font-semibold text-jade-700 dark:text-jade-300'
                          }
                        >
                          {STOCK_LABELS[product.stockStatus] || product.stockStatus}
                        </span>
                      </p>
                    </div>
                    <p className="shrink-0 font-mono text-xs font-semibold tabular-nums text-ink-800 dark:text-ink-100">
                      {naira(product.price)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {lowStock.length > 0 && (
            <button
              type="button"
              onClick={() => onTabChange('inventory')}
              className="flex w-full cursor-pointer items-center gap-2 border-t border-amber-500/20 bg-amber-50/60 px-5 py-3 text-left text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-50 dark:bg-amber-400/5 dark:text-amber-200 dark:hover:bg-amber-400/10"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {lowStock.length} listing{lowStock.length === 1 ? '' : 's'} low or out of stock
              <ChevronRight className="ml-auto h-3.5 w-3.5" />
            </button>
          )}
        </Card>
      </div>

      {/* PAYOUTS + READINESS */}
      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
            <div>
              <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                Settlement history
              </h3>
              <p className="mt-0.5 text-xs text-ink-400">
                {payoutHistory.length > 0
                  ? `${naira(totalWithdrawn)} settled across ${payoutHistory.length} payout${payoutHistory.length === 1 ? '' : 's'}`
                  : 'Bank payouts will be listed here'}
              </p>
            </div>
            <button
              type="button"
              onClick={onWithdraw}
              disabled={withdrawableEarnings <= 0}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-ink-200 px-3 text-xs font-bold text-ink-700 transition-colors hover:border-jade-500 hover:text-jade-700 disabled:cursor-not-allowed disabled:opacity-45 dark:border-ink-700 dark:text-ink-200 dark:hover:text-jade-300"
            >
              <Wallet className="h-3.5 w-3.5" />
              Withdraw
            </button>
          </div>

          {latestPayouts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-jade-500/10 text-jade-700 dark:text-jade-300">
                <Landmark className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">No payouts yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-ink-500">
                Completed order earnings become withdrawable here. Settlements go straight to your
                Nigerian bank account.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-100 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-400 dark:border-ink-800">
                    <th className="px-5 py-2.5 font-bold">Reference</th>
                    <th className="px-3 py-2.5 font-bold">Destination</th>
                    <th className="px-3 py-2.5 font-bold">Amount</th>
                    <th className="px-5 py-2.5 text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {latestPayouts.map((payout) => (
                    <tr key={payout.id} className="text-ink-700 dark:text-ink-300">
                      <td className="px-5 py-2.5 font-mono text-[10px] text-ink-500">{payout.transactionId}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold">{payout.bank}</span>
                        <span className="ml-1 font-mono text-[10px] text-ink-400">
                          ·{String(payout.accountNumber || '').slice(-4)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold tabular-nums text-ink-900 dark:text-white">
                        {naira(payout.amount)}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="inline-flex rounded-full border border-jade-500/25 bg-jade-500/10 px-2 py-0.5 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                          {payout.status || 'Completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="border-t border-ink-100 px-5 py-3 font-mono text-[10px] text-ink-400 dark:border-ink-800">
            Settled through the Central Bank NIP network
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                Store readiness
              </h3>
              <p className="mt-0.5 text-xs text-ink-400">The four checks buyers care about</p>
            </div>
            {verified ? (
              <VerifiedBadge
                sellerId={user.id}
                status={profile?.verificationStatus}
                expiresAt={profile?.verificationExpiresAt}
                variant="pill"
                fallbackName={storeName}
              />
            ) : (
              <VerificationStatusChip stage={stage} size="sm" />
            )}
          </div>

          <Meter
            className="mt-4"
            value={completedChecks}
            max={4}
            label={`${completedChecks} of 4 complete`}
            showValue
          />

          <ul className="mt-5 space-y-1">
            {readiness.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={item.action}
                  disabled={item.done}
                  className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                    item.done ? 'cursor-default' : 'cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/60'
                  }`}
                >
                  {item.done ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-jade-600 dark:text-jade-400" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 dark:text-ink-600" />
                  )}
                  <span className="min-w-0">
                    <span
                      className={`block text-xs font-bold ${
                        item.done
                          ? 'text-ink-500 dark:text-ink-400'
                          : 'text-ink-900 dark:text-white'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">
                      {item.hint}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
