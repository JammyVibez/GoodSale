// components/Header.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, ShoppingCart, Bell, User as UserIcon, Shield, RefreshCw, 
  Award, Store, Sun, Moon, Laptop, LogIn, CheckCircle, Sparkles,
  X, Gavel, Package, Eye, EyeOff, Trash, MessageSquare, Truck, DollarSign,
  Wallet, ChevronDown, Settings as SettingsIcon, LogOut, LayoutGrid, BadgeCheck
} from 'lucide-react';
import { UserRole, dbOperations, useDBState } from '../lib/store';
import Logo from './LogoIcon';

interface HeaderProps {
  currentView: string;
  onNavigate: (view: string, payload?: any) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cartCount: number;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

export default function Header({
  currentView,
  onNavigate,
  searchQuery,
  onSearchChange,
  cartCount,
  onOpenAuth,
}: HeaderProps) {
  const db = useDBState();
  const [showNotifications, setShowNotifications] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('dark');
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Search History States
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecentDropdown, setShowRecentDropdown] = useState(false);
  const [showMobileRecentDropdown, setShowMobileRecentDropdown] = useState(false);

  // Initialize Search History from local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('goodsale_recent_searches');
      if (saved) {
        try {
          setRecentSearches(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse recent searches:', e);
        }
      }
    }
  }, []);

  const saveSearchQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 5);
      localStorage.setItem('goodsale_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteRecentSearch = (e: React.MouseEvent, item: string) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s !== item);
      localStorage.setItem('goodsale_recent_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearAllRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    localStorage.removeItem('goodsale_recent_searches');
  };

  const handleSelectRecentSearch = (item: string) => {
    onSearchChange(item);
    saveSearchQuery(item);
    setShowRecentDropdown(false);
    setShowMobileRecentDropdown(false);
  };



  // Initialize theme from localStorage on mount (safe for SSR)
  useEffect(() => {
    const savedTheme = localStorage.getItem('goodsale_theme') as 'light' | 'dark' | 'system' | null;
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
      setThemeMode(savedTheme);
    } else {
      setThemeMode('dark');
    }
  }, []);

  // Handle system dark/light mode toggle with support for System Preference
  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (mode: 'light' | 'dark' | 'system') => {
      if (mode === 'dark') {
        root.classList.add('dark');
      } else if (mode === 'light') {
        root.classList.remove('dark');
      } else {
        // System preference
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemPrefersDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme(themeMode);

    // If it's system mode, listen for external media query changes
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };
      
      // Modern & fallback compatibility
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
      } else {
        mediaQuery.addListener(listener);
      }
      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', listener);
        } else {
          mediaQuery.removeListener(listener);
        }
      };
    }
  }, [themeMode]);

  const selectTheme = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    localStorage.setItem('goodsale_theme', mode);
    setShowThemeMenu(false);
  };

  const user = db.currentUser;
  const unreadNotifications = db.notifications.filter(n => n.userId === user?.id && !n.isRead);

  const handleClearNotifications = () => {
    if (user) {
      dbOperations.clearNotifications(user.id);
    }
    setShowNotifications(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink-200 dark:border-ink-800 bg-white/95 dark:bg-ink-900/95 backdrop-blur-md transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo */}
          <div 
            id="logo-container"
            onClick={() => onNavigate('marketplace')}
            className="flex items-center gap-2 cursor-pointer select-none shrink-0"
          >
            <Logo iconSize={36} />
          </div>

          {/* Search Bar - Hidden on minimal views */}
          {(currentView === 'marketplace' || currentView === 'product') && (
            <div className="hidden md:flex flex-1 max-w-md relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-ink-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                id="search-input"
                type="text"
                placeholder="Search products, brands, barcodes, locations..."
                value={searchQuery}
                onFocus={() => setShowRecentDropdown(true)}
                onBlur={() => setTimeout(() => setShowRecentDropdown(false), 250)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveSearchQuery(searchQuery);
                    setShowRecentDropdown(false);
                  }
                }}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-ink-100 dark:bg-ink-800 border-none rounded-full focus:outline-none focus:ring-2 focus:ring-jade-500 text-ink-800 dark:text-white transition-all placeholder:text-ink-400 dark:placeholder:text-ink-500"
              />

              {/* Recent Searches Dropdown */}
              {showRecentDropdown && recentSearches.length > 0 && (
                <div 
                  className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 rounded-2xl shadow-xl z-50 py-3 overflow-hidden animate-slide-in"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between px-4 pb-2 mb-1 border-b border-ink-50 dark:border-ink-800/50 text-xs font-bold text-ink-400 dark:text-ink-500 font-mono tracking-wider">
                    <span>RECENT SEARCHES</span>
                    <button 
                      onClick={handleClearAllRecent}
                      className="hover:text-ink-500 transition-colors flex items-center gap-0.5 cursor-pointer"
                    >
                      <Trash className="w-3 h-3" />
                      Clear All
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {recentSearches.map((item, index) => (
                      <div
                        key={index}
                        onClick={() => handleSelectRecentSearch(item)}
                        className="flex items-center justify-between px-4 py-2 hover:bg-ink-50 dark:hover:bg-ink-800/80 cursor-pointer text-xs font-semibold text-ink-700 dark:text-ink-300 transition-colors group"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <RefreshCw className="w-3.5 h-3.5 text-ink-400 dark:text-ink-500 group-hover:text-jade-500" />
                          <span className="truncate">{item}</span>
                        </span>
                        <button
                          onClick={(e) => handleDeleteRecentSearch(e, item)}
                          className="p-1 hover:bg-ink-50 dark:hover:bg-ink-950/20 rounded-md text-ink-400 dark:text-ink-500 hover:text-ink-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Core Button Navigation Row */}
          <div className="hidden md:flex items-center gap-1.5 bg-ink-50/80 dark:bg-ink-850/80 p-1 rounded-xl border border-ink-200/50 dark:border-ink-800/80">
            <button
              onClick={() => onNavigate('marketplace')}
              aria-current={currentView === 'marketplace' ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                currentView === 'marketplace'
                  ? 'bg-jade-500 text-white shadow-sm shadow-jade-500/30 [&_svg]:text-white'
                  : 'text-ink-600 dark:text-ink-300 hover:text-jade-500 dark:hover:text-jade-400'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Marketplace</span>
            </button>
            <button
              onClick={() => {
                if (user) {
                  onNavigate('wallet');
                } else {
                  onOpenAuth?.('register');
                }
              }}
              aria-current={currentView === 'wallet' ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                currentView === 'wallet'
                  ? 'bg-jade-500 text-white shadow-sm shadow-jade-500/30 [&_svg]:text-white'
                  : 'text-ink-600 dark:text-ink-300 hover:text-jade-500 dark:hover:text-jade-400'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Wallet</span>
            </button>
            <button
              onClick={() => {
                if (user) {
                  onNavigate('chats');
                } else {
                  onOpenAuth?.('login');
                }
              }}
              aria-current={currentView === 'chats' ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                currentView === 'chats'
                  ? 'bg-jade-500 text-white shadow-sm shadow-jade-500/30 [&_svg]:text-white'
                  : 'text-ink-600 dark:text-ink-300 hover:text-jade-500 dark:hover:text-jade-400'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chats</span>
            </button>
            <button
              onClick={() => {
                if (!user) {
                  onOpenAuth?.('register');
                  return;
                }
                onNavigate('cart');
              }}
              aria-current={currentView === 'cart' ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                currentView === 'cart'
                  ? 'bg-jade-500 text-white shadow-sm shadow-jade-500/30 [&_svg]:text-white'
                  : 'text-ink-600 dark:text-ink-300 hover:text-jade-500 dark:hover:text-jade-400'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Cart ({cartCount})</span>)
            </button>
          </div>          {/* Actions & Switching Panel */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            
            {/* Always Visible Core: Cart Widget */}
            <button
              id="cart-widget"
              onClick={() => {
                if (!user) {
                  onOpenAuth?.('register');
                  return;
                }
                onNavigate('cart');
              }}
              className="p-2 text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-xl transition-colors relative cursor-pointer"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-jade-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Always Visible Core: Notifications Tray */}
            <div className="relative">
              <button
                id="notifications-toggle"
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (showMobileMenu) setShowMobileMenu(false);
                }}
                className="p-2 text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-xl transition-colors relative cursor-pointer"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-jade-500 rounded-full animate-ping" />
                )}
              </button>

              {showNotifications && (
                <div id="notifications-tray" className="absolute right-0 mt-3 w-96 max-h-[500px] overflow-y-auto bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-2xl z-50 flex flex-col animate-slide-in">
                  
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-ink-50/50 dark:bg-ink-950/20">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-ink-900 dark:text-white font-sans">Notification Hub</span>
                      {unreadNotifications.length > 0 && (
                        <span className="px-2 py-0.5 text-xs font-black bg-ink-500/10 text-ink-500 dark:text-ink-400 rounded-full">
                          {unreadNotifications.length} New
                        </span>
                      )}
                    </div>
                    {unreadNotifications.length > 0 && (
                      <button 
                        onClick={handleClearNotifications}
                        className="text-xs text-jade-600 hover:text-jade-500 dark:text-jade-400 font-extrabold hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Filters Tab Panel */}
                  <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-800 flex gap-2 bg-white dark:bg-ink-900">
                    <button
                      onClick={() => setNotifFilter('all')}
                      className={`px-3 py-1 text-xs font-black uppercase tracking-wider rounded-md border transition-all cursor-pointer ${
                        notifFilter === 'all'
                          ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-ink-900 dark:border-ink-100'
                          : 'bg-transparent text-ink-500 dark:text-ink-400 border-ink-200 dark:border-ink-800 hover:text-ink-700'
                      }`}
                    >
                      All ({db.notifications.filter(n => n.userId === user?.id).length})
                    </button>
                    <button
                      onClick={() => setNotifFilter('unread')}
                      className={`px-3 py-1 text-xs font-black uppercase tracking-wider rounded-md border transition-all cursor-pointer ${
                        notifFilter === 'unread'
                          ? 'bg-jade-500 text-white border-jade-500'
                          : 'bg-transparent text-ink-500 dark:text-ink-400 border-ink-200 dark:border-ink-800 hover:text-jade-500'
                      }`}
                    >
                      Unread ({unreadNotifications.length})
                    </button>
                  </div>

                  {/* Notification List Container */}
                  <div className="divide-y divide-ink-100 dark:divide-ink-850 max-h-64 overflow-y-auto flex-1">
                    {db.notifications.filter(n => n.userId === user?.id && (notifFilter === 'all' || !n.isRead)).length === 0 ? (
                      <div className="p-8 text-center text-ink-400 dark:text-ink-500 space-y-2">
                        <Bell className="w-8 h-8 mx-auto text-ink-300 dark:text-ink-700 animate-bounce" />
                        <p className="text-xs font-medium font-sans text-ink-800 dark:text-ink-200">No {notifFilter === 'unread' ? 'unread' : ''} notifications</p>
                        <p className="text-xs text-ink-400 leading-relaxed font-sans">
                          Your safe trading updates, bids, and escrow dispatches will appear here.
                        </p>
                      </div>
                    ) : (
                      db.notifications
                        .filter(n => n.userId === user?.id && (notifFilter === 'all' || !n.isRead))
                        .map((notif) => {
                          // Icon selector based on type
                          let IconComp = Bell;
                          let iconBg = "bg-jade-500/10 text-jade-600 dark:text-jade-400";
                          if (notif.type === 'BID') {
                            IconComp = Gavel;
                            iconBg = "bg-ink-500/10 text-ink-600 dark:text-ink-400";
                          } else if (notif.type === 'SAFEMEET') {
                            IconComp = Shield;
                            iconBg = "bg-jade-500/10 text-jade-600 dark:text-jade-400";
                          } else if (notif.type === 'ESCROW') {
                            IconComp = Package;
                            iconBg = "bg-jade-500/10 text-jade-600 dark:text-jade-400";
                          } else if (notif.type === 'POINTS') {
                            IconComp = Award;
                            iconBg = "bg-ink-500/10 text-ink-600 dark:text-ink-400";
                          }

                          return (
                            <div 
                              key={notif.id} 
                              className={`p-3.5 flex items-start gap-3 transition-colors relative group ${
                                notif.isRead 
                                  ? 'opacity-75 hover:opacity-100 bg-white dark:bg-ink-900' 
                                  : 'bg-jade-50/10 dark:bg-jade-500/[0.02] hover:bg-jade-50/20 dark:hover:bg-jade-500/[0.04]'
                              }`}
                            >
                              {/* Unread dot */}
                              {!notif.isRead && (
                                <span className="absolute top-4 left-1.5 w-2 h-2 bg-jade-500 rounded-full animate-pulse" />
                              )}

                              {/* Icon category */}
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                                <IconComp className="w-4 h-4" />
                              </div>

                              {/* Content text */}
                              <div className="flex-1 min-w-0 pr-8">
                                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                  <h5 className="font-extrabold text-ink-900 dark:text-ink-100 text-xs truncate font-sans">
                                    {notif.title}
                                  </h5>
                                  <span className="text-xs text-ink-400 dark:text-ink-500 font-mono shrink-0">
                                    {notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                                <p className="text-ink-600 dark:text-ink-400 text-xs leading-relaxed break-words font-sans">
                                  {notif.message}
                                </p>
                              </div>

                              {/* Hover actions */}
                              <div className="absolute right-2 top-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => dbOperations.toggleNotificationRead(notif.id)}
                                  className="p-1 rounded bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700 text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white cursor-pointer"
                                  title={notif.isRead ? "Mark as Unread" : "Mark as Read"}
                                >
                                  {notif.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => dbOperations.deleteNotification(notif.id)}
                                  className="p-1 rounded bg-ink-500/10 hover:bg-ink-500/20 text-ink-500 dark:text-ink-400 cursor-pointer"
                                  title="Delete notification"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>

                

                </div>
              )}
            </div>

            {/* DESKTOP-ONLY ACTIONS ROW */}
            <div className="hidden md:flex items-center gap-2.5">
              {/* GoodPoints Tracker */}
              {user && (
                <div 
                  id="points-badge"
                  onClick={() => onNavigate('loyalty')}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-ink-500/10 to-ink-500/10 hover:from-ink-500/20 hover:to-ink-500/20 border border-ink-500/30 dark:border-ink-500/20 text-ink-600 dark:text-ink-400 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all shrink-0"
                  title="Your GoodPoints Loyalty Balance"
                >
                  <Award className="w-3.5 h-3.5 text-ink-500 fill-ink-500/20" />
                  <span>{user.goodPoints.toLocaleString()} GP</span>
                </div>
              )}

              {/* Sign In / Register / Logout Buttons */}
              {!user ? (
                <div className="flex items-center gap-2">
                  <button
                    id="auth-login-btn"
                    onClick={() => onOpenAuth?.('login')}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-750 text-ink-700 dark:text-ink-300 font-sans font-bold rounded-lg text-xs hover:shadow-sm transition-all cursor-pointer select-none border border-ink-200 dark:border-ink-750"
                  >
                    <LogIn className="w-3.5 h-3.5 text-jade-500" />
                    <span>Login</span>
                  </button>
                  <button
                    id="auth-register-btn"
                    onClick={() => onOpenAuth?.('register')}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-jade-500 to-jade-600 hover:from-jade-600 hover:to-jade-700 text-white font-sans font-bold rounded-lg text-xs hover:shadow-md transition-all cursor-pointer select-none border border-jade-500/10"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sign Up</span>
                  </button>
                  {/* Guest login removed — use Supabase Auth */}
                </div>
              ) : (
                <div className="relative">
                  <button
                    id="user-menu-btn"
                    onClick={() => {
                      setShowUserMenu(!showUserMenu);
                      if (showNotifications) setShowNotifications(false);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={showUserMenu}
                    className={`flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border transition-all cursor-pointer select-none ${
                      showUserMenu
                        ? 'bg-ink-100 dark:bg-ink-800 border-ink-300 dark:border-ink-700'
                        : 'bg-white dark:bg-ink-900 border-ink-200 dark:border-ink-750 hover:bg-ink-100 dark:hover:bg-ink-800'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-jade-500/10 text-jade-600 dark:text-jade-400 flex items-center justify-center font-black text-xs">
                      {(user.fullName || 'G').trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden lg:block text-xs font-bold text-ink-800 dark:text-ink-200 max-w-[96px] truncate">
                      {user.fullName || 'My account'}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                      <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-2xl z-50 py-2 animate-slide-in">
                        <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-800">
                          <p className="text-sm font-black text-ink-900 dark:text-white truncate">
                            {user.fullName}
                          </p>
                          <p className="text-xs text-ink-500 font-mono truncate">
                            {user.role.replace(/_/g, ' ').toLowerCase()}
                          </p>
                        </div>
                        <div className="py-1.5">
                          {([
                            { id: 'buyer-profile', label: 'My profile', icon: UserIcon },
                            { id: 'wallet', label: 'Wallet', icon: Wallet },
                            { id: 'revenue', label: 'Revenue hub', icon: DollarSign },
                            { id: 'loyalty', label: 'GoodPoints', icon: Award },
                            { id: 'verification', label: 'Verification', icon: BadgeCheck },
                            { id: 'dashboard', label: 'Seller hub', icon: Store, roles: [UserRole.BUSINESS, UserRole.VERIFIED_BUSINESS, UserRole.SELLER, UserRole.VERIFIED_SELLER] },
                            { id: 'dispatch', label: 'GoodDispatch', icon: Truck, roles: [UserRole.BUSINESS, UserRole.VERIFIED_BUSINESS, UserRole.SELLER, UserRole.VERIFIED_SELLER, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
                            { id: 'brand-center', label: 'Brand center', icon: Sparkles },
                            { id: 'admin', label: 'Admin panel', icon: Shield, roles: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
                            { id: 'settings', label: 'Settings', icon: SettingsIcon },
                            { id: 'landing', label: 'About GoodSale', icon: LayoutGrid },
                          ] as Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: UserRole[] }>)
                            .filter((item) => !item.roles || item.roles.includes(user.role))
                            .map((item) => (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setShowUserMenu(false);
                                  onNavigate(item.id);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-3 transition-colors cursor-pointer ${
                                  currentView === item.id
                                    ? 'text-jade-600 dark:text-jade-400 bg-jade-500/5'
                                    : 'text-ink-700 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-850'
                                }`}
                              >
                                <item.icon className="w-4 h-4 shrink-0" />
                                {item.label}
                              </button>
                            ))}
                        </div>
                        <div className="border-t border-ink-100 dark:border-ink-800 pt-1.5">
                          <button
                            id="auth-logout-btn"
                            onClick={async () => {
                              setShowUserMenu(false);
                              await dbOperations.logout();
                              onNavigate('landing');
                            }}
                            className="w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-3 text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850 transition-colors cursor-pointer"
                          >
                            <LogOut className="w-4 h-4 shrink-0" />
                            Log out
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Theme System Selector */}
              <div className="relative">
                <button
                  id="theme-toggle-btn"
                  onClick={() => setShowThemeMenu(!showThemeMenu)}
                  className="p-2 text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                  title={`Theme: ${themeMode}`}
                >
                  {themeMode === 'light' && <Sun className="w-5 h-5 text-ink-500" />}
                  {themeMode === 'dark' && <Moon className="w-5 h-5 text-jade-400" />}
                  {themeMode === 'system' && <Laptop className="w-5 h-5 text-jade-400" />}
                </button>

                {showThemeMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-2xl z-50 py-1.5 animate-slide-in">
                      <div className="px-3 py-1.5 border-b border-ink-100 dark:border-ink-800 mb-1">
                        <span className="text-xs font-bold text-ink-400 uppercase tracking-wider">Appearance Mode</span>
                      </div>
                      
                      <button
                        onClick={() => selectTheme('light')}
                        className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-ink-50 dark:hover:bg-ink-850 flex items-center gap-2 transition-colors ${themeMode === 'light' ? 'text-jade-500 font-semibold bg-jade-50/25 dark:bg-jade-500/5' : 'text-ink-700 dark:text-ink-300'}`}
                      >
                        <Sun className="w-4 h-4 text-ink-500 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span>Light Theme</span>
                            {themeMode === 'light' && <CheckCircle className="w-3.5 h-3.5 text-jade-500" />}
                          </div>
                          <span className="text-xs text-ink-400 block leading-none mt-0.5 font-normal font-sans">Crisp and clear off-white</span>
                        </div>
                      </button>

                      <button
                        onClick={() => selectTheme('dark')}
                        className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-ink-50 dark:hover:bg-ink-850 flex items-center gap-2 transition-colors ${themeMode === 'dark' ? 'text-jade-500 font-semibold bg-jade-50/25 dark:bg-jade-500/5' : 'text-ink-700 dark:text-ink-300'}`}
                      >
                        <Moon className="w-4 h-4 text-jade-400 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span>Dark Theme</span>
                            {themeMode === 'dark' && <CheckCircle className="w-3.5 h-3.5 text-jade-500" />}
                          </div>
                          <span className="text-xs text-ink-400 block leading-none mt-0.5 font-normal font-sans">Inky black premium night mode</span>
                        </div>
                      </button>

                      <button
                        onClick={() => selectTheme('system')}
                        className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-ink-50 dark:hover:bg-ink-850 flex items-center gap-2 transition-colors ${themeMode === 'system' ? 'text-jade-500 font-semibold bg-jade-50/25 dark:bg-jade-500/5' : 'text-ink-700 dark:text-ink-300'}`}
                      >
                        <Laptop className="w-4 h-4 text-jade-400 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span>Follow Device</span>
                            {themeMode === 'system' && <CheckCircle className="w-3.5 h-3.5 text-jade-500" />}
                          </div>
                          <span className="text-xs text-ink-400 block leading-none mt-0.5 font-normal font-sans">Auto-sync with system theme</span>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>



            </div>

          </div>

        </div>
      </div>

      {/* Mobile-responsive search bar - visible while browsing the marketplace */}
      {(currentView === 'marketplace' || currentView === 'product') && (
        <div className="md:hidden px-4 pb-3 pt-0.5 border-t border-ink-100 dark:border-ink-800/65 bg-white/95 dark:bg-ink-900/95 relative">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-ink-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="search-input-mobile"
              type="text"
              placeholder="Search products, brands, locations..."
              value={searchQuery}
              onFocus={() => setShowMobileRecentDropdown(true)}
              onBlur={() => setTimeout(() => setShowMobileRecentDropdown(false), 250)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveSearchQuery(searchQuery);
                  setShowMobileRecentDropdown(false);
                }
              }}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-ink-100 dark:bg-ink-800 border-none rounded-full focus:outline-none focus:ring-2 focus:ring-jade-500 text-ink-800 dark:text-white transition-all placeholder:text-ink-400 dark:placeholder:text-ink-500 font-sans font-medium"
            />
          </div>

          {/* Mobile Recent Searches Dropdown */}
          {showMobileRecentDropdown && recentSearches.length > 0 && (
            <div 
              className="absolute left-4 right-4 bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 rounded-2xl shadow-xl z-50 mt-1 py-3 overflow-hidden animate-slide-in"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between px-4 pb-2 mb-1 border-b border-ink-50 dark:border-ink-800/50 text-xs font-bold text-ink-400 dark:text-ink-500 font-mono tracking-wider">
                <span>RECENT SEARCHES</span>
                <button 
                  onClick={handleClearAllRecent}
                  className="hover:text-ink-500 transition-colors flex items-center gap-0.5 cursor-pointer"
                >
                  <Trash className="w-3 h-3" />
                  Clear All
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {recentSearches.map((item, index) => (
                  <div
                    key={index}
                    onClick={() => handleSelectRecentSearch(item)}
                    className="flex items-center justify-between px-4 py-2 hover:bg-ink-50 dark:hover:bg-ink-800/80 cursor-pointer text-xs font-semibold text-ink-700 dark:text-ink-300 transition-colors group"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <RefreshCw className="w-3.5 h-3.5 text-ink-400 dark:text-ink-500 group-hover:text-jade-500" />
                      <span className="truncate">{item}</span>
                    </span>
                    <button
                      onClick={(e) => handleDeleteRecentSearch(e, item)}
                      className="p-1 hover:bg-ink-50 dark:hover:bg-ink-950/20 rounded-md text-ink-400 dark:text-ink-500 hover:text-ink-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
