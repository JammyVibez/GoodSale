// components/BottomNavigation.tsx
'use client';

import React from 'react';
import { Home, MessageSquare, Package, Plus, User } from 'lucide-react';
import { useDBState } from '../lib/store';
import { totalUnreadMessages } from '../lib/chat';

interface BottomNavigationProps {
  currentView: string;
  onNavigate: (view: string, payload?: any) => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Panel currently open on the Account screen, so Orders/Account select correctly. */
  activeProfileSection?: string;
}

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

/**
 * Mobile shell — the five primary destinations.
 *
 * Home · Orders · Sell · Chats · Account, with Sell as the raised circular
 * action in the middle. The bar stays a clean white surface in both themes so it
 * reads as chrome rather than content; categories live on the homepage and in
 * the app menu, not here.
 */
export default function BottomNavigation({
  currentView,
  onNavigate,
  onOpenAuth,
  onSearchChange,
  activeProfileSection,
}: BottomNavigationProps) {
  const db = useDBState();
  const user = db.currentUser;

  const unreadMessages = user
    ? totalUnreadMessages(db.chatRooms, db.messages, user.id)
    : 0;

  const go = (view: string, payload?: any, authMode: 'login' | 'register' = 'login') => {
    if (!user) {
      onOpenAuth(authMode);
      return;
    }
    onNavigate(view, payload);
  };

  const onAccount = ['buyer-profile', 'settings', 'referrals', 'loyalty'].includes(currentView);
  const ordersSelected = onAccount && (activeProfileSection ?? 'you-overview') === 'you-orders';

  const tabs: Tab[] = [
    {
      id: 'home',
      label: 'Home',
      icon: Home,
      active: currentView === 'marketplace',
      onClick: () => {
        onSearchChange('');
        onNavigate('marketplace');
      },
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: Package,
      active: ordersSelected,
      onClick: () => go('buyer-profile', { section: 'you-orders' }),
    },
    {
      id: 'chats',
      label: 'Chats',
      icon: MessageSquare,
      active: currentView === 'chats',
      onClick: () => go('chats'),
      badge: user ? unreadMessages : undefined,
    },
    {
      id: 'account',
      label: 'Account',
      icon: User,
      active: onAccount && !ordersSelected,
      onClick: () => go('buyer-profile', { section: 'you-overview' }),
    },
  ];

  const renderTab = (tab: Tab) => {
    const Icon = tab.icon;
    const showBadge = typeof tab.badge === 'number' && tab.badge > 0;
    return (
      <button
        key={tab.id}
        id={`bottom-nav-${tab.id}`}
        onClick={tab.onClick}
        aria-current={tab.active ? 'page' : undefined}
        className="relative flex h-full flex-col items-center justify-center gap-1 cursor-pointer transition-transform duration-100 press-scale focus-ring rounded-2xl"
      >
        <span className="relative">
          <Icon
            className={`h-[22px] w-[22px] transition-colors duration-200 ${
              tab.active ? 'text-jade-600' : 'text-ink-500'
            }`}
          />
          {showBadge && (
            <span className="absolute -right-2 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-2 border-white bg-jade-600 px-1 text-[9px] font-bold leading-none text-white">
              {tab.badge! > 99 ? '99+' : tab.badge}
            </span>
          )}
        </span>
        <span
          className={`text-[10px] font-bold tracking-wide transition-colors duration-200 ${
            tab.active ? 'text-jade-700' : 'text-ink-500'
          }`}
        >
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      id="persistent-bottom-nav"
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-ink-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-safe-bottom"
    >
      <div className="grid h-[68px] grid-cols-5 items-center px-1">
        {renderTab(tabs[0])}
        {renderTab(tabs[1])}

        {/* Sell — the prominent circular centre action */}
        <button
          type="button"
          id="bottom-nav-sell"
          onClick={() => go('dashboard', undefined, 'register')}
          aria-current={currentView === 'dashboard' ? 'page' : undefined}
          className="flex h-full flex-col items-center justify-center cursor-pointer focus-ring rounded-2xl"
        >
          <span className="-mt-6 grid h-12 w-12 place-items-center rounded-full bg-jade-600 text-white shadow-[0_8px_20px_-8px_rgba(16,110,74,0.75)] ring-4 ring-white transition-transform duration-150 active:scale-95">
            <Plus className="h-6 w-6" strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span className="-mt-0.5 text-[10px] font-bold tracking-wide text-jade-700">Sell</span>
        </button>

        {renderTab(tabs[2])}
        {renderTab(tabs[3])}
      </div>
    </nav>
  );
}
