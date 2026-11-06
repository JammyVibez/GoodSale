'use client';

import { createClient } from '@/lib/supabase/client';

export type ProductMetric = 'view' | 'impression' | 'like' | 'cart';

/**
 * Fire-and-forget counters used by seller analytics. The database exposes a
 * narrow security-definer function (migration 017) so shoppers cannot write
 * any other product field. Failures are silent: analytics must never block
 * browsing or checkout.
 */
export function trackProductMetric(productId: number, metric: ProductMetric, oncePerSession = false) {
  if (typeof window === 'undefined' || !productId) return;
  const key = `goodsale:metric:${metric}:${productId}`;
  if (oncePerSession) {
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // private mode — still count the event
    }
  }
  const client = createClient();
  if (!client) return;
  void client
    .rpc('increment_product_metric', { p_product_id: productId, p_metric: metric })
    .then(() => {}, () => {});
}
