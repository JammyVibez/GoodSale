'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PUSH_TOPICS,
  urlBase64ToUint8Array,
  type PushTopics,
} from '@/lib/push/payload';
import { detectInstallPlatform } from '@/lib/pwa/install';

export interface WebPushState {
  loading: boolean;
  busy: boolean;
  isSupported: boolean;
  isConfigured: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  requiresIOSHomeScreen: boolean;
  subscriptionCount: number;
  topics: PushTopics;
  error: string | null;
}

const INITIAL_STATE: WebPushState = {
  loading: true,
  busy: false,
  isSupported: false,
  isConfigured: false,
  permission: 'default',
  isSubscribed: false,
  requiresIOSHomeScreen: false,
  subscriptionCount: 0,
  topics: DEFAULT_PUSH_TOPICS,
  error: null,
};

function detectPlatformSlug(): 'ios' | 'android' | 'desktop' | 'web' {
  if (typeof navigator === 'undefined') return 'web';
  const info = detectInstallPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    displayModeStandalone:
      typeof window !== 'undefined' &&
      window.matchMedia?.('(display-mode: standalone)').matches,
    navigatorStandalone:
      typeof window !== 'undefined' &&
      Boolean((window.navigator as { standalone?: boolean }).standalone),
  });
  if (info.isIOS) return 'ios';
  if (info.isAndroid) return 'android';
  if (info.isDesktop) return 'desktop';
  return 'web';
}

export function useWebPush(enabled: boolean) {
  const [state, setState] = useState<WebPushState>(INITIAL_STATE);
  const [publicKey, setPublicKey] = useState<string | null>(
    () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null
  );

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const installInfo = detectInstallPlatform({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches,
      navigatorStandalone: Boolean((window.navigator as { standalone?: boolean }).standalone),
    });

    const requiresIOSHomeScreen = installInfo.isIOS && !installInfo.isInstalled;
    const hasApis =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    const permission: NotificationPermission | 'unsupported' =
      'Notification' in window ? Notification.permission : 'unsupported';

    let browserSubscribed = false;
    if (hasApis) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        browserSubscribed = Boolean(sub);
      } catch {
        browserSubscribed = false;
      }
    }

    try {
      const res = await fetch('/api/push/subscribe', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      const serverPublicKey =
        typeof json?.publicKey === 'string' && json.publicKey
          ? json.publicKey
          : process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
      setPublicKey(serverPublicKey);

      setState((prev) => ({
        ...prev,
        loading: false,
        isSupported: hasApis,
        isConfigured: Boolean(json?.configured && serverPublicKey),
        permission,
        isSubscribed: Boolean(
          hasApis && permission === 'granted' && (browserSubscribed || json?.subscribed)
        ),
        requiresIOSHomeScreen,
        subscriptionCount: Number(json?.subscriptionCount || 0),
        topics: json?.topics
          ? {
              escrow: json.topics.escrow !== false,
              disputes: json.topics.disputes !== false,
              messages: json.topics.messages !== false,
            }
          : DEFAULT_PUSH_TOPICS,
        error: null,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        isSupported: hasApis,
        permission,
        isSubscribed: Boolean(hasApis && permission === 'granted' && browserSubscribed),
        requiresIOSHomeScreen,
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [enabled, refresh]);

  const subscribe = useCallback(
    async (nextTopics?: PushTopics): Promise<{ ok: boolean; error?: string }> => {
      if (typeof window === 'undefined') {
        return { ok: false, error: 'Browser environment required.' };
      }

      if (state.requiresIOSHomeScreen) {
        const msg =
          'On iPhone and iPad, tap Share → Add to Home Screen first to receive Web Push alerts.';
        setState((prev) => ({ ...prev, error: msg }));
        return { ok: false, error: msg };
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        const msg = 'This browser does not support Web Push notifications.';
        setState((prev) => ({ ...prev, error: msg }));
        return { ok: false, error: msg };
      }

      const key = publicKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
      if (!state.isConfigured || !key) {
        const msg =
          'Web Push VAPID keys are not configured on this server yet. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable live device delivery.';
        setState((prev) => ({ ...prev, error: msg }));
        return { ok: false, error: msg };
      }

      setState((prev) => ({ ...prev, busy: true, error: null }));
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          const msg =
            permission === 'denied'
              ? 'Notifications are blocked in your browser site settings. Allow notifications for this site and try again.'
              : 'Notification permission prompt was dismissed.';
          setState((prev) => ({ ...prev, busy: false, permission, error: msg }));
          return { ok: false, error: msg };
        }

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const applicationServerKey = urlBase64ToUint8Array(key);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
          });
        }

        const serialized = subscription.toJSON();
        const topicsToSave = nextTopics || state.topics;
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: serialized.endpoint,
            keys: serialized.keys,
            platform: detectPlatformSlug(),
            topics: topicsToSave,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          const msg = json?.error || 'Could not save push subscription.';
          setState((prev) => ({ ...prev, busy: false, permission, error: msg }));
          return { ok: false, error: msg };
        }

        await refresh();
        setState((prev) => ({ ...prev, busy: false }));
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not enable Web Push.';
        setState((prev) => ({ ...prev, busy: false, error: msg }));
        return { ok: false, error: msg };
      }
    },
    [publicKey, refresh, state.isConfigured, state.requiresIOSHomeScreen, state.topics]
  );

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      let endpoint: string | undefined;
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe();
        }
      }

      const res = await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        const msg = json?.error || 'Could not disable push alerts.';
        setState((prev) => ({ ...prev, busy: false, error: msg }));
        return { ok: false, error: msg };
      }

      await refresh();
      setState((prev) => ({ ...prev, busy: false }));
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not disable push alerts.';
      setState((prev) => ({ ...prev, busy: false, error: msg }));
      return { ok: false, error: msg };
    }
  }, [refresh]);

  const updateTopics = useCallback(
    async (patch: Partial<PushTopics>): Promise<{ ok: boolean; error?: string }> => {
      const next: PushTopics = { ...state.topics, ...patch };
      setState((prev) => ({ ...prev, topics: next, error: null }));
      try {
        const res = await fetch('/api/push/subscribe', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topics: next }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          return { ok: false, error: json?.error || 'Could not update alert topics.' };
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not update alert topics.',
        };
      }
    },
    [state.topics]
  );

  const sendTestPush = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setState((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      setState((prev) => ({ ...prev, busy: false }));
      if (!res.ok || !json?.success) {
        return { ok: false, error: json?.error || 'Could not send test alert.' };
      }
      return { ok: true };
    } catch (err) {
      setState((prev) => ({ ...prev, busy: false }));
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not send test alert.',
      };
    }
  }, []);

  return {
    ...state,
    refresh,
    subscribe,
    unsubscribe,
    updateTopics,
    sendTestPush,
  };
}
