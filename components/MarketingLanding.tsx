// components/MarketingLanding.tsx
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  ShieldCheck, ArrowRight, Truck, BadgeCheck, Headphones,
  Store, ShoppingCart, Star, ChevronRight, Zap, Users,
  CheckCircle2, Grid, Sparkles, Heart
} from 'lucide-react';
import { useDBState } from '../lib/store';

interface MarketingLandingProps {
  onNavigate: (view: string, payload?: any) => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onSelectProduct?: (productId: number) => void;
  onAddToCart?: (productId: number) => void;
  onSearchChange?: (query: string) => void;
}

interface DealProduct {
  id: number;
  title: string;
  image: string;
  price: number;
  originalPrice?: number;
  discount?: string;
  rating: number;
  reviewsCount: string;
  category: string;
}

const DEALS: DealProduct[] = [
  {
    id: 101,
    title: 'iPhone 16 Pro',
    image: '/images/landing/prod_iphone.png',
    price: 1350000,
    originalPrice: 1590000,
    discount: '-15%',
    rating: 4.8,
    reviewsCount: '2.5k',
    category: 'Phones & Tablets',
  },
  {
    id: 102,
    title: 'Sony WH-1000XM5',
    image: '/images/landing/prod_sony.png',
    price: 420000,
    originalPrice: 525000,
    discount: '-20%',
    rating: 4.8,
    reviewsCount: '1.2k',
    category: 'Electronics',
  },
  {
    id: 103,
    title: 'Nike Air Force 1',
    image: '/images/landing/prod_nike.png',
    price: 150000,
    originalPrice: 200000,
    discount: '-25%',
    rating: 4.7,
    reviewsCount: '980',
    category: 'Fashion & Beauty',
  },
  {
    id: 104,
    title: 'MacBook Air M4',
    image: '/images/landing/prod_macbook.png',
    price: 1200000,
    rating: 4.8,
    reviewsCount: '760',
    category: 'Electronics',
  },
  {
    id: 105,
    title: 'Dior Sauvage',
    image: '/images/landing/prod_dior.png',
    price: 180000,
    discount: '-10%',
    rating: 4.7,
    reviewsCount: '650',
    category: 'Fashion & Beauty',
  },
];

const CATEGORIES = [
  { name: 'Phones & Tablets', image: '/images/landing/cat_phones.png', slug: 'phones' },
  { name: 'Electronics', image: '/images/landing/cat_electronics.png', slug: 'electronics' },
  { name: 'Fashion & Beauty', image: '/images/landing/cat_fashion.png', slug: 'fashion' },
  { name: 'Home & Living', image: '/images/landing/cat_home.png', slug: 'home' },
  { name: 'Appliances', image: '/images/landing/cat_appliances.png', slug: 'appliances' },
  { name: 'Cars & Bikes', image: '/images/landing/cat_cars.png', slug: 'cars' },
  { name: 'Sports & Outdoors', image: '/images/landing/cat_sports.png', slug: 'sports' },
];

export default function MarketingLanding({
  onNavigate,
  onOpenAuth,
  onSelectProduct,
  onAddToCart,
  onSearchChange,
}: MarketingLandingProps) {
  const db = useDBState();
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const formatNaira = (num: number) => {
    return '₦' + num.toLocaleString('en-NG');
  };

  return (
    <div className="bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-50 transition-colors duration-300 font-sans pb-16">
      
      {/* ═══════════════════════════════════════════════════════════════
          1. HERO SECTION — Deep Green Canvas with Glowing Arc & Abuja Mosque
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#021F17] via-[#022B20] to-[#011710] text-white pt-8 pb-16 lg:pb-24">
        {/* Subtle luminous golden trail backdrop */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(ellipse_at_70%_40%,rgba(245,166,35,0.25),transparent_65%)]" 
          aria-hidden="true" 
        />
        <div 
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" 
          aria-hidden="true" 
        />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            
            {/* Left Column: Headlines, Slogan, CTA Buttons, Trust Highlights */}
            <div className="lg:col-span-7 flex flex-col justify-center text-left pt-2 lg:pt-6">
              
              {/* Brand Wordmark Accent */}
              <div className="flex items-center gap-2 mb-3">
                <span className="font-extrabold text-2xl sm:text-3xl tracking-tight text-white select-none">
                  Good<span className="text-[#F5A623]">Sale</span>
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-[58px] font-extrabold text-white tracking-tight leading-[1.08] text-balance">
                More Than a Marketplace.
                <span className="block text-[#F5A623] mt-1 sm:mt-2">
                  A Better Way to Trade.
                </span>
              </h1>

              {/* Subheading */}
              <p className="text-gray-300 text-base sm:text-lg mt-4 sm:mt-6 max-w-xl leading-relaxed">
                Discover amazing products, shop with confidence, and grow your business — all in one place.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3.5 sm:gap-4 mt-8 sm:mt-10">
                <button
                  onClick={() => {
                    const el = document.getElementById('hot-deals');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                    else onNavigate('marketplace');
                  }}
                  className="bg-[#EFA426] hover:bg-[#df971d] text-ink-950 font-bold px-7 sm:px-8 py-3.5 sm:py-4 rounded-full text-sm sm:text-base inline-flex items-center gap-2 shadow-lg shadow-black/25 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <span>Start Shopping</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => {
                    if (db.currentUser) onNavigate('dashboard');
                    else onOpenAuth('register');
                  }}
                  className="border border-white/25 bg-white/5 hover:bg-white/10 text-white font-semibold px-6 sm:px-7 py-3.5 sm:py-4 rounded-full text-sm sm:text-base inline-flex items-center gap-2.5 transition-all hover:border-white/40 active:scale-95 cursor-pointer"
                >
                  <Store className="w-4 h-4 text-white" />
                  <span>Start Selling</span>
                </button>
              </div>

              {/* Trust Badges Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-emerald-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-white">Secure &amp; Trusted</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#F5A623]/20 text-[#F5A623] flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 fill-[#F5A623]" />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-white">Fast &amp; Reliable Delivery</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#F5A623]/20 text-[#F5A623] flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-white">100% Nigerian Marketplace</span>
                </div>
              </div>
            </div>

            {/* Right Column: Hero Visual (Nigerian woman, shopping bags, phone, gold swirl, Abuja Mosque) */}
            <div className="lg:col-span-5 relative flex items-end justify-center lg:justify-end mt-4 lg:mt-0">
              <div className="relative w-full max-w-[480px] sm:max-w-[540px] lg:max-w-none">
                <Image
                  src="/images/landing/hero_banner_right.png"
                  alt="Shop with confidence on GoodSale Nigeria"
                  width={574}
                  height={425}
                  priority
                  className="w-full h-auto object-contain rounded-2xl drop-shadow-[0_20px_35px_rgba(0,0,0,0.5)]"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          2. FLOATING CATEGORIES STRIP — Overlapping the Hero
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative z-20 -mt-8 sm:-mt-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-ink-900 rounded-3xl shadow-xl shadow-black/8 border border-gray-100 dark:border-ink-800 p-3 sm:p-5">
          <div className="flex items-center gap-2.5 sm:gap-3.5 overflow-x-auto pb-1 scrollbar-hide sm:grid sm:grid-cols-4 md:grid-cols-8">
            
            {CATEGORIES.map((cat, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (onSearchChange) onSearchChange(cat.name);
                  onNavigate('marketplace');
                }}
                className="min-w-[100px] sm:min-w-0 flex-1 bg-[#F4F6F5] dark:bg-ink-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 hover:-translate-y-1 group"
              >
                <div className="h-12 w-12 sm:h-14 sm:w-14 flex items-center justify-center mb-1.5">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    width={55}
                    height={55}
                    className="max-h-full max-w-full object-contain transition-transform group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="text-[11px] sm:text-xs font-bold text-ink-900 dark:text-gray-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 line-clamp-1 leading-tight">
                  {cat.name}
                </span>
              </div>
            ))}

            {/* "More Categories" item */}
            <div
              onClick={() => onNavigate('marketplace')}
              className="min-w-[100px] sm:min-w-0 flex-1 bg-[#F4F6F5] dark:bg-ink-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 hover:-translate-y-1 group relative"
            >
              <div className="h-12 w-12 sm:h-14 sm:w-14 flex items-center justify-center mb-1.5 relative">
                <Grid className="w-8 h-8 text-ink-700 dark:text-gray-300" />
                <span className="absolute -right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#F5A623] text-ink-950 flex items-center justify-center shadow-md">
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-ink-900 dark:text-gray-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 line-clamp-1 leading-tight">
                More Categories
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          3. VALUE PROPOSITION TRUST BANNER — Dark Forest Green Card
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 sm:mt-12">
        <div className="bg-[#04402D] dark:bg-[#032B1E] rounded-3xl p-6 sm:p-8 text-white shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            
            {/* 1. Buyer Protection */}
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-[#F5A623]" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base text-white">Buyer Protection</h4>
                <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 leading-relaxed">
                  Shop worry-free with our secure payment system.
                </p>
              </div>
            </div>

            {/* 2. Reliable Support */}
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <Headphones className="w-6 h-6 text-[#F5A623]" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base text-white">Reliable Support</h4>
                <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 leading-relaxed">
                  We&apos;re here to help, anytime.
                </p>
              </div>
            </div>

            {/* 3. Verified Sellers */}
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <BadgeCheck className="w-6 h-6 text-[#F5A623]" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base text-white">Verified Sellers</h4>
                <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 leading-relaxed">
                  Buy from trusted sellers.
                </p>
              </div>
            </div>

            {/* 4. Nationwide Delivery */}
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <Truck className="w-6 h-6 text-[#F5A623]" />
              </div>
              <div>
                <h4 className="font-bold text-sm sm:text-base text-white">Nationwide Delivery</h4>
                <p className="text-xs sm:text-sm text-emerald-100/80 mt-1 leading-relaxed">
                  From Abuja to everywhere in Nigeria.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          4. HOT DEALS SECTION — 5 Featured Product Cards
          ═══════════════════════════════════════════════════════════════ */}
      <section id="hot-deals" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16">
        
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink-900 dark:text-white flex items-center gap-2">
              <span>Hot Deals</span>
              <span className="text-2xl" role="img" aria-label="fire">🔥</span>
            </h2>
            <p className="text-xs sm:text-sm text-ink-500 dark:text-ink-400 mt-1">
              Grab the best deals before they&apos;re gone!
            </p>
          </div>

          <button
            onClick={() => onNavigate('marketplace')}
            className="bg-[#FEF5E7] dark:bg-amber-950/40 text-[#C98006] dark:text-amber-400 font-bold text-xs sm:text-sm px-4 py-2 rounded-full border border-[#FCD9A5]/60 flex items-center gap-1.5 hover:bg-[#FDEED5] transition-colors cursor-pointer"
          >
            <span>View All Deals</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 5 Deals Product Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-5">
          {DEALS.map((deal) => {
            const isFav = favoriteIds.includes(deal.id);
            return (
              <div
                key={deal.id}
                onClick={() => onSelectProduct ? onSelectProduct(deal.id) : onNavigate('product', { id: deal.id })}
                className="bg-white dark:bg-ink-900 rounded-2xl p-3.5 sm:p-4 border border-ink-150 dark:border-ink-800 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group hover:-translate-y-1 relative"
              >
                {/* Discount Badge */}
                {deal.discount && (
                  <span className="absolute top-3 right-3 bg-[#0A854B] text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10 shadow-sm">
                    {deal.discount}
                  </span>
                )}

                {/* Favorite Heart Button */}
                <button
                  onClick={(e) => toggleFavorite(deal.id, e)}
                  className="absolute top-3 left-3 p-1 rounded-full bg-white/80 dark:bg-ink-800/80 text-ink-400 hover:text-red-500 z-10 transition-colors"
                  aria-label="Save deal"
                >
                  <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-red-500 text-red-500' : ''}`} />
                </button>

                {/* Product Image */}
                <div className="h-36 sm:h-44 w-full flex items-center justify-center p-2 mb-3 bg-[#F9FAF9] dark:bg-ink-800/40 rounded-xl relative">
                  <Image
                    src={deal.image}
                    alt={deal.title}
                    width={150}
                    height={150}
                    className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Product Title */}
                <h3 className="font-bold text-xs sm:text-sm text-ink-900 dark:text-white line-clamp-1 group-hover:text-emerald-600 transition-colors">
                  {deal.title}
                </h3>

                {/* Price Display */}
                <div className="flex items-baseline gap-1.5 mt-1.5 flex-wrap">
                  <span className="font-extrabold text-sm sm:text-base text-[#0A854B] dark:text-[#5CD89F]">
                    {formatNaira(deal.price)}
                  </span>
                  {deal.originalPrice && (
                    <span className="text-[10px] sm:text-xs text-ink-400 line-through">
                      {formatNaira(deal.originalPrice)}
                    </span>
                  )}
                </div>

                {/* Rating & Add to Cart Action */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-ink-100 dark:border-ink-800/60">
                  <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-ink-700 dark:text-gray-300">
                    <Star className="w-3.5 h-3.5 text-[#F5A623] fill-[#F5A623]" />
                    <span>{deal.rating}</span>
                    <span className="text-ink-400 font-normal">({deal.reviewsCount})</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAddToCart) onAddToCart(deal.id);
                    }}
                    className="p-2 sm:p-2.5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 hover:bg-[#0A854B] hover:text-white dark:hover:bg-[#0A854B] dark:hover:text-white transition-colors cursor-pointer"
                    title="Add to Cart"
                    aria-label={`Add ${deal.title} to cart`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          5. "READY TO SELL?" CALL-TO-ACTION BANNER
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16">
        <div className="bg-gradient-to-r from-[#023123] via-[#023B2A] to-[#022B1E] rounded-3xl p-6 sm:p-10 text-white relative overflow-hidden shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Content */}
            <div className="lg:col-span-5 text-left">
              <h3 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                Ready to Sell?
              </h3>
              <p className="text-emerald-100/85 text-sm sm:text-base mt-3 leading-relaxed max-w-md">
                Turn your products into profit. Reach millions of buyers across Nigeria with GoodSale.
              </p>

              <button
                onClick={() => {
                  if (db.currentUser) onNavigate('dashboard');
                  else onOpenAuth('register');
                }}
                className="bg-[#EFA426] hover:bg-[#df971d] text-ink-950 font-bold px-7 py-3.5 rounded-full text-sm sm:text-base mt-6 sm:mt-8 inline-flex items-center gap-2 shadow-lg shadow-black/25 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <span>Start Selling Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Center 3D Storefront Graphic */}
            <div className="lg:col-span-4 flex items-center justify-center my-2 lg:my-0">
              <Image
                src="/images/landing/seller_storefront.png"
                alt="GoodSale Storefront with delivery boxes and growth chart"
                width={340}
                height={150}
                className="w-full max-w-[320px] h-auto object-contain drop-shadow-[0_15px_30px_rgba(0,0,0,0.4)]"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Right Checklist */}
            <div className="lg:col-span-3 space-y-3.5 pl-0 lg:pl-4">
              {[
                'Easy Listing',
                'Powerful Analytics',
                'Affordable Promotions',
                'Grow Your Business',
              ].map((point, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#F5A623]/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-[#F5A623]" />
                  </div>
                  <span className="font-bold text-sm sm:text-base text-white">{point}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          6. "TRUSTED BY MILLIONS ACROSS NIGERIA" SOCIAL PROOF
          ═══════════════════════════════════════════════════════════════ */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-2 border-t border-ink-150 dark:border-ink-800/80 pt-8">
          <div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-ink-900 dark:text-white">
              Trusted by Millions Across Nigeria
            </h3>
            <p className="text-xs sm:text-sm text-ink-500 dark:text-ink-400 mt-1">
              Join a growing community of buyers and sellers.
            </p>
          </div>

          {/* Avatars & Happy Users Pill */}
          <div className="flex items-center gap-3.5">
            <div className="h-10 sm:h-12 flex items-center">
              <Image
                src="/images/landing/social_proof_avatars.png"
                alt="Trusted Nigerian community users"
                width={380}
                height={50}
                className="h-9 sm:h-10 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="bg-[#D1F7E2] dark:bg-emerald-950/60 text-[#0A7441] dark:text-emerald-300 font-extrabold text-xs sm:text-sm px-4 py-2 rounded-full border border-emerald-300/40 dark:border-emerald-800/40 shrink-0">
              +1M Happy Users
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
