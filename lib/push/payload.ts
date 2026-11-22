export type PushCategory = 'escrow' | 'disputes' | 'messages';

export interface PushTopics {
  escrow: boolean;
  disputes: boolean;
  messages: boolean;
}

export const DEFAULT_PUSH_TOPICS: PushTopics = {
  escrow: true,
  disputes: true,
  messages: true,
};

export interface PushNotificationPayload {
  title: string;
  body: string;
  url: string;
  category: PushCategory;
  tag: string;
  icon: string;
  badge: string;
  requireInteraction?: boolean;
}

export type PushEventSpec =
  | {
      kind: 'ESCROW_LOCKED';
      orderNumber: string;
      amountNaira?: number;
      recipientRole: 'buyer' | 'seller';
    }
  | {
      kind: 'ESCROW_RELEASED';
      orderNumber: string;
      amountNaira?: number;
      recipientRole: 'buyer' | 'seller';
    }
  | {
      kind: 'ESCROW_STATUS';
      orderNumber: string;
      status: 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'CANCELLED' | 'DELIVERY_CONFIRMED';
      recipientRole: 'buyer' | 'seller';
    }
  | {
      kind: 'DISPUTE_OPENED';
      orderNumber: string;
      reason?: string;
    }
  | {
      kind: 'DISPUTE_RESOLVED';
      orderNumber: string;
      resolution: 'REFUND_BUYER' | 'RELEASE_SELLER';
      recipientRole: 'buyer' | 'seller';
    }
  | {
      kind: 'CHAT_MESSAGE';
      roomId: number;
      senderName: string;
      preview: string;
    }
  | {
      kind: 'TEST';
      userName?: string;
    };

export interface ValidatedPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: 'web' | 'ios' | 'android' | 'desktop';
  topics: PushTopics;
}

function formatNaira(amount?: number): string {
  if (!Number.isFinite(amount) || !amount || amount <= 0) return '';
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

function truncateText(text: string, maxLength = 120): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function sanitizePushUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  return trimmed;
}

export function normalizePushTopics(input?: Partial<PushTopics> | null): PushTopics {
  return {
    escrow: input?.escrow !== false,
    disputes: input?.disputes !== false,
    messages: input?.messages !== false,
  };
}

export function shouldDeliverPushForTopic(
  topics: Partial<PushTopics> | null | undefined,
  category: PushCategory,
  pushEnabled = true
): boolean {
  if (!pushEnabled) return false;
  const normalized = normalizePushTopics(topics);
  return normalized[category] !== false;
}

export function buildPushPayload(spec: PushEventSpec): PushNotificationPayload {
  const icon = '/pwa-192x192.png';
  const badge = '/pwa-192x192.png';

  switch (spec.kind) {
    case 'ESCROW_LOCKED': {
      const amount = formatNaira(spec.amountNaira);
      const amountPart = amount ? `${amount} is ` : 'Funds are ';
      return {
        category: 'escrow',
        title:
          spec.recipientRole === 'seller'
            ? `New escrow order ${spec.orderNumber}`
            : `Escrow secured — ${spec.orderNumber}`,
        body:
          spec.recipientRole === 'seller'
            ? `${amountPart}held safely in escrow. Prepare item for dispatch.`
            : `${amountPart}protected in escrow until you confirm delivery.`,
        url: spec.recipientRole === 'seller' ? '/?view=dashboard' : '/?view=buyer-profile',
        tag: `escrow-${spec.orderNumber}`,
        icon,
        badge,
      };
    }

    case 'ESCROW_RELEASED': {
      const amount = formatNaira(spec.amountNaira);
      return {
        category: 'escrow',
        title:
          spec.recipientRole === 'seller'
            ? `Escrow released — ${spec.orderNumber}`
            : `Delivery complete — ${spec.orderNumber}`,
        body:
          spec.recipientRole === 'seller'
            ? `${amount ? `${amount} has been ` : 'Funds have been '}credited to your GoodSale wallet.`
            : `Escrow released for order ${spec.orderNumber}. Leave a review to earn GoodPoints.`,
        url: spec.recipientRole === 'seller' ? '/?view=wallet' : '/?view=buyer-profile',
        tag: `escrow-release-${spec.orderNumber}`,
        icon,
        badge,
      };
    }

    case 'ESCROW_STATUS': {
      if (spec.status === 'OUT_FOR_DELIVERY') {
        return {
          category: 'escrow',
          title: `Out for delivery — ${spec.orderNumber}`,
          body: 'Your rider is on the way. Keep your delivery confirmation PIN ready.',
          url: '/?view=buyer-profile',
          tag: `delivery-${spec.orderNumber}`,
          icon,
          badge,
        };
      }
      if (spec.status === 'SHIPPED') {
        return {
          category: 'escrow',
          title: `Order shipped — ${spec.orderNumber}`,
          body: 'Your seller marked this order as shipped. Track live updates inside GoodSale.',
          url: '/?view=buyer-profile',
          tag: `delivery-${spec.orderNumber}`,
          icon,
          badge,
        };
      }
      if (spec.status === 'DELIVERY_CONFIRMED') {
        return {
          category: 'escrow',
          title:
            spec.recipientRole === 'buyer'
              ? `Delivery handed over — ${spec.orderNumber}`
              : `Buyer handover confirmed — ${spec.orderNumber}`,
          body:
            spec.recipientRole === 'buyer'
              ? 'Rider confirmed delivery code. Confirm receipt to release escrow funds.'
              : 'Delivery handover code verified. Escrow awaits final buyer confirmation.',
          url: spec.recipientRole === 'buyer' ? '/?view=buyer-profile' : '/?view=dashboard',
          tag: `delivery-${spec.orderNumber}`,
          icon,
          badge,
        };
      }
      return {
        category: 'escrow',
        title: `Order cancelled — ${spec.orderNumber}`,
        body: 'This order was cancelled before fulfillment.',
        url: '/?view=buyer-profile',
        tag: `order-${spec.orderNumber}`,
        icon,
        badge,
      };
    }

    case 'DISPUTE_OPENED': {
      const reasonPreview = spec.reason ? ` Reason: ${truncateText(spec.reason, 80)}` : '';
      return {
        category: 'disputes',
        title: `Escrow dispute opened — ${spec.orderNumber}`,
        body: `Escrow funds remain frozen while Trust & Safety reviews the case.${reasonPreview}`,
        url: '/?view=trust-safety',
        tag: `dispute-${spec.orderNumber}`,
        icon,
        badge,
        requireInteraction: true,
      };
    }

    case 'DISPUTE_RESOLVED': {
      const refunded = spec.resolution === 'REFUND_BUYER';
      return {
        category: 'disputes',
        title: `Dispute resolved — ${spec.orderNumber}`,
        body: refunded
          ? spec.recipientRole === 'buyer'
            ? 'Arbitration ruled in your favor. Your escrow refund is being processed.'
            : 'Arbitration ruled to refund the buyer from held escrow.'
          : spec.recipientRole === 'seller'
            ? 'Arbitration ruled in your favor. Escrow funds have been released to your wallet.'
            : 'Arbitration ruled to release held escrow funds to the seller.',
        url: spec.recipientRole === 'seller' ? '/?view=wallet' : '/?view=trust-safety',
        tag: `dispute-resolved-${spec.orderNumber}`,
        icon,
        badge,
        requireInteraction: true,
      };
    }

    case 'CHAT_MESSAGE': {
      const sender = spec.senderName.trim() || 'GoodSale member';
      const body = truncateText(spec.preview || 'Sent you a message', 120);
      return {
        category: 'messages',
        title: sender,
        body,
        url: `/?view=chats&roomId=${spec.roomId}`,
        tag: `chat-room-${spec.roomId}`,
        icon,
        badge,
      };
    }

    case 'TEST': {
      return {
        category: 'escrow',
        title: 'GoodSale Push Alerts Active',
        body: spec.userName
          ? `Hi ${spec.userName}, real-time escrow, dispute, and chat alerts are enabled on this device.`
          : 'Real-time escrow, dispute, and chat alerts are enabled on this device.',
        url: '/?view=settings',
        tag: 'goodsale-push-test',
        icon,
        badge,
      };
    }
  }
}

export function validatePushSubscriptionInput(
  raw: unknown
): { ok: true; data: ValidatedPushSubscription } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid subscription payload' };
  }
  const obj = raw as Record<string, unknown>;
  const endpointRaw = typeof obj.endpoint === 'string' ? obj.endpoint.trim() : '';
  if (!endpointRaw || endpointRaw.length > 2048) {
    return { ok: false, error: 'Valid push endpoint URL is required' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpointRaw);
  } catch {
    return { ok: false, error: 'Push endpoint must be a valid URL' };
  }

  const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
  if (parsedUrl.protocol !== 'https:' && !isLocalhost) {
    return { ok: false, error: 'Push endpoint must use HTTPS' };
  }

  const keys = obj.keys as Record<string, unknown> | undefined;
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : '';
  if (!p256dh || p256dh.length < 16 || !auth || auth.length < 8) {
    return { ok: false, error: 'Valid subscription encryption keys are required' };
  }

  const platformRaw = typeof obj.platform === 'string' ? obj.platform.toLowerCase() : 'web';
  const platform: ValidatedPushSubscription['platform'] =
    platformRaw === 'ios' ||
    platformRaw === 'android' ||
    platformRaw === 'desktop'
      ? platformRaw
      : 'web';

  const topics = normalizePushTopics(
    obj.topics && typeof obj.topics === 'object'
      ? (obj.topics as Partial<PushTopics>)
      : undefined
  );

  return {
    ok: true,
    data: {
      endpoint: parsedUrl.toString(),
      p256dh,
      auth,
      platform,
      topics,
    },
  };
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const normalized = base64String.trim();
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/');

  if (typeof atob === 'function') {
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  return Uint8Array.from(Buffer.from(base64, 'base64'));
}
