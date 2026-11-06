// components/MarketplaceHeader.tsx
'use client';

/**
 * App header — the marketplace layout: brand logo on the left, notifications,
 * wishlist and avatar on the right, then a second row with the location pill,
 * product search and the cart badge. It is rendered on every view.
 *
 * Two skins, one bar: a clean white bar with ink text in light mode, and the
 * deep-jade bar with gold accents in dark mode.
 */
import React, { useMemo, useState } from 'react';
import {
  Search, ShoppingCart, Bell, Heart, MapPin, X, ChevronDown, CheckCheck,
  User as UserIcon,
} from 'lucide-react';
import { dbOperations, useDBState } from '../lib/store';
import { SmartAvatar } from './ui/SmartImage';
import Logo from './LogoIcon';

interface MarketplaceHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cartCount: number;
  wishlistCount: number;
  selectedState: string;
  onSelectState: (state: string) => void;
  onNavigate: (view: string, payload?: any) => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
  onOpenWishlist: () => void;
}

export default function MarketplaceHeader({
  searchQuery,
  onSearchChange,
  cartCount,
  wishlistCount,
  selectedState,
  onSelectState,
  onNavigate,
  onOpenAuth,
  onOpenWishlist,
}: MarketplaceHeaderProps) {
  const db = useDBState();
  const [showNotifications, setShowNotifications] = useState(false);

  const user = db.currentUser;
  const profile = useMemo(
    () => (user ? db.profiles.find((p) => p.userId === user.id) : undefined),
    [db.profiles, user]
  );

  const unread = useMemo(
    () => db.notifications.filter((n) => n.userId === user?.id && !n.isRead),
    [db.notifications, user]
  );
  const recent = useMemo(
    () => db.notifications.filter((n) => n.userId === user?.id).slice(0, 8),
    [db.notifications, user]
  );

  const states = useMemo(() => {
    const set = new Set<string>();
    const profiles = new Map(db.profiles.map((p) => [p.userId, p]));
    for (const product of db.products) {
      const state = profiles.get(product.sellerId)?.state;
      if (state) set.add(state);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.products, db.profiles]);

  const clearAll = () => {
    if (user) dbOperations.clearNotifications(user.id);
    setShowNotifications(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink-150 bg-white text-ink-900 shadow-sm transition-colors duration-300 dark:border-jade-800/70 dark:bg-jade-950 dark:text-white dark:shadow-lg dark:shadow-jade-950/20">
      {/* aurora glow — dark skin only */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 hidden h-28 overflow-hidden dark:block"
      >
        <div className="absolute -left-10 -top-16 h-40 w-40 rounded-full bg-jade-500/25 blur-3xl" />
        <div className="absolute right-0 -top-20 h-40 w-52 rounded-full bg-gold-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Row 1 — logo + actions */}
        <div className="flex h-16 items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onNavigate('marketplace')}
            aria-label="GoodSale marketplace"
            className="flex items-center"
          >
            <Logo
              iconSize={38}
              textColorClass="text-ink-900 dark:text-white"
              subtitleColorClass="text-ink-400 dark:text-gold-300"
              accentClassName="from-jade-500 to-jade-700 dark:from-gold-300 dark:to-gold-400"
            />
          </button>

          <div className="flex items-center gap-1">
            {/* notifications */}
            <div className="relative">
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setShowNotifications((v) => !v)}
                className="relative grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-ink-100 dark:hover:bg-white/10"
              >
                <Bell className="h-5 w-5" />
                {unread.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-jade-600 px-1 text-[9px] font-black leading-none text-white dark:bg-gold-300 dark:text-jade-950">
                    {unread.length > 9 ? '9+' : unread.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <button
                    type="button"
                    aria-label="Close notifications"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setShowNotifications(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-150 bg-white text-ink-900 shadow-2xl dark:border-ink-800 dark:bg-ink-900 dark:text-white">
                    <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
                      <span className="text-sm font-bold">Notifications</span>
                      {unread.length > 0 && (
                        <button
                          type="button"
                          onClick={clearAll}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-jade-600 hover:text-jade-700 dark:text-jade-400"
                        >
                          <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {recent.length === 0 ? (
                        <p className="px-4 py-8 text-center text-xs text-ink-400">
                          {user ? 'No notifications yet.' : 'Sign in to see your notifications.'}
                        </p>
                      ) : (
                        recent.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => dbOperations.toggleNotificationRead(n.id)}
                            className={`flex w-full flex-col gap-0.5 border-b border-ink-50 px-4 py-3 text-left last:border-0 hover:bg-ink-50 dark:border-ink-800/60 dark:hover:bg-ink-800/50 ${
                              n.isRead ? 'opacity-60' : ''
                            }`}
                          >
                            <span className="flex items-center gap-1.5 text-xs font-bold">
                              {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-jade-500" />}
                              {n.title}
                            </span>
                            <span className="line-clamp-2 text-[11px] leading-snug text-ink-500 dark:text-ink-400">
                              {n.message}
                            </span>
                          </button>
                        ))
                      )}
                    </div>

                  </div>
                </>
              )}
            </div>

            {/* wishlist */}
            <button
              type="button"
              aria-label="Wishlist"
              onClick={onOpenWishlist}
              className="relative grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-ink-100 dark:hover:bg-white/10"
            >
              <Heart className="h-5 w-5" />
              {wishlistCount > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-jade-600 px-1 text-[9px] font-black leading-none text-white dark:bg-gold-300 dark:text-jade-950">
                  {wishlistCount > 9 ? '9+' : wishlistCount}
                </span>
              )}
            </button>

            {/* account */}
            <button
              type="button"
              aria-label={user ? 'Your account' : 'Sign in'}
              onClick={() => (user ? onNavigate('buyer-profile') : onOpenAuth?.('login'))}
              className="ml-0.5 flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-ink-100 dark:hover:bg-white/10"
            >
              {user ? (
                <SmartAvatar
                  src={profile?.photoUrl}
                  name={user.fullName}
                  seed={`header-${user.id}`}
                  className="h-9 w-9 ring-2 ring-jade-600/25 dark:ring-gold-300/60"
                />
              ) : (
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ink-100 text-ink-500 ring-2 ring-ink-200 dark:bg-white/10 dark:text-white dark:ring-white/20">
                  <UserIcon className="h-4 w-4" />
                </span>
              )}
              <ChevronDown className="hidden h-4 w-4 text-ink-400 dark:text-white/60 sm:block" />
            </button>
          </div>
        </div>

        {/* Row 2 — location + search + cart */}
        <div className="flex items-center gap-2 pb-3">
          <label className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50 pl-2.5 pr-2 transition-colors dark:border-white/25 dark:bg-white/10">
            <MapPin className="h-4 w-4 shrink-0 text-jade-600 dark:text-gold-300" />
            <span className="flex min-w-0 flex-col justify-center leading-none">
              <span className="text-[8px] font-semibold uppercase tracking-wider text-ink-500 dark:text-jade-200">Deliver to</span>
              <select
                aria-label="Delivery location"
                value={selectedState}
                onChange={(e) => onSelectState(e.target.value)}
                className="mt-0.5 max-w-[72px] cursor-pointer bg-transparent text-[11px] font-bold text-ink-900 outline-none sm:max-w-[116px] dark:text-white [&>option]:text-ink-900"
              >
                <option value="">Nigeria</option>
                {states.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </span>
          </label>

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search for products…"
              aria-label="Search products"
              className="h-10 w-full rounded-full border border-ink-200 bg-white pl-9 pr-9 text-sm font-medium text-ink-900 shadow-sm placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-jade-500/50 dark:border-white/20 dark:shadow-none dark:focus:ring-gold-300"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-ink-100 text-ink-500 hover:bg-ink-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
            onClick={() => (user ? onNavigate('cart') : onOpenAuth?.('register'))}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-ink-100 dark:hover:bg-white/10"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-jade-600 px-1 text-[9px] font-black leading-none text-white dark:bg-gold-300 dark:text-jade-950">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
