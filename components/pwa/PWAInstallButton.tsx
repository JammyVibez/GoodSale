'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, PlusSquare, Share, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '@/lib/hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'card' | 'compact' | 'row';
  showDesktopFallback?: boolean;
  className?: string;
}

export function PWAInstallButton({
  variant = 'compact',
  showDesktopFallback = false,
  className = '',
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isIOSSafari, isAndroid, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!showGuide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowGuide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showGuide]);

  // Never show an install prompt when already launched as an installed app
  if (isInstalled) {
    if (variant === 'row') {
      return (
        <div
          className={`flex items-center gap-3 rounded-2xl border border-jade-500/20 bg-jade-500/[0.06] px-4 py-3 text-xs text-jade-700 dark:text-jade-300 ${className}`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold">GoodSale App active on this device</span>
        </div>
      );
    }
    return null;
  }

  const canRender = isInstallable || isIOS || showDesktopFallback;
  if (!canRender) return null;

  const handleAction = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) return;
      return;
    }
    setShowGuide(true);
  };

  const buttonLabel = isInstallable
    ? 'Install GoodSale App'
    : isIOS
      ? 'Add to iPhone / iPad'
      : isAndroid
        ? 'Install on Android'
        : 'Install Desktop App';

  const compactLabel = isInstallable
    ? 'Install App'
    : isIOS
      ? 'iOS App'
      : 'Get App';

  return (
    <>
      {variant === 'card' ? (
        <div
          className={`rounded-2xl border border-jade-500/25 bg-jade-500/[0.06] p-4 dark:bg-jade-500/10 ${className}`}
        >
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-jade-600 text-white shadow-sm">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-900 dark:text-white">
                {isIOS ? 'Get the GoodSale iOS App' : 'Use GoodSale as an App'}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-ink-600 dark:text-ink-300">
                {isIOS
                  ? 'Add GoodSale to your Home Screen for full-screen shopping, saved cart access, and native-style navigation.'
                  : 'Install GoodSale for instant launch from your home screen or dock with offline fallback.'}
              </p>
              <button
                type="button"
                onClick={handleAction}
                className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-jade-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-jade-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {buttonLabel}
              </button>
            </div>
          </div>
        </div>
      ) : variant === 'row' ? (
        <button
          type="button"
          onClick={handleAction}
          className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-left transition-colors hover:border-jade-500 dark:border-ink-800 dark:bg-ink-900 cursor-pointer ${className}`}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-jade-500/10 text-jade-700 dark:text-jade-300">
              <Download className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-ink-900 dark:text-white">
                {buttonLabel}
              </span>
              <span className="block truncate text-[11px] text-ink-500 dark:text-ink-400">
                {isIOS ? 'Runs full-screen on iPhone & iPad' : 'Works on desktop, Android & iOS'}
              </span>
            </span>
          </span>
          <span className="rounded-lg bg-jade-600 px-2.5 py-1 text-[11px] font-bold text-white whitespace-nowrap shrink-0">
            Install
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleAction}
          aria-label={buttonLabel}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-jade-600/25 bg-jade-500/10 px-3 py-1.5 text-xs font-bold text-jade-700 transition-colors hover:bg-jade-500/15 dark:border-jade-400/30 dark:text-jade-300 whitespace-nowrap shrink-0 cursor-pointer ${className}`}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{compactLabel}</span>
        </button>
      )}

      {showGuide && mounted && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border border-ink-200 bg-white p-6 pb-safe-bottom shadow-2xl dark:border-ink-800 dark:bg-ink-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-jade-600 text-white">
                  <Smartphone className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2
                    id="pwa-install-title"
                    className="font-display text-lg font-bold text-ink-900 dark:text-white"
                  >
                    {isIOS ? 'Install GoodSale on iOS' : 'Install GoodSale App'}
                  </h2>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Full-screen app experience, zero App Store wait
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-5 space-y-3 text-sm text-ink-700 dark:text-ink-200">
                {!isIOSSafari && (
                  <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200">
                    Open this page in <strong>Safari</strong> on your iPhone or iPad to add GoodSale to your Home Screen.
                  </p>
                )}
                <ol className="space-y-3">
                  <li className="flex items-start gap-3 rounded-2xl border border-ink-150 bg-ink-50/70 p-3 dark:border-ink-800 dark:bg-ink-950/60">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-jade-600 text-xs font-bold text-white">
                      1
                    </span>
                    <div className="text-xs leading-5">
                      Tap the{' '}
                      <span className="inline-flex items-center gap-1 font-bold text-ink-900 dark:text-white">
                        <Share className="h-3.5 w-3.5 text-jade-600" aria-hidden="true" /> Share
                      </span>{' '}
                      button in Safari&apos;s toolbar.
                    </div>
                  </li>
                  <li className="flex items-start gap-3 rounded-2xl border border-ink-150 bg-ink-50/70 p-3 dark:border-ink-800 dark:bg-ink-950/60">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-jade-600 text-xs font-bold text-white">
                      2
                    </span>
                    <div className="text-xs leading-5">
                      Scroll down and tap{' '}
                      <span className="inline-flex items-center gap-1 font-bold text-ink-900 dark:text-white">
                        <PlusSquare className="h-3.5 w-3.5 text-jade-600" aria-hidden="true" /> Add to Home Screen
                      </span>.
                    </div>
                  </li>
                  <li className="flex items-start gap-3 rounded-2xl border border-ink-150 bg-ink-50/70 p-3 dark:border-ink-800 dark:bg-ink-950/60">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-jade-600 text-xs font-bold text-white">
                      3
                    </span>
                    <div className="text-xs leading-5">
                      Tap <strong>Add</strong>. GoodSale opens full-screen from your Home Screen like a native iOS app.
                    </div>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="mt-5 space-y-3 text-xs leading-6 text-ink-600 dark:text-ink-300">
                <p>
                  Use your browser&apos;s address bar install icon or browser menu (<strong>Install GoodSale</strong> / <strong>Add to Dock</strong>) to run GoodSale as a standalone desktop or mobile app.
                </p>
                <p>
                  On iPhone or iPad, open GoodSale in <strong>Safari</strong>, tap <strong>Share</strong>, and choose <strong>Add to Home Screen</strong>.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-ink-900 py-2.5 text-sm font-bold text-white transition-colors hover:bg-ink-800 dark:bg-jade-600 dark:hover:bg-jade-700 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
