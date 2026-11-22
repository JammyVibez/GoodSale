'use client';

import { useCallback, useEffect, useState } from 'react';
import { detectInstallPlatform, type InstallPlatformInfo } from '@/lib/pwa/install';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DEFAULT_PLATFORM: InstallPlatformInfo = {
  isInstalled: false,
  isIOS: false,
  isIPadOS: false,
  isIOSSafari: false,
  isAndroid: false,
  isDesktop: true,
  platformLabel: 'Desktop',
};

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<InstallPlatformInfo>(DEFAULT_PLATFORM);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');

    const refreshPlatform = () => {
      setPlatform(
        detectInstallPlatform({
          userAgent: window.navigator.userAgent || '',
          maxTouchPoints: window.navigator.maxTouchPoints || 0,
          displayModeStandalone: mediaQuery?.matches ?? false,
          navigatorStandalone:
            (window.navigator as unknown as { standalone?: boolean }).standalone === true,
        })
      );
    };

    refreshPlatform();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setPlatform((prev) => ({
        ...prev,
        isInstalled: true,
        platformLabel: 'Installed App',
      }));
    };

    mediaQuery?.addEventListener?.('change', refreshPlatform);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery?.removeEventListener?.('change', refreshPlatform);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setPlatform((prev) => ({
        ...prev,
        isInstalled: true,
        platformLabel: 'Installed App',
      }));
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    ...platform,
    install,
  };
}
