// app/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import LandingView from '../components/LandingView';
import ProductDetailView from '../components/ProductDetailView';
import DashboardView from '../components/DashboardView';
import AdminDashboard from '../components/AdminDashboard';
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
import { getDBState, useDBState } from '../lib/store';

export default function Home() {
  const db = useDBState();
  const [currentView, setCurrentView] = useState<string>('landing');
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Shopping Cart client State
  const [cart, setCart] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dynamic payloads
  const [checkoutProductId, setCheckoutProductId] = useState<number | null>(null);
  const [activeChatRoomId, setActiveChatRoomId] = useState<number | null>(null);

  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAddToCart = (productId: number) => {
    setCart(prev => {
      if (prev.includes(productId)) {
        triggerToast('Item is already in your shopping cart!');
        return prev;
      }
      triggerToast('Item added to shopping cart securely!');
      return [...prev, productId];
    });
  };

  const handleRemoveFromCart = (productId: number) => {
    setCart(prev => prev.filter(id => id !== productId));
    triggerToast('Item removed from shopping cart.');
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleSelectProduct = (id: number) => {
    handleNavigate('product', { id });
  };

  // Safe navigation proxy
  const handleNavigate = (view: string, payload?: any) => {
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

  return (
    <div className="bg-gray-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen transition-colors duration-300">
      
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

      {/* Floating active Toast notification banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-950 px-4 py-3 rounded-xl font-sans font-semibold text-xs shadow-2xl flex items-center gap-2 border border-slate-800 dark:border-gray-200 animate-slide-in">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Core Dynamic Content Container */}
      <main className="min-h-[calc(100vh-4rem)] pb-[68px] md:pb-0">
        {currentView === 'landing' && (
          <LandingView
            onSelectProduct={handleSelectProduct}
            searchQuery={searchQuery}
            onNavigate={handleNavigate}
            onAddToCart={handleAddToCart}
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
          <DashboardView onOpenAuth={() => setAuthModalOpen(true)} />
        )}

        {currentView === 'admin' && (
          <AdminDashboard onOpenAuth={() => setAuthModalOpen(true)} />
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

        {/* Visual simple footer */}
        <footer className="bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 py-6 text-center text-[10px] text-gray-400 font-mono tracking-wide mt-auto">
          © {new Date().getFullYear()} GoodSale Inc. Premium Escrow Nigerian Commerce. All rights reserved.
        </footer>
      </main>

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
