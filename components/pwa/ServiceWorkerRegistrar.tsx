'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    const updateDisplayMode = () => {
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      document.documentElement.dataset.displayMode = standalone ? 'standalone' : 'browser';
    };

    updateDisplayMode();
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', updateDisplayMode);

    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // Ignore registration errors in restricted preview iframes
        });
    }

    return () => {
      mq?.removeEventListener?.('change', updateDisplayMode);
    };
  }, []);

  return null;
}
