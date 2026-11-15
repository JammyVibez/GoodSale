// components/offline/OfflineVaultDrawer.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  OFFLINE_VAULT_EVENT,
  clearOfflineQueue,
  readOfflineVault,
  type OfflineVaultState,
} from '@/lib/offline/vault';
import { SmartImage } from '@/components/ui/SmartImage';
import { toast } from '@/lib/feedback';

interface OfflineVaultDrawerProps {
  onNavigate: (view: string, payload?: unknown) => void;
  /** `icon` (default) is the compact round button; `menu` is a full-width menu row. */
  variant?: 'icon' | 'menu';
}

export default function OfflineVaultDrawer({
  onNavigate,
  variant = 'icon',
}: OfflineVaultDrawerProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(true);
  const [vault, setVault] = useState<OfflineVaultState>(() => readOfflineVault());
  const [revealedPinIds, setRevealedPinIds] = useState<number[]>([]);

  const refreshVault = () => setVault(readOfflineVault());

  const openVault = () => {
    refreshVault();
    setOpen(true);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnline(navigator.onLine);
    refreshVault();

    const onOnline = () => {
      setOnline(true);
      refreshVault();
      const current = readOfflineVault();
      if (current.queue.length > 0) {
        clearOfflineQueue();
        refreshVault();
        toast.success('Connection restored — queued offline actions synced.');
      }
    };
    const onOffline = () => {
      setOnline(false);
      refreshVault();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(OFFLINE_VAULT_EVENT, refreshVault);
    window.addEventListener('storage', refreshVault);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(OFFLINE_VAULT_EVENT, refreshVault);
      window.removeEventListener('storage', refreshVault);
    };
  }, []);

  const totalBadge = vault.orders.filter((o) => o.deliveryPin).length;

  const togglePin = (orderId: number) => {
    setRevealedPinIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  return (
    <>
      {variant === 'menu' ? (
        <button
          type="button"
          onClick={openVault}
          aria-label={online ? 'Open offline PIN and saved vault' : 'Offline mode — view saved cart and PIN vault'}
          className="flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-jade-700 dark:text-ink-200 dark:hover:bg-ink-800/80 dark:hover:text-jade-300 cursor-pointer"
        >
          <span className="inline-flex items-center gap-2">
            {online ? (
              <KeyRound className="h-4 w-4 text-jade-600 dark:text-jade-400" aria-hidden="true" />
            ) : (
              <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            )}
            <span>Offline PIN &amp; saved vault</span>
            {totalBadge > 0 && (
              <span className="rounded-full bg-jade-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white dark:bg-gold-300 dark:text-jade-950">
                {totalBadge > 9 ? '9+' : totalBadge}
              </span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openVault}
          aria-label={online ? 'Open offline PIN and saved vault' : 'Offline mode — view saved cart and PIN vault'}
          className={`relative grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-full transition-colors cursor-pointer ${
            online
              ? 'hover:bg-ink-100 text-ink-600 dark:text-ink-200 dark:hover:bg-white/10'
              : 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/40 dark:text-amber-300'
          }`}
        >
          {online ? <KeyRound className="h-[18px] w-[18px]" /> : <WifiOff className="h-[18px] w-[18px]" />}
          {totalBadge > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-jade-600 px-1 text-[9px] font-black leading-none text-white dark:bg-gold-300 dark:text-jade-950">
              {totalBadge > 9 ? '9+' : totalBadge}
            </span>
          )}
        </button>
      )}

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[135] flex justify-end bg-ink-950/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-vault-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex h-full w-full max-w-md flex-col border-l border-ink-200 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-950">
            <div className="flex items-center justify-between border-b border-ink-150 px-5 py-4 dark:border-ink-800">
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-xl ${
                    online
                      ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                </span>
                <div>
                  <h2 id="offline-vault-heading" className="font-display text-sm font-extrabold text-ink-900 dark:text-white">
                    Offline PIN &amp; Saved Vault
                  </h2>
                  <p className="text-[11px] text-ink-500 dark:text-ink-400">
                    {online ? 'Live device mirror ready offline' : 'Offline mode · cached on this device'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close offline vault"
                className="grid h-10 w-10 place-items-center rounded-full text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {vault.queue.length > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs">
                  <span className="font-semibold text-amber-900 dark:text-amber-200">
                    {vault.queue.length} queued offline {vault.queue.length === 1 ? 'action' : 'actions'}
                  </span>
                  {online && (
                    <button
                      type="button"
                      onClick={() => {
                        clearOfflineQueue();
                        refreshVault();
                        toast.success('Offline queue synced.');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" /> Sync now
                    </button>
                  )}
                </div>
              )}

              {/* Active Order PINs */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    Escrow Order &amp; PIN Vault ({vault.orders.length})
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-jade-700 dark:text-jade-300">
                    <ShieldCheck className="h-3.5 w-3.5" /> Offline readable
                  </span>
                </div>

                {vault.orders.length === 0 ? (
                  <p className="rounded-2xl border border-ink-150 bg-ink-50 p-4 text-xs text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
                    No active escrow PINs cached on this device yet. Orders placed while signed in appear here automatically for no-signal handovers.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {vault.orders.map((ord) => {
                      const revealed = revealedPinIds.includes(ord.id);
                      return (
                        <div
                          key={ord.id}
                          className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-[11px] font-bold text-jade-700 dark:text-jade-300">
                                {ord.orderNumber}
                              </p>
                              <p className="line-clamp-1 text-xs font-bold text-ink-900 dark:text-white">
                                {ord.productTitle}
                              </p>
                              <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                                ₦{ord.totalAmount.toLocaleString()} · {ord.status.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>

                          {ord.deliveryPin ? (
                            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-950">
                              <span className="font-mono text-sm font-black tracking-[0.28em] text-ink-900 dark:text-white">
                                {revealed ? ord.deliveryPin : '••••••'}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => togglePin(ord.id)}
                                  aria-label={revealed ? 'Hide delivery PIN' : 'Reveal delivery PIN'}
                                  className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 cursor-pointer"
                                >
                                  {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard
                                      ?.writeText(ord.deliveryPin)
                                      .then(() => toast.success('PIN copied'))
                                      .catch(() => {});
                                  }}
                                  aria-label="Copy delivery PIN"
                                  className="grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 cursor-pointer"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Saved Cart & Wishlist */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  Saved Offline Basket ({vault.cartIds.length} cart · {vault.wishlistIds.length} wishlist)
                </h3>
                {vault.products.length === 0 ? (
                  <p className="rounded-2xl border border-ink-150 bg-ink-50 p-4 text-xs text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
                    Items you add to your cart or wishlist are mirrored here for offline browsing.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {vault.products.map((item) => {
                      const inCart = vault.cartIds.includes(item.id);
                      const inWishlist = vault.wishlistIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onNavigate('product', { id: item.id });
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white p-2.5 text-left hover:border-jade-500/40 dark:border-ink-800 dark:bg-ink-900 cursor-pointer"
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
                            <SmartImage src={item.image} alt={item.title} seed={`ov-${item.id}`} className="h-full w-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-xs font-bold text-ink-900 dark:text-white">{item.title}</p>
                            <p className="text-[11px] font-mono font-bold text-jade-700 dark:text-jade-300">
                              ₦{item.price.toLocaleString()}
                            </p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-ink-500">
                            {inCart && <ShoppingCart className="h-3.5 w-3.5 text-jade-600" />}
                            {inWishlist && <Heart className="h-3.5 w-3.5 fill-jade-600 text-jade-600" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {vault.lastSyncedAt && (
              <div className="border-t border-ink-150 px-5 py-3 text-[11px] text-ink-400 dark:border-ink-800">
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-jade-600" />
                  Last synced {new Date(vault.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
