// app/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import MarketplaceHeader from '../components/MarketplaceHeader';
import { useWishlist } from '@/lib/hooks/useWishlist';
import LandingView from '../components/LandingView';
import AuthModal from '../components/AuthModal';

// Every screen except Home is code-split: the marketplace shell boots without
// the dashboard, admin, checkout and messaging bundles, and each view is
// fetched the first time it is opened.
const WalletView = dynamic(() => import('../components/WalletView'));
const ProductDetailView = dynamic(() => import('../components/ProductDetailView'));
const DashboardView = dynamic(() => import('../components/DashboardView'));
const AdminDashboard = dynamic(() => import('../components/AdminDashboard'));
const DispatchDashboardView = dynamic(() => import('../components/DispatchDashboardView'));
const RevenueCenterView = dynamic(() => import('../components/RevenueCenterView'));
const ChatView = dynamic(() => import('../components/ChatView'));
const CartCheckoutView = dynamic(() => import('../components/CartCheckoutView'));
const SellerVerificationCenter = dynamic(() => import('../components/seller/SellerVerificationCenter'));
const LoyaltyHubView = dynamic(() => import('../components/LoyaltyHubView'));
const ReferralCenter = dynamic(() => import('../components/referral/ReferralCenter'));
const BrandCenterView = dynamic(() => import('../components/BrandCenterView'));
const SellerProfileView = dynamic(() => import('../components/SellerProfileView'));
const SettingsView = dynamic(() => import('../components/SettingsView'));
const CategoriesView = dynamic(() => import('../components/CategoriesView'));
const BuyerProfileView = dynamic(() => import('../components/BuyerProfileView'));
const TrustSafetyView = dynamic(() => import('../components/TrustSafetyView'));
const SupportCenterView = dynamic(() => import('../components/SupportCenterView'));
import BottomNavigation from '../components/BottomNavigation';
import SetupBanner from '../components/SetupBanner';
import FeedbackHost from '../components/ui/FeedbackHost';
import AnnouncementModal from '../components/AnnouncementModal';
import CallHost from '../components/CallHost';
import BrandLoader from '../components/ui/BrandLoader';
import { getDBState, useDBState } from '../lib/store';
import { trackProductMetric } from '../lib/productMetrics';
import { toast } from '../lib/feedback';
import QuickBuySheet from '../components/marketplace/QuickBuySheet';
import { enqueueOfflineAction, syncOfflineProducts } from '@/lib/offline/vault';

function BootSplash() {
  return (
    <div className="fixed inset-0 z-[200] animate-fade-in bg-white dark:bg-ink-950">
      <BrandLoader message="Securing your trade…" />
    </div>
  );
}

export default function Home() {
  const db = useDBState();
  // The marketplace is the whole app — it is the first screen every visitor sees.
  const [currentView, setCurrentView] = useState<string>('marketplace');
  const wishlist = useWishlist();
  const [marketState, setMarketState] = useState<string>('');
  const [wishlistOnly, setWishlistOnly] = useState(false);
  // Full-screen transition beat: the goodsale-loader Lottie owns this moment only.
  const [booted, setBooted] = useState(false);
  // Deep link used when onboarding finishes (e.g. /?view=dashboard).
  const [pendingView, setPendingView] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 450);
    return () => clearTimeout(t);
  }, []);

  // Every in-app view starts at the top. Without this, opening Settings or the
  // You page from halfway down the catalogue left the new page scrolled down.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [currentView]);

  // Public SEO pages deep-link into the interactive app without changing the
  // existing single-page view model: /?product=123 or /?seller=45.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const productParam = Number(params.get('product'));
    const sellerParam = Number(params.get('seller'));

    if (Number.isFinite(productParam) && productParam > 0) {
      setSelectedProductId(productParam);
      setCurrentView('product');
      return;
    }
    if (Number.isFinite(sellerParam) && sellerParam > 0) {
      setSelectedSellerId(sellerParam);
      setCurrentView('seller-profile');
    }

    // /?view=dashboard lets onboarding land a seller on their hub. It waits for
    // the session to load so a guest still sees the marketplace.
    const viewParam = params.get('view');
    const roomIdParam = Number(params.get('roomId'));
    if (viewParam) {
      setPendingView(viewParam);
      if (viewParam === 'chats' && Number.isInteger(roomIdParam) && roomIdParam > 0) {
        setActiveChatRoomId(roomIdParam);
      }
    }
  }, []);

  useEffect(() => {
    if (!pendingView) return;
    const known = [
      'marketplace', 'dashboard', 'wallet', 'chats', 'settings', 'buyer-profile', 'cart',
      'loyalty', 'referrals', 'dispatch', 'revenue', 'verification', 'brand-center', 'admin',
      'support', 'trust-safety',
    ];
    if (!known.includes(pendingView)) {
      setPendingView(null);
      return;
    }
    const guestAccessibleViews = ['marketplace', 'trust-safety', 'brand-center', 'referrals'];
    if (!db.currentUser && !guestAccessibleViews.includes(pendingView)) return; // signed-in views wait for the session
    setCurrentView(pendingView);
    setPendingView(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('roomId');
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
  }, [pendingView, db.currentUser]);

  // Receive deep-link navigation requests from the Service Worker when the user
  // taps a Web Push notification while the app is already open.
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'GOODSALE_NAVIGATE' || typeof event.data?.url !== 'string') return;
      try {
        const parsed = new URL(event.data.url, window.location.origin);
        const viewParam = parsed.searchParams.get('view');
        const roomIdParam = Number(parsed.searchParams.get('roomId'));
        if (!viewParam) return;
        if (viewParam === 'chats' && Number.isInteger(roomIdParam) && roomIdParam > 0) {
          setActiveChatRoomId(roomIdParam);
        }
        setCurrentView(viewParam);
      } catch {
        /* ignore malformed url */
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Shopping Cart client State — mirrored into localStorage so a refresh or a
  // return visit keeps the basket (and the header badge) intact.
  const [cart, setCart] = useState<number[]>([]);
  const [cartReady, setCartReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('goodsale_cart');
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setCart(parsed.filter((id) => typeof id === 'number'));
    } catch {
      /* storage blocked — start with an empty cart */
    }
    setCartReady(true);
  }, []);

  useEffect(() => {
    if (!cartReady) return;
    try {
      window.localStorage.setItem('goodsale_cart', JSON.stringify(cart));
    } catch {
      /* storage blocked — keep the in-memory cart */
    }
  }, [cart, cartReady]);

  // A saved cart can outlive a delisted product. Drop those ids once the
  // catalogue is loaded so checkout never opens an empty/blank line item.
  useEffect(() => {
    if (!cartReady || db.products.length === 0) return;
    const available = new Set(db.products.map((product) => product.id));
    setCart((prev) => (prev.every((id) => available.has(id)) ? prev : prev.filter((id) => available.has(id))));
  }, [cartReady, db.products]);

  // Dynamic payloads
  const [checkoutProductId, setCheckoutProductId] = useState<number | null>(null);
  const [quickBuyProductId, setQuickBuyProductId] = useState<number | null>(null);
  const [activeChatRoomId, setActiveChatRoomId] = useState<number | null>(null);

  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(null);
  // Which panel the Account screen opens on — the Orders tab in the bottom nav
  // deep-links straight to the buyer's orders.
  const [profileSection, setProfileSection] = useState<string>('you-overview');
  // Category the catalogue opens on — set by the Categories screen, cleared
  // whenever the shopper lands on Home or starts a new search.
  const [marketplaceCategory, setMarketplaceCategory] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (!cartReady || db.products.length === 0) return;
    syncOfflineProducts(db.products, [...cart, ...wishlist.favorites]);
  }, [cartReady, db.products, cart, wishlist.favorites]);

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
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueueOfflineAction({ kind: 'CART_ADD', productId });
    }
    setCart(prev => {
      if (prev.includes(productId)) {
        triggerToast('Item is already in your shopping cart!', 'info');
        return prev;
      }
      triggerToast('Item added to shopping cart securely!');
      trackProductMetric(productId, 'cart');
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
      'support',
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

    // A saved-items filter belongs to the catalogue screen only. Clearing it on
    // the way out stops Home reopening filtered to the wishlist later.
    if (view !== 'marketplace' && wishlistOnly) setWishlistOnly(false);

    // Save current view in history (skip no-op taps on the current view)
    if (view !== currentView) setHistory(prev => [...prev, currentView]);

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
    } else if (view === 'buyer-profile') {
      if (typeof payload?.section === 'string') setProfileSection(payload.section);
      setCurrentView('buyer-profile');
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
    } else if (view === 'marketplace') {
      setMarketplaceCategory(typeof payload?.category === 'string' ? payload.category : null);
      setCurrentView('marketplace');
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
      setCurrentView('marketplace');
    }
  };

  return (
    <>
      {/* The splash overlays the marketplace rather than replacing it, so the
          landing content is present in the server-rendered HTML for crawlers
          and no-JavaScript visitors. */}
      {!booted && <BootSplash />}
    <div className="bg-white dark:bg-ink-950 text-ink-900 dark:text-ink-100 min-h-screen transition-colors duration-300">
      <SetupBanner />
      
      {/* One header for the whole app — the marketplace shopping bar. */}
      <MarketplaceHeader
        searchQuery={searchQuery}
        onSearchChange={(query) => {
          setSearchQuery(query);
          if (query) setMarketplaceCategory(null);
          if (query && currentView !== 'marketplace') setCurrentView('marketplace');
        }}
        cartCount={cart.length}
        wishlistCount={wishlist.count}
        selectedState={marketState}
        onSelectState={setMarketState}
        onNavigate={handleNavigate}
        onOpenAuth={(mode?: 'login' | 'register') => {
          setAuthModalMode(mode || 'login');
          setAuthModalOpen(true);
        }}
        onOpenWishlist={() => {
          setWishlistOnly(true);
          setCurrentView('marketplace');
          setTimeout(() => {
            document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 60);
        }}
      />

      {/* Global Aurora Flow feedback: toasts + themed confirm dialog */}
      <FeedbackHost />

      {/* Admin-written popup shown whenever a user joins or enters the app */}
      <AnnouncementModal />

      {/* Core Dynamic Content Container */}
      <main className="min-h-[calc(100vh-4rem)] pb-[calc(92px+env(safe-area-inset-bottom,0px))] md:pb-12">
        {/* Screen-push transition: each view enters from the trailing edge */}
        <div key={currentView} className="animate-screen-push">
        {currentView === 'marketplace' && (
          <LandingView
            onSelectProduct={handleSelectProduct}
            searchQuery={searchQuery}
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
            onQuickBuy={(id: number) => setQuickBuyProductId(id)}
            selectedState={marketState}
            onSelectState={setMarketState}
            wishlistOnly={wishlistOnly}
            onWishlistOnlyChange={setWishlistOnly}
            initialCategory={marketplaceCategory}
            onOpenAuth={(mode?: 'login' | 'register') => {
              setAuthModalMode(mode || 'login');
              setAuthModalOpen(true);
            }}
          />
        )}

        {currentView === 'categories' && (
          <CategoriesView onNavigate={handleNavigate} />
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
            onQuickBuy={(id: number) => setQuickBuyProductId(id)}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {currentView === 'seller-profile' && selectedSellerId !== null && (
          <SellerProfileView
            sellerId={selectedSellerId}
            onBack={handleGoBack}
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
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
          <RevenueCenterView onNavigate={handleNavigate} />
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
          <SellerVerificationCenter />
        )}

        {currentView === 'loyalty' && (
          <LoyaltyHubView onNavigate={handleNavigate} />
        )}

        {currentView === 'referrals' && (
          <ReferralCenter
            onBack={handleGoBack}
            onNavigate={handleNavigate}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {currentView === 'brand-center' && (
          <BrandCenterView onBack={handleGoBack} />
        )}

        {currentView === 'settings' && (
          <SettingsView onBack={handleGoBack} onNavigate={handleNavigate} onOpenAuth={() => setAuthModalOpen(true)} />
        )}

        {currentView === 'buyer-profile' && (
          <BuyerProfileView
            onBack={handleGoBack}
            onNavigate={handleNavigate}
            onOpenAuth={() => setAuthModalOpen(true)}
            initialSection={profileSection as 'you-overview' | 'you-saved' | 'you-listings' | 'you-orders' | 'you-reviews'}
          />
        )}

        {currentView === 'trust-safety' && (
          <TrustSafetyView onBack={handleGoBack} onNavigate={handleNavigate} />
        )}

        {currentView === 'support' && (
          <SupportCenterView
            onBack={handleGoBack}
            onNavigate={handleNavigate}
            onOpenAuth={() => { setAuthModalMode('login'); setAuthModalOpen(true); }}
          />
        )}
        </div>
      </main>

      {/* App-wide real-time call overlay */}
      <CallHost />

      {/* Bottom-Sheet Quick Buy Express Escrow */}
      <QuickBuySheet
        productId={quickBuyProductId}
        onClose={() => setQuickBuyProductId(null)}
        onOpenAuth={(mode) => {
          setAuthModalMode(mode || 'register');
          setAuthModalOpen(true);
        }}
        onNavigate={handleNavigate}
      />

      {/* Persistent Secure Auth Modal Portal */}
      <AuthModal isOpen={isAuthModalOpen} initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />

      {/* Persistent Bottom Navigation (Mobile Native Feel) */}
      <BottomNavigation
        currentView={currentView}
        onNavigate={handleNavigate}
        onOpenAuth={(mode?: 'login' | 'register') => {
          setAuthModalMode(mode || 'login');
          setAuthModalOpen(true);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

    </div>
    </>
  );
}
