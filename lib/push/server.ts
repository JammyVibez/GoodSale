// web-push is CommonJS and exposes no default export, so import the namespace.
import * as webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import {
  buildPushPayload,
  shouldDeliverPushForTopic,
  type PushCategory,
  type PushEventSpec,
  type PushNotificationPayload,
  type PushTopics,
} from './payload';

let vapidInitialized = false;

export function getVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key && key.length >= 20 ? key : null;
}

export function isWebPushConfigured(): boolean {
  const pub = getVapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  return Boolean(pub && priv && priv.length >= 20);
}

function ensureVapidConfigured(): boolean {
  if (!isWebPushConfigured()) return false;
  if (vapidInitialized) return true;
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    (process.env.NEXT_PUBLIC_APP_URL?.startsWith('http')
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'mailto:support@goodsale.ng');
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim();
  const priv = process.env.VAPID_PRIVATE_KEY!.trim();
  webpush.setVapidDetails(subject, pub, priv);
  vapidInitialized = true;
  return true;
}

interface SubscriptionRow {
  id: number;
  profile_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  topics: Partial<PushTopics> | null;
}

export interface PushDispatchSummary {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  pruned: number;
}

export async function sendPushToProfileIds(opts: {
  profileIds: Array<number | null | undefined>;
  payload: PushNotificationPayload;
  category: PushCategory;
}): Promise<PushDispatchSummary> {
  const empty: PushDispatchSummary = {
    configured: isWebPushConfigured(),
    attempted: 0,
    sent: 0,
    failed: 0,
    pruned: 0,
  };

  if (!ensureVapidConfigured()) return empty;

  const uniqueIds = Array.from(
    new Set(
      opts.profileIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)
    )
  );
  if (uniqueIds.length === 0) return empty;

  const admin = createAdminClient();
  if (!admin) return empty;

  const [{ data: profiles }, { data: subscriptions, error }] = await Promise.all([
    admin.from('profiles').select('id, push_enabled').in('id', uniqueIds),
    admin
      .from('push_subscriptions')
      .select('id, profile_id, endpoint, p256dh, auth, topics')
      .in('profile_id', uniqueIds),
  ]);

  if (error) {
    logger.warn('Failed to fetch push subscriptions', { error: error.message });
    return empty;
  }

  const pushEnabledMap = new Map<number, boolean>();
  for (const p of (profiles || []) as Array<{ id: number; push_enabled?: boolean | null }>) {
    pushEnabledMap.set(Number(p.id), p.push_enabled !== false);
  }

  const eligible = ((subscriptions || []) as SubscriptionRow[]).filter((sub) =>
    shouldDeliverPushForTopic(
      sub.topics,
      opts.category,
      pushEnabledMap.get(Number(sub.profile_id)) ?? true
    )
  );

  if (eligible.length === 0) return empty;

  const serializedPayload = JSON.stringify(opts.payload);
  const expiredIds: number[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    eligible.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          serializedPayload,
          { TTL: 3600, urgency: opts.category === 'disputes' ? 'high' : 'normal' }
        );
        sent += 1;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredIds.push(sub.id);
        } else {
          failed += 1;
          logger.warn('Web push delivery error', {
            subscriptionId: sub.id,
            statusCode: statusCode ?? 'unknown',
          });
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', expiredIds);
  }

  return {
    configured: true,
    attempted: eligible.length,
    sent,
    failed,
    pruned: expiredIds.length,
  };
}

export async function notifyOrderPushParticipants(opts: {
  orderId: number;
  buildSpec: (order: {
    orderNumber: string;
    totalAmount: number;
    buyerId: number;
    sellerId: number;
  }) => Array<{ profileId: number; spec: PushEventSpec }>;
}): Promise<void> {
  if (!isWebPushConfigured()) return;
  const admin = createAdminClient();
  if (!admin) return;

  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, total_amount, buyer_id, seller_id')
    .eq('id', opts.orderId)
    .maybeSingle();

  if (!order) return;
  const entries = opts.buildSpec({
    orderNumber: String(order.order_number || `#${order.id}`),
    totalAmount: Number(order.total_amount || 0),
    buyerId: Number(order.buyer_id),
    sellerId: Number(order.seller_id),
  });

  await Promise.allSettled(
    entries.map(({ profileId, spec }) => {
      const payload = buildPushPayload(spec);
      return sendPushToProfileIds({
        profileIds: [profileId],
        payload,
        category: payload.category,
      });
    })
  );
}
