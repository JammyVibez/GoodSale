'use client';

/**
 * Server-backed user settings.
 *
 * All non-profile preferences live in Supabase Auth `user_metadata` (namespaced
 * under `goodsale_settings`) so they persist across devices without needing any
 * new database tables. A localStorage cache keeps the UI instant on reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SavedAddress {
  id: number;
  label: string;
  address: string;
  isDefault: boolean;
}

export interface StaffMember {
  id: number;
  name: string;
  role: string;
  status: string;
}

export interface SupportTicket {
  id: string;
  type: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface UserSettings {
  twoFactorEnabled: boolean;
  biometricsEnabled: boolean;
  profileVisibility: 'public' | 'followers' | 'private';
  hidePhone: boolean;
  hideEmail: boolean;
  onlineStatus: boolean;
  readReceipts: boolean;
  whoCanMessage: 'all' | 'verified' | 'none';
  blockedUsers: string[];
  mutedUsers: string[];
  savedAddresses: SavedAddress[];
  defaultPayment: string;
  savedSearches: string[];
  vacationMode: boolean;
  vacationAutoReply: string;
  inventoryAlertThreshold: number;
  defaultCategory: string;
  defaultDeliveryMethod: string;
  businessHours: string;
  staffList: StaffMember[];
  preferredCourier: string;
  safeMeetPreSel: number | null;
  pickupAddress: string;
  supportTickets: SupportTicket[];
  redeemedVouchers: string[];
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  twoFactorEnabled: false,
  biometricsEnabled: false,
  profileVisibility: 'public',
  hidePhone: false,
  hideEmail: true,
  onlineStatus: true,
  readReceipts: true,
  whoCanMessage: 'all',
  blockedUsers: [],
  mutedUsers: [],
  savedAddresses: [],
  defaultPayment: 'CARD',
  savedSearches: [],
  vacationMode: false,
  vacationAutoReply: '',
  inventoryAlertThreshold: 2,
  defaultCategory: 'ELECTRONICS',
  defaultDeliveryMethod: 'GOODSALE_PARTNER',
  businessHours: '',
  staffList: [],
  preferredCourier: 'GIG Logistics',
  safeMeetPreSel: null,
  pickupAddress: '',
  supportTickets: [],
  redeemedVouchers: [],
};

const CACHE_KEY = 'goodsale_user_settings_v1';

/** Coerce an unknown server payload into a complete, well-typed settings object. */
export function mergeSettings(raw: unknown): UserSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaults = DEFAULT_USER_SETTINGS as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    const defaultValue = defaults[key];
    if (Array.isArray(defaultValue)) {
      if (Array.isArray(value)) merged[key] = value;
      continue;
    }
    if (typeof defaultValue !== typeof value) continue;
    merged[key] = value;
  }
  return merged as unknown as UserSettings;
}

function readCache(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_USER_SETTINGS;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? mergeSettings(JSON.parse(raw)) : DEFAULT_USER_SETTINGS;
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

function writeCache(settings: UserSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    // storage may be unavailable (private mode) — the server copy is canonical
  }
}

export function clearSettingsCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Loads and persists the current user's settings against
 * `/api/account/settings`. Writes are optimistic and reconciled with the
 * server response.
 */
export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(() => readCache());
  const [ready, setReady] = useState(false);
  const settingsRef = useRef<UserSettings>(settings);

  const apply = useCallback((next: UserSettings) => {
    settingsRef.current = next;
    setSettings(next);
    writeCache(next);
  }, []);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/account/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { settings?: unknown };
        if (data?.settings) apply(mergeSettings(data.settings));
      }
    } catch {
      // keep cached values
    } finally {
      setReady(true);
    }
  }, [apply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      apply(next);
      try {
        const res = await fetch('/api/account/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = (await res.json()) as { settings?: unknown };
          if (data?.settings) apply(mergeSettings(data.settings));
          return true;
        }
      } catch {
        // fall through — optimistic value stays cached
      }
      return false;
    },
    [apply]
  );

  return { settings, ready, update, reload };
}
