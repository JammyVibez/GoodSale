// components/BottomNavigation.tsx
'use client';

import React from 'react';
import { Home, Tag, User, ShoppingCart, MessageSquare, Shield, Store, Package } from 'lucide-react';
import { useDBState, UserRole } from '../lib/store';

interface BottomNavigationProps {
  currentView: string;
  onNavigate: (view: string, payload?: any) => void;
  cartCount: number;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  badge?: number;
  requiresAuth?: boolean;
}

/**
 * Mobile shell — five professional tabs. The middle tab is role-aware:
 * buyers get **Buy** (→ marketplace), sellers get **Sell**, businesses get
 * **Business** (their dashboard) and staff get **Admin**. Active tabs get a
 * jade nav-indicator that pops in on change.
 */
export default function BottomNavigation({
  currentView,
  onNavigate,
  cartCount,
  onOpenAuth,
  onSearchChange,
}: BottomNavigationProps) {
  const db = useDBState();
  const user = db.currentUser;

  const unreadMessages = user
    ? db.chatRooms.filter((r) => r.buyerId === user.id || r.sellerId === user.id).length
    : 0;

  const go = (view: string, authMode: 'login' | 'register' = 'login') => {
    if (!user) {
      onOpenAuth(authMode);
      return;
    }
    onNavigate(view);
  };

  // Role-aware middle tab: buyers Buy, sellers Sell, businesses get their
  // dashboard, staff get the Admin panel. Everyone still keeps Home / Chats /
  // Cart / You, so a business can do everything a buyer and seller can.
  const isAdmin = !!user && (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN);
  const isBusiness =
    !!user && (user.role === UserRole.BUSINESS || user.role === UserRole.VERIFIED_BUSINESS);
  const isSeller =
    !!user && (user.role === UserRole.SELLER || user.role === UserRole.VERIFIED_SELLER);

  const middle = isAdmin
    ? {
        label: 'Admin',
        Icon: Shield,
        active: currentView === 'admin',
        requiresAuth: true,
        onClick: () => go('admin'),
      }
    : isBusiness
      ? {
          label: 'Business',
          Icon: Store,
          active: currentView === 'dashboard',
          requiresAuth: true,
          onClick: () => go('dashboard', 'register'),
        }
      : isSeller
        ? {
            label: 'Sell',
            Icon: Tag,
            active: currentView === 'dashboard',
            requiresAuth: true,
            onClick: () => go('dashboard', 'register'),
          }
        : user
          ? {
              label: 'Buy',
              Icon: ShoppingCart,
              active: currentView === 'marketplace',
              requiresAuth: false,
              onClick: () => {
                onSearchChange('');
                onNavigate('marketplace');
              },
            }
          : {
              label: 'Sell',
              Icon: Tag,
              active: currentView === 'dashboard',
              requiresAuth: true,
              onClick: () => go('dashboard', 'register'),
            };

  const tabs: Tab[] = [
    {
      id: 'marketplace',
      label: 'Home',
      icon: Home,
      active: currentView === 'marketplace' || currentView === 'landing',
      onClick: () => {
        onSearchChange('');
        onNavigate('marketplace');
      },
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
      id: 'role',
      label: middle.label,
      icon: middle.Icon,
      active: middle.active,
      onClick: middle.onClick,
      requiresAuth: middle.requiresAuth,
    },
    {
      id: 'cart',
      label: 'Cart',
      icon: ShoppingCart,
      active: currentView === 'cart',
      onClick: () => go('cart', 'register'),
      badge: cartCount,
      requiresAuth: true,
    },
    {
      id: 'you',
      label: 'You',
      icon: User,
      active: ['buyer-profile', 'settings'].includes(currentView),
      onClick: () => (user ? onNavigate('buyer-profile') : onOpenAuth('login')),
    },
  ];

  return (
    <nav
      id="persistent-bottom-nav"
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 h-[72px] bg-white/95 dark:bg-ink-900/95 backdrop-blur-xl border-t border-ink-200 dark:border-ink-800 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-40 px-2 pb-safe-bottom"
    >
      <div className="grid grid-cols-5 h-full items-center">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const showBadge = typeof tab.badge === 'number' && tab.badge > 0;
          return (
            <button
              key={tab.id}
              id={`bottom-nav-${tab.id}`}
              onClick={tab.onClick}
              aria-current={tab.active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center h-full cursor-pointer transition-transform duration-100 press-scale focus-ring rounded-2xl"
            >
              {tab.active && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 h-1 w-5 rounded-full bg-jade-500 animate-nav-indicator"
                />
              )}
              <span className="relative">
                <Icon
                  className={`w-6 h-6 transition-colors duration-200 ${
                    tab.active
                      ? 'text-jade-600 dark:text-jade-400'
                      : 'text-ink-500 dark:text-ink-400'
                  }`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 bg-jade-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center border-2 border-white dark:border-ink-900 leading-none">
                    {tab.badge! > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </span>
              <span
                className={`mt-1 text-xs font-bold tracking-wide transition-colors duration-200 ${
                  tab.active
                    ? 'text-jade-600 dark:text-jade-400'
                    : 'text-ink-500 dark:text-ink-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
