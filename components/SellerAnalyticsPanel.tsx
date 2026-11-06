// components/SellerAnalyticsPanel.tsx
'use client';

import React, { useMemo } from 'react';
import {
  Eye, MousePointerClick, Heart, ShoppingCart, PackageCheck, Wallet,
  Star, MessageSquare, TrendingUp, Megaphone, AlertTriangle, ArrowUpRight,
} from 'lucide-react';
import { useDBState } from '../lib/store';
import { computeSellerTrust } from '../lib/trust';
import { OrderStatus } from '../lib/types';

interface SellerAnalyticsPanelProps {
  sellerId: number;
  onNavigate?: (view: string, payload?: unknown) => void;
}

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function SellerAnalyticsPanel({ sellerId, onNavigate }: SellerAnalyticsPanelProps) {
  const db = useDBState();

  const data = useMemo(() => {
    const products = db.products.filter((p) => p.sellerId === sellerId);
    const orders = db.orders.filter((o) => o.sellerId === sellerId);
    const delivered = orders.filter((o) => o.status === OrderStatus.DELIVERED_SUCCESS);
    const pending = orders.filter((o) =>
      [OrderStatus.PENDING, OrderStatus.PENDING_BANK_TRANSFER, OrderStatus.PAID_ESCROW, OrderStatus.PARTIAL_DEPOSIT_PAID].includes(o.status)
    );
    const reviews = db.reviews.filter((r) => r.revieweeId === sellerId && r.rating > 0);

    const impressions = products.reduce((s, p) => s + (p.impressions || 0), 0);
    const views = products.reduce((s, p) => s + (p.viewCount || 0), 0);
    const likes = products.reduce((s, p) => s + (p.likes || 0), 0);
    const cartAdds = products.reduce((s, p) => s + (p.cartAdds || 0), 0);
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);
    const escrowHeld = orders
      .filter((o) => [OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.PARTIAL_DEPOSIT_PAID].includes(o.status))
      .reduce((s, o) => s + o.totalAmount, 0);

    const ads = db.sponsoredAds.filter((a) => a.sellerId === sellerId);
    const featured = db.featuredListings.filter((f) => f.sellerId === sellerId);
    const adImpressions = ads.reduce((s, a) => s + (a.impressions || 0), 0);
    const adClicks = ads.reduce((s, a) => s + (a.clicks || 0), 0);
    const adSpend = ads.reduce((s, a) => s + (a.spent || 0), 0);

    const stock = {
      available: products.filter((p) => p.stockStatus === 'IN_STOCK').length,
      low: products.filter((p) => p.stockStatus === 'LOW_STOCK').length,
      out: products.filter((p) => p.stockStatus === 'OUT_OF_STOCK').length,
      sold: products.filter((p) => p.stockStatus === 'SOLD').length,
      unavailable: products.filter((p) => p.stockStatus === 'UNAVAILABLE').length,
    };

    const topProducts = [...products]
      .sort((a, b) => (b.impressions || 0) + (b.viewCount || 0) * 2 - ((a.impressions || 0) + (a.viewCount || 0) * 2))
      .slice(0, 6);

    return {
      products,
      orders,
      delivered,
      pending,
      reviews,
      impressions,
      views,
      likes,
      cartAdds,
      revenue,
      escrowHeld,
      ads,
      featured,
      adImpressions,
      adClicks,
      adSpend,
      stock,
      topProducts,
      rating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0,
    };
  }, [db, sellerId]);

  const trust = useMemo(() => computeSellerTrust(db, sellerId), [db, sellerId]);

  const funnel = [
    { label: 'Impressions', value: data.impressions, Icon: Eye, tone: 'bg-jade-500' },
    { label: 'Listing views', value: data.views, Icon: MousePointerClick, tone: 'bg-jade-600' },
    { label: 'Cart additions', value: data.cartAdds, Icon: ShoppingCart, tone: 'bg-gold-500' },
    { label: 'Orders', value: data.orders.length, Icon: PackageCheck, tone: 'bg-jade-800' },
  ];
  const funnelMax = Math.max(funnel[0].value, 1);

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Impressions', value: compact(data.impressions), sub: 'Card appearances', Icon: Eye },
          { label: 'Listing views', value: compact(data.views), sub: 'Product page opens', Icon: MousePointerClick },
          { label: 'Likes & saves', value: compact(data.likes), sub: 'Buyer intent', Icon: Heart },
          { label: 'Cart additions', value: compact(data.cartAdds), sub: 'Ready to buy', Icon: ShoppingCart },
          { label: 'Completed orders', value: compact(data.delivered.length), sub: `${data.pending.length} in progress`, Icon: PackageCheck },
          { label: 'Escrow revenue', value: naira(data.revenue), sub: 'Released after delivery', Icon: Wallet },
          { label: 'Average rating', value: data.reviews.length ? data.rating.toFixed(1) : '—', sub: `${data.reviews.length} reviews`, Icon: Star },
          { label: 'Trust score', value: `${trust.score}`, sub: trust.bandLabel, Icon: TrendingUp },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{kpi.label}</p>
              <kpi.Icon className="h-3.5 w-3.5 text-ink-300" />
            </div>
            <p className="mt-2 font-display text-xl font-bold tracking-tight text-ink-900 dark:text-white">{kpi.value}</p>
            <p className="mt-0.5 text-[10px] text-ink-400">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Funnel */}
        <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Buyer journey</h3>
            <span className="text-[10px] font-semibold text-ink-400">Last recorded period</span>
          </div>
          <ul className="mt-4 space-y-3.5">
            {funnel.map((step) => (
              <li key={step.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-ink-600 dark:text-ink-300">
                    <step.Icon className="h-3.5 w-3.5 text-ink-400" /> {step.label}
                  </span>
                  <span className="font-bold tabular-nums text-ink-900 dark:text-white">{step.value.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className={`h-full rounded-full ${step.tone}`} style={{ width: `${Math.max(step.value / funnelMax * 100, step.value ? 4 : 0)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
            Impressions are recorded when your listing card is shown; views when a shopper opens the product page.
            Both counters are written by the marketplace, not self-reported.
          </p>
        </div>

        {/* Inventory + reliability */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Inventory health</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'Available', value: data.stock.available, cls: 'text-jade-700 dark:text-jade-300 bg-jade-500/10' },
                { label: 'Low stock', value: data.stock.low, cls: 'text-gold-700 dark:text-gold-300 bg-gold-400/15' },
                { label: 'Out of stock', value: data.stock.out, cls: 'text-orange-700 dark:text-orange-300 bg-orange-500/10' },
                { label: 'Sold', value: data.stock.sold, cls: 'text-ink-600 dark:text-ink-300 bg-ink-100 dark:bg-ink-800' },
                { label: 'Unavailable', value: data.stock.unavailable, cls: 'text-ink-500 dark:text-ink-400 bg-ink-100 dark:bg-ink-800' },
              ].map((s) => (
                <div key={s.label} className={`rounded-xl px-3 py-2 ${s.cls}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide">{s.label}</p>
                  <p className="mt-0.5 text-lg font-bold">{s.value}</p>
                </div>
              ))}
            </div>
            {(data.stock.low > 0 || data.stock.out > 0) && (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-orange-600 dark:text-orange-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Restock low or out-of-stock items to stay visible in search.
              </p>
            )}
            <button
              onClick={() => onNavigate?.('dashboard')}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-jade-700 dark:text-jade-300 cursor-pointer"
            >
              Manage inventory <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-900 dark:text-white">Fulfilment &amp; service</h3>
              <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-bold text-gold-700 dark:text-gold-300">{trust.bandLabel}</span>
            </div>
            <ul className="mt-3 space-y-2 text-xs">
              {[
                { label: 'Delivered orders', value: trust.completedOrders, Icon: PackageCheck },
                { label: 'Cancellations', value: trust.cancelledOrders, Icon: AlertTriangle },
                { label: 'Disputes', value: trust.disputes, Icon: MessageSquare },
                { label: 'Reply rate', value: `${trust.responseRate}%`, Icon: MessageSquare },
                { label: 'Escrow in progress', value: naira(data.escrowHeld), Icon: Wallet },
              ].map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-950">
                  <span className="flex items-center gap-1.5 text-ink-500 dark:text-ink-400"><r.Icon className="h-3.5 w-3.5" /> {r.label}</span>
                  <span className="font-bold text-ink-900 dark:text-white">{r.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Promotions */}
      <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
              <Megaphone className="h-4 w-4 text-gold-500" /> Promotion performance
            </h3>
            <p className="mt-1 text-[11px] text-ink-400">Featured listings and sponsored placements bought from the Revenue Centre.</p>
          </div>
          <button
            onClick={() => onNavigate?.('revenue')}
            className="rounded-xl bg-jade-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-jade-700 cursor-pointer"
          >
            Buy a promotion
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Promoted impressions', value: data.adImpressions.toLocaleString() },
            { label: 'Promoted clicks', value: data.adClicks.toLocaleString() },
            { label: 'Click-through rate', value: data.adImpressions ? `${Math.round((data.adClicks / data.adImpressions) * 1000) / 10}%` : '—' },
            { label: 'Promotion spend', value: naira(data.adSpend) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-ink-150 px-3 py-2.5 dark:border-ink-800">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{s.label}</p>
              <p className="mt-1 text-sm font-bold text-ink-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Featured listings</p>
            {data.featured.length === 0 ? (
              <p className="mt-2 rounded-xl bg-ink-50 px-3 py-2.5 text-[11px] text-ink-400 dark:bg-ink-950">No featured listings yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.featured.slice(0, 4).map((f) => {
                  const product = db.products.find((p) => p.id === f.productId);
                  const active = f.status === 'ACTIVE' && new Date(f.expiresAt).getTime() > Date.now();
                  return (
                    <li key={f.id} className="flex items-center justify-between rounded-xl border border-ink-150 px-3 py-2 text-[11px] dark:border-ink-800">
                      <span className="min-w-0 truncate font-semibold text-ink-700 dark:text-ink-200">{product?.title || `Listing #${f.productId}`}</span>
                      <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 font-bold ${active ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'}`}>
                        {active ? `${Math.max(1, Math.ceil((new Date(f.expiresAt).getTime() - Date.now()) / 86400000))}d left` : 'Expired'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Sponsored campaigns</p>
            {data.ads.length === 0 ? (
              <p className="mt-2 rounded-xl bg-ink-50 px-3 py-2.5 text-[11px] text-ink-400 dark:bg-ink-950">No campaigns running.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.ads.slice(0, 4).map((ad) => (
                  <li key={ad.id} className="rounded-xl border border-ink-150 px-3 py-2 dark:border-ink-800">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="min-w-0 truncate font-semibold text-ink-700 dark:text-ink-200">{ad.title}</span>
                      <span className="ml-2 shrink-0 font-bold uppercase text-ink-400">{ad.status}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-ink-400">
                      {ad.impressions.toLocaleString()} impressions · {ad.clicks.toLocaleString()} clicks · {naira(ad.spent)} / {naira(ad.budget)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Top products */}
      <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <h3 className="text-sm font-bold text-ink-900 dark:text-white">Listing performance</h3>
          <span className="text-[10px] font-semibold text-ink-400">{data.products.length} listings</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-ink-50 text-[10px] uppercase tracking-wider text-ink-400 dark:bg-ink-950">
              <tr>
                <th className="px-4 py-2.5 font-bold">Listing</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 text-right font-bold">Impr.</th>
                <th className="px-4 py-2.5 text-right font-bold">Views</th>
                <th className="px-4 py-2.5 text-right font-bold">Cart</th>
                <th className="px-4 py-2.5 text-right font-bold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {data.topProducts.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">No listings yet.</td></tr>
              )}
              {data.topProducts.map((p) => (
                <tr key={p.id}>
                  <td className="max-w-[220px] truncate px-4 py-3 font-semibold text-ink-800 dark:text-ink-100">{p.title}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                      {p.stockStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-500 dark:text-ink-400">{p.impressions || 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-500 dark:text-ink-400">{p.viewCount || 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-500 dark:text-ink-400">{p.cartAdds || 0}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-800 dark:text-ink-100">{naira(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent reviews */}
      <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <h3 className="text-sm font-bold text-ink-900 dark:text-white">Recent customer reviews</h3>
        {data.reviews.length === 0 ? (
          <p className="mt-3 rounded-xl bg-ink-50 px-3 py-3 text-[11px] text-ink-400 dark:bg-ink-950">
            Reviews appear after buyers confirm delivery. Every review is tied to a real escrow order.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...data.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map((r) => (
              <li key={r.id} className="rounded-xl border border-ink-150 px-3 py-2.5 dark:border-ink-800">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-gold-500">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-3 w-3 ${i < r.rating ? 'fill-current' : 'text-ink-200 dark:text-ink-700'}`} />)}
                  </span>
                  <span className="text-[10px] text-ink-400">{new Date(r.createdAt).toLocaleDateString('en-NG')}</span>
                </div>
                {r.comment && <p className="mt-1 line-clamp-2 text-[11px] text-ink-500 dark:text-ink-400">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
