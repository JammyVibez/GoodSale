// app/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Facebook, Instagram, Twitter, Linkedin, Mail, ArrowUp, Send,
} from 'lucide-react';
import Header from '../components/Header';
import MarketingLanding from '../components/MarketingLanding';
import LandingView from '../components/LandingView';
import WalletView from '../components/WalletView';
import ProductDetailView from '../components/ProductDetailView';
import DashboardView from '../components/DashboardView';
import AdminDashboard from '../components/AdminDashboard';
import DispatchDashboardView from '../components/DispatchDashboardView';
import RevenueCenterView from '../components/RevenueCenterView';
import ChatView from '../components/ChatView';
import CartCheckoutView from '../components/CartCheckoutView';
import VerificationBadgeView from '../components/VerificationBadgeView';
import LoyaltyHubView from '../components/LoyaltyHubView';
import BrandCenterView from '../components/BrandCenterView';
import SellerProfileView from '../components/SellerProfileView';
import SettingsView from '../components/SettingsView';
import BuyerProfileView from '../components/BuyerProfileView';
import AuthModal from '../components/AuthModal';
import BottomNavigation from '../components/BottomNavigation';
import SetupBanner from '../components/SetupBanner';
import FeedbackHost from '../components/ui/FeedbackHost';
import AnnouncementModal from '../components/AnnouncementModal';
import CallHost from '../components/CallHost';
import LottieAnimation from '../components/ui/LottieAnimation';
import goodsaleLoader from '../lib/lottie/goodsale-loader.json';
import { getDBState, useDBState } from '../lib/store';
import { toast } from '../lib/feedback';

function BootSplash() {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-white dark:bg-ink-950 animate-fade-in">
      <div className="flex flex-col items-center gap-4">
        <div className="lottie-host h-28 w-28">
          <span
            className="lottie-fallback h-16 w-16 rounded-full border-[3px] border-ink-200 dark:border-ink-800 border-t-jade-500 animate-spin"
            aria-hidden="true"
          />
          <div className="lottie-layer h-28 w-28">
            <LottieAnimation animationData={goodsaleLoader} className="h-28 w-28" />
          </div>
        </div>
        <p className="font-display font-bold tracking-tight text-lg text-ink-900 dark:text-white">
          Good<span className="text-jade-600 dark:text-jade-400">Sale</span>
        </p>
        <p className="text-sm text-ink-400">
          Securing your trade…
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const db = useDBState();
  const [currentView, setCurrentView] = useState<string>('landing');
  // Full-screen transition beat: the goodsale-loader Lottie owns this moment only.
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 450);
    return () => clearTimeout(t);
  }, []);
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Shopping Cart client State
  const [cart, setCart] = useState<number[]>([]);

  // Dynamic payloads
  const [checkoutProductId, setCheckoutProductId] = useState<number | null>(null);
  const [activeChatRoomId, setActiveChatRoomId] = useState<number | null>(null);

  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const triggerToast = (msg: string, kind: 'success' | 'info' | 'error' = 'success') => {
    if (kind === 'error') toast.error(msg);
    else if (kind === 'info') toast.info(msg);
    else toast.success(msg);
  };

  const handleAddToCart = (productId: number) => {
    if (!db.currentUser) {
      setAuthModalMode('register');
      setAuthModalOpen(true);
      triggerToast('Create an account to add items to your cart.', 'info');
      return;
    }
    setCart(prev => {
      if (prev.includes(productId)) {
        triggerToast('Item is already in your shopping cart!', 'info');
        return prev;
      }
      triggerToast('Item added to shopping cart securely!');
      return [...prev, productId];
    });
  };

  const handleRemoveFromCart = (productId: number) => {
    setCart(prev => prev.filter(id => id !== productId));
    triggerToast('Item removed from shopping cart.', 'info');
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleSelectProduct = (id: number) => {
    handleNavigate('product', { id });
  };

  // Safe navigation proxy — guests may browse catalog; profile & cart require an account
  const handleNavigate = (view: string, payload?: any) => {
    const authRequired = [
      'cart',
      'buyer-profile',
      'settings',
      'chats',
      'loyalty',
      'dashboard',
      'admin',
      'dispatch',
      'revenue',
      'wallet',
      'verification',
      'checkout',
    ];
    if (!db.currentUser && authRequired.includes(view)) {
      setAuthModalMode(view === 'cart' || view === 'checkout' ? 'register' : 'login');
      setAuthModalOpen(true);
      triggerToast(
        view === 'cart' || view === 'checkout'
          ? 'Create an account to view your cart and checkout.'
          : 'Sign in to access your account.',
        'info'
      );
      return;
    }

    // Save current view in history
    setHistory(prev => [...prev, currentView]);

    // Clear sub-states
    setCheckoutProductId(null);
    setActiveChatRoomId(null);

    if (view === 'checkout') {
      if (payload?.productId) {
        setCheckoutProductId(payload.productId);
      }
      setCurrentView('cart'); // CartCheckoutView handles checkout step internally
    } else if (view === 'chats') {
      if (payload?.roomId) {
        setActiveChatRoomId(payload.roomId);
      }
      setCurrentView('chats');
    } else if (view === 'seller-profile') {
      if (payload?.sellerId) {
        setSelectedSellerId(payload.sellerId);
      }
      setCurrentView('seller-profile');
    } else if (view === 'product') {
      if (payload?.id) {
        setSelectedProductId(payload.id);
      }
      setCurrentView('product');
    } else {
      setCurrentView(view);
    }
  };

  const handleGoBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(old => old.slice(0, -1));
      setCurrentView(prev);
    } else {
      setCurrentView('landing');
    }
  };

  if (!booted) return <BootSplash />;

  return (
    <div className="bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100 min-h-screen transition-colors duration-300">
      <SetupBanner />
      
      {/* Header element */}
      <Header
        currentView={currentView}
        onNavigate={handleNavigate}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        cartCount={cart.length}
        onOpenAuth={(mode?: 'login' | 'register') => {
          setAuthModalMode(mode || 'login');
          setAuthModalOpen(true);
        }}
      />

      {/* Global Aurora Flow feedback: toasts + themed confirm dialog */}
      <FeedbackHost />

      {/* Admin-written popup shown whenever a user joins or enters the app */}
      <AnnouncementModal />

      {/* Core Dynamic Content Container */}
      <main className="min-h-[calc(100vh-4rem)] pb-[68px] md:pb-0">
        {/* Screen-push transition: each view enters from the trailing edge */}
        <div key={currentView} className="animate-screen-push">
        {currentView === 'landing' && (
          <MarketingLanding
            onNavigate={handleNavigate}
            onSelectProduct={handleSelectProduct}
            onAddToCart={handleAddToCart}
            onSearchChange={setSearchQuery}
            onOpenAuth={(mode?: 'login' | 'register') => {
              setAuthModalMode(mode || 'login');
              setAuthModalOpen(true);
            }}
          />
        )}

        {currentView === 'marketplace' && (
          <LandingView
            onSelectProduct={handleSelectProduct}
            searchQuery={searchQuery}
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
            onOpenAuth={(mode?: 'login' | 'register') => {
              setAuthModalMode(mode || 'login');
              setAuthModalOpen(true);
            }}
          />
        )}

        {currentView === 'wallet' && (
          <WalletView
            onNavigate={handleNavigate}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {currentView === 'product' && selectedProductId !== null && (
          <ProductDetailView
            productId={selectedProductId}
            onBack={handleGoBack}
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {currentView === 'seller-profile' && selectedSellerId !== null && (
          <SellerProfileView
            sellerId={selectedSellerId}
            onBack={handleGoBack}
            onNavigate={handleNavigate}
          />
        )}

        {currentView === 'dashboard' && (
          <DashboardView onOpenAuth={() => setAuthModalOpen(true)} onNavigate={handleNavigate} />
        )}

        {currentView === 'admin' && (
          <AdminDashboard onOpenAuth={() => setAuthModalOpen(true)} />
        )}

        {currentView === 'dispatch' && (
          <DispatchDashboardView />
        )}

        {currentView === 'revenue' && (
          <RevenueCenterView />
        )}


        {currentView === 'chats' && (
          <ChatView initialRoomId={activeChatRoomId} onNavigate={handleNavigate} onOpenAuth={() => setAuthModalOpen(true)} />
        )}

        {currentView === 'cart' && (
          <CartCheckoutView
            onBack={handleGoBack}
            onNavigate={handleNavigate}
            cart={cart}
            onRemoveFromCart={handleRemoveFromCart}
            onClearCart={handleClearCart}
            preselectedProductId={checkoutProductId}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {currentView === 'verification' && (
          <VerificationBadgeView />
        )}

        {currentView === 'loyalty' && (
          <LoyaltyHubView />
        )}

        {currentView === 'brand-center' && (
          <BrandCenterView onBack={handleGoBack} />
        )}

        {currentView === 'settings' && (
          <SettingsView onBack={handleGoBack} onNavigate={handleNavigate} onOpenAuth={() => setAuthModalOpen(true)} />
        )}

        {currentView === 'buyer-profile' && (
          <BuyerProfileView onBack={handleGoBack} onNavigate={handleNavigate} onOpenAuth={() => setAuthModalOpen(true)} />
        )}
        </div>

        {/* Professional footer — suppressed inside the chat workspace, where a
            full-height conversation pane is the whole screen. */}
        {currentView !== 'chats' && (
        <footer className="mt-auto border-t border-emerald-950/80 bg-[#021A12] text-gray-300">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
              {/* Brand */}
              <div className="col-span-2 lg:col-span-2">
                <div className="flex items-center gap-2 select-none">
                  <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 14C12 9.58172 15.5817 6 20 6C24.4183 6 28 9.58172 28 14" stroke="#102019" strokeWidth="2.5" strokeLinecap="round" />
                    <rect x="6" y="12" width="28" height="24" rx="6" fill="#F5A623" />
                    <path d="M13 22C15.5 26 24.5 26 27 22" stroke="#102019" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <span className="font-extrabold text-2xl tracking-tight text-white">
                    Good<span className="text-[#F5A623]">Sale</span>
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#F5A623]">
                  Shop. Sell. Grow.
                </p>
                <p className="mt-2 max-w-xs text-xs sm:text-sm leading-relaxed text-gray-400">
                  Nigeria&apos;s escrow-backed marketplace. Buy and sell with verified sellers,
                  tracked delivery and money that moves only when goods do.
                </p>
                <div className="mt-5 flex items-center gap-2">
                  {[
                    { href: 'https://x.com/goodsale', label: 'GoodSale on X', Icon: Twitter },
                    { href: 'https://instagram.com/goodsale', label: 'GoodSale on Instagram', Icon: Instagram },
                    { href: 'https://facebook.com/goodsale', label: 'GoodSale on Facebook', Icon: Facebook },
                    { href: 'https://linkedin.com/company/goodsale', label: 'GoodSale on LinkedIn', Icon: Linkedin },
                  ].map(({ href, label, Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-900/60 bg-emerald-950/30 text-gray-400 transition-colors hover:border-[#F5A623]/50 hover:text-[#F5A623]"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-900/20 px-3 py-1.5 text-xs font-medium text-emerald-400 border border-emerald-800/40">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#F5A623]" /> Escrow protected on every order
                </div>
              </div>

              {/* Quick Links */}
              <div>
                <p className="text-sm font-bold text-white tracking-wide">Quick Links</p>
                <ul className="mt-4 space-y-2.5 text-xs sm:text-sm">
                  <li><button onClick={() => handleNavigate('landing')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Home</button></li>
                  <li><button onClick={() => handleNavigate('marketplace')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Shop &amp; Browse</button></li>
                  <li><button onClick={() => handleNavigate('dashboard')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Sell on GoodSale</button></li>
                  <li><button onClick={() => handleNavigate('cart')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Shopping Cart</button></li>
                </ul>
              </div>

              {/* Support */}
              <div>
                <p className="text-sm font-bold text-white tracking-wide">Support</p>
                <ul className="mt-4 space-y-2.5 text-xs sm:text-sm">
                  <li><button onClick={() => handleNavigate('settings')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Help Centre</button></li>
                  <li><button onClick={() => handleNavigate('dispatch')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Track Order</button></li>
                  <li><button onClick={() => handleNavigate('chats')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Contact Us</button></li>
                  <li>
                    <a href="mailto:support@goodsale.ng" className="inline-flex items-center gap-1.5 text-gray-400 transition-colors hover:text-[#F5A623]">
                      <Mail className="h-3.5 w-3.5" /> support@goodsale.ng
                    </a>
                  </li>
                </ul>
              </div>

              {/* About GoodSale */}
              <div>
                <p className="text-sm font-bold text-white tracking-wide">About GoodSale</p>
                <ul className="mt-4 space-y-2.5 text-xs sm:text-sm">
                  <li><Link href="/terms" className="text-gray-400 transition-colors hover:text-[#F5A623]">Terms of Service</Link></li>
                  <li><Link href="/privacy" className="text-gray-400 transition-colors hover:text-[#F5A623]">Privacy Policy</Link></li>
                  <li><button onClick={() => handleNavigate('verification')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Trust &amp; Safety</button></li>
                  <li><button onClick={() => handleNavigate('settings')} className="text-gray-400 transition-colors hover:text-[#F5A623] cursor-pointer">Escrow Guarantee</button></li>
                </ul>
              </div>

              {/* Stay Connected */}
              <div className="col-span-2 sm:col-span-1 lg:col-span-1">
                <p className="text-sm font-bold text-white tracking-wide">Stay Connected</p>
                <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                  Get the latest deals and updates.
                </p>
                <div className="mt-3 flex items-center max-w-xs">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    className="w-full px-3 py-2 text-xs rounded-l-full bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        triggerToast('Subscribed to GoodSale deals!', 'success');
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                  <button
                    onClick={(e) => {
                      const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                      if (input && input.value) {
                        triggerToast('Subscribed to GoodSale deals!', 'success');
                        input.value = '';
                      } else {
                        triggerToast('Please enter your email.', 'info');
                      }
                    }}
                    className="bg-[#F5A623] hover:bg-[#df971d] text-ink-950 font-bold px-3 py-2 rounded-r-full text-xs flex items-center justify-center cursor-pointer transition-colors"
                    aria-label="Subscribe"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Row: Copyright, Made in Nigeria, Scroll to Top */}
            <div className="mt-10 flex flex-col gap-4 border-t border-emerald-900/60 pt-6 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-400">
              <p>
                © {new Date().getFullYear()} GoodSale. All rights reserved. | A Nigerian Marketplace for a Better Tomorrow.
              </p>
              
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-medium text-gray-300">
                  <span role="img" aria-label="Nigeria">🇳🇬</span> Made in Nigeria <span className="text-red-500">❤️</span>
                </span>

                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="w-8 h-8 rounded-full bg-[#F5A623] hover:bg-[#df971d] text-ink-950 flex items-center justify-center shadow-md transition-transform hover:scale-110 active:scale-95 cursor-pointer ml-2"
                  title="Back to top"
                  aria-label="Back to top"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </footer>
        )}
      </main>

      {/* App-wide real-time call overlay */}
      <CallHost />

      {/* Persistent Secure Auth Modal Portal */}
      <AuthModal isOpen={isAuthModalOpen} initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />

      {/* Persistent Bottom Navigation (Mobile Native Feel) */}
      <BottomNavigation
        currentView={currentView}
        onNavigate={handleNavigate}
        cartCount={cart.length}
        onOpenAuth={(mode?: 'login' | 'register') => {
          setAuthModalMode(mode || 'login');
          setAuthModalOpen(true);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

    </div>
  );
}
