// components/LandingView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, Shield, Zap, Flame, Award, MapPin, CheckCircle, 
  Sparkles, ArrowRight, Star, Heart, Grid, ShoppingBag, Eye, User,
  ChevronLeft, ChevronRight, Store, Truck, Lock, Handshake, ShieldCheck,
  Shirt, Cpu, Smartphone, Laptop, Armchair, Apple, Car, BookOpen
} from 'lucide-react';
import { Product, getDBState, UserRole, useDBState, dbOperations } from '../lib/store';
import { SmartAvatar } from './ui/SmartImage';
import LottieAnimation from './ui/LottieAnimation';
import goodsaleLoader from '../lib/lottie/goodsale-loader.json';

interface LandingViewProps {
  onSelectProduct: (productId: number) => void;
  searchQuery: string;
  onNavigate: (view: string, payload?: any) => void;
  onAddToCart: (productId: number) => void;
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

const CATEGORIES = [
  { name: 'Fashion', slug: 'fashion' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Phones', slug: 'phones' },
  { name: 'Laptops', slug: 'laptops' },
  { name: 'Furniture', slug: 'furniture' },
  { name: 'Groceries', slug: 'groceries' },
  { name: 'Beauty', slug: 'beauty' },
  { name: 'Vehicles', slug: 'vehicles' },
  { name: 'Books', slug: 'books' },
];

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  fashion: Shirt,
  electronics: Cpu,
  phones: Smartphone,
  laptops: Laptop,
  furniture: Armchair,
  groceries: Apple,
  beauty: Sparkles,
  vehicles: Car,
  books: BookOpen,
};

export default function LandingView({
  onSelectProduct,
  searchQuery,
  onNavigate,
  onAddToCart,
  onOpenAuth,
}: LandingViewProps) {
  const db = useDBState();
  const [activeMainTab, setActiveMainTab] = useState<'marketplace' | 'flash_sale' | 'auction'>('marketplace');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  
  // Promotional Carousel State
  const [currentPromoIndex, setCurrentPromoIndex] = useState<number>(0);

  // Real daily flash-sale countdown — resets at midnight, no fake offsets.
  const getTimeToMidnight = () => {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const diff = Math.max(0, end.getTime() - now.getTime());
    return {
      hours: Math.floor(diff / 3.6e6),
      minutes: Math.floor((diff % 3.6e6) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
    };
  };
  const [timeLeft, setTimeLeft] = useState(getTimeToMidnight);

  // Live feed + traders derived from real marketplace data (no fake activity)
  const liveActivities = React.useMemo(() => {
    const lines: string[] = [];
    const recentProducts = [...db.products]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 4);
    for (const p of recentProducts) {
      const seller = db.users.find((u) => u.id === p.sellerId);
      lines.push(
        `New listing "${p.title}" by @${seller?.username || 'seller'} — ₦${p.price.toLocaleString()} under escrow`
      );
    }
    const recentOrders = [...db.orders]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 4);
    for (const o of recentOrders) {
      lines.push(`Order ${o.orderNumber} → ${o.status.replace(/_/g, ' ')}`);
    }
    const recentBids = [...(db.bids || [])]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 3);
    for (const bid of recentBids) {
      const bidder = db.users.find((u) => u.id === bid.userId);
      lines.push(`₦${bid.amount.toLocaleString()} bid by @${bidder?.username || 'buyer'}`);
    }
    if (lines.length === 0) {
      return ['Marketplace is live — list an item or place a bid to appear here'];
    }
    return lines.slice(0, 6);
  }, [db.products, db.orders, db.bids, db.users]);

  // Real escrow volume derived from live orders — shown in the hero.
  const liveStats = React.useMemo(() => {
    const escrowHeld = (db.orders || [])
      .filter(o => ['PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DISPUTED'].includes(String(o.status)))
      .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    return {
      listings: db.products.length,
      traders: db.users.length,
      escrowHeld,
    };
  }, [db.products, db.users, db.orders]);

  const onlineTraders = React.useMemo(() => {
    return db.users
      .filter((u) =>
        u.role === UserRole.VERIFIED_SELLER ||
        u.role === UserRole.VERIFIED_BUSINESS ||
        u.role === UserRole.SELLER ||
        u.role === UserRole.BUYER ||
        u.role === UserRole.BUSINESS
      )
      .slice(0, 6)
      .map((u) => {
        const profile = db.profiles.find((p) => p.userId === u.id);
        return {
          id: u.id,
          name: u.username || u.fullName || 'trader',
          city: profile?.city || 'Nigeria',
          photo: profile?.photoUrl || '',
          isPulsing: true,
        };
      });
  }, [db.users, db.profiles]);

  // Promo Carousel Auto-Play Loop
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentPromoIndex(prev => (prev === 0 ? 1 : 0));
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  // Flash Sale Countdown Logic
  useEffect(() => {
    const interval = setInterval(() => setTimeLeft(getTimeToMidnight()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Toggle user favorite
  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
  };

  // Trigger Gemini API search grounding & semantic recommendations
  const handleAiSmartSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsAiLoading(true);
    setAiAnalysis(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recommend',
          payload: { query: searchQuery }
        })
      });
      const res = await response.json();
      if (res.success) {
        setAiAnalysis(res.recommendations);
      }
    } catch (e) {
      console.error('Failed to parse AI search recommendations:', e);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Perform filtering logic
  const filteredProducts = db.products.filter(product => {
    // 1. Search Query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesText = product.title.toLowerCase().includes(q) || 
                          product.description.toLowerCase().includes(q) ||
                          product.category.toLowerCase().includes(q) ||
                          (product.brand && product.brand.toLowerCase().includes(q));
      if (!matchesText) return false;
    }

    // 2. Category filter
    if (selectedCategory && product.category.toLowerCase() !== selectedCategory.toLowerCase()) {
      return false;
    }

    // 3. City/Location Filter
    if (selectedCity) {
      const sellerProfile = db.profiles.find(p => p.userId === product.sellerId);
      if (sellerProfile && sellerProfile.city.toLowerCase() !== selectedCity.toLowerCase()) {
        return false;
      }
    }

    // 4. Verified Sellers Filter
    if (onlyVerified) {
      const seller = db.users.find(u => u.id === product.sellerId);
      if (seller && seller.role !== UserRole.VERIFIED_SELLER && seller.role !== UserRole.VERIFIED_BUSINESS) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen pb-16 transition-colors duration-300">
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* Temu-style wide green promise bar */}
        <div className="w-full bg-emerald-600 text-white rounded-2xl px-4 py-3.5 mb-6 flex flex-wrap justify-between items-center gap-2 text-xs font-bold shadow-md">
          <div className="flex items-center gap-2">
            <span className="bg-white text-emerald-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black">✓</span>
            <span>Why choose GoodSale? Safe Payments.</span>
          </div>
          <div className="flex gap-4 sm:gap-6 flex-wrap font-medium text-[11px] text-emerald-100">
            <span>🔒 Secure Escrow Lock</span>
            <span>⚡ Instant Payout Post-PIN</span>
            <span>🤝 Anti-Fraud Guarantee</span>
          </div>
        </div>

        {/* Temu/AliExpress Style Promo & Trust Banner */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-2xl">
            <span className="text-xl">🚚</span>
            <div>
              <p className="font-extrabold text-[11px] leading-tight text-emerald-600 dark:text-emerald-400 font-sans">Escrow Courier</p>
              <p className="text-[9px] text-gray-400 font-normal">Insured & tracked transit</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 px-4 py-3 rounded-2xl">
            <span className="text-xl">🛡️</span>
            <div>
              <p className="font-extrabold text-[11px] leading-tight text-amber-600 font-sans">Return within 90d</p>
              <p className="text-[9px] text-gray-400 font-normal">From purchase date guarantee</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 px-4 py-3 rounded-2xl">
            <span className="text-xl">⚡</span>
            <div>
              <p className="font-extrabold text-[11px] leading-tight text-blue-600 dark:text-blue-400 font-sans">Safe Payments</p>
              <p className="text-[9px] text-gray-400 font-normal">Funds locked till PIN delivery</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 px-4 py-3 rounded-2xl">
            <span className="text-xl">🔥</span>
            <div>
              <p className="font-extrabold text-[11px] leading-tight text-purple-600 dark:text-purple-400 font-sans">Verified Merchants</p>
              <p className="text-[9px] text-gray-400 font-normal">Direct-from-vetted sellers</p>
            </div>
          </div>
        </div>

        {/* PREMIUM MAIN VIEW TABS (MARKETPLACE, FLASH SALE, AUCTION) */}
        <div className="w-full bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/85 rounded-3xl p-1.5 sm:p-2 mb-6 sm:mb-8 flex gap-1 sm:gap-2 shadow-sm sticky top-[106px] md:top-16 z-20 backdrop-blur-md bg-white/95 dark:bg-slate-900/95 transition-all">
          <button
            onClick={() => setActiveMainTab('marketplace')}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3.5 rounded-2xl font-sans font-extrabold text-[10px] sm:text-xs md:text-sm uppercase tracking-wide sm:tracking-wider transition-all cursor-pointer ${
              activeMainTab === 'marketplace'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20 scale-[1.01]'
                : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-slate-800'
            }`}
          >
            <span>🛒</span>
            <span className="hidden sm:inline">Marketplace Deals</span>
            <span className="inline sm:hidden">Marketplace</span>
            <span className={`ml-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[8px] sm:text-[10px] ${activeMainTab === 'marketplace' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-800 text-slate-500'}`}>
              {db.products.filter(p => !p.isAuction).length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveMainTab('flash_sale')}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3.5 rounded-2xl font-sans font-extrabold text-[10px] sm:text-xs md:text-sm uppercase tracking-wide sm:tracking-wider transition-all cursor-pointer ${
              activeMainTab === 'flash_sale'
                ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg shadow-red-500/20 scale-[1.01]'
                : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-slate-800'
            }`}
          >
            <span>⚡</span>
            <span className="hidden xs:inline">Flash Sales</span>
            <span className="inline xs:hidden">Flash</span>
            <span className={`ml-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[8px] sm:text-[10px] ${activeMainTab === 'flash_sale' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-800 text-slate-500'}`}>
              {Math.min(db.products.filter(p => !p.isAuction).length, 4)}
              <span className="hidden sm:inline"> Active</span>
            </span>
          </button>

          <button
            onClick={() => setActiveMainTab('auction')}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3.5 rounded-2xl font-sans font-extrabold text-[10px] sm:text-xs md:text-sm uppercase tracking-wide sm:tracking-wider transition-all cursor-pointer ${
              activeMainTab === 'auction'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/20 scale-[1.01]'
                : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-slate-800'
            }`}
          >
            <span>🔨</span>
            <span className="hidden sm:inline">Auction Room</span>
            <span className="inline sm:hidden">Auctions</span>
            <span className={`ml-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[8px] sm:text-[10px] ${activeMainTab === 'auction' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-800 text-slate-500'}`}>
              {db.products.filter(p => p.isAuction).length}
            </span>
          </button>
        </div>

        {activeMainTab === 'marketplace' && (
          <>
            {/* 2. JUMIA-STYLE INTERACTIVE PRODUCT CATEGORIES */}
            <section id="categories-section" className="mb-10 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/80 p-6 sm:p-8 rounded-[32px] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display font-black text-xl text-slate-900 dark:text-white flex items-center gap-2">
                <Grid className="w-5.5 h-5.5 text-orange-500 animate-spin-slow" />
                Explore Categories
              </h2>
              <p className="text-xs text-slate-400 mt-1">Shop verified Nigerian deals by department</p>
            </div>
            {selectedCategory && (
              <button 
                onClick={() => setSelectedCategory(null)}
                className="text-xs px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500 text-orange-600 dark:text-orange-400 hover:text-white rounded-xl font-bold transition-all cursor-pointer"
              >
                Show All Categories
              </button>
            )}
          </div>

          {/* Jumia Circular Grid / Flex Layout */}
          <div className="flex overflow-x-auto gap-4 sm:gap-6 pb-4 scrollbar-hide justify-between items-center px-1">
            {[
              { name: 'Fashion', icon: '👕', slug: 'fashion', color: 'orange' },
              { name: 'Electronics', icon: '🔌', slug: 'electronics', color: 'purple' },
              { name: 'Phones', icon: '📱', slug: 'phones', color: 'teal' },
              { name: 'Laptops', icon: '💻', slug: 'laptops', color: 'blue' },
              { name: 'Furniture', icon: '🛋️', slug: 'furniture', color: 'indigo' },
              { name: 'Groceries', icon: '🍏', slug: 'groceries', color: 'emerald' },
              { name: 'Beauty', icon: '💄', slug: 'beauty', color: 'pink' },
              { name: 'Vehicles', icon: '🚗', slug: 'vehicles', color: 'cyan' },
              { name: 'Books', icon: '📚', slug: 'books', color: 'amber' },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.slug;
              // Map colors to beautiful Tailwind class pairings
              const colorMaps: Record<string, string> = {
                orange: 'bg-orange-100 hover:bg-orange-200 text-orange-600 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400',
                purple: 'bg-purple-100 hover:bg-purple-200 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400',
                teal: 'bg-teal-100 hover:bg-teal-200 text-teal-600 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400',
                blue: 'bg-blue-100 hover:bg-blue-200 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400',
                indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-600 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400',
                emerald: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400',
                pink: 'bg-pink-100 hover:bg-pink-200 text-pink-600 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400',
                cyan: 'bg-cyan-100 hover:bg-cyan-200 text-cyan-600 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400',
                amber: 'bg-amber-100 hover:bg-amber-200 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400',
              };
              const colorClass = colorMaps[cat.color] || colorMaps.orange;

              return (
                <button
                  key={cat.slug}
                  onClick={() => setSelectedCategory(isSelected ? null : cat.slug)}
                  className="flex flex-col items-center gap-2.5 group shrink-0 cursor-pointer focus:outline-none"
                >
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-2xl sm:text-3xl border-2 transition-all relative ${
                    isSelected 
                      ? 'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-105' 
                      : `${colorClass} border-transparent shadow-sm group-hover:scale-105 group-hover:shadow-md`
                  }`}>
                    {cat.icon}
                    
                    {/* Selected Indicator Badge */}
                    {isSelected && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white dark:border-slate-900 animate-pulse">
                        ✓
                      </span>
                    )}
                  </div>
                  <span className={`text-[11px] sm:text-xs font-sans font-bold tracking-tight transition-colors ${
                    isSelected ? 'text-orange-500 dark:text-orange-400' : 'text-slate-700 dark:text-slate-300 group-hover:text-orange-500'
                  }`}>
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </>
    )}

        {activeMainTab === 'flash_sale' && (
          /* 3. REDESIGNED JUMIA-STYLE ACTIVE FLASH SALES */
          <section id="flash-sales-section" className="mb-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-[32px] shadow-sm relative overflow-hidden">
          
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 animate-pulse">
                <Flame className="w-5.5 h-5.5 fill-red-500/10" />
              </div>
              <div>
                <h2 className="font-display font-black text-lg text-slate-900 dark:text-white leading-tight">Lightning Flash Sales</h2>
                <p className="text-[10px] text-gray-400">Super discount prices, valid for limited hours only</p>
              </div>
            </div>
            
            {/* Countdown timer UI */}
            <div className="flex items-center gap-2 bg-red-50/80 dark:bg-red-950/20 px-3 py-1.5 rounded-xl border border-red-100 dark:border-red-900/30 text-xs font-bold text-red-600 dark:text-red-400">
              <span className="uppercase tracking-wider text-[9px] font-black">Ends In:</span>
              <span className="font-mono text-xs font-black tracking-widest animate-pulse">
                {String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m : {String(timeLeft.seconds).padStart(2, '0')}s
              </span>
            </div>
          </div>
 
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {db.products.filter(p => !p.isAuction).slice(0, 2).map((item) => {
              const discountedPrice = Math.round(item.price * 0.85);
              const soldPercentage = Math.floor(item.id * 17 + 45) % 35 + 60; // stable dynamic demo percentage
              const stockLeft = 3 + (item.id % 4);
              
              return (
                <div 
                  key={item.id}
                  onClick={() => onSelectProduct(item.id)}
                  className="flex gap-4 p-4 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl hover:bg-white dark:hover:bg-slate-800 hover:shadow-md cursor-pointer transition-all border border-gray-100 dark:border-slate-800/80 group relative overflow-hidden"
                >
                  {/* Left image wrapper */}
                  <div className="w-28 h-28 rounded-xl bg-gray-200 dark:bg-slate-700 relative overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    
                    {/* Flash Sale absolute tags */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-[9px] font-black rounded-lg uppercase shadow-sm tracking-wide">
                      -15% OFF
                    </span>
                    <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm text-white text-[8px] font-bold rounded">
                      ⚡ FLASH DEAL
                    </span>
                  </div>

                  {/* Right specifications & progressive indicators */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[9px] font-mono font-bold text-red-500 uppercase tracking-widest">{item.category}</span>
                        <span className="text-[10px] text-gray-400 dark:text-slate-500 font-mono">@{item.brand || 'Vetted'}</span>
                      </div>
                      <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-red-500 transition-colors">{item.title}</h4>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 line-clamp-1 mt-0.5">{item.description}</p>
                    </div>
                    
                    {/* Progress Bar and Stock Tracker */}
                    <div className="my-2.5 space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-bold">
                        <span className="text-slate-400">Sold: {soldPercentage}%</span>
                        <span className="text-red-500 uppercase tracking-wider font-extrabold animate-pulse">Only {stockLeft} left!</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-red-500 to-orange-500 h-full rounded-full" style={{ width: `${soldPercentage}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono font-black text-base text-red-600 dark:text-red-400">₦{discountedPrice.toLocaleString()}</span>
                        <span className="font-mono text-xs text-gray-400 line-through">₦{item.price.toLocaleString()}</span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCart(item.id);
                        }}
                        className="px-3.5 py-1.5 bg-red-500 hover:bg-red-600 active:scale-95 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md shadow-red-500/10 cursor-pointer"
                      >
                        Buy Now
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </section>
        )}

        {activeMainTab === 'auction' && (
          /* 4. PREMIUM REDESIGNED LIVE AUCTION BIDDING ZONE */
          <section id="auctions-section" className="mb-10 bg-slate-950 text-white rounded-[32px] p-6 border border-amber-500/20 shadow-xl relative overflow-hidden">
          
          {/* Subtle live golden radial background */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/10 animate-pulse">
                <Zap className="w-5.5 h-5.5 fill-amber-500/10" />
              </div>
              <div>
                <h2 className="font-display font-black text-lg text-white leading-tight flex items-center gap-1.5">
                  Live Auctions Escrow
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                </h2>
                <p className="text-[10px] text-slate-400">Direct instant bidding on premium certified merchant stock</p>
              </div>
            </div>
            
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full font-mono text-[9px] uppercase tracking-wider font-bold">
              ⚡ LIVE COUNTER ACTIVE
            </div>
          </div>
 
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative z-10">
            {db.products.filter(p => p.isAuction).slice(0, 2).map((item) => {
              const auction = db.auctions.find(a => a.productId === item.id);
              const bids = db.bids.filter(b => b.auctionId === auction?.id).sort((a,b) => b.amount - a.amount);
              const highestBid = bids.length > 0 ? bids[0].amount : (auction?.startingBid || 0);
 
              return (
                <div 
                  key={item.id}
                  onClick={() => onSelectProduct(item.id)}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/30 rounded-2xl overflow-hidden hover:shadow-2xl transition-all cursor-pointer flex flex-col sm:flex-row group"
                >
                  {/* Left Column: Image with live indicator */}
                  <div className="sm:w-44 h-48 bg-slate-800 relative overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-amber-500 text-slate-950 text-[8px] font-black rounded uppercase tracking-wider flex items-center gap-1 shadow-md">
                      <Zap className="w-2.5 h-2.5 text-slate-950 fill-slate-950" />
                      LIVE BID
                    </div>
                    <div className="absolute bottom-2.5 left-2.5 px-1.5 py-0.5 bg-black/60 text-white text-[8px] font-mono rounded">
                      Bids Casted: {bids.length}
                    </div>
                  </div>
 
                  {/* Right Column: Information, Bid Log, Quick Actions */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[9px] font-mono font-bold text-amber-400 uppercase tracking-widest">{item.brand || 'Premium'}</span>
                        <span className="text-[9px] text-slate-400 font-mono">Ends: {auction ? new Date(auction.endsAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : ''}</span>
                      </div>
                      <h4 className="font-display font-bold text-sm text-white line-clamp-1 mb-1 group-hover:text-amber-400 transition-colors">{item.title}</h4>
                      <p className="text-[11px] text-slate-400 line-clamp-1 leading-relaxed mb-3">{item.description}</p>
                      
                      {/* Interactive Bid Ticker */}
                      <div className="bg-slate-950/60 border border-slate-800/60 p-2 rounded-xl mb-3">
                        <span className="text-[8px] text-slate-500 uppercase tracking-wider block font-bold mb-1">Recent Bids Log</span>
                        {bids.slice(0, 2).length === 0 ? (
                          <span className="text-[9px] italic text-slate-500 block">No bids casted yet. Join in!</span>
                        ) : (
                          <div className="space-y-1">
                            {bids.slice(0, 2).map((b, idx) => (
                              <div key={b.id} className="flex justify-between items-center text-[9px] font-mono">
                                <span className="text-slate-400 truncate max-w-[80px]">@{b.username} {idx === 0 && '👑'}</span>
                                <span className="font-extrabold text-amber-400">₦{b.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
 
                    <div className="border-t border-slate-800/80 pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-mono leading-none mb-1">Highest Bid</span>
                          <span className="font-mono font-extrabold text-base text-white">₦{highestBid.toLocaleString()}</span>
                        </div>
                        
                        <div className="text-right">
                          <span className="text-[8px] text-slate-500 block uppercase font-mono">Minimum Next</span>
                          <span className="font-mono text-[10px] text-amber-500 font-bold">₦{(highestBid + 5000).toLocaleString()}</span>
                        </div>
                      </div>
 
                      {/* QUICK DIRECT BID TRIGGERS */}
                      <div className="flex gap-1.5 pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!db.currentUser) {
                              onOpenAuth?.('login');
                              return;
                            }
                            if (auction) {
                              dbOperations.submitBid(auction.id, highestBid + 5000);
                            }
                          }}
                          className="flex-1 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 hover:border-amber-500 text-amber-400 font-mono font-black text-[9px] uppercase rounded-lg transition-all text-center cursor-pointer active:scale-95"
                          title="Place quick bid of +₦5,000"
                        >
                          +₦5,000
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!db.currentUser) {
                              onOpenAuth?.('login');
                              return;
                            }
                            if (auction) {
                              dbOperations.submitBid(auction.id, highestBid + 20000);
                            }
                          }}
                          className="flex-1 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 border border-slate-700 hover:border-amber-500 text-amber-400 font-mono font-black text-[9px] uppercase rounded-lg transition-all text-center cursor-pointer active:scale-95"
                          title="Place quick bid of +₦20,000"
                        >
                          +₦20,000
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProduct(item.id);
                          }}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-display font-black text-[9px] uppercase tracking-wider rounded-lg transition-all cursor-pointer text-center"
                        >
                          Bid Info
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        )}

        {activeMainTab === 'marketplace' && (
          <>
            {/* Live Handshake Event Hub & Online Traders */}
            <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* A. Dynamic Scrolling Activity Feed */}
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 text-white rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Live Handshake Event Hub
              </span>
              <span className="text-[9px] text-slate-500 font-mono font-bold uppercase">Real-time Feed</span>
            </div>

            <div className="space-y-2 flex-1 flex flex-col justify-center min-h-[90px]">
              {liveActivities.slice(0, 3).map((act, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs transition-opacity duration-300">
                  <span className="text-emerald-500 font-bold shrink-0">⚡</span>
                  <p className="text-slate-300 font-sans leading-relaxed line-clamp-1">
                    {act}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* B. Real-time Active Traders Avatars */}
          <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
            <div>
              <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-orange-500 block mb-1">
                Online Escrow Traders
              </span>
              <h3 className="font-display font-black text-sm text-slate-900 dark:text-white">Active Peers Nearby</h3>
            </div>

            <div className="flex items-center gap-3 my-4">
              <div className="flex -space-x-2.5 overflow-hidden">
                {onlineTraders.length > 0 ? (
                  onlineTraders.map((trader) => (
                    <div
                      key={trader.id}
                      className="relative w-10 h-10 rounded-full border-2 border-white dark:border-slate-900 overflow-hidden shrink-0 group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={trader.photo} alt={trader.name} className="w-full h-full object-cover" />
                      {trader.isPulsing && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="h-10 flex items-center text-[10px] text-slate-400 font-mono">
                    Waiting for first traders…
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  {onlineTraders.length > 0
                    ? `${db.users.length} registered trader${db.users.length === 1 ? '' : 's'}`
                    : 'No traders yet'}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {onlineTraders.length > 0 ? 'Escrow channels ready' : 'Be the first to list'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Filter Controls */}
        <section className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-4 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            
            {/* City Selector */}
            <select
              value={selectedCity || ''}
              onChange={(e) => setSelectedCity(e.target.value || null)}
              className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-sans font-bold focus:outline-none"
            >
              <option value="">All Nigeria Cities</option>
              <option value="Gbagada">Gbagada (Lagos)</option>
              <option value="Ojo">Ojo (Lagos)</option>
              <option value="Abuja CBD">Abuja CBD (FCT)</option>
              <option value="Ikeja">Ikeja (Lagos)</option>
            </select>

            {/* Verified toggle */}
            <button
              onClick={() => setOnlyVerified(!onlyVerified)}
              className={`px-3 py-1.5 text-xs rounded-xl font-sans font-bold transition-all border ${onlyVerified ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
            >
              Only Verified Sellers
            </button>
          </div>

          <p className="text-xs text-gray-400 font-mono">Found {filteredProducts.length} items matching criteria</p>
        </section>

        {/* 6. Marketplace Product Catalog (AliExpress/Temu/Jumia style dense cards grid) */}
        <section id="catalog-section" className="mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display font-black text-xl text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5.5 h-5.5 text-emerald-500" />
                Marketplace Super Deals
              </h2>
              <p className="text-xs text-gray-400 mt-1">Direct-from-merchant listings with escrow payment protection guarantee.</p>
            </div>
            
            {/* Quick Jumia style promo badge */}
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 font-mono text-[10px] font-bold flex items-center gap-1.5 self-start sm:self-center">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
              ⚡ Escrow Guarantee Secure
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-[32px] border border-gray-200 dark:border-slate-800 shadow-sm">
              <ShoppingBag className="w-12 h-12 text-gray-300 dark:text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 dark:text-slate-400 text-sm font-bold mb-1">No products found</p>
              <p className="text-xs text-gray-400">Try loosening your search query or location filter.</p>
            </div>
          ) : (
            /* DENSE MULTI-COLUMN INTERACTIVE PRODUCT GRID (TEMU & ALIEXPRESS INSPIRED) */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3" id="products-catalog-grid">
              {filteredProducts.map((product) => {
                const seller = db.users.find(u => u.id === product.sellerId);
                const sellerProfile = db.profiles.find(p => p.userId === product.sellerId);
                const isSellerVerified = seller?.role === UserRole.VERIFIED_SELLER || seller?.role === UserRole.VERIFIED_BUSINESS;
                
                const productReviews = (db.reviews || []).filter(
                  (r) => r.productId === product.id && r.rating > 0
                );
                const avgRating =
                  productReviews.length > 0
                    ? (
                        productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
                      ).toFixed(1)
                    : null;
                const soldCount = (db.orders || []).filter(
                  (o) =>
                    o.productId === product.id &&
                    ['COMPLETED', 'DELIVERED', 'PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(
                      String(o.status)
                    )
                ).length;
                const stockLeft = Math.max(0, product.quantity ?? 0);

                const handleQuickAddToCart = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onAddToCart(product.id);
                };

                return (
                  <div 
                    key={product.id}
                    onClick={() => onSelectProduct(product.id)}
                    className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl hover:border-emerald-500/40 dark:hover:border-emerald-500/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer flex flex-col overflow-hidden relative"
                  >
                    
                    {/* A. Square Image Block with badges */}
                    <div className="aspect-square bg-gray-50 dark:bg-slate-950/40 relative overflow-hidden shrink-0 border-b border-gray-100 dark:border-slate-800/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={product.images[0]} 
                        alt={product.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Discount banner only when seller set a compare-at style deal via low stock flash */}
                      {product.stockStatus === 'LOW_STOCK' && (
                        <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-orange-600 dark:bg-orange-500 text-white text-[9px] font-mono font-black tracking-wider rounded shadow-md flex items-center gap-0.5">
                          <span>LOW STOCK</span>
                        </div>
                      )}

                      {stockLeft > 0 && stockLeft <= 5 && (
                        <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 bg-amber-500 text-slate-950 text-[8px] font-mono font-black uppercase tracking-wider rounded shadow-sm">
                          Only {stockLeft} left
                        </div>
                      )}

                      {/* Small Escrow lock overlay */}
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-slate-900/90 backdrop-blur-md text-[8px] font-mono font-bold text-emerald-400 rounded-md border border-emerald-500/20 shadow flex items-center gap-1">
                        <Shield className="w-2.5 h-2.5 text-emerald-400" />
                        <span>Escrow Locked</span>
                      </div>

                      {/* Favorite Heart Button */}
                      <button 
                        onClick={(e) => toggleFavorite(product.id, e)}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-full text-gray-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer shadow z-10"
                      >
                        <Heart className={`w-3 h-3 ${favorites.includes(product.id) ? 'fill-red-500 text-red-500' : ''}`} />
                      </button>
                    </div>

                    {/* B. Dense Details Text Block */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2.5 text-xs">
                      
                      <div className="space-y-1.5">
                        
                        {/* 1. Vendor Username & Link with Store icon */}
                        <div className="flex items-center justify-between text-[10px] bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-gray-100 dark:border-slate-800/60 font-sans">
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('seller-profile', { sellerId: product.sellerId });
                            }}
                            className="flex items-center gap-1 hover:text-emerald-500 cursor-pointer min-w-0 flex-1"
                            title="View Vendor Storefront"
                          >
                            <Store className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="font-bold text-slate-700 dark:text-slate-300 font-mono truncate text-[11px]">
                              @{seller?.username || 'vendor'}
                            </span>
                            {isSellerVerified && (
                              <CheckCircle className="w-3 h-3 text-amber-500 fill-amber-500/20 shrink-0" />
                            )}
                          </div>
                          <span className="text-[9px] font-mono font-bold text-gray-400 shrink-0 uppercase tracking-tight bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-gray-150 dark:border-slate-800 ml-1">
                            {sellerProfile?.city || 'Nigeria'}
                          </span>
                        </div>

                        {/* 2. Category name */}
                        <div className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                          {product.category}
                        </div>

                        {/* 3. Headline with 2-line clamp */}
                        <h4 className="font-sans font-bold text-xs text-slate-800 dark:text-slate-200 line-clamp-2 leading-tight group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors h-8">
                          {product.title}
                        </h4>

                        {/* 4. Rating & sold metrics from real reviews/orders */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                            {avgRating ? (
                              <>
                                <div className="flex text-amber-500 text-[11px]">
                                  {"★".repeat(Math.round(parseFloat(avgRating)))}
                                  {"☆".repeat(5 - Math.round(parseFloat(avgRating)))}
                                </div>
                                <span className="font-bold text-[10px] text-amber-600 dark:text-amber-400">
                                  {avgRating}
                                </span>
                                <span className="text-slate-400 text-[9px]">
                                  ({productReviews.length})
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-400 text-[9px]">No reviews yet</span>
                            )}
                            {soldCount > 0 && (
                              <span className="text-slate-400 text-[9px] ml-auto">{soldCount} sold</span>
                            )}
                          </div>
                          
                          {/* Escrow Delivery Badge */}
                          <div className="flex items-center justify-between text-[10px] font-mono mt-0.5">
                            <span className="text-emerald-600 dark:text-emerald-400 font-sans font-medium flex items-center gap-0.5">
                              Escrow Delivery
                            </span>
                          </div>
                        </div>

                        {stockLeft > 0 && stockLeft <= 8 && (
                          <div className="pt-0.5">
                            <div className="flex items-center justify-between text-[9px] font-mono text-gray-400">
                              <span className="text-orange-600 dark:text-orange-400 font-bold">
                                {stockLeft} in stock
                              </span>
                              {soldCount > 0 && <span>{soldCount} sold</span>}
                            </div>
                            <div className="w-full bg-gray-150 dark:bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-orange-500 h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(100, Math.max(8, (stockLeft / Math.max(stockLeft + soldCount, 1)) * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* 6. Price */}
                        <div className="pt-1">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="font-mono font-extrabold text-sm sm:text-base text-orange-600 dark:text-orange-400 leading-none">
                              ₦{product.price.toLocaleString()}
                            </span>
                          </div>
                        </div>

                      </div>

                      {/* C. Direct Action Footer */}
                      <div className="pt-2 border-t border-gray-100 dark:border-slate-800/80 flex items-center justify-between gap-1">
                        <span className="text-[8px] font-mono text-emerald-500 dark:text-emerald-400 font-black tracking-wider uppercase block">
                          ⚡ Escrow Safe
                        </span>
                        
                        <button 
                          onClick={handleQuickAddToCart}
                          className="w-7 h-7 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 dark:hover:text-white text-slate-800 dark:text-slate-300 rounded-full border border-gray-200 dark:border-slate-700/60 transition-all flex items-center justify-center shrink-0 shadow-sm cursor-pointer"
                          title="Add to Shopping Cart"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                        </button>
                      </div>

                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 7. Featured Verified Businesses */}
        <section id="businesses-section" className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display font-black text-lg text-slate-900 dark:text-white">
              Featured Verified Stores
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {db.businesses.map((biz) => (
              <div 
                key={biz.id}
                onClick={() => onNavigate('seller-profile', { sellerId: biz.ownerId })}
                className="p-5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl flex items-center gap-4 hover:shadow-md cursor-pointer transition-all relative overflow-hidden group hover:border-emerald-500/40"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center overflow-hidden shrink-0 border border-gray-100 dark:border-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={biz.logoUrl} alt={biz.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">{biz.name}</h4>
                    <span title="Premium Business Badge">
                      <CheckCircle className="w-4 h-4 text-amber-500 fill-amber-500/10 shrink-0" />
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 line-clamp-1 mb-2 leading-relaxed">{biz.description}</p>
                  
                  <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {biz.rating} ({biz.reviewsCount})
                    </span>
                    <span>Followers: {biz.followers}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </>
    )}

      </div>
    </div>
  );
}
