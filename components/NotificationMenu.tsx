// components/NotificationMenu.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BadgeCheck,
  Bell,
  BellOff,
  CheckCheck,
  ChevronRight,
  Gavel,
  Info,
  Lock,
  MessageCircle,
  Package,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  UserRound,
} from 'lucide-react';
import { dbOperations, useDBState } from '@/lib/store';
import type { Notification } from '@/lib/types';
import { UserRole } from '@/lib/types';

type Filter = 'all' | 'unread';

interface NotificationMenuProps {
  onNavigate: (view: string, payload?: unknown) => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

const SELLER_ROLES = new Set<UserRole>([
  UserRole.SELLER,
  UserRole.VERIFIED_SELLER,
  UserRole.BUSINESS,
  UserRole.VERIFIED_BUSINESS,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]);

const TYPE_STYLES: Record<
  Notification['type'],
  { Icon: React.ComponentType<{ className?: string }>; tone: string; label: string }
> = {
  ORDER: { Icon: ShoppingBag, tone: 'bg-jade-500/10 text-jade-700 dark:text-jade-300', label: 'Order' },
  BID: { Icon: Gavel, tone: 'bg-gold-400/15 text-gold-700 dark:text-gold-300', label: 'Offer' },
  DISPUTE: { Icon: ShieldAlert, tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-300', label: 'Dispute' },
  POINTS: { Icon: Sparkles, tone: 'bg-gold-400/15 text-gold-700 dark:text-gold-300', label: 'Rewards' },
  CHAT: { Icon: MessageCircle, tone: 'bg-jade-500/10 text-jade-700 dark:text-jade-300', label: 'Message' },
  VERIFICATION: { Icon: BadgeCheck, tone: 'bg-jade-500/10 text-jade-700 dark:text-jade-300', label: 'Verification' },
  SAFEMEET: { Icon: UserRound, tone: 'bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-200', label: 'SafeMeet' },
  ESCROW: { Icon: Lock, tone: 'bg-jade-500/10 text-jade-700 dark:text-jade-300', label: 'Escrow' },
  SYSTEM: { Icon: Info, tone: 'bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-200', label: 'System' },
  DELIVERY: { Icon: Truck, tone: 'bg-jade-500/10 text-jade-700 dark:text-jade-300', label: 'Delivery' },
  STOCK: { Icon: Package, tone: 'bg-gold-400/15 text-gold-700 dark:text-gold-300', label: 'Inventory' },
  PROMOTION: { Icon: Sparkles, tone: 'bg-gold-400/15 text-gold-700 dark:text-gold-300', label: 'Promotion' },
};

function relativeTime(value: string): string {
  const date = new Date(value);
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  if (ms < 60_000) return 'Just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 6 * 86_400_000;
  const time = date.getTime();
  if (!Number.isFinite(time)) return 'Earlier';
  if (time >= startOfToday) return 'Today';
  if (time >= startOfYesterday) return 'Yesterday';
  if (time >= startOfWeek) return 'This week';
  return 'Earlier';
}

export default function NotificationMenu({ onNavigate, onOpenAuth }: NotificationMenuProps) {
  const db = useDBState();
  const user = db.currentUser;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 0, right: 16, maxHeight: 'calc(100dvh - 1rem)' });

  const updatePanelPosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect || typeof window === 'undefined') return;
    const gutter = window.innerWidth < 640 ? 12 : 24;
    const top = Math.round(rect.bottom + 10);
    setPanelPosition({
      top,
      right: gutter,
      maxHeight: `${Math.max(260, window.innerHeight - top - gutter)}px`,
    });
  }, []);

  const notifications = useMemo(() => {
    if (!user) return [] as Notification[];
    return db.notifications
      .filter((n) => n.userId === user.id)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [db.notifications, user]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const visible = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications),
    [filter, notifications]
  );

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; items: Notification[] }> = [];
    for (const notification of visible) {
      const label = groupLabel(notification.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(notification);
      else groups.push({ label, items: [notification] });
    }
    return groups;
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updatePanelPosition);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [open, updatePanelPosition]);

  // Signing out while the panel is open must not leave a stale menu behind.
  useEffect(() => {
    if (!user) {
      setOpen(false);
      setFilter('all');
    }
  }, [user]);

  const canSell = !!user && SELLER_ROLES.has(user.role);

  const destinationFor = (type: Notification['type']): string => {
    switch (type) {
      case 'CHAT':
        return 'chats';
      case 'POINTS':
        return 'loyalty';
      case 'PROMOTION':
      case 'BID':
        return 'marketplace';
      case 'VERIFICATION':
        return 'verification';
      case 'DISPUTE':
        return 'trust-safety';
      case 'SYSTEM':
        return 'settings';
      case 'SAFEMEET':
        return canSell ? 'dashboard' : 'chats';
      case 'ORDER':
      case 'ESCROW':
      case 'DELIVERY':
      case 'STOCK':
        return canSell ? 'dashboard' : 'buyer-profile';
      default:
        return 'marketplace';
    }
  };

  const openNotification = (notification: Notification) => {
    if (!notification.isRead) dbOperations.toggleNotificationRead(notification.id);
    setOpen(false);
    onNavigate(destinationFor(notification.type));
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) updatePanelPosition();
          setOpen((value) => !value);
        }}
        className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors ${
          open
            ? 'bg-ink-100 text-ink-900 dark:bg-white/15 dark:text-white'
            : 'hover:bg-ink-100 dark:hover:bg-white/10'
        }`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-jade-600 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white dark:bg-gold-300 dark:text-jade-950 dark:ring-jade-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-[80] cursor-default bg-ink-950/20 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Notifications"
            style={{
              top: panelPosition.top,
              right: panelPosition.right,
              maxHeight: panelPosition.maxHeight,
              width: 'min(24rem, calc(100vw - 1.5rem))',
            }}
            className="fixed z-[85] flex origin-top-right flex-col overflow-hidden rounded-2xl border border-ink-150 bg-white text-ink-900 shadow-2xl shadow-ink-950/15 animate-fade-in-scale dark:border-ink-800 dark:bg-ink-900 dark:text-white dark:shadow-black/40"
          >
            {/* Header */}
            <div className="shrink-0 border-b border-ink-100 px-4 pb-3 pt-4 dark:border-ink-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold tracking-tight">Notifications</h2>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-jade-500/10 px-2 py-0.5 text-[10px] font-bold text-jade-700 dark:bg-jade-400/15 dark:text-jade-300">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                    Orders, messages and account updates
                  </p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => user && dbOperations.clearNotifications(user.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-jade-700 transition-colors hover:bg-jade-500/10 focus-ring dark:text-jade-300"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {user && (
                <div
                  role="tablist"
                  aria-label="Filter notifications"
                  className="mt-3 flex items-center gap-1 rounded-xl bg-ink-100/80 p-1 dark:bg-ink-950/70"
                >
                  {(
                    [
                      { value: 'all', label: 'All', count: notifications.length },
                      { value: 'unread', label: 'Unread', count: unreadCount },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.value}
                      role="tab"
                      aria-selected={filter === tab.value}
                      onClick={() => setFilter(tab.value)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                        filter === tab.value
                          ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white'
                          : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-black leading-none ${
                          filter === tab.value
                            ? 'bg-jade-500/10 text-jade-700 dark:bg-jade-400/15 dark:text-jade-300'
                            : 'bg-ink-200/70 text-ink-500 dark:bg-white/10 dark:text-ink-300'
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            {!user ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-jade-500/10 text-jade-600 dark:text-jade-300">
                  <Bell className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-bold">Stay in the loop</p>
                <p className="mt-1 max-w-[15rem] text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  Sign in to see order updates, buyer messages and payout alerts.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenAuth?.('login');
                  }}
                  className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-jade-600 px-4 text-xs font-bold text-white transition-colors hover:bg-jade-700 focus-ring"
                >
                  Sign in
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-white/5 dark:text-ink-500">
                  <BellOff className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-bold">
                  {filter === 'unread' ? "You're all caught up" : 'No notifications yet'}
                </p>
                <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  {filter === 'unread'
                    ? 'Every notification has been read. New updates will appear here.'
                    : 'Order activity, messages and account alerts will show up here.'}
                </p>
                {filter === 'unread' && notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-jade-700 hover:underline dark:text-jade-300"
                  >
                    View all notifications
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {grouped.map((group) => (
                  <section key={group.label} aria-label={group.label}>
                    <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400 backdrop-blur dark:bg-ink-900/95 dark:text-ink-500">
                      <span>{group.label}</span>
                      <span className="font-mono text-[9px] tracking-normal">{group.items.length}</span>
                    </div>
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800/70">
                      {group.items.map((notification) => {
                        const style = TYPE_STYLES[notification.type] ?? TYPE_STYLES.SYSTEM;
                        const { Icon } = style;
                        return (
                          <li
                            key={notification.id}
                            className={`group/item relative flex items-start gap-3 px-4 py-3 transition-colors ${
                              notification.isRead
                                ? 'bg-white dark:bg-ink-900'
                                : 'bg-jade-500/[0.045] dark:bg-jade-400/[0.055]'
                            } hover:bg-ink-50 dark:hover:bg-ink-800/60`}
                          >
                            <button
                              type="button"
                              onClick={() => openNotification(notification)}
                              className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900"
                            >
                              <span
                                className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${style.tone}`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1 pr-7">
                                <span className="flex items-center gap-1.5">
                                  {!notification.isRead && (
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-jade-500 dark:bg-gold-300" />
                                  )}
                                  <span
                                    className={`truncate text-xs ${
                                      notification.isRead
                                        ? 'font-semibold text-ink-700 dark:text-ink-300'
                                        : 'font-bold text-ink-900 dark:text-white'
                                    }`}
                                  >
                                    {notification.title}
                                  </span>
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-ink-500 dark:text-ink-400">
                                  {notification.message}
                                </span>
                                <span className="mt-1.5 flex items-center gap-2">
                                  <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-500 dark:bg-white/5 dark:text-ink-400">
                                    {style.label}
                                  </span>
                                  <span className="text-[10px] font-medium text-ink-400 dark:text-ink-500">
                                    {relativeTime(notification.createdAt)}
                                  </span>
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete notification: ${notification.title}`}
                              onClick={() => dbOperations.deleteNotification(notification.id)}
                              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-ink-300 opacity-100 transition-all hover:bg-rose-500/10 hover:text-rose-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 group-hover/item:opacity-100 dark:text-ink-600 dark:hover:text-rose-300 sm:opacity-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRight
                              aria-hidden="true"
                              className="absolute bottom-3.5 right-3 h-3.5 w-3.5 text-ink-300 opacity-0 transition-opacity group-hover/item:opacity-70 dark:text-ink-600"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-ink-100 bg-ink-50/60 px-3 py-2.5 dark:border-ink-800 dark:bg-ink-950/40">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!user) onOpenAuth?.('login');
                  else onNavigate('settings');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Notification settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!user) onOpenAuth?.('login');
                  else onNavigate(canSell ? 'dashboard' : 'buyer-profile');
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-jade-700 transition-colors hover:bg-jade-500/10 dark:text-jade-300"
              >
                {canSell ? 'Merchant hub' : 'My activity'}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
