'use client';

import type { NotificationPreferenceKey, NotificationPreferences } from './types';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  orders: true,
  payments: true,
  messages: true,
  deliveries: true,
  stock: true,
  promotions: false,
  security: true,
};

export const NOTIFICATION_PREFERENCE_META: Array<{
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}> = [
  { key: 'orders', label: 'Orders', description: 'Order placed, accepted, shipped and completed.' },
  { key: 'payments', label: 'Payments & escrow', description: 'Payment confirmations, escrow releases and refunds.' },
  { key: 'messages', label: 'Messages', description: 'New buyer or seller chat messages.' },
  { key: 'deliveries', label: 'Deliveries', description: 'Courier assignment, dispatch and delivery PIN updates.' },
  { key: 'stock', label: 'Stock alerts', description: 'Low stock and sold-out warnings for your listings.' },
  { key: 'promotions', label: 'Promotions', description: 'Featured listing offers and marketplace campaigns.' },
  { key: 'security', label: 'Security & account', description: 'Verification decisions, disputes and account notices.' },
];

const KEY = 'goodsale:notification_prefs_v1';
const EVENT = 'goodsale:notification_prefs_change';

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function setNotificationPreferences(patch: Partial<NotificationPreferences>): NotificationPreferences {
  const next = { ...getNotificationPreferences(), ...patch };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      // storage may be unavailable — keep the in-memory result
    }
  }
  return next;
}

export function subscribeNotificationPreferences(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** True when the user still wants this class of notification. */
export function notificationAllowed(key: NotificationPreferenceKey) {
  return getNotificationPreferences()[key] !== false;
}
