'use client';

import { readRecentAdClick } from '@/components/AdSlot';

type OrderLike = { id: number; productId?: number };

/**
 * Record one server-verified conversion for the most recent sponsored click.
 * The API re-reads the buyer and order value; the browser never supplies money.
 */
export async function recordSponsoredConversion(orders: OrderLike[]) {
  if (typeof window === 'undefined' || !orders.length) return;
  const click = readRecentAdClick();
  if (!click) return;
  const order = orders.find((entry) => click.targetId > 0 && entry.productId === click.targetId) || orders[0];
  if (!order?.id) return;

  try {
    const res = await fetch('/api/ads/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId: click.adId, type: 'CONVERSION', orderId: order.id }),
    });
    if (res.ok) window.sessionStorage.removeItem('goodsale_ad_click');
  } catch {
    // Attribution is best-effort; it never affects order placement.
  }
}
