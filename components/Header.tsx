// components/Header.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, ShoppingCart, Bell, User as UserIcon, Shield, RefreshCw, 
  MapPin, Award, Store, Sun, Moon, Laptop, LogIn, ChevronDown, CheckCircle, Sparkles,
  Menu, X, Gavel, Package, Eye, EyeOff, Trash, Zap, MessageSquare, Truck, DollarSign
} from 'lucide-react';
import { User, UserRole, getDBState, saveDBState, dbOperations, useDBState } from '../lib/store';
import { isDemoMode, isOwnerAdminEmail } from '@/lib/demo';
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
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('dark');
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');

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

  const handleSimulateAlert = (type: 'BID' | 'SAFEMEET' | 'ESCROW') => {
    if (!user) {
      alert("Please join or sign in to experience the real-time notification hub alerts!");
      return;
    }
    
    let title = "";
    let message = "";
    if (type === 'BID') {
      title = "⚠️ Outbid Alert!";
      message = "You have been outbid on 'MacBook Pro M3 Max'! Quick, update your bid to stay in the lead!";
    } else if (type === 'SAFEMEET') {
      title = "🤝 SafeMeet™ Proposal Received";
      message = "Seller Chidi has proposed Mega Plaza SafeMeet Cafe on Sunday at 2:00 PM under platform police surveillance.";
    } else {
      title = "📦 Escrow Package Dispatched";
      message = "Hurray! GoodSale Courier has picked up your iPhone 15 Pro Max from Fatima's hub. Track physical transit pin.";
    }

    dbOperations.createCustomNotification(user.id, title, message, type);
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

  const selectUserRole = (role: UserRole) => {
    void dbOperations.updateCurrentUserRole(role).then((res) => {
      if (!res.success) {
        alert(res.error || 'Could not change role');
        return;
      }
      setShowRoleSwitcher(false);
      onNavigate('landing');
    });
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
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo */}
          <div 
            id="logo-container"
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2 cursor-pointer select-none shrink-0"
          >
            <Logo iconSize={36} />
          </div>

          {/* Search Bar - Hidden on minimal views */}
          {currentView === 'landing' && (
            <div className="hidden md:flex flex-1 max-w-md relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
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
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-slate-800 border-none rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500"
              />

              {/* Recent Searches Dropdown */}
              {showRecentDropdown && recentSearches.length > 0 && (
                <div 
                  className="absolute left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xl z-50 py-3 overflow-hidden animate-slide-in"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between px-4 pb-2 mb-1 border-b border-gray-50 dark:border-slate-800/50 text-[10px] font-bold text-gray-400 dark:text-slate-500 font-mono tracking-wider">
                    <span>RECENT SEARCHES</span>
                    <button 
                      onClick={handleClearAllRecent}
                      className="hover:text-red-500 transition-colors flex items-center gap-0.5 cursor-pointer"
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
                        className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors group"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <RefreshCw className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 group-hover:text-emerald-500" />
                          <span className="truncate">{item}</span>
                        </span>
                        <button
                          onClick={(e) => handleDeleteRecentSearch(e, item)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
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
          <div className="hidden md:flex items-center gap-1.5 bg-gray-50/80 dark:bg-slate-850/80 p-1 rounded-xl border border-gray-200/50 dark:border-slate-800/80">
            <button
              onClick={() => onNavigate('landing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                currentView === 'landing'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Market</span>
            </button>
            <button
              onClick={() => {
                if (user) {
                  onNavigate('chats');
                } else {
                  onOpenAuth?.('login');
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                currentView === 'chats'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                currentView === 'cart'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5 text-orange-500" />
              <span>Cart ({cartCount})</span>
            </button>
            {user && (
              <button
                onClick={() => onNavigate('loyalty')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold tracking-wide transition-all cursor-pointer ${
                  currentView === 'loyalty'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400'
                }`}
              >
                <Award className="w-3.5 h-3.5 text-amber-500" />
                <span>Loyalty</span>
              </button>
            )}
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
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors relative cursor-pointer"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
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
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors relative cursor-pointer"
              >
                <Bell className="w-5 h-5" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                )}
              </button>

              {showNotifications && (
                <div id="notifications-tray" className="absolute right-0 mt-3 w-96 max-h-[500px] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 flex flex-col animate-slide-in">
                  
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-950/20">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-slate-900 dark:text-white font-sans">Notification Hub</span>
                      {unreadNotifications.length > 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-black bg-red-500/10 text-red-500 dark:text-red-400 rounded-full">
                          {unreadNotifications.length} New
                        </span>
                      )}
                    </div>
                    {unreadNotifications.length > 0 && (
                      <button 
                        onClick={handleClearNotifications}
                        className="text-[11px] text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 font-extrabold hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Filters Tab Panel */}
                  <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-800 flex gap-2 bg-white dark:bg-slate-900">
                    <button
                      onClick={() => setNotifFilter('all')}
                      className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border transition-all cursor-pointer ${
                        notifFilter === 'all'
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                          : 'bg-transparent text-slate-500 dark:text-slate-400 border-gray-200 dark:border-slate-800 hover:text-slate-700'
                      }`}
                    >
                      All ({db.notifications.filter(n => n.userId === user?.id).length})
                    </button>
                    <button
                      onClick={() => setNotifFilter('unread')}
                      className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border transition-all cursor-pointer ${
                        notifFilter === 'unread'
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-transparent text-slate-500 dark:text-slate-400 border-gray-200 dark:border-slate-800 hover:text-emerald-500'
                      }`}
                    >
                      Unread ({unreadNotifications.length})
                    </button>
                  </div>

                  {/* Notification List Container */}
                  <div className="divide-y divide-gray-100 dark:divide-slate-850 max-h-64 overflow-y-auto flex-1">
                    {db.notifications.filter(n => n.userId === user?.id && (notifFilter === 'all' || !n.isRead)).length === 0 ? (
                      <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                        <Bell className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 animate-bounce" />
                        <p className="text-xs font-medium font-sans text-slate-800 dark:text-slate-200">No {notifFilter === 'unread' ? 'unread' : ''} notifications</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                          Your safe trading updates, bids, and escrow dispatches will appear here.
                        </p>
                      </div>
                    ) : (
                      db.notifications
                        .filter(n => n.userId === user?.id && (notifFilter === 'all' || !n.isRead))
                        .map((notif) => {
                          // Icon selector based on type
                          let IconComp = Bell;
                          let iconBg = "bg-purple-500/10 text-purple-600 dark:text-purple-400";
                          if (notif.type === 'BID') {
                            IconComp = Gavel;
                            iconBg = "bg-amber-500/10 text-amber-600 dark:text-amber-400";
                          } else if (notif.type === 'SAFEMEET') {
                            IconComp = Shield;
                            iconBg = "bg-blue-500/10 text-blue-600 dark:text-blue-400";
                          } else if (notif.type === 'ESCROW') {
                            IconComp = Package;
                            iconBg = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
                          } else if (notif.type === 'POINTS') {
                            IconComp = Award;
                            iconBg = "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
                          }

                          return (
                            <div 
                              key={notif.id} 
                              className={`p-3.5 flex items-start gap-3 transition-colors relative group ${
                                notif.isRead 
                                  ? 'opacity-75 hover:opacity-100 bg-white dark:bg-slate-900' 
                                  : 'bg-emerald-50/10 dark:bg-emerald-500/[0.02] hover:bg-emerald-50/20 dark:hover:bg-emerald-500/[0.04]'
                              }`}
                            >
                              {/* Unread dot */}
                              {!notif.isRead && (
                                <span className="absolute top-4 left-1.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                              )}

                              {/* Icon category */}
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                                <IconComp className="w-4 h-4" />
                              </div>

                              {/* Content text */}
                              <div className="flex-1 min-w-0 pr-8">
                                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                  <h5 className="font-extrabold text-slate-900 dark:text-slate-100 text-xs truncate font-sans">
                                    {notif.title}
                                  </h5>
                                  <span className="text-[9px] text-gray-400 dark:text-slate-500 font-mono shrink-0">
                                    {notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                                <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed break-words font-sans">
                                  {notif.message}
                                </p>
                              </div>

                              {/* Hover actions */}
                              <div className="absolute right-2 top-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => dbOperations.toggleNotificationRead(notif.id)}
                                  className="p-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                                  title={notif.isRead ? "Mark as Unread" : "Mark as Read"}
                                >
                                  {notif.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => dbOperations.deleteNotification(notif.id)}
                                  className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 cursor-pointer"
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

                  {/* Real-time Simulator Panel */}
                  {user && (
                    <div className="p-3.5 bg-gray-50 dark:bg-slate-950 border-t border-gray-100 dark:border-slate-850 rounded-b-2xl">
                      <div className="flex items-center gap-1 mb-2">
                        <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/15 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-sans">
                          Real-Time Alerts Simulator
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => handleSimulateAlert('BID')}
                          className="py-1.5 px-2 bg-white dark:bg-slate-900 border border-amber-500/20 hover:bg-amber-500/5 hover:border-amber-500 text-[10px] font-bold rounded-lg text-amber-600 dark:text-amber-400 transition-all cursor-pointer flex flex-col items-center gap-1 text-center font-sans"
                          title="Simulate Gavel Outbid Alert"
                        >
                          <Gavel className="w-3.5 h-3.5 text-amber-500" />
                          <span>Outbid Bid</span>
                        </button>
                        <button
                          onClick={() => handleSimulateAlert('SAFEMEET')}
                          className="py-1.5 px-2 bg-white dark:bg-slate-900 border border-blue-500/20 hover:bg-blue-500/5 hover:border-blue-500 text-[10px] font-bold rounded-lg text-blue-600 dark:text-blue-400 transition-all cursor-pointer flex flex-col items-center gap-1 text-center font-sans"
                          title="Simulate SafeMeet Proposal Alert"
                        >
                          <Shield className="w-3.5 h-3.5 text-blue-500" />
                          <span>SafeMeet™</span>
                        </button>
                        <button
                          onClick={() => handleSimulateAlert('ESCROW')}
                          className="py-1.5 px-2 bg-white dark:bg-slate-900 border border-emerald-500/20 hover:bg-emerald-500/5 hover:border-emerald-500 text-[10px] font-bold rounded-lg text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer flex flex-col items-center gap-1 text-center font-sans"
                          title="Simulate Escrow Dispatch Alert"
                        >
                          <Package className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Escrow Sent</span>
                        </button>
                      </div>
                    </div>
                  )}

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
                  className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 hover:from-amber-500/20 hover:to-yellow-500/20 border border-amber-500/30 dark:border-yellow-500/20 text-amber-600 dark:text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all shrink-0"
                  title="Your GoodPoints Loyalty Balance"
                >
                  <Award className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
                  <span>{user.goodPoints.toLocaleString()} GP</span>
                </div>
              )}

              {/* Brand Kit Showcase Button */}
              <button
                id="brand-center-link"
                onClick={() => onNavigate('brand-center')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border select-none ${
                  currentView === 'brand-center'
                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-750 border-gray-200 dark:border-slate-700'
                }`}
                title="Open GoodSale Brand Identity Kit"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span>Brand Spec</span>
              </button>

              {/* My Buyer Profile Link */}
              {user ? (
                <button
                  id="buyer-profile-link"
                  onClick={() => onNavigate('buyer-profile')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border select-none ${
                    currentView === 'buyer-profile'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/10'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-orange-500 hover:bg-slate-100 dark:hover:bg-slate-750 border-gray-200 dark:border-slate-700'
                  }`}
                  title="View Buyer Profile"
                >
                  <UserIcon className="w-3.5 h-3.5 text-orange-500" />
                  <span>My Profile</span>
                </button>
              ) : null}

              {/* Settings Configuration Link */}
              {user ? (
                <button
                  id="settings-link"
                  onClick={() => onNavigate('settings')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border select-none ${
                    currentView === 'settings'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/10'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-750 border-gray-200 dark:border-slate-700'
                  }`}
                  title="Configure Settings"
                >
                  <UserIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Settings</span>
                </button>
              ) : null}

              {/* GoodDispatch Link */}
              {user ? (
                <button
                  id="dispatch-link"
                  onClick={() => onNavigate('dispatch')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border select-none ${
                    currentView === 'dispatch'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-750 border-gray-200 dark:border-slate-700'
                  }`}
                  title="Open GoodDispatch Delivery Network"
                >
                  <Truck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>GoodDispatch™</span>
                </button>
              ) : null}

              {/* Revenue Hub Link */}
              {user ? (
                <button
                  id="revenue-link"
                  onClick={() => onNavigate('revenue')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border select-none ${
                    currentView === 'revenue'
                      ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/10'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-750 border-gray-200 dark:border-slate-700'
                  }`}
                  title="Open Revenue Hub"
                >
                  <DollarSign className="w-3.5 h-3.5 text-amber-500" />
                  <span>Revenue Hub</span>
                </button>
              ) : null}

              {/* Sign In / Register / Logout Buttons */}
              {!user ? (
                <div className="flex items-center gap-2">
                  <button
                    id="auth-login-btn"
                    onClick={() => onOpenAuth?.('login')}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-sans font-bold rounded-lg text-xs hover:shadow-sm transition-all cursor-pointer select-none border border-gray-200 dark:border-slate-755"
                  >
                    <LogIn className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Login</span>
                  </button>
                  <button
                    id="auth-register-btn"
                    onClick={() => onOpenAuth?.('register')}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold rounded-lg text-xs hover:shadow-md transition-all cursor-pointer select-none border border-emerald-500/10"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Sign Up</span>
                  </button>
                  {/* Guest login removed — use Supabase Auth */}
                </div>
              ) : (
                <button
                  id="auth-logout-btn"
                  onClick={async () => {
                    await dbOperations.logout();
                    onNavigate('landing');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/30 select-none shrink-0"
                  title="Log Out of current session"
                >
                  <span>Log Out</span>
                </button>
              )}

              {/* Theme System Selector */}
              <div className="relative">
                <button
                  id="theme-toggle-btn"
                  onClick={() => setShowThemeMenu(!showThemeMenu)}
                  className="p-2 text-slate-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                  title={`Theme: ${themeMode}`}
                >
                  {themeMode === 'light' && <Sun className="w-5 h-5 text-amber-500" />}
                  {themeMode === 'dark' && <Moon className="w-5 h-5 text-emerald-400" />}
                  {themeMode === 'system' && <Laptop className="w-5 h-5 text-indigo-400" />}
                </button>

                {showThemeMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowThemeMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 py-1.5 animate-slide-in">
                      <div className="px-3 py-1.5 border-b border-gray-100 dark:border-slate-800 mb-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Appearance Mode</span>
                      </div>
                      
                      <button
                        onClick={() => selectTheme('light')}
                        className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-gray-50 dark:hover:bg-slate-850 flex items-center gap-2 transition-colors ${themeMode === 'light' ? 'text-emerald-500 font-semibold bg-emerald-50/25 dark:bg-emerald-500/5' : 'text-slate-700 dark:text-slate-300'}`}
                      >
                        <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span>Light Theme</span>
                            {themeMode === 'light' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                          <span className="text-[9px] text-gray-400 block leading-none mt-0.5 font-normal font-sans">Crisp and clear off-white</span>
                        </div>
                      </button>

                      <button
                        onClick={() => selectTheme('dark')}
                        className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-gray-50 dark:hover:bg-slate-850 flex items-center gap-2 transition-colors ${themeMode === 'dark' ? 'text-emerald-500 font-semibold bg-emerald-50/25 dark:bg-emerald-500/5' : 'text-slate-700 dark:text-slate-300'}`}
                      >
                        <Moon className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span>Dark Theme</span>
                            {themeMode === 'dark' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                          <span className="text-[9px] text-gray-400 block leading-none mt-0.5 font-normal font-sans">Deep Navy premium night mode</span>
                        </div>
                      </button>

                      <button
                        onClick={() => selectTheme('system')}
                        className={`w-full text-left px-3 py-2 text-xs font-sans hover:bg-gray-50 dark:hover:bg-slate-850 flex items-center gap-2 transition-colors ${themeMode === 'system' ? 'text-emerald-500 font-semibold bg-emerald-50/25 dark:bg-emerald-500/5' : 'text-slate-700 dark:text-slate-300'}`}
                      >
                        <Laptop className="w-4 h-4 text-indigo-400 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span>Follow Device</span>
                            {themeMode === 'system' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                          <span className="text-[9px] text-gray-400 block leading-none mt-0.5 font-normal font-sans">Auto-sync with system theme</span>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>



              {/* Custom Sidebar Nav Indicators for Dashboards */}
              {user && (
                user.role === UserRole.ADMIN || 
                user.role === UserRole.SUPER_ADMIN || 
                isOwnerAdminEmail(user.email)
              ) && (
                <button 
                  onClick={() => onNavigate('admin')}
                  className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${currentView === 'admin' ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-200'}`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin Panel</span>
                </button>
              )}

              {user && (user.role === UserRole.BUSINESS || user.role === UserRole.VERIFIED_BUSINESS || user.role === UserRole.SELLER || user.role === UserRole.VERIFIED_SELLER) && (
                <button 
                  onClick={() => onNavigate('dashboard')}
                  className={`p-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${currentView === 'dashboard' ? 'bg-amber-500 text-white border-amber-500 shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:bg-gray-200'}`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Seller Hub</span>
                </button>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* Mobile-responsive search bar - visible only on smaller viewports when in landing view */}
      {currentView === 'landing' && (
        <div className="md:hidden px-4 pb-3 pt-0.5 border-t border-gray-100 dark:border-slate-800/65 bg-white/95 dark:bg-slate-900/95 relative">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
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
              className="w-full pl-10 pr-4 py-2 text-xs bg-gray-100 dark:bg-slate-800 border-none rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 font-sans font-medium"
            />
          </div>

          {/* Mobile Recent Searches Dropdown */}
          {showMobileRecentDropdown && recentSearches.length > 0 && (
            <div 
              className="absolute left-4 right-4 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xl z-50 mt-1 py-3 overflow-hidden animate-slide-in"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between px-4 pb-2 mb-1 border-b border-gray-50 dark:border-slate-800/50 text-[10px] font-bold text-gray-400 dark:text-slate-500 font-mono tracking-wider">
                <span>RECENT SEARCHES</span>
                <button 
                  onClick={handleClearAllRecent}
                  className="hover:text-red-500 transition-colors flex items-center gap-0.5 cursor-pointer"
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
                    className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors group"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <RefreshCw className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 group-hover:text-emerald-500" />
                      <span className="truncate">{item}</span>
                    </span>
                    <button
                      onClick={(e) => handleDeleteRecentSearch(e, item)}
                      className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md text-gray-400 dark:text-slate-500 hover:text-red-500 transition-colors"
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
