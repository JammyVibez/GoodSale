// app/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Facebook, Instagram, Twitter, Linkedin, Mail,
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
        <footer className="mt-auto border-t border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
              {/* Brand */}
              <div className="col-span-2 lg:col-span-2">
                <p className="font-display text-xl font-bold tracking-tight text-ink-900 dark:text-white">
                  Good<span className="text-jade-600 dark:text-jade-400">Sale</span>
                </p>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500 dark:text-ink-400">
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
                      className="grid h-9 w-9 place-items-center rounded-xl border border-ink-200 text-ink-500 transition-colors hover:border-jade-500/40 hover:text-jade-600 dark:border-ink-800 dark:text-ink-400 dark:hover:text-jade-400"
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  ))}
                </div>
                <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-jade-500/5 px-3 py-2 text-xs font-medium text-jade-700 dark:bg-jade-500/10 dark:text-jade-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> Escrow protected on every order
                </div>
              </div>

              {/* Marketplace */}
              <div>
                <p className="text-sm font-semibold text-ink-900 dark:text-white">Marketplace</p>
                <ul className="mt-4 space-y-3 text-sm">
                  <li><button onClick={() => handleNavigate('marketplace')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Browse listings</button></li>
                  <li><button onClick={() => handleNavigate('marketplace')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Categories</button></li>
                  <li><button onClick={() => handleNavigate('landing')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">How it works</button></li>
                  <li><button onClick={() => handleNavigate('cart')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Your cart</button></li>
                </ul>
              </div>

              {/* Selling */}
              <div>
                <p className="text-sm font-semibold text-ink-900 dark:text-white">Selling</p>
                <ul className="mt-4 space-y-3 text-sm">
                  <li><button onClick={() => handleNavigate('dashboard')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Start selling</button></li>
                  <li><button onClick={() => handleNavigate('dashboard')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Seller hub</button></li>
                  <li><button onClick={() => handleNavigate('settings')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Account type</button></li>
                  <li><button onClick={() => handleNavigate('wallet')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Payouts &amp; wallet</button></li>
                </ul>
              </div>

              {/* Support */}
              <div>
                <p className="text-sm font-semibold text-ink-900 dark:text-white">Support</p>
                <ul className="mt-4 space-y-3 text-sm">
                  <li><button onClick={() => handleNavigate('settings')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Help centre</button></li>
                  <li><button onClick={() => handleNavigate('chats')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Chat with a seller</button></li>
                  <li><button onClick={() => handleNavigate('settings')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Delivery &amp; tracking</button></li>
                  <li>
                    <a href="mailto:support@goodsale.ng" className="inline-flex items-center gap-1.5 text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400">
                      <Mail className="h-3.5 w-3.5" /> support@goodsale.ng
                    </a>
                  </li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <p className="text-sm font-semibold text-ink-900 dark:text-white">Legal</p>
                <ul className="mt-4 space-y-3 text-sm">
                  <li><Link href="/terms" className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400">Terms of Service</Link></li>
                  <li><Link href="/privacy" className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400">Privacy Policy</Link></li>
                  <li><button onClick={() => handleNavigate('settings')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Escrow agreement</button></li>
                  <li><button onClick={() => handleNavigate('settings')} className="text-ink-500 transition-colors hover:text-jade-600 dark:text-ink-400 dark:hover:text-jade-400 cursor-pointer">Dispute policy</button></li>
                </ul>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t border-ink-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-ink-800">
              <p className="text-sm text-ink-400">
                © {new Date().getFullYear()} GoodSale. Escrow-secured commerce for Nigeria.
              </p>
              <p className="text-sm text-ink-400">Built in Nigeria · Payments by Paystack</p>
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
