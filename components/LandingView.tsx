// components/LandingView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, Shield, Zap, Flame, Award, MapPin, CheckCircle, 
  Sparkles, Star, Heart, Grid, ShoppingBag,
  ChevronLeft, ChevronRight, Store, Truck, Lock, ShieldCheck,
  Shirt, Cpu, Smartphone, Laptop, Armchair, Apple, Car, BookOpen, Gavel
} from 'lucide-react';
import { Product, getDBState, UserRole, useDBState, dbOperations } from '../lib/store';
import { SmartAvatar } from './ui/SmartImage';
import EmptyState from './ui/EmptyState';
import AdSlot from './AdSlot';

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

// Real photography for the hero (delivery vans/riders + buyers). Hosted, CSP-allowed.
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

  // Real escrow volume derived from live orders — shown in the marketplace header.
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
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen pb-16 transition-colors duration-300">
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* MARKETPLACE HEADER — commerce-first; the marketing story lives on the landing page */}
        <section className="mb-8 rounded-[32px] border border-ink-200 bg-white p-6 shadow-sm sm:p-8 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-jade-600 dark:text-jade-400">
                Marketplace
              </span>
              <h1 className="mt-2 font-display text-2xl font-black tracking-tight text-ink-900 sm:text-3xl dark:text-white">
                Find it. Escrow it. Receive it.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-500">
                {liveStats.listings.toLocaleString()} live listings from{' '}
                {liveStats.traders.toLocaleString()} buyers, merchants and couriers across Nigeria.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-jade-600 dark:text-jade-400" /> Escrow on every order
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-jade-600 dark:text-jade-400" /> Verified sellers
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-jade-600 dark:text-jade-400" /> Tracked delivery
                </span>
              </div>
            </div>

            <dl className="grid shrink-0 grid-cols-2 gap-3">
              {[
                { label: 'Live listings', value: liveStats.listings.toLocaleString() },
                { label: 'Traders', value: liveStats.traders.toLocaleString() },
                { label: 'Held in escrow', value: `₦${liveStats.escrowHeld.toLocaleString()}` },
                { label: 'Escrow released', value: `${db.orders.filter((o) => String(o.status) === 'DELIVERED_SUCCESS').length}` },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-ink-100 bg-ink-50 px-4 py-3 dark:border-ink-800 dark:bg-ink-950/50"
                >
                  <dd className="font-mono text-lg font-black leading-none text-ink-900 dark:text-white">
                    {stat.value}
                  </dd>
                  <dt className="mt-1 font-mono text-xs uppercase tracking-widest text-ink-500">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Sponsored: top-of-home placement */}
        <AdSlot placement="HOME" onNavigate={onNavigate} className="mb-6" />

        {/* PREMIUM MAIN VIEW TABS (MARKETPLACE, FLASH SALE, AUCTION) */}
        <div className="w-full bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800/85 rounded-3xl p-1.5 sm:p-2 mb-6 sm:mb-8 flex gap-1 sm:gap-2 shadow-sm sticky top-[106px] md:top-16 z-20 backdrop-blur-md bg-white/95 dark:bg-ink-900/95 transition-all">
          <button
            onClick={() => setActiveMainTab('marketplace')}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3.5 rounded-2xl font-sans font-extrabold text-xs sm:text-xs md:text-sm uppercase tracking-wide sm:tracking-wider transition-all cursor-pointer ${
              activeMainTab === 'marketplace'
                ? 'bg-gradient-to-r from-jade-500 to-jade-600 text-white shadow-lg shadow-jade-500/20 scale-[1.01]'
                : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 hover:text-ink-800'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Marketplace Deals</span>
            <span className="inline sm:hidden">Marketplace</span>
            <span className={`ml-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs ${activeMainTab === 'marketplace' ? 'bg-white/20 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'}`}>
              {db.products.filter(p => !p.isAuction).length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveMainTab('flash_sale')}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3.5 rounded-2xl font-sans font-extrabold text-xs sm:text-xs md:text-sm uppercase tracking-wide sm:tracking-wider transition-all cursor-pointer ${
              activeMainTab === 'flash_sale'
                ? 'bg-gradient-to-r from-jade-500 to-jade-600 text-white shadow-lg shadow-jade-500/20 scale-[1.01]'
                : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 hover:text-ink-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span className="hidden xs:inline">Flash Sales</span>
            <span className="inline xs:hidden">Flash</span>
            <span className={`ml-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs ${activeMainTab === 'flash_sale' ? 'bg-white/20 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'}`}>
              {Math.min(db.products.filter(p => !p.isAuction).length, 4)}
              <span className="hidden sm:inline"> Active</span>
            </span>
          </button>

          <button
            onClick={() => setActiveMainTab('auction')}
            className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 py-2.5 sm:py-3.5 rounded-2xl font-sans font-extrabold text-xs sm:text-xs md:text-sm uppercase tracking-wide sm:tracking-wider transition-all cursor-pointer ${
              activeMainTab === 'auction'
                ? 'bg-gradient-to-r from-jade-500 to-jade-600 text-white shadow-lg shadow-jade-500/20 scale-[1.01]'
                : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 hover:text-ink-800'
            }`}
          >
            <Gavel className="w-4 h-4" />
            <span className="hidden sm:inline">Auction Room</span>
            <span className="inline sm:hidden">Auctions</span>
            <span className={`ml-1 px-1 sm:px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs ${activeMainTab === 'auction' ? 'bg-white/20 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'}`}>
              {db.products.filter(p => p.isAuction).length}
            </span>
          </button>
        </div>

        {activeMainTab === 'marketplace' && (
          <>
            {/* 2. JUMIA-STYLE INTERACTIVE PRODUCT CATEGORIES */}
            <section id="categories-section" className="mb-10 bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800/80 p-6 sm:p-8 rounded-[32px] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-display font-black text-xl text-ink-900 dark:text-white flex items-center gap-2">
                <Grid className="w-5.5 h-5.5 text-ink-500 animate-spin-slow" />
                Explore Categories
              </h2>
              <p className="text-xs text-ink-400 mt-1">Shop verified Nigerian deals by department</p>
            </div>
            {selectedCategory && (
              <button 
                onClick={() => setSelectedCategory(null)}
                className="text-xs px-3 py-1.5 bg-ink-500/10 hover:bg-jade-500 text-ink-600 dark:text-ink-400 hover:text-white rounded-xl font-bold transition-all cursor-pointer press-scale focus-ring"
              >
                Show All Categories
              </button>
            )}
          </div>

          {/* Jumia Circular Grid / Flex Layout */}
          <div className="flex overflow-x-auto gap-4 sm:gap-6 pb-4 scrollbar-hide justify-between items-center px-1">
            {[
              { name: 'Fashion', icon: Shirt, slug: 'fashion' },
              { name: 'Electronics', icon: Cpu, slug: 'electronics' },
              { name: 'Phones', icon: Smartphone, slug: 'phones' },
              { name: 'Laptops', icon: Laptop, slug: 'laptops' },
              { name: 'Furniture', icon: Armchair, slug: 'furniture' },
              { name: 'Groceries', icon: Apple, slug: 'groceries' },
              { name: 'Beauty', icon: Sparkles, slug: 'beauty' },
              { name: 'Vehicles', icon: Car, slug: 'vehicles' },
              { name: 'Books', icon: BookOpen, slug: 'books' },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.slug;

              return (
                <button
                  key={cat.slug}
                  onClick={() => setSelectedCategory(isSelected ? null : cat.slug)}
                  className="flex flex-col items-center gap-2.5 group shrink-0 cursor-pointer focus:outline-none focus-ring rounded-2xl"
                >
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center border-2 transition-all relative ${
                    isSelected
                      ? 'border-jade-500 bg-jade-500 text-white shadow-lg shadow-jade-500/30 scale-105'
                      : 'bg-jade-500/5 border-jade-500/20 text-jade-600 dark:text-jade-400 shadow-sm group-hover:scale-105 group-hover:shadow-md group-hover:border-jade-500/40'
                  }`}>
                    <cat.icon className="w-7 h-7 sm:w-8 sm:h-8" />

                    {/* Selected Indicator Badge */}
                    {isSelected && (
                      <span className="absolute -top-1 -right-1 w-6 h-6 bg-jade-600 text-white rounded-full flex items-center justify-center border-2 border-white dark:border-ink-900 animate-nav-indicator">
                        <CheckCircle className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-sans font-bold tracking-tight transition-colors ${
                    isSelected ? 'text-jade-600 dark:text-jade-400' : 'text-ink-700 dark:text-ink-300 group-hover:text-jade-600'
                  }`}>
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sponsored: category placement */}
          <AdSlot placement="CATEGORY" onNavigate={onNavigate} />
        </section>
      </>
    )}

        {activeMainTab === 'flash_sale' && (
          /* 3. REDESIGNED JUMIA-STYLE ACTIVE FLASH SALES */
          <section id="flash-sales-section" className="mb-10 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 p-6 rounded-[32px] shadow-sm relative overflow-hidden">
          
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-ink-500 via-ink-500 to-ink-500" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-ink-500/10 flex items-center justify-center text-ink-500 animate-pulse">
                <Flame className="w-5.5 h-5.5 fill-ink-500/10" />
              </div>
              <div>
                <h2 className="font-display font-black text-lg text-ink-900 dark:text-white leading-tight">Today’s Featured Deals</h2>
                <p className="text-xs text-ink-400">Hand-picked listings from verified merchants — escrow protected</p>
              </div>
            </div>
            
            {/* Countdown timer UI */}
            <div className="flex items-center gap-2 bg-ink-50/80 dark:bg-ink-950/20 px-3 py-1.5 rounded-xl border border-ink-100 dark:border-ink-900/30 text-xs font-bold text-ink-600 dark:text-ink-400">
              <span className="uppercase tracking-wider text-xs font-black">Ends In:</span>
              <span className="font-mono text-xs font-black tracking-widest animate-pulse">
                {String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m : {String(timeLeft.seconds).padStart(2, '0')}s
              </span>
            </div>
          </div>
 
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {db.products.filter(p => !p.isAuction).slice(0, 2).map((item) => {
              // Honest signals derived from real data: units actually sold (paid
              // orders) and the real remaining stock. No invented discounts.
              const soldCount = (db.orders || []).filter(
                (o) =>
                  o.productId === item.id &&
                  ['COMPLETED', 'DELIVERED', 'DELIVERED_SUCCESS', 'PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(
                    String(o.status)
                  )
              ).length;
              const stockLeft = Math.max(0, item.quantity ?? 0);
              const soldPercentage =
                soldCount + stockLeft > 0 ? Math.min(100, Math.round((soldCount / (soldCount + stockLeft)) * 100)) : 0;
              const discountedPrice = item.price;
              
              return (
                <div 
                  key={item.id}
                  onClick={() => onSelectProduct(item.id)}
                  className="flex gap-4 p-4 bg-ink-50/50 dark:bg-ink-800/20 rounded-2xl hover:bg-white dark:hover:bg-ink-800 hover:shadow-md cursor-pointer transition-all border border-ink-100 dark:border-ink-800/80 group relative overflow-hidden"
                >
                  {/* Left image wrapper */}
                  <div className="w-28 h-28 rounded-xl bg-ink-200 dark:bg-ink-700 relative overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    
                    {/* Flash Sale absolute tags */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-ink-600 text-white text-xs font-black rounded-lg uppercase shadow-sm tracking-wide">
                      FEATURED
                    </span>
                    <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold rounded">
                      FLASH DEAL
                    </span>
                  </div>

                  {/* Right specifications & progressive indicators */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-ink-500 uppercase tracking-widest">{item.category}</span>
                        <span className="text-xs text-ink-400 dark:text-ink-500 font-mono">@{item.brand || 'Vetted'}</span>
                      </div>
                      <h4 className="font-display font-bold text-sm text-ink-900 dark:text-white truncate group-hover:text-ink-500 transition-colors">{item.title}</h4>
                      <p className="text-xs text-ink-500 dark:text-ink-400 line-clamp-1 mt-0.5">{item.description}</p>
                    </div>
                    
                    {/* Progress Bar and Stock Tracker */}
                    <div className="my-2.5 space-y-1">
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-ink-400">Sold: {soldPercentage}%</span>
                        <span className="text-ink-500 uppercase tracking-wider font-extrabold animate-pulse">Only {stockLeft} left!</span>
                      </div>
                      <div className="w-full bg-ink-200 dark:bg-ink-800 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-ink-500 to-ink-500 h-full rounded-full" style={{ width: `${soldPercentage}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono font-black text-base text-ink-600 dark:text-ink-400">₦{discountedPrice.toLocaleString()}</span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToCart(item.id);
                        }}
                        className="px-3.5 py-1.5 bg-ink-500 hover:bg-ink-600 active:scale-95 text-white font-display font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-ink-500/10 cursor-pointer"
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
          <section id="auctions-section" className="mb-10 bg-ink-950 text-white rounded-[32px] p-6 border border-ink-500/20 shadow-xl relative overflow-hidden">
          
          {/* Subtle live golden radial background */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-ink-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-ink-500/10 flex items-center justify-center text-ink-500 border border-ink-500/10 animate-pulse">
                <Zap className="w-5.5 h-5.5 fill-ink-500/10" />
              </div>
              <div>
                <h2 className="font-display font-black text-lg text-white leading-tight flex items-center gap-1.5">
                  Live Auctions Escrow
                  <span className="w-2.5 h-2.5 rounded-full bg-ink-500 animate-ping" />
                </h2>
                <p className="text-xs text-ink-400">Direct instant bidding on premium certified merchant stock</p>
              </div>
            </div>
            
            <div className="px-3 py-1 bg-ink-500/10 border border-ink-500/20 text-ink-400 rounded-full font-mono text-xs uppercase tracking-wider font-bold">
              LIVE COUNTER ACTIVE
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
                  className="bg-ink-900 border border-ink-800 hover:border-ink-500/30 rounded-2xl overflow-hidden hover:shadow-2xl transition-all cursor-pointer flex flex-col sm:flex-row group"
                >
                  {/* Left Column: Image with live indicator */}
                  <div className="sm:w-44 h-48 bg-ink-800 relative overflow-hidden shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-ink-500 text-ink-950 text-[10px] font-black rounded uppercase tracking-wider flex items-center gap-1 shadow-md">
                      <Zap className="w-2.5 h-2.5 text-ink-950 fill-ink-950" />
                      LIVE BID
                    </div>
                    <div className="absolute bottom-2.5 left-2.5 px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-mono rounded">
                      Bids Casted: {bids.length}
                    </div>
                  </div>
 
                  {/* Right Column: Information, Bid Log, Quick Actions */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-mono font-bold text-ink-400 uppercase tracking-widest">{item.brand || 'Premium'}</span>
                        <span className="text-xs text-ink-400 font-mono">Ends: {auction ? new Date(auction.endsAt).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : ''}</span>
                      </div>
                      <h4 className="font-display font-bold text-sm text-white line-clamp-1 mb-1 group-hover:text-ink-400 transition-colors">{item.title}</h4>
                      <p className="text-xs text-ink-400 line-clamp-1 leading-relaxed mb-3">{item.description}</p>
                      
                      {/* Interactive Bid Ticker */}
                      <div className="bg-ink-950/60 border border-ink-800/60 p-2 rounded-xl mb-3">
                        <span className="text-[10px] text-ink-500 uppercase tracking-wider block font-bold mb-1">Recent Bids Log</span>
                        {bids.slice(0, 2).length === 0 ? (
                          <span className="text-xs italic text-ink-500 block">No bids casted yet. Join in!</span>
                        ) : (
                          <div className="space-y-1">
                            {bids.slice(0, 2).map((b, idx) => (
                              <div key={b.id} className="flex justify-between items-center text-xs font-mono">
                                <span className="text-ink-400 truncate max-w-[80px]">@{b.username} {idx === 0 && <Star className="w-3 h-3 text-jade-500 inline" />}</span>
                                <span className="font-extrabold text-ink-400">₦{b.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
 
                    <div className="border-t border-ink-800/80 pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-ink-400 uppercase tracking-widest block font-mono leading-none mb-1">Highest Bid</span>
                          <span className="font-mono font-extrabold text-base text-white">₦{highestBid.toLocaleString()}</span>
                        </div>
                        
                        <div className="text-right">
                          <span className="text-[10px] text-ink-500 block uppercase font-mono">Minimum Next</span>
                          <span className="font-mono text-xs text-ink-500 font-bold">₦{(highestBid + 5000).toLocaleString()}</span>
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
                          className="flex-1 py-1.5 bg-ink-800 hover:bg-ink-500 hover:text-ink-950 border border-ink-700 hover:border-ink-500 text-ink-400 font-mono font-black text-xs uppercase rounded-lg transition-all text-center cursor-pointer active:scale-95"
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
                          className="flex-1 py-1.5 bg-ink-800 hover:bg-ink-500 hover:text-ink-950 border border-ink-700 hover:border-ink-500 text-ink-400 font-mono font-black text-xs uppercase rounded-lg transition-all text-center cursor-pointer active:scale-95"
                          title="Place quick bid of +₦20,000"
                        >
                          +₦20,000
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectProduct(item.id);
                          }}
                          className="px-3 py-1.5 bg-ink-500 hover:bg-ink-600 text-ink-950 font-display font-black text-xs uppercase tracking-wider rounded-lg transition-all cursor-pointer text-center"
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
        {/* 5. Filter Controls */}
        <section className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-4 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            
            {/* City Selector */}
            <select
              value={selectedCity || ''}
              onChange={(e) => setSelectedCity(e.target.value || null)}
              className="px-3 py-1.5 text-xs bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl text-ink-700 dark:text-ink-300 font-sans font-bold focus:outline-none"
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
              className={`px-3 py-1.5 text-xs rounded-xl font-sans font-bold transition-all border ${onlyVerified ? 'bg-jade-500 border-jade-500 text-white shadow-sm' : 'bg-ink-50 dark:bg-ink-800 border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-300'}`}
            >
              Only Verified Sellers
            </button>
          </div>

          <p className="text-xs text-ink-400 font-mono">Found {filteredProducts.length} items matching criteria</p>
        </section>

        {/* 6. Marketplace Product Catalog (AliExpress/Temu/Jumia style dense cards grid) */}
        {searchQuery.trim() && (
          <AdSlot placement="SEARCH" onNavigate={onNavigate} className="mb-6" />
        )}

        <section id="catalog-section" className="mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display font-black text-xl text-ink-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5.5 h-5.5 text-jade-500" />
                Marketplace Super Deals
              </h2>
              <p className="text-xs text-ink-400 mt-1">Direct-from-merchant listings with escrow payment protection guarantee.</p>
            </div>
            
            {/* Quick Jumia style promo badge */}
            <div className="px-3 py-1 bg-ink-500/10 border border-ink-500/20 rounded-xl text-ink-500 font-mono text-xs font-bold flex items-center gap-1.5 self-start sm:self-center">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-ping" />
              Escrow Guarantee Secure
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            db.products.length === 0 ? (
              /* Fresh marketplace — no listings exist yet, so invite the first seller */
              <div className="bg-white dark:bg-ink-900 rounded-[32px] border border-dashed border-ink-300 dark:border-ink-700 shadow-sm">
                <EmptyState
                  state="empty-cart"
                  icon={<Store />}
                  title="The marketplace is just getting started"
                  description={
                    <>
                      No listings yet. Create an account to sell the first item — every order is protected by
                      GoodSale escrow, released only when the buyer confirms delivery with their PIN.
                    </>
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => onOpenAuth?.('register')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-jade-500 hover:bg-jade-600 text-white text-xs font-sans font-extrabold uppercase tracking-wide rounded-xl shadow-lg shadow-jade-500/20 transition-all cursor-pointer press-scale focus-ring"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      List the first item
                    </button>
                  }
                />
              </div>
            ) : (
              <div className="bg-white dark:bg-ink-900 rounded-[32px] border border-ink-200 dark:border-ink-800 shadow-sm">
                <EmptyState
                  state="empty-search"
                  icon={<Search />}
                  title="No products found"
                  description="Try loosening your search query or location filter."
                />
              </div>
            )
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
                    className="bg-white dark:bg-ink-900 border border-ink-150 dark:border-ink-800 rounded-2xl hover:border-jade-500/40 dark:hover:border-jade-500/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group cursor-pointer flex flex-col overflow-hidden relative"
                  >
                    
                    {/* A. Square Image Block with badges */}
                    <div className="aspect-square bg-ink-50 dark:bg-ink-950/40 relative overflow-hidden shrink-0 border-b border-ink-100 dark:border-ink-800/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={product.images[0]} 
                        alt={product.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Discount banner only when seller set a compare-at style deal via low stock flash */}
                      {product.stockStatus === 'LOW_STOCK' && (
                        <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-ink-600 dark:bg-ink-500 text-white text-xs font-mono font-black tracking-wider rounded shadow-md flex items-center gap-0.5">
                          <span>LOW STOCK</span>
                        </div>
                      )}

                      {stockLeft > 0 && stockLeft <= 5 && (
                        <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 bg-ink-500 text-ink-950 text-[10px] font-mono font-black uppercase tracking-wider rounded shadow-sm">
                          Only {stockLeft} left
                        </div>
                      )}

                      {/* Small Escrow lock overlay */}
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-ink-900/90 backdrop-blur-md text-[10px] font-mono font-bold text-jade-400 rounded-md border border-jade-500/20 shadow flex items-center gap-1">
                        <Shield className="w-2.5 h-2.5 text-jade-400" />
                        <span>Escrow Locked</span>
                      </div>

                      {/* Favorite Heart Button */}
                      <button 
                        onClick={(e) => toggleFavorite(product.id, e)}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-white/95 dark:bg-ink-900/95 backdrop-blur-sm rounded-full text-ink-500 dark:text-ink-400 hover:text-ink-500 dark:hover:text-ink-400 transition-colors cursor-pointer shadow z-10"
                      >
                        <Heart className={`w-3 h-3 ${favorites.includes(product.id) ? 'fill-ink-500 text-ink-500' : ''}`} />
                      </button>
                    </div>

                    {/* B. Details text block — roomy spacing so lines don't collapse */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3.5 text-xs">
                      
                      <div className="space-y-2.5">
                        
                        {/* 1. Vendor Username & Link with Store icon */}
                        <div className="flex items-center justify-between text-xs bg-ink-50 dark:bg-ink-800/40 p-1.5 rounded-xl border border-ink-100 dark:border-ink-800/60 font-sans">
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('seller-profile', { sellerId: product.sellerId });
                            }}
                            className="flex items-center gap-1 hover:text-jade-500 cursor-pointer min-w-0 flex-1"
                            title="View Vendor Storefront"
                          >
                            <Store className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                            <span className="font-bold text-ink-700 dark:text-ink-300 font-mono truncate text-xs">
                              @{seller?.username || 'vendor'}
                            </span>
                            {isSellerVerified && (
                              <CheckCircle className="w-3 h-3 text-ink-500 fill-ink-500/20 shrink-0" />
                            )}
                          </div>
                          <span className="text-xs font-mono font-bold text-ink-400 shrink-0 uppercase tracking-tight bg-white dark:bg-ink-900 px-1 py-0.5 rounded border border-ink-150 dark:border-ink-800 ml-1">
                            {sellerProfile?.city || 'Nigeria'}
                          </span>
                        </div>

                        {/* 2. Category name */}
                        <div className="text-xs font-mono font-bold text-ink-400 uppercase tracking-wider">
                          {product.category}
                        </div>

                        {/* 3. Headline with 2-line clamp */}
                        <h4 className="font-sans font-bold text-xs text-ink-800 dark:text-ink-200 line-clamp-2 leading-snug tracking-tight group-hover:text-jade-500 dark:group-hover:text-jade-400 transition-colors min-h-[2.25rem]">
                          {product.title}
                        </h4>

                        {/* 4. Rating & sold metrics from real reviews/orders */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400 font-sans">
                            {avgRating ? (
                              <>
                                <div className="flex text-ink-500 text-xs">
                                  {Array.from({ length: Math.round(parseFloat(avgRating)) }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-jade-500 text-jade-500" />
                          ))}
                                  {Array.from({ length: Math.max(0, 5 - Math.round(parseFloat(avgRating))) }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 text-ink-300 dark:text-ink-700" />
                          ))}
                                </div>
                                <span className="font-bold text-xs text-ink-600 dark:text-ink-400">
                                  {avgRating}
                                </span>
                                <span className="text-ink-400 text-xs">
                                  ({productReviews.length})
                                </span>
                              </>
                            ) : (
                              <span className="text-ink-400 text-xs">No reviews yet</span>
                            )}
                            {soldCount > 0 && (
                              <span className="text-ink-400 text-xs ml-auto">{soldCount} sold</span>
                            )}
                          </div>
                          
                          {/* Escrow Delivery Badge */}
                          <div className="flex items-center justify-between text-xs font-mono mt-0.5">
                            <span className="text-jade-600 dark:text-jade-400 font-sans font-medium flex items-center gap-0.5">
                              Escrow Delivery
                            </span>
                          </div>
                        </div>

                        {stockLeft > 0 && stockLeft <= 8 && (
                          <div className="pt-0.5">
                            <div className="flex items-center justify-between text-xs font-mono text-ink-400">
                              <span className="text-ink-600 dark:text-ink-400 font-bold">
                                {stockLeft} in stock
                              </span>
                              {soldCount > 0 && <span>{soldCount} sold</span>}
                            </div>
                            <div className="w-full bg-ink-150 dark:bg-ink-800 h-1 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-ink-500 h-full rounded-full transition-all duration-500"
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
                            <span className="font-mono font-extrabold text-sm sm:text-base text-ink-600 dark:text-ink-400 leading-none">
                              ₦{product.price.toLocaleString()}
                            </span>
                          </div>
                        </div>

                      </div>

                      {/* C. Direct Action Footer */}
                      <div className="pt-2 border-t border-ink-100 dark:border-ink-800/80 flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono text-jade-500 dark:text-jade-400 font-black tracking-wider uppercase block">
                          Escrow safe
                        </span>
                        
                        <button 
                          onClick={handleQuickAddToCart}
                          className="w-7 h-7 bg-ink-100 dark:bg-ink-800 hover:bg-jade-500 hover:text-white dark:hover:bg-jade-500 dark:hover:text-white text-ink-800 dark:text-ink-300 rounded-full border border-ink-200 dark:border-ink-700/60 transition-all flex items-center justify-center shrink-0 shadow-sm cursor-pointer"
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
            <h2 className="font-display font-black text-lg text-ink-900 dark:text-white">
              Featured Verified Stores
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {db.businesses.map((biz) => (
              <div 
                key={biz.id}
                onClick={() => onNavigate('seller-profile', { sellerId: biz.ownerId })}
                className="p-5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl flex items-center gap-4 hover:shadow-md cursor-pointer transition-all relative overflow-hidden group hover:border-jade-500/40"
              >
                <div className="w-14 h-14 rounded-full bg-jade-500/10 flex items-center justify-center overflow-hidden shrink-0 border border-ink-100 dark:border-ink-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={biz.logoUrl} alt={biz.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h4 className="font-display font-bold text-sm text-ink-900 dark:text-white truncate">{biz.name}</h4>
                    <span title="Premium Business Badge">
                      <CheckCircle className="w-4 h-4 text-ink-500 fill-ink-500/10 shrink-0" />
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400 line-clamp-1 mb-2 leading-relaxed">{biz.description}</p>
                  
                  <div className="flex items-center gap-4 text-xs font-mono text-ink-400">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-ink-400 fill-ink-400" />
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
