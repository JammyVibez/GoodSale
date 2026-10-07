// components/CartCheckoutView.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, Shield, CreditCard, ChevronRight, CheckCircle2, 
  MapPin, Award, Trash2, KeyRound, QrCode, ClipboardCheck, ArrowLeft, RefreshCw,
  Truck, ExternalLink, Sparkles, ShieldAlert, ShieldCheck, CheckCircle,
  Coins, FileText, Upload, Navigation
} from 'lucide-react';
import { 
  getDBState, saveDBState, dbOperations, Product, Order, OrderStatus 
} from '../lib/store';
import PaystackPayment from './PaystackPayment';
import { toast } from '@/lib/feedback';
import EmptyState from './ui/EmptyState';
import { SmartImage } from './ui/SmartImage';
import LiveDispatchMap from './LiveDispatchMap';
import { useLiveLocation } from '@/lib/hooks/useLiveLocation';
import {
  LOCATION_PRESETS,
  rankPartnersByProximity,
  bestCoords,
  formatDistanceKm,
} from '@/lib/geo';
import { computePlatformFee } from '@/lib/fees';

interface CartCheckoutViewProps {
  onBack: () => void;
  onNavigate: (view: string, payload?: any) => void;
  cart: number[];
  onRemoveFromCart: (productId: number) => void;
  onClearCart: () => void;
  preselectedProductId?: number | null;
  onOpenAuth?: () => void;
}

export default function CartCheckoutView({
  onBack,
  onNavigate,
  cart,
  onRemoveFromCart,
  onClearCart,
  preselectedProductId = null,
  onOpenAuth,
}: CartCheckoutViewProps) {
  const [db, setDb] = useState(getDBState());
  const [activeStep, setActiveStep] = useState<'cart' | 'checkout' | 'orders'>('cart');
  
  // Checkout Fields
  const [deliveryAddress, setDeliveryAddress] = useState<string>(LOCATION_PRESETS.gbagada.address);
  const [city, setCity] = useState<string>(LOCATION_PRESETS.gbagada.city);
  const [state, setState] = useState<string>(LOCATION_PRESETS.gbagada.state);
  const [phoneNumber, setPhoneNumber] = useState('+234 812 345 6789');
  const [deliveryLat, setDeliveryLat] = useState<number>(LOCATION_PRESETS.gbagada.lat);
  const [deliveryLng, setDeliveryLng] = useState<number>(LOCATION_PRESETS.gbagada.lng);

  const buyerGps = useLiveLocation({ watch: true, throttleMs: 10000, enabled: true });

  // Prefer live GPS for delivery pin when available
  useEffect(() => {
    if (buyerGps.coords && buyerGps.source === 'gps') {
      setDeliveryLat(buyerGps.coords.lat);
      setDeliveryLng(buyerGps.coords.lng);
    }
  }, [buyerGps.coords, buyerGps.source]);

  // New States for GoodDispatch Marketplace & Protection
  const [deliveryMethod, setDeliveryMethod] = useState<'GOODSALE_PARTNER' | 'THIRD_PARTY_COURIER' | 'PICKUP'>('GOODSALE_PARTNER');
  const [serviceType, setServiceType] = useState<'ECONOMY' | 'STANDARD' | 'EXPRESS'>('STANDARD');
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [hasGoodSaleProtect, setHasGoodSaleProtect] = useState(false);
  const [smartMatchingActive, setSmartMatchingActive] = useState(false);
  const [smartMatchResult, setSmartMatchResult] = useState<string | null>(null);

  // Expanded Payment and Checkout States
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('escrow');
  const [bankTransferReceipt, setBankTransferReceipt] = useState<string | null>(null);
  const [bankTransferUploading, setBankTransferUploading] = useState(false);
  const [invoiceTerms, setInvoiceTerms] = useState<string>('Net 15');
  const [pendingPayOrderIds, setPendingPayOrderIds] = useState<number[]>([]);
  const [pendingPayAmount, setPendingPayAmount] = useState(0);

  // Interactive Verification PIN state
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  // Selected Order for Receipt View
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  // Dispute state
  const [showDisputeFormOrderId, setShowDisputeFormOrderId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [showPaystackModal, setShowPaystackModal] = useState(false);

  // Match algorithm: real GPS proximity + trust / workload
  const deliveryOrigin = useMemo(
    () =>
      bestCoords(
        { lat: deliveryLat, lng: deliveryLng },
        buyerGps.coords,
        city,
        state,
        deliveryAddress
      ),
    [deliveryLat, deliveryLng, buyerGps.coords, city, state, deliveryAddress]
  );

  const rankedCouriers = useMemo(() => {
    const activePartners = db.deliveryPartners.filter((p) => p.status === 'APPROVED' && p.isAvailable);
    return rankPartnersByProximity(deliveryOrigin, activePartners);
  }, [db.deliveryPartners, deliveryOrigin]);

  const runSmartMatching = () => {
    setSmartMatchingActive(true);
    setSmartMatchResult(null);
    
    setTimeout(() => {
      if (rankedCouriers.length === 0) {
        setSmartMatchingActive(false);
        setSmartMatchResult("No active dispatch riders are currently available near your location. Please assign manually or retry shortly.");
        return;
      }

      const best = rankedCouriers[0];
      setSelectedPartnerId(best.partner.id);
      setSmartMatchResult(
        `Smart Match Successful! Recommended ${best.partner.fullName} (${best.score}% fit) — ${formatDistanceKm(best.distanceKm)} away, ~${best.etaMinutes} mins ETA, trust ${best.partner.trustScore}%.`
      );
      setSmartMatchingActive(false);
    }, 900);
  };

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  // Pre-fill buy now product
  useEffect(() => {
    if (preselectedProductId) {
      const timer = setTimeout(() => {
        setActiveStep('checkout');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [preselectedProductId]);

  // Items to purchase
  const cartItems = preselectedProductId 
    ? db.products.filter(p => p.id === preselectedProductId)
    : db.products.filter(p => cart.includes(p.id));

  const currentCheckoutItem = cartItems[0];

  // Get active payment methods globally configured by admin, default to all if not set
  const enabledGlobalMethods = db.paymentSettings?.enabledMethods || ['escrow', 'cod', 'card', 'bank', 'invoice', 'partial'];
  
  // Intersect product specific methods with global enabled ones.
  const productMethods = currentCheckoutItem
    ? ((currentCheckoutItem as any).paymentMethods || ['escrow', 'card', 'cod', 'bank', 'invoice', 'partial'])
    : ['escrow', 'card', 'cod', 'bank', 'invoice', 'partial'];
  
  const allowedCheckoutMethods = productMethods.filter((m: string) => enabledGlobalMethods.includes(m.toLowerCase()));
  
  // Ensure we have at least 'escrow' if nothing else is left
  if (allowedCheckoutMethods.length === 0) {
    allowedCheckoutMethods.push('escrow');
  }

  // Auto-select first allowed payment method when item changes
  useEffect(() => {
    if (currentCheckoutItem) {
      if (allowedCheckoutMethods.length > 0 && !allowedCheckoutMethods.includes(selectedPaymentMethod)) {
        setSelectedPaymentMethod(allowedCheckoutMethods[0]);
      }
    }
  }, [currentCheckoutItem, selectedPaymentMethod, allowedCheckoutMethods]);

  const user = db.currentUser;
  
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-jade-500/10 dark:bg-jade-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-jade-500/20">
          <Shield className="w-8 h-8 text-jade-500" />
        </div>
        <h2 className="font-display font-bold text-2xl text-ink-900 dark:text-white mb-2">Create an account to use your cart</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Guests can browse the GoodSale catalog freely. Sign up or sign in to save items, checkout with escrow, and track deliveries.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-jade-500 to-jade-600 hover:from-jade-600 hover:to-jade-700 text-white font-sans font-bold text-xs tracking-tight rounded-xl cursor-pointer shadow-md shadow-jade-500/10 transition-all"
          >
            Create Account / Sign In
          </button>
          <button
            onClick={onBack}
            className="w-full py-2.5 bg-transparent border border-ink-200 dark:border-ink-800 hover:bg-ink-100 dark:hover:bg-ink-900 text-ink-700 dark:text-ink-300 font-sans font-bold text-xs tracking-tight rounded-xl cursor-pointer transition-all"
          >
            Go Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  const subtotal = cartItems.reduce((acc, p) => acc + p.price, 0);
  // Per-item platform fee — mirrors Order.taxAmount (admin-toggleable, OFF at launch).
  const platformFeeMeta = computePlatformFee(db.revenueSettings, subtotal);
  const escrowFee = cartItems.reduce(
    (acc, p) => acc + computePlatformFee(db.revenueSettings, p.price).amount,
    0
  );
  
  const protectFee = hasGoodSaleProtect ? (db.revenueSettings?.goodSaleProtectFee || 1500) : 0;
  
  const deliveryCharge = cartItems.length === 0 ? 0 : (
    deliveryMethod === 'GOODSALE_PARTNER' ? (
      serviceType === 'EXPRESS' ? 10000 : serviceType === 'ECONOMY' ? 3500 : 6000
    ) : deliveryMethod === 'THIRD_PARTY_COURIER' ? 12000 : 0
  );

  const totalDue = subtotal + escrowFee + deliveryCharge + protectFee;

  // Create order(s); for card/escrow/partial open Paystack after order exists
  const handlePayIntoEscrow = async (customMethod?: string) => {
    if (cartItems.length === 0) return;

    const pm = (customMethod || selectedPaymentMethod || 'escrow').toLowerCase();
    const needsPaystack = ['escrow', 'card', 'partial'].includes(pm);

    const createdIds: number[] = [];
    let payAmount = 0;

    for (const item of cartItems) {
      const order = await dbOperations.placeOrder(
        item.id,
        deliveryAddress,
        city,
        state,
        pm,
        deliveryMethod,
        false,
        deliveryMethod === 'GOODSALE_PARTNER' && selectedPartnerId ? selectedPartnerId : undefined,
        serviceType,
        hasGoodSaleProtect,
        bankTransferReceipt || undefined,
        invoiceTerms,
        { lat: deliveryOrigin.lat, lng: deliveryOrigin.lng }
      );
      if (order?.id) {
        createdIds.push(order.id);
        payAmount += order.totalAmount;
      }
    }

    if (needsPaystack && createdIds.length > 0) {
      setPendingPayOrderIds(createdIds);
      setPendingPayAmount(payAmount || totalDue);
      setShowPaystackModal(true);
      return;
    }

    onClearCart();
    setActiveStep('orders');
  };

  const handlePaystackSuccess = async () => {
    setShowPaystackModal(false);
    setPendingPayOrderIds([]);
    setPendingPayAmount(0);
    onClearCart();
    setActiveStep('orders');
  };

  // Submit Secret PIN Verification to release funds
  const handleVerifyDeliveryPin = async (orderId: number) => {
    setPinError(null);
    setPinSuccess(null);

    const result = await dbOperations.completeDelivery(orderId, enteredPin);
    if (result && 'error' in result) {
      setPinError(result.error || 'Verification failed');
    } else {
      setPinSuccess('PIN verified! Escrow funds released to the merchant wallet.');
      setEnteredPin('');
      setTimeout(() => setPinSuccess(null), 4000);
    }
  };

  // Preset location fillers for Lagos/Abuja
  const handlePresetLocation = (cityPreset: string) => {
    if (cityPreset === 'Lag') {
      setDeliveryAddress(LOCATION_PRESETS.lekki.address);
      setCity(LOCATION_PRESETS.lekki.city);
      setState(LOCATION_PRESETS.lekki.state);
      setDeliveryLat(LOCATION_PRESETS.lekki.lat);
      setDeliveryLng(LOCATION_PRESETS.lekki.lng);
    } else {
      setDeliveryAddress(LOCATION_PRESETS.abuja.address);
      setCity(LOCATION_PRESETS.abuja.city);
      setState(LOCATION_PRESETS.abuja.state);
      setDeliveryLat(LOCATION_PRESETS.abuja.lat);
      setDeliveryLng(LOCATION_PRESETS.abuja.lng);
    }
  };

  const useMyGpsLocation = () => {
    buyerGps.refresh();
    if (buyerGps.coords) {
      setDeliveryLat(buyerGps.coords.lat);
      setDeliveryLng(buyerGps.coords.lng);
      setDeliveryAddress(
        `Live GPS pin ${buyerGps.coords.lat.toFixed(5)}, ${buyerGps.coords.lng.toFixed(5)}`
      );
      setCity(city || 'My location');
    }
  };

  // Get User Order log
  const myOrders = db.orders.filter(order => 
    order.buyerId === user.id || order.sellerId === user.id
  ).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        
        {/* Navigation Tabs */}
        <div className="mb-6 flex items-center justify-between border-b border-ink-200 dark:border-ink-800 pb-4">
          <button 
            onClick={onBack}
            className="text-xs font-bold text-ink-500 hover:text-ink-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Continue Shopping
          </button>

          <div className="flex gap-2 bg-ink-100 dark:bg-ink-900 p-1 rounded-xl">
            <button
              onClick={() => setActiveStep('cart')}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeStep === 'cart' ? 'bg-jade-500 text-white shadow' : 'text-ink-700 dark:text-ink-400 hover:text-ink-950'}`}
            >
              Shopping Cart ({cart.length})
            </button>
            <button
              onClick={() => setActiveStep('checkout')}
              disabled={cartItems.length === 0}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeStep === 'checkout' ? 'bg-jade-500 text-white shadow' : 'text-ink-700 dark:text-ink-400 hover:text-ink-950 disabled:opacity-50'}`}
            >
              Escrow Checkout
            </button>
            <button
              onClick={() => setActiveStep('orders')}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeStep === 'orders' ? 'bg-jade-500 text-white shadow' : 'text-ink-700 dark:text-ink-400 hover:text-ink-950'}`}
            >
              My Escrow Orders ({myOrders.length})
            </button>
          </div>
        </div>

        {/* STEP 1: Shopping Cart */}
        {activeStep === 'cart' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Cart products item list */}
            <div className="lg:col-span-8 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-sans font-semibold text-sm text-ink-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-jade-500" />
                Shopping Bag Items
              </h3>

              {cartItems.length === 0 ? (
                <EmptyState
                  state="empty-cart"
                  size="sm"
                  icon={<ShoppingCart />}
                  title="Your shopping cart is empty"
                  description="Go back to browse premium secured C2C items."
                  action={
                    <button
                      type="button"
                      onClick={() => onNavigate('landing')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-jade-500 hover:bg-jade-600 text-white text-xs font-semibold tracking-tight rounded-xl transition-all cursor-pointer press-scale focus-ring"
                    >
                      Browse marketplace
                    </button>
                  }
                />
              ) : (
                <div className="divide-y divide-ink-100 dark:divide-ink-800/60">
                  {cartItems.map((item) => (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex gap-4 items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-lg bg-ink-100 dark:bg-ink-800 overflow-hidden shrink-0">
                          <SmartImage src={item.images?.[0]} alt={item.title} seed={`cart-${item.id}`} className="h-full w-full" />
                        </div>
                        <div>
                          <h4 className="font-bold text-ink-950 dark:text-white">{item.title}</h4>
                          <span className="text-jade-500 font-mono">Category: {item.category}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-sans font-semibold text-sm text-ink-950 dark:text-white">₦{item.price.toLocaleString()}</span>
                        {!preselectedProductId && (
                          <button
                            onClick={() => onRemoveFromCart(item.id)}
                            className="p-1.5 hover:bg-ink-500/10 text-ink-500 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Price calculations summary sidebar */}
            <div className="lg:col-span-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="font-sans font-bold text-xs tracking-tight text-ink-500 dark:text-ink-400">Order Pricing Summary</h4>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-400">Cart Subtotal</span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">
                    {platformFeeMeta.enabled && platformFeeMeta.percentage > 0
                      ? `GoodSale Platform Fee (${platformFeeMeta.percentage}%)`
                      : 'GoodSale Platform Fee — Free'}
                  </span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{escrowFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Nigeria Delivery Charge</span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{deliveryCharge.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-ink-100 dark:border-ink-800 pt-2 font-bold text-sm text-ink-950 dark:text-white">
                  <span>Grand Total</span>
                  <span>₦{totalDue.toLocaleString()}</span>
                </div>
              </div>

              <button
                onClick={() => setActiveStep('checkout')}
                disabled={cartItems.length === 0}
                className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-sans font-semibold text-xs rounded-xl transition-all shadow-md shadow-jade-500/10 cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
              >
                Proceed to Escrow Checkout
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>
        )}

        {/* STEP 2: Checkout Details Form */}
        {activeStep === 'checkout' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Core checkout form */}
            <div className="lg:col-span-8 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-6">
              <h3 className="font-sans font-semibold text-sm text-ink-900 dark:text-white pb-3 border-b border-ink-100 dark:border-ink-800 flex items-center gap-1.5">
                <CreditCard className="w-5 h-5 text-jade-500" />
                Nigerian Delivery & Escrow Payout Rules
              </h3>

              {/* Preset selectors */}
              <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-ink-400 tracking-tight block">Delivery Location</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePresetLocation('Lag')}
                    className="p-2.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl hover:border-jade-500 text-xs font-bold transition-all cursor-pointer text-left"
                  >
                    Lagos Lekki Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetLocation('Abj')}
                    className="p-2.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl hover:border-jade-500 text-xs font-bold transition-all cursor-pointer text-left"
                  >
                    Abuja CBD Preset
                  </button>
                </div>
                <button
                  type="button"
                  onClick={useMyGpsLocation}
                  className="w-full flex items-center justify-center gap-2 p-2.5 bg-jade-500/10 border border-jade-500/30 rounded-xl text-xs font-bold text-jade-700 dark:text-jade-400 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Use my live GPS location
                  {buyerGps.source === 'gps' && (
                    <span className="font-mono text-xs opacity-80">
                      {deliveryLat.toFixed(4)}, {deliveryLng.toFixed(4)}
                    </span>
                  )}
                </button>
                <div className="rounded-xl overflow-hidden border border-ink-200 dark:border-ink-700">
                  <LiveDispatchMap
                    destination={deliveryOrigin}
                    rider={buyerGps.coords}
                    statusLabel="Your delivery pin"
                    geoError={buyerGps.error}
                    gpsLocked={buyerGps.source === 'gps'}
                    height="180px"
                  />
                </div>
              </div>

              {/* Input details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="text-ink-400 block mb-1">Detailed Delivery Address</label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-jade-500"
                  />
                </div>

                <div>
                  <label className="text-ink-400 block mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-ink-400 block mb-1">State / Region</label>
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-ink-400 block mb-1">Recipient Mobile Phone</label>
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white"
                  />
                </div>
              </div>

              {/* DELIVERY AND LOGISTICS OPTIONS */}
              <div className="space-y-4 pt-4 border-t border-ink-100 dark:border-ink-800">
                <span className="text-xs font-bold text-ink-400 tracking-tight block">Delivery & Logistics Carrier</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: GoodDispatch Network */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMethod('GOODSALE_PARTNER');
                      setSelectedPartnerId(null);
                      setSmartMatchResult(null);
                    }}
                    className={`p-4 border rounded-2xl text-left transition-all relative ${
                      deliveryMethod === 'GOODSALE_PARTNER'
                        ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                        : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Truck className="w-5 h-5 text-jade-500" />
                      <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white">GoodDispatch™</span>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400 leading-normal">
                      Verified dispatch riders with real-time GPS & secure PIN release.
                    </p>
                    <div className="mt-2.5 inline-block text-xs font-bold font-mono px-2 py-0.5 bg-jade-100 dark:bg-jade-950/40 text-jade-600 rounded-full">
                      Escrow Secured
                    </div>
                  </button>

                  {/* Option 2: Third Party Courier */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMethod('THIRD_PARTY_COURIER');
                      setSelectedPartnerId(null);
                      setSmartMatchResult(null);
                    }}
                    className={`p-4 border rounded-2xl text-left transition-all relative ${
                      deliveryMethod === 'THIRD_PARTY_COURIER'
                        ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                        : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ExternalLink className="w-5 h-5 text-jade-500" />
                      <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white">Third-Party Courier</span>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400 leading-normal">
                      Coordinate your own delivery with DHL, FedEx, GIGM, or others.
                    </p>
                    <div className="mt-2.5 inline-block text-xs font-bold font-mono px-2 py-0.5 bg-jade-100 dark:bg-jade-950/40 text-jade-600 rounded-full">
                      Flat ₦12,000
                    </div>
                  </button>

                  {/* Option 3: Store Pickup */}
                  <button
                    type="button"
                    disabled={cartItems.some(item => !item.pickupAvailable)}
                    onClick={() => {
                      setDeliveryMethod('PICKUP');
                      setSelectedPartnerId(null);
                      setSmartMatchResult(null);
                    }}
                    className={`p-4 border rounded-2xl text-left transition-all relative disabled:opacity-40 ${
                      deliveryMethod === 'PICKUP'
                        ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                        : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <MapPin className="w-5 h-5 text-ink-500" />
                      <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white">Store Self-Pickup</span>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400 leading-normal">
                      Pick up directly from the merchant&apos;s physical shop or SafeMeet hub.
                    </p>
                    <div className="mt-2.5 inline-block text-xs font-bold font-mono px-2 py-0.5 bg-ink-100 dark:bg-ink-950/40 text-ink-600 rounded-full">
                      Free ₦0
                    </div>
                  </button>
                </div>
              </div>

              {/* GOODDISPATCH MARKETPLACE AND SMART MATCHING PANEL */}
              {deliveryMethod === 'GOODSALE_PARTNER' && (
                <div className="p-5 bg-ink-50 dark:bg-ink-800/20 border border-ink-200 dark:border-ink-800 rounded-3xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink-200/60 dark:border-ink-800 pb-3">
                    <div>
                      <h4 className="font-sans font-semibold text-xs text-ink-900 dark:text-white flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-jade-500" />
                        GoodDispatch™ Delivery Marketplace
                      </h4>
                      <p className="text-xs text-ink-400 mt-0.5">Select a verified rider or use our machine-learning match system.</p>
                    </div>

                    <button
                      type="button"
                      disabled={smartMatchingActive}
                      onClick={runSmartMatching}
                      className="px-3 py-1.5 bg-ink-900 hover:bg-ink-800 dark:bg-jade-500 dark:hover:bg-jade-600 text-white font-sans font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 shadow-sm disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-ink-300 animate-spin-slow" />
                      {smartMatchingActive ? 'Smart Matching...' : 'Smart Match Me'}
                    </button>
                  </div>

                  {/* Service speed selection */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-ink-400 tracking-tight block">Select Service Tier</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { type: 'ECONOMY', label: 'Economy', price: '₦3,500', desc: 'Est. 24 Hours' },
                        { type: 'STANDARD', label: 'Standard', price: '₦6,000', desc: 'Est. 3-4 Hours' },
                        { type: 'EXPRESS', label: 'Express', price: '₦10,000', desc: 'Est. 1 Hour' }
                      ].map((tier) => (
                        <button
                          key={tier.type}
                          type="button"
                          onClick={() => setServiceType(tier.type as any)}
                          className={`p-2.5 border rounded-xl text-center transition-all ${
                            serviceType === tier.type
                              ? 'border-jade-500 bg-jade-500/5 text-jade-600 dark:text-jade-400 font-bold'
                              : 'border-ink-200 dark:border-ink-800 text-ink-600 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800'
                          }`}
                        >
                          <span className="block text-xs">{tier.label}</span>
                          <span className="block text-xs font-mono mt-0.5">{tier.price}</span>
                          <span className="block text-[10px] text-ink-400 font-medium mt-0.5">{tier.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Match alert or result banner */}
                  {smartMatchingActive && (
                    <div className="p-4 bg-white dark:bg-ink-900 border border-jade-500/30 rounded-2xl text-center space-y-2 animate-pulse">
                      <div className="w-8 h-8 rounded-full border-2 border-jade-500 border-t-transparent animate-spin mx-auto"></div>
                      <p className="text-xs font-sans font-semibold text-ink-800 dark:text-ink-200">
                        Running multi-criteria compatibility algorithm...
                      </p>
                      <p className="text-xs text-ink-400 max-w-xs mx-auto">
                        Evaluating courier workload, coordinates proximity, rating thresholds, vehicle capacities, and safety trust index.
                      </p>
                    </div>
                  )}

                  {smartMatchResult && !smartMatchingActive && (
                    <div className="p-3 bg-jade-500/10 border border-jade-500/20 rounded-xl text-left flex gap-2.5 items-start">
                      <Sparkles className="w-4 h-4 text-jade-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-jade-800 dark:text-jade-300 leading-normal font-sans">
                        {smartMatchResult}
                      </p>
                    </div>
                  )}

                  {/* Courier grid list */}
                  {!smartMatchingActive && (
                    <div className="space-y-2.5">
                      <span className="text-xs font-bold text-ink-400 tracking-tight block">Available Couriers Marketplace</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                        {rankedCouriers.map(({ partner: courier, distanceKm: distance, etaMinutes, score }) => {
                            const isSelected = selectedPartnerId === courier.id;
                            
                            // Estimate dynamic times based on service type
                            let pickup = `${Math.max(10, etaMinutes)} mins`;
                            let delivery = `${Math.max(etaMinutes + 20, 45)} mins`;
                            if (serviceType === 'EXPRESS') {
                              pickup = `${Math.max(8, Math.round(etaMinutes * 0.7))} mins`;
                              delivery = `${Math.max(etaMinutes + 10, 30)} mins`;
                            } else if (serviceType === 'ECONOMY') {
                              pickup = `${Math.max(20, etaMinutes + 10)} mins`;
                              delivery = 'Same Day';
                            }

                            return (
                              <button
                                key={courier.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPartnerId(courier.id);
                                  setSmartMatchResult(null); // Clear automated tag to reflect manual choice
                                }}
                                className={`p-3 border rounded-xl text-left transition-all cursor-pointer flex gap-3 relative ${
                                  isSelected
                                    ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                                    : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900/45'
                                }`}
                              >
                                {/* Photo or initials avatar */}
                                <div className="w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 shrink-0 overflow-hidden relative flex items-center justify-center">
                                  {courier.photoUrl ? (
                                    <img
                                      src={courier.photoUrl}
                                      alt={courier.fullName}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-xs font-bold font-sans text-ink-500">
                                      {courier.fullName.split(' ').map(n => n[0]).join('')}
                                    </span>
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-jade-500/10 flex items-center justify-center">
                                      <CheckCircle2 className="w-5 h-5 text-jade-500 bg-white dark:bg-ink-900 rounded-full" />
                                    </div>
                                  )}
                                </div>

                                {/* Courier details */}
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-1">
                                    <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white truncate">
                                      {courier.fullName}
                                    </span>
                                    <ShieldAlert className="w-3.5 h-3.5 text-ink-500 fill-ink-100 dark:fill-none" />
                                    <span className="text-[10px] bg-ink-100 dark:bg-ink-800 font-mono font-bold text-ink-500 dark:text-ink-400 px-1 rounded">
                                      {courier.trustScore}%
                                    </span>
                                  </div>

                                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-ink-400">
                                    <span className="font-semibold text-ink-600 dark:text-ink-300">
                                      {courier.vehicleType === 'BICYCLE' ? 'Bicycle' :
                                       courier.vehicleType === 'MOTORCYCLE' ? 'Motorcycle' :
                                       courier.vehicleType === 'CAR' ? 'Car' :
                                       courier.vehicleType === 'KEKE' ? 'Keke' : 'Van/Truck'}
                                    </span>
                                    <span>•</span>
                                    <span>Rating {courier.rating}</span>
                                    <span>•</span>
                                    <span>{courier.completedDeliveries} Jobs</span>
                                  </div>

                                  <div className="flex items-center justify-between text-xs text-ink-500 pt-1 border-t border-ink-100 dark:border-ink-800/80 mt-1">
                                    <span>{formatDistanceKm(distance)} · {score}% match</span>
                                    <span className="font-mono text-jade-500 font-semibold">{pickup} / {delivery}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Require selection lock warning */}
                  {!selectedPartnerId && (
                    <p className="text-xs font-semibold text-ink-500 flex items-center gap-1 animate-pulse">
                      Please select a Courier Partner from the list or click &quot;Smart Match Me&quot; to unlock secure escrow assignment.
                    </p>
                  )}

                  {/* MERCHANT PAYMENT CHANNELS SELECTOR */}
                  <div className="border-t border-ink-100 dark:border-ink-800 pt-5 mt-4 space-y-4">
                    <div>
                      <span className="text-xs font-bold text-ink-400 tracking-tight block mb-1">Select Checkout Payment Channel</span>
                      <p className="text-xs text-ink-400">The merchant has configured specific payment options for this item. Please select your preferred mode:</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {allowedCheckoutMethods.map((method: string) => {
                        const mLower = method.toLowerCase();
                        const isSelected = selectedPaymentMethod === mLower;
                        
                        let label = 'GoodSale Escrow';
                        let icon = <Shield className="w-4 h-4 text-jade-500" />;
                        let desc = 'Secure buyer lock';

                        if (mLower === 'card') {
                          label = 'Credit / Debit Card';
                          icon = <CreditCard className="w-4 h-4 text-jade-500" />;
                          desc = 'Pay with Card';
                        } else if (mLower === 'bank') {
                          label = 'Direct Bank Transfer';
                          icon = <ExternalLink className="w-4 h-4 text-jade-500" />;
                          desc = 'Instant transfer';
                        } else if (mLower === 'cod') {
                          label = 'Cash on Delivery';
                          icon = <Truck className="w-4 h-4 text-ink-500" />;
                          desc = 'Pay at door';
                        } else if (mLower === 'invoice') {
                          label = 'Business Invoice';
                          icon = <FileText className="w-4 h-4 text-jade-500" />;
                          desc = 'Net term billing';
                        } else if (mLower === 'partial') {
                          label = 'Partial Deposit';
                          icon = <Coins className="w-4 h-4 text-ink-500" />;
                          desc = `${currentCheckoutItem?.partialPercent || 30}% deposit payment`;
                        }

                        return (
                          <button
                            key={mLower}
                            type="button"
                            onClick={() => setSelectedPaymentMethod(mLower)}
                            className={`p-3 border rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between h-24 ${
                              isSelected
                                ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                                : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900/45'
                            }`}
                          >
                            <div className="flex justify-between items-start w-full">
                              {icon}
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-jade-500 fill-white dark:fill-none" />}
                            </div>
                            <div>
                              <span className="block text-xs font-bold text-ink-800 dark:text-white leading-tight">
                                {label}
                              </span>
                              <span className="block text-xs text-ink-400 mt-0.5 leading-none">
                                {desc}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* DYNAMIC SUB-VIEWS BASED ON SELECTION */}
                    {selectedPaymentMethod === 'bank' && (
                      <div className="p-4 bg-jade-500/5 border border-jade-500/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-2.5">
                          <ExternalLink className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-jade-800 dark:text-jade-400">Direct Bank Transfer Instructions</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              Please transfer the exact checkout amount of <strong className="text-jade-700 dark:text-jade-300 font-mono">₦{totalDue.toLocaleString()}</strong> to the GoodSale Escrow settlement account:
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 bg-white dark:bg-ink-900 p-3 rounded-xl border border-jade-100 dark:border-jade-950 text-xs">
                          <div>
                            <span className="text-ink-400 block">Settlement Bank</span>
                            <span className="font-bold text-ink-800 dark:text-ink-200">Wema Bank (Alat Escrow Hub)</span>
                          </div>
                          <div>
                            <span className="text-ink-400 block">Account Number</span>
                            <span className="font-semibold text-ink-950 dark:text-white font-mono tracking-wider">1023847586</span>
                          </div>
                          <div className="col-span-2 border-t border-ink-100 dark:border-ink-800 pt-1.5 mt-0.5">
                            <span className="text-ink-400 block">Account Name</span>
                            <span className="font-bold text-ink-800 dark:text-ink-200">GoodSale Nigeria Marketplace Ltd (Escrow Account)</span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <label className="text-xs font-bold text-ink-500 dark:text-ink-400 tracking-tight block">
                            Upload Payment Transaction Screenshot Receipt (Mandatory for Review)
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setBankTransferUploading(true);
                                setTimeout(() => {
                                  setBankTransferReceipt(`GS-BANK-TX-${Math.floor(100000 + Math.random() * 900000)}-SCREENSHOT.png`);
                                  setBankTransferUploading(false);
                                }, 1500);
                              }}
                              disabled={bankTransferUploading}
                              className="px-4 py-2 bg-jade-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 hover:bg-jade-600 transition-all cursor-pointer disabled:opacity-50"
                            >
                              {bankTransferUploading ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              {bankTransferReceipt ? 'Receipt Re-upload' : 'Upload Transaction Slip'}
                            </button>
                            {bankTransferReceipt ? (
                              <div className="flex items-center gap-1 text-xs font-semibold text-jade-500">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span className="truncate max-w-[150px]">{bankTransferReceipt}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-400">Allowed formats: PNG, JPG (Max 5MB)</span>
                            )}
                          </div>
                          {bankTransferReceipt && (
                            <p className="text-xs text-jade-600 font-medium">
                              Receipt attached successfully! The transaction will enter pending review status upon order submit.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedPaymentMethod === 'invoice' && (
                      <div className="p-4 bg-jade-500/5 border border-jade-500/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-2.5">
                          <FileText className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-jade-800 dark:text-jade-400">Business Net Term Invoice Checkout</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              This payment mode allows corporate business profiles to checkout immediately and get invoiced under neutral credit-payment agreements.
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-ink-500 tracking-tight block mb-1">Select Net Billing Terms</label>
                          <select
                            value={invoiceTerms}
                            onChange={(e) => setInvoiceTerms(e.target.value)}
                            className="px-3 py-1.5 text-xs bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white focus:outline-none"
                          >
                            <option value="Net 15">Net 15 (Payment due in 15 days)</option>
                            <option value="Net 30">Net 30 (Payment due in 30 days)</option>
                            <option value="Net 60">Net 60 (Payment due in 60 days - Approved partners only)</option>
                          </select>
                        </div>

                        <div className="p-3 bg-white dark:bg-ink-900 rounded-xl border border-jade-100 dark:border-jade-950 text-xs space-y-1">
                          <p className="font-bold text-ink-700 dark:text-ink-200 text-xs mb-1">Corporate Ledger Preview</p>
                          <div className="flex justify-between">
                            <span className="text-ink-400">Billing Terms:</span>
                            <span className="font-semibold text-ink-800 dark:text-ink-200">{invoiceTerms}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-400">Invoice Sum Amount:</span>
                            <span className="font-bold text-ink-800 dark:text-ink-200">₦{totalDue.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-400">Due Date grace:</span>
                            <span className="font-semibold text-ink-800 dark:text-ink-200">
                              {new Date(Date.now() + (invoiceTerms === 'Net 30' ? 30 : invoiceTerms === 'Net 60' ? 60 : 15) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-ink-500 font-medium leading-relaxed pt-1.5 border-t border-ink-50 dark:border-ink-800 mt-1 font-sans">
                            Outstanding balances not settled on schedule accrue a 2% monthly late payment surcharge penalty.
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedPaymentMethod === 'card' && (
                      <div className="p-4 bg-jade-500/5 border border-jade-500/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-2.5">
                          <CreditCard className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-jade-800 dark:text-jade-400">Paystack Card Checkout</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              Card details are never collected on GoodSale. You will complete payment inside Paystack&apos;s PCI-compliant popup after the order is created.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedPaymentMethod === 'cod' && (
                      <div className="p-4 bg-ink-500/5 border border-ink-500/20 rounded-2xl space-y-2">
                        <div className="flex items-start gap-2.5">
                          <Truck className="w-5 h-5 text-ink-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-ink-800 dark:text-ink-200">Cash on Delivery (COD) Agreement</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              You will pay in cash or via point-of-sale transfer directly to the logistics handler upon verified package handover.
                            </p>
                            <p className="text-xs text-ink-500 font-medium leading-relaxed mt-1.5 font-sans">
                              Note: Delivery charge & protect premiums must still be authorized on order submit. Fraudulent refusals of handovers result in dynamic Trust Score deductions!
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* GOODSALE PROTECT BUYER PURCHASE PROTECTION */}
              <div className="p-5 border border-jade-500/20 bg-gradient-to-br from-jade-500/[0.02] to-ink-500/[0.01] dark:from-jade-950/10 dark:to-transparent rounded-3xl space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-jade-500 shrink-0" />
                    <div>
                      <span className="text-[10px] bg-ink-500/10 text-ink-600 font-mono font-semibold tracking-tight px-2 py-0.5 rounded-full">
                        RECOMMENDED PROTECTION
                      </span>
                      <h4 className="font-sans font-semibold text-xs text-ink-950 dark:text-white mt-1">
                        GoodSale Protect™ Premium Coverage
                      </h4>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasGoodSaleProtect}
                      onChange={(e) => setHasGoodSaleProtect(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-ink-200 dark:bg-ink-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-jade-500"></div>
                  </label>
                </div>

                <p className="text-xs text-ink-500 dark:text-ink-400 leading-relaxed">
                  Safeguard your transaction and logistics from end-to-end. Rest assured that your capital is completely backed and protected against any courier accidents, damages, or disputes.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-ink-100 dark:border-ink-800">
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Priority Support Ticket Queue</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Extended 14-day hold window</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Enhanced Dispute Arbitration</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Complete Transit Cover Coverage</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 mt-1 border-t border-ink-100 dark:border-ink-800">
                  <span className="text-xs font-sans font-bold text-ink-700 dark:text-ink-300">Coverage Premium Fee</span>
                  <span className="text-xs font-mono font-semibold text-ink-900 dark:text-white">
                    +₦{(db.revenueSettings?.goodSaleProtectFee || 1500).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Escrow declaration checks */}
              <div className="p-4 bg-jade-50 dark:bg-jade-950/20 border border-jade-500/20 rounded-2xl flex items-start gap-3">
                <Shield className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <h4 className="font-sans font-bold text-jade-800 dark:text-jade-400">Payment Security Escrow Shield Promise</h4>
                  <ul className="list-disc list-inside space-y-1 mt-1.5 text-jade-700 dark:text-jade-300/80 leading-relaxed text-xs">
                    <li>We protect buyer capital inside neutral lock until package validates.</li>
                    <li>We dispatch secret 6-digit delivery confirmation PIN codes automatically.</li>
                    <li>Any merchant dispute is freeze-investigated by a neutral GoodSale Admin auditor.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Checkout Pricing checkout button sidebar */}
            <div className="lg:col-span-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-4 font-sans">
              <h4 className="font-sans font-bold text-xs tracking-tight text-ink-500 dark:text-ink-400">Final Payout Ledger</h4>
              
              <div className="space-y-2 text-xs border-b border-ink-100 dark:border-ink-800 pb-3">
                <div className="flex justify-between">
                  <span className="text-ink-400">Item Cost</span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">
                    {platformFeeMeta.enabled && platformFeeMeta.percentage > 0
                      ? `Platform fee (${platformFeeMeta.percentage}%)`
                      : 'Platform fee — Free'}
                  </span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{escrowFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Delivery charge ({deliveryMethod === 'GOODSALE_PARTNER' ? serviceType : 'Other'})</span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{deliveryCharge.toLocaleString()}</span>
                </div>
                {hasGoodSaleProtect && (
                  <div className="flex justify-between text-jade-600 dark:text-jade-400 font-semibold">
                    <span>GoodSale Protect™ Fee</span>
                    <span>₦{protectFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-sm text-ink-950 dark:text-white pt-2 border-t border-ink-50 dark:border-ink-800">
                  <span>Grand Total (₦)</span>
                  <span>₦{totalDue.toLocaleString()}</span>
                </div>

                {selectedPaymentMethod === 'partial' && (
                  <div className="space-y-1.5 p-3 bg-ink-500/[0.04] border border-ink-500/20 rounded-2xl text-xs mt-2">
                    <div className="flex justify-between text-ink-600 dark:text-ink-400 font-bold">
                      <span>Deposit Due Today ({currentCheckoutItem?.partialPercent || 30}%):</span>
                      <span>₦{Math.round(totalDue * ((currentCheckoutItem?.partialPercent || 30) / 100)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-ink-400 text-xs">
                      <span>Remaining Balance Due:</span>
                      <span>₦{(totalDue - Math.round(totalDue * ((currentCheckoutItem?.partialPercent || 30) / 100))).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-ink-500 leading-normal font-sans font-medium">
                      Settle the remaining balance within {currentCheckoutItem?.partialRemainingDays || 7} days of verified courier handover.
                    </p>
                  </div>
                )}
              </div>

              {selectedPaymentMethod === 'bank' && !bankTransferReceipt && (
                <p className="text-xs text-ink-500 font-medium leading-normal p-2.5 bg-ink-500/5 rounded-xl border border-ink-500/10">
                  Please upload your transfer screenshot receipt above to activate the submit button.
                </p>
              )}

              <button
                disabled={
                  (deliveryMethod === 'GOODSALE_PARTNER' && !selectedPartnerId) ||
                  (selectedPaymentMethod === 'bank' && !bankTransferReceipt)
                }
                onClick={() => {
                  void handlePayIntoEscrow(
                    selectedPaymentMethod === 'bank'
                      ? 'BANK'
                      : selectedPaymentMethod === 'invoice'
                        ? 'INVOICE'
                        : selectedPaymentMethod === 'cod'
                          ? 'COD'
                          : selectedPaymentMethod === 'partial'
                            ? 'partial'
                            : selectedPaymentMethod === 'card'
                              ? 'card'
                              : 'escrow'
                  );
                }}
                className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-sans font-semibold text-xs rounded-xl transition-all shadow-lg shadow-jade-500/20 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Shield className="w-4 h-4 text-ink-300" />
                {deliveryMethod === 'GOODSALE_PARTNER' && !selectedPartnerId ? (
                  'Select a courier partner'
                ) : selectedPaymentMethod === 'bank' ? (
                  'Submit Transfer for Review'
                ) : selectedPaymentMethod === 'invoice' ? (
                  'Submit Business Invoice'
                ) : selectedPaymentMethod === 'cod' ? (
                  'Confirm COD Order'
                ) : selectedPaymentMethod === 'partial' ? (
                  `Pay ₦${Math.round(totalDue * ((currentCheckoutItem?.partialPercent || 30) / 100)).toLocaleString()} Deposit`
                ) : (
                  'Pay Securely into Escrow'
                )}
              </button>
            </div>

          </div>
        )}

        {/* STEP 3: My Escrow Orders Log with active delivery pin inputs */}
        {activeStep === 'orders' && (
          <div className="space-y-6">
            
            <div className="p-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm">
              <span className="font-sans font-bold text-sm text-ink-900 dark:text-white block mb-1">Active Payout Escrow Trackers</span>
              <p className="text-xs text-ink-400">
                Track status updates. Once couriers present packages, buyers must provide their secret 6-digit PIN. Senders input PIN below to unlock neutral funds automatically.
              </p>
            </div>

            {myOrders.length === 0 ? (
              <div className="p-12 text-center text-xs text-ink-400">
                You have not placed any orders yet.
              </div>
            ) : (
              <div className="space-y-4">
                {myOrders.map((order) => {
                  const product = db.products.find(p => p.id === order.productId);
                  const isBuyer = order.buyerId === user.id;
                  const activeDispute = db.disputes.find(d => d.orderId === order.id);

                  return (
                    <div 
                      key={order.id}
                      className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-5 shadow-sm space-y-4"
                    >
                      {/* Order Title Header */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-ink-100 dark:border-ink-800 pb-3">
                        <div>
                          <span className="text-xs text-ink-400 tracking-tight font-mono">Order SKU: {order.id}</span>
                          <h4 className="font-bold text-sm text-ink-900 dark:text-white mt-0.5">{product?.title}</h4>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-semibold text-sm text-ink-950 dark:text-white">₦{order.totalAmount.toLocaleString()}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-tight ${order.status === OrderStatus.DELIVERED_SUCCESS ? 'bg-jade-100 text-jade-800 dark:bg-jade-500/10 dark:text-jade-400' : order.status === OrderStatus.PAID_ESCROW ? 'bg-ink-100 text-ink-800 dark:bg-ink-500/10' : 'bg-ink-100 text-ink-800 dark:bg-ink-500/10'}`}>
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Info logs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        
                        {/* Shipping address details */}
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-ink-400 block text-xs">Destination Address</span>
                            <span className="font-bold text-ink-800 dark:text-ink-300">{order.deliveryAddress}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-ink-400 block text-xs">Carrier & Speed</span>
                              <span className="font-semibold text-ink-800 dark:text-ink-300 block">
                                {order.deliveryMethod === 'GOODSALE_PARTNER' 
                                  ? `GoodDispatch (${order.serviceType || 'STANDARD'})` 
                                  : order.deliveryMethod === 'THIRD_PARTY_COURIER' 
                                    ? 'Third-Party Express' 
                                    : 'Self-Pickup'
                                }
                              </span>
                            </div>
                            <div>
                              <span className="text-ink-400 block text-xs">Ledger Mode</span>
                              <span className="font-semibold text-ink-800 dark:text-ink-300 block">PIN Verification</span>
                            </div>
                          </div>

                          {order.hasGoodSaleProtect && (
                            <div className="pt-1.5">
                              <span className="inline-flex items-center gap-1 bg-jade-500/10 text-jade-600 dark:text-jade-400 px-2 py-0.5 rounded-full text-xs font-bold">
                                <ShieldCheck className="w-3 h-3" />
                                GoodSale Protect™ Coverage Active
                              </span>
                            </div>
                          )}

                          {/* Live rider map when out for delivery */}
                          {order.deliveryMethod === 'GOODSALE_PARTNER' &&
                            [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.SHIPPED].includes(order.status) && (() => {
                              const job = db.deliveryJobs.find((j) => j.orderId === order.id);
                              const dest = bestCoords(
                                { lat: order.deliveryLat, lng: order.deliveryLng },
                                null,
                                order.deliveryCity,
                                order.deliveryState,
                                order.deliveryAddress
                              );
                              const pickup = bestCoords(
                                { lat: order.pickupLat, lng: order.pickupLng },
                                null
                              );
                              const rider =
                                job?.currentLat != null && job?.currentLng != null
                                  ? { lat: job.currentLat, lng: job.currentLng }
                                  : null;
                              return (
                                <div className="pt-3">
                                  <LiveDispatchMap
                                    rider={rider}
                                    destination={dest}
                                    pickup={pickup}
                                    speedKmh={job?.currentSpeed}
                                    statusLabel={rider ? 'Rider live on map' : 'Awaiting rider GPS'}
                                    height="200px"
                                  />
                                </div>
                              );
                            })()}
                          
                          {/* Printable digital receipt click */}
                          <div className="pt-2">
                            <button
                              onClick={() => setSelectedReceiptOrder(order)}
                              className="text-jade-500 font-bold hover:underline text-xs flex items-center gap-1 cursor-pointer"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              Generate Escrow Ledger Receipt
                            </button>
                          </div>
                        </div>

                        {/* Secret PIN display / verification forms */}
                        <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl flex flex-col justify-between gap-3">
                          
                          {isBuyer ? (
                            // Buyer sees PIN code to hand over to courier
                            <div>
                              <span className="text-xs text-jade-500 font-semibold tracking-tight block mb-1">Your Secret Delivery Verification PIN</span>
                              <div className="flex items-center gap-2.5">
                                <KeyRound className="w-4 h-4 text-jade-500 animate-pulse" />
                                <span className="font-mono text-lg font-semibold text-ink-900 dark:text-white tracking-widest bg-white dark:bg-ink-900 px-3.5 py-1 rounded-lg border border-ink-100 dark:border-ink-800">
                                  {order.deliveryPin}
                                </span>
                              </div>
                              <p className="text-xs text-ink-400 mt-2 leading-relaxed">
                                Present this secret PIN code to the dispatch courier only after verifying package physical specifications. Never share PIN online!
                              </p>
                            </div>
                          ) : (
                            // Senders/Couriers input PIN to confirm delivery and release funds
                            order.status === OrderStatus.DELIVERED_SUCCESS ? (
                              <div className="text-center py-2 text-jade-500 font-bold text-xs">
                                Neutral Escrow Payout released successfully to your wallet!
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <span className="text-xs text-ink-500 font-semibold tracking-tight block">Input Buyer PIN to Release Escrow Payout</span>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={enteredPin}
                                    onChange={(e) => setEnteredPin(e.target.value)}
                                    placeholder="Enter 6-digit PIN"
                                    className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white text-center font-mono"
                                  />
                                  <button
                                    onClick={() => handleVerifyDeliveryPin(order.id)}
                                    className="px-3.5 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                                  >
                                    Verify
                                  </button>
                                </div>
                                {pinError && <p className="text-xs font-bold text-ink-500">{pinError}</p>}
                                {pinSuccess && <p className="text-xs font-bold text-jade-500">{pinSuccess}</p>}
                              </div>
                            )
                          )}

                        </div>

                      </div>

                      {/* Escrow Dispute Status and File Dispute form */}
                      {order.status === OrderStatus.DISPUTED ? (
                        <div className="p-4 bg-ink-500/10 border border-ink-500/20 rounded-2xl text-xs space-y-1.5 animate-fade-in">
                          <div className="flex items-center gap-1.5 text-ink-600 dark:text-ink-400 font-semibold tracking-tight text-xs">
                            <span className="w-2 h-2 bg-jade-500 rounded-full animate-ping shrink-0" />
                            <span>Escrow Payout Frozen & Disputed</span>
                          </div>
                          <p className="text-ink-700 dark:text-ink-300">
                            <strong>Arbitration Reason:</strong> {activeDispute?.reason || 'The buyer reported that product specifications or physical conditions do not match listings.'}
                          </p>
                          <div className="text-xs text-ink-500 dark:text-ink-400 font-mono font-bold">
                            Case Status: {activeDispute?.resolution === 'PENDING' ? 'Under review by GoodSale neutral arbitration' : `Resolved: ${activeDispute?.resolution}`}
                          </div>
                        </div>
                      ) : (
                        isBuyer && [OrderStatus.PENDING, OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY].includes(order.status) && (
                          <div className="mt-4 border-t border-ink-100 dark:border-ink-800/60 pt-3">
                            {showDisputeFormOrderId === order.id ? (
                              <div className="space-y-3 bg-ink-500/5 border border-ink-500/10 rounded-2xl p-4 animate-slide-up">
                                <label className="text-xs text-ink-500 dark:text-ink-400 font-semibold tracking-tight block">Explain the Dispute (Merchant Fraud, Broken Spec, Delayed Shipment)</label>
                                <textarea
                                  required
                                  rows={3}
                                  placeholder="Please detail why you want to halt the escrow payout. Be professional and detailed. A neutral GoodSale Admin arbiter will review the case..."
                                  value={disputeReason}
                                  onChange={(e) => setDisputeReason(e.target.value)}
                                  className="w-full p-3 text-xs bg-white dark:bg-ink-905 border border-ink-500/20 rounded-xl focus:outline-none focus:ring-1 focus:ring-ink-500 text-ink-800 dark:text-white"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      void (async () => {
                                        if (!disputeReason.trim()) {
                                          toast.error('Please enter a reason for the dispute.');
                                          return;
                                        }
                                        const result = await dbOperations.openDispute(order.id, disputeReason);
                                        if (result && 'error' in result && result.error && !(result as { success?: boolean }).success) {
                                          toast.error(String(result.error));
                                          return;
                                        }
                                        setShowDisputeFormOrderId(null);
                                        setDisputeReason('');
                                        toast.success('Escrow dispute submitted — funds are now frozen pending review.');
                                      })();
                                    }}
                                    className="px-4 py-2 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                                  >
                                    Freeze Funds & Dispute
                                  </button>
                                  <button
                                    onClick={() => {
                                      setShowDisputeFormOrderId(null);
                                      setDisputeReason('');
                                    }}
                                    className="px-4 py-2 bg-transparent text-ink-500 hover:text-ink-700 font-bold text-xs rounded-xl cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setShowDisputeFormOrderId(order.id);
                                  setDisputeReason('');
                                }}
                                className="text-ink-500 hover:text-ink-600 font-bold text-xs flex items-center gap-1 cursor-pointer"
                              >
                                File Escrow Dispute / Freeze Capital
                              </button>
                            )}
                          </div>
                        )
                      )}

                    </div>
                  );
                })}
              </div>
            )}

            {/* Printable Ledger PDF/HTML Receipt Drawer */}
            {selectedReceiptOrder && (
              <div className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white text-ink-900 p-6 rounded-3xl max-w-md w-full shadow-2xl relative space-y-4">
                  <div className="text-center border-b border-ink-100 pb-3">
                    <QrCode className="w-10 h-10 text-jade-500 mx-auto mb-1" />
                    <h3 className="font-sans font-semibold text-base tracking-tight text-ink-950">GoodSale Payout Escrow Receipt</h3>
                    <p className="text-xs font-mono tracking-tight text-ink-400">Neutral Ledger Certificate</p>
                  </div>

                  <div className="text-xs space-y-2 font-sans text-ink-700">
                    <div className="flex justify-between border-b border-ink-50 pb-1">
                      <span>Receipt ID Reference:</span>
                      <span className="font-mono font-semibold">REC-{selectedReceiptOrder.id}-TXN</span>
                    </div>
                    <div className="flex justify-between border-b border-ink-50 pb-1">
                      <span>Buyer Client:</span>
                      <span className="font-bold">{user.fullName}</span>
                    </div>
                    <div className="flex justify-between border-b border-ink-50 pb-1">
                      <span>Recipient Address:</span>
                      <span className="font-semibold text-right max-w-[200px] truncate">{selectedReceiptOrder.deliveryAddress}</span>
                    </div>
                    <div className="flex justify-between border-b border-ink-50 pb-1">
                      <span>Escrow Capital held:</span>
                      <span className="font-mono font-semibold text-ink-950">₦{selectedReceiptOrder.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-dashed border-ink-200 text-sm font-bold text-ink-950">
                      <span>Status:</span>
                      <span className="text-jade-500 font-mono font-semibold">{selectedReceiptOrder.status}</span>
                    </div>
                  </div>

                  <div className="pt-2 text-center text-xs text-ink-400 leading-relaxed border-t border-ink-100">
                    Scanning the unique transaction QR Code verifies secure blockchain ledger registration. Thank you for choosing GoodSale Escrow systems!
                  </div>

                  <button
                    onClick={() => setSelectedReceiptOrder(null)}
                    className="w-full py-2 bg-ink-900 hover:bg-ink-800 text-white font-sans font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Close Ledger Receipt
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {showPaystackModal && pendingPayOrderIds[0] && (
          <PaystackPayment 
            email={user.email} 
            amount={pendingPayAmount || totalDue}
            orderId={pendingPayOrderIds[0]}
            orderIds={pendingPayOrderIds}
            onSuccess={() => {
              void handlePaystackSuccess();
            }} 
            onCancel={() => {
              setShowPaystackModal(false);
              // Orders remain PENDING until paid
              setActiveStep('orders');
            }} 
          />
        )}

      </div>
    </div>
  );
}
