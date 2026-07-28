// components/BottomNavigation.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Home, Grid, User, ShoppingCart, X, ChevronRight, MessageSquare, Award } from 'lucide-react';
import { useDBState, dbOperations } from '../lib/store';

interface BottomNavigationProps {
  currentView: string;
  onNavigate: (view: string, payload?: any) => void;
  cartCount: number;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function BottomNavigation({
  currentView,
  onNavigate,
  cartCount,
  onOpenAuth,
  searchQuery,
  onSearchChange,
}: BottomNavigationProps) {
  const db = useDBState();
  const user = db.currentUser;
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);

  // Categories list exactly matching LandingView
  const categoriesList = [
    { name: 'Fashion', icon: '👕', slug: 'fashion', desc: 'Premium clothing & accessories' },
    { name: 'Electronics', icon: '🔌', slug: 'electronics', desc: 'Secure escrow tech purchases' },
    { name: 'Phones', icon: '📱', slug: 'phones', desc: 'Mobile devices & accessories' },
    { name: 'Laptops', icon: '💻', slug: 'laptops', desc: 'Workstations & personal notebooks' },
    { name: 'Furniture', icon: '🛋️', slug: 'furniture', desc: 'Comfortable home & office setups' },
    { name: 'Groceries', icon: '🍏', slug: 'groceries', desc: 'Fresh local Nigerian foodstuff' },
    { name: 'Beauty', icon: '💄', slug: 'beauty', desc: 'Skincare, cosmetics & cosmetics' },
    { name: 'Vehicles', icon: '🚗', slug: 'vehicles', desc: 'Verified local cars & spare parts' },
    { name: 'Books', icon: '📚', slug: 'books', desc: 'Academic, fiction & business titles' },
  ];

  // Dynamic Badge calculation for "You" tab
  // Defaults to 18 as shown in reference image for that aesthetic touch, or displays actual unread count if user has some!
  const unreadAlertsCount = user 
    ? db.notifications.filter(n => n.userId === user.id && !n.isRead).length || 18
    : 18;

  const handleHomeClick = () => {
    onSearchChange(''); // Reset search
    onNavigate('landing');
  };

  const handleCategorySelect = (slug: string) => {
    setIsCategorySheetOpen(false);
    onSearchChange(slug);
    onNavigate('landing');
  };

  const handleYouClick = () => {
    if (user) {
      onNavigate('buyer-profile');
    } else {
      onOpenAuth('login');
    }
  };

  const handleCartClick = () => {
    if (!user) {
      onOpenAuth('register');
      return;
    }
    onNavigate('cart');
  };

  return (
    <>
      {/* PERSISTENT BOTTOM NAVIGATION BAR (Visible on Mobile / Medium Screens) */}
      <div 
        id="persistent-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 h-[68px] bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 px-4 pb-safe-bottom"
      >
        <div className="grid grid-cols-5 h-full items-center">
          {/* 1. HOME TAB */}
          <button
            id="bottom-nav-home"
            onClick={handleHomeClick}
            className="flex flex-col items-center justify-center h-full focus:outline-none cursor-pointer transition-transform duration-100 active:scale-95"
          >
            <Home 
              className={`w-5.5 h-5.5 transition-colors duration-200 ${
                currentView === 'landing' 
                  ? 'text-[#e00000] fill-[#e00000]' 
                  : 'text-slate-700 dark:text-slate-400'
              }`}
            />
            <span 
              className={`text-[9px] font-bold mt-1 tracking-wide font-sans transition-colors duration-200 ${
                currentView === 'landing' 
                  ? 'text-[#e00000]' 
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Home
            </span>
          </button>

          {/* 2. CHATS TAB */}
          <button
            id="bottom-nav-chats"
            onClick={() => {
              if (user) {
                onNavigate('chats');
              } else {
                onOpenAuth('login');
              }
            }}
            className="flex flex-col items-center justify-center h-full focus:outline-none cursor-pointer relative transition-transform duration-100 active:scale-95"
          >
            <div className="relative">
              <MessageSquare 
                className={`w-5.5 h-5.5 transition-colors duration-200 ${
                  currentView === 'chats' 
                    ? 'text-[#e00000] fill-[#e00000]/10' 
                    : 'text-slate-700 dark:text-slate-400'
                }`}
              />
              {user && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[8px] font-extrabold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-sm leading-none">
                  2
                </span>
              )}
            </div>
            <span 
              className={`text-[9px] font-bold mt-1 tracking-wide font-sans transition-colors duration-200 ${
                currentView === 'chats' 
                  ? 'text-[#e00000]' 
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Chats
            </span>
          </button>

          {/* 3. GP LOYALTY TAB */}
          <button
            id="bottom-nav-gp"
            onClick={() => {
              if (user) {
                onNavigate('loyalty');
              } else {
                onOpenAuth('login');
              }
            }}
            className="flex flex-col items-center justify-center h-full focus:outline-none cursor-pointer relative transition-transform duration-100 active:scale-95"
          >
            <div className="relative flex flex-col items-center">
              <Award 
                className={`w-5.5 h-5.5 transition-colors duration-200 ${
                  currentView === 'loyalty' 
                    ? 'text-[#e00000] fill-[#e00000]/10' 
                    : 'text-slate-700 dark:text-slate-400'
                }`}
              />
              {user && user.goodPoints > 0 && (
                <span className="absolute -top-1 -right-2.5 bg-amber-500 text-white text-[8px] font-extrabold px-1 h-3.5 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-sm leading-none whitespace-nowrap">
                  GP
                </span>
              )}
            </div>
            <span 
              className={`text-[9px] font-bold mt-1 tracking-wide font-sans transition-colors duration-200 ${
                currentView === 'loyalty' 
                  ? 'text-[#e00000]' 
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Loyalty
            </span>
          </button>

          {/* 4. YOU TAB */}
          <button
            id="bottom-nav-you"
            onClick={handleYouClick}
            className="flex flex-col items-center justify-center h-full focus:outline-none cursor-pointer relative transition-transform duration-100 active:scale-95"
          >
            <div className="relative">
              <User 
                className={`w-5.5 h-5.5 transition-colors duration-200 ${
                  ['buyer-profile', 'settings'].includes(currentView)
                    ? 'text-[#e00000] fill-[#e00000]/10' 
                    : 'text-slate-700 dark:text-slate-400'
                }`}
              />
              {/* Reference image orange "18" badge */}
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-[#ff6a00] text-white text-[8px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-sm leading-none">
                  {unreadAlertsCount}
                </span>
              )}
            </div>
            <span 
              className={`text-[9px] font-bold mt-1 tracking-wide font-sans transition-colors duration-200 ${
                ['buyer-profile', 'settings'].includes(currentView)
                  ? 'text-[#e00000]' 
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              You
            </span>
          </button>

          {/* 5. CART TAB */}
          <button
            id="bottom-nav-cart"
            onClick={handleCartClick}
            className="flex flex-col items-center justify-center h-full focus:outline-none cursor-pointer relative transition-transform duration-100 active:scale-95"
          >
            <div className="relative">
              <ShoppingCart 
                className={`w-5.5 h-5.5 transition-colors duration-200 ${
                  currentView === 'cart' 
                    ? 'text-[#e00000] fill-[#e00000]/10' 
                    : 'text-slate-700 dark:text-slate-400'
                }`}
              />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-600 text-white text-[8px] font-extrabold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white dark:border-slate-900 shadow-sm leading-none animate-pulse">
                  {cartCount}
                </span>
              )}
            </div>
            <span 
              className={`text-[9px] font-bold mt-1 tracking-wide font-sans transition-colors duration-200 ${
                currentView === 'cart' 
                  ? 'text-[#e00000]' 
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Cart
            </span>
          </button>
        </div>
      </div>

      {/* CATEGORY DRAWER / SHEET OVERLAY (Sliding up elegantly from the bottom) */}
      {isCategorySheetOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity duration-300 md:hidden">
          {/* Backdrop Touch Close */}
          <div className="absolute inset-0" onClick={() => setIsCategorySheetOpen(false)} />
          
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col animate-slide-in">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Grid className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-black text-slate-800 dark:text-white font-sans tracking-wide">
                  Explore Categories
                </span>
              </div>
              <button 
                onClick={() => setIsCategorySheetOpen(false)}
                className="p-1.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 hover:text-red-500 dark:text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Categories List */}
            <div className="overflow-y-auto py-3 px-4 space-y-2">
              {categoriesList.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => handleCategorySelect(cat.slug)}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-850 dark:hover:bg-slate-800 border border-gray-100 dark:border-slate-800/80 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl filter drop-shadow-sm group-hover:scale-110 transition-transform">
                      {cat.icon}
                    </span>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-200">
                        {cat.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {cat.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>

            {/* Bottom Safe Padding */}
            <div className="h-6 bg-white dark:bg-slate-900 pb-safe-bottom" />
          </div>
        </div>
      )}
    </>
  );
}
