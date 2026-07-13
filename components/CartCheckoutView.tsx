// components/CartCheckoutView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, Shield, CreditCard, ChevronRight, CheckCircle2, 
  MapPin, Award, Trash2, KeyRound, QrCode, ClipboardCheck, ArrowLeft, RefreshCw 
} from 'lucide-react';
import { 
  getDBState, saveDBState, dbOperations, Product, Order, OrderStatus 
} from '../lib/store';
import PaystackPayment from './PaystackPayment';

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
  const [deliveryAddress, setDeliveryAddress] = useState('14, Gbagada Phase-2, Gbagada, Lagos');
  const [city, setCity] = useState('Gbagada');
  const [state, setState] = useState('Lagos State');
  const [phoneNumber, setPhoneNumber] = useState('+234 812 345 6789');

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

  const user = db.currentUser;
  
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
          <Shield className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Secure Escrow Checkout</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Verify delivery details, track courier handshakes, and process neutral locked payouts safely. Please sign in or register to complete your purchase.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 transition-all"
          >
            Sign In / Register Account
          </button>
          <button
            onClick={onBack}
            className="w-full py-2.5 bg-transparent border border-gray-200 dark:border-slate-800 hover:bg-gray-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-sans font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer transition-all"
          >
            Go Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  // Items to purchase
  const cartItems = preselectedProductId 
    ? db.products.filter(p => p.id === preselectedProductId)
    : db.products.filter(p => cart.includes(p.id));

  const subtotal = cartItems.reduce((acc, p) => acc + p.price, 0);
  const escrowFee = subtotal * 0.015; // 1.5% neutral escrow fee
  const deliveryCharge = subtotal > 0 ? 3500 : 0; // Nigeria Lagos standard courier
  const totalDue = subtotal + escrowFee + deliveryCharge;

  // Process payment securely into escrow
  const handlePayIntoEscrow = () => {
    if (cartItems.length === 0) return;

    // Create Escrow Order for each item
    cartItems.forEach(item => {
      dbOperations.placeOrder(
        item.id,
        deliveryAddress,
        city,
        state,
        'CARD', // paymentMethod
        'GOODSALE_PARTNER', // deliveryMethod
        false // usePoints
      );
    });

    onClearCart();
    setActiveStep('orders');
  };

  // Submit Secret PIN Verification to release funds
  const handleVerifyDeliveryPin = (orderId: number) => {
    setPinError(null);
    setPinSuccess(null);

    const result = dbOperations.completeDelivery(orderId, enteredPin);
    if (result && 'error' in result) {
      setPinError(result.error || 'Verification failed');
    } else {
      setPinSuccess('PIN verified! Neutral escrow capital payout dispatched immediately to merchant.');
      setEnteredPin('');
      setTimeout(() => setPinSuccess(null), 4000);
    }
  };

  // Preset location fillers for Lagos/Abuja
  const handlePresetLocation = (cityPreset: string) => {
    if (cityPreset === 'Lag') {
      setDeliveryAddress('24, Admiralty Way, Lekki Phase 1, Lagos');
      setCity('Lekki');
      setState('Lagos State');
    } else {
      setDeliveryAddress('Plot 502, Constitution Avenue, Central Business District, Abuja');
      setCity('Abuja CBD');
      setState('FCT Abuja');
    }
  };

  // Get User Order log
  const myOrders = db.orders.filter(order => 
    order.buyerId === user.id || order.sellerId === user.id
  ).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        
        {/* Navigation Tabs */}
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 dark:border-slate-800 pb-4">
          <button 
            onClick={onBack}
            className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Continue Shopping
          </button>

          <div className="flex gap-2 bg-gray-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setActiveStep('cart')}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeStep === 'cart' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950'}`}
            >
              Shopping Cart ({cart.length})
            </button>
            <button
              onClick={() => setActiveStep('checkout')}
              disabled={cartItems.length === 0}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeStep === 'checkout' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 disabled:opacity-50'}`}
            >
              Escrow Checkout
            </button>
            <button
              onClick={() => setActiveStep('orders')}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeStep === 'orders' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950'}`}
            >
              My Escrow Orders ({myOrders.length})
            </button>
          </div>
        </div>

        {/* STEP 1: Shopping Cart */}
        {activeStep === 'cart' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Cart products item list */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-sans font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-500" />
                Shopping Bag Items
              </h3>

              {cartItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400 leading-relaxed">
                  Your shopping cart is currently empty. Go back to browse premium secured C2C items.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-800/60">
                  {cartItems.map((item) => (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex gap-4 items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.images[0]} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-950 dark:text-white">{item.title}</h4>
                          <span className="text-emerald-500 font-mono">Category: {item.category}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-sans font-extrabold text-sm text-slate-950 dark:text-white">₦{item.price.toLocaleString()}</span>
                        {!preselectedProductId && (
                          <button
                            onClick={() => onRemoveFromCart(item.id)}
                            className="p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg cursor-pointer"
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
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Order Pricing Summary</h4>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Cart Subtotal</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">₦{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">GoodSale Escrow Fee (1.5%)</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">₦{escrowFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Nigeria Delivery Charge</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">₦{deliveryCharge.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 dark:border-slate-800 pt-2 font-bold text-sm text-slate-950 dark:text-white">
                  <span>Grand Total</span>
                  <span>₦{totalDue.toLocaleString()}</span>
                </div>
              </div>

              <button
                onClick={() => setActiveStep('checkout')}
                disabled={cartItems.length === 0}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
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
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
              <h3 className="font-sans font-extrabold text-sm text-slate-900 dark:text-white pb-3 border-b border-gray-100 dark:border-slate-800 flex items-center gap-1.5">
                <CreditCard className="w-5 h-5 text-emerald-500" />
                Nigerian Delivery & Escrow Payout Rules
              </h3>

              {/* Preset selectors */}
              <div className="p-4 bg-gray-50 dark:bg-slate-800/40 rounded-2xl">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Delivery Location Presets</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePresetLocation('Lag')}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl hover:border-emerald-500 text-xs font-bold transition-all cursor-pointer text-left"
                  >
                    📍 Lagos Lekki Preset
                  </button>
                  <button
                    onClick={() => handlePresetLocation('Abj')}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl hover:border-emerald-500 text-xs font-bold transition-all cursor-pointer text-left"
                  >
                    📍 Abuja CBD Preset
                  </button>
                </div>
              </div>

              {/* Input details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="text-slate-400 block mb-1">Detailed Delivery Address</label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">State / Region</label>
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Recipient Mobile Phone</label>
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Escrow declaration checks */}
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl flex items-start gap-3">
                <Shield className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <h4 className="font-sans font-bold text-emerald-800 dark:text-emerald-400">Payment Security Escrow Shield Promise</h4>
                  <ul className="list-disc list-inside space-y-1 mt-1.5 text-emerald-700 dark:text-emerald-300/80 leading-relaxed text-[11px]">
                    <li>We protect buyer capital inside neutral lock until package validates.</li>
                    <li>We dispatch secret 6-digit delivery confirmation PIN codes automatically.</li>
                    <li>Any merchant dispute is freeze-investigated by a neutral GoodSale Admin auditor.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Checkout Pricing checkout button sidebar */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <h4 className="font-sans font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Final Payout Ledger</h4>
              
              <div className="space-y-2 text-xs border-b border-gray-100 dark:border-slate-800 pb-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Item Cost</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">₦{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Escrow neutral Fee</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">₦{escrowFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Delivery charge</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">₦{deliveryCharge.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-extrabold text-sm text-slate-950 dark:text-white pt-2 border-t border-gray-50 dark:border-slate-800">
                  <span>Grand Total (₦)</span>
                  <span>₦{totalDue.toLocaleString()}</span>
                </div>
              </div>

              <button
                onClick={() => setShowPaystackModal(true)}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-extrabold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Shield className="w-4 h-4 text-amber-300" />
                Pay Securely into Escrow
              </button>
            </div>

          </div>
        )}

        {/* STEP 3: My Escrow Orders Log with active delivery pin inputs */}
        {activeStep === 'orders' && (
          <div className="space-y-6">
            
            <div className="p-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <span className="font-sans font-bold text-sm text-slate-900 dark:text-white block mb-1">Active Payout Escrow Trackers</span>
              <p className="text-[11px] text-gray-400">
                Track status updates. Once couriers present packages, buyers must provide their secret 6-digit PIN. Senders input PIN below to unlock neutral funds automatically.
              </p>
            </div>

            {myOrders.length === 0 ? (
              <div className="p-12 text-center text-xs text-gray-400">
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
                      className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4"
                    >
                      {/* Order Title Header */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                        <div>
                          <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">Order SKU: {order.id}</span>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">{product?.title}</h4>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-extrabold text-sm text-slate-950 dark:text-white">₦{order.totalAmount.toLocaleString()}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${order.status === OrderStatus.DELIVERED_SUCCESS ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' : order.status === OrderStatus.PAID_ESCROW ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10' : 'bg-red-100 text-red-800 dark:bg-red-500/10'}`}>
                            {order.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Info logs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        
                        {/* Shipping address details */}
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase">Destination Address</span>
                            <span className="font-bold text-slate-800 dark:text-slate-300">{order.deliveryAddress}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px] uppercase">Verification status log</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-300">Escrow Release Mode: PIN Validation</span>
                          </div>
                          
                          {/* Printable digital receipt click */}
                          <div className="pt-2">
                            <button
                              onClick={() => setSelectedReceiptOrder(order)}
                              className="text-emerald-500 font-bold hover:underline text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              Generate Escrow Ledger Receipt
                            </button>
                          </div>
                        </div>

                        {/* Secret PIN display / verification forms */}
                        <div className="p-4 bg-gray-50 dark:bg-slate-800/40 rounded-2xl flex flex-col justify-between gap-3">
                          
                          {isBuyer ? (
                            // Buyer sees PIN code to hand over to courier
                            <div>
                              <span className="text-[10px] text-emerald-500 uppercase font-bold tracking-widest block mb-1">Your Secret Delivery Verification PIN</span>
                              <div className="flex items-center gap-2.5">
                                <KeyRound className="w-4 h-4 text-emerald-500 animate-pulse" />
                                <span className="font-mono text-lg font-extrabold text-slate-900 dark:text-white tracking-widest bg-white dark:bg-slate-900 px-3.5 py-1 rounded-lg border border-gray-100 dark:border-slate-800">
                                  {order.deliveryPin}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                                Present this secret PIN code to the dispatch courier only after verifying package physical specifications. Never share PIN online!
                              </p>
                            </div>
                          ) : (
                            // Senders/Couriers input PIN to confirm delivery and release funds
                            order.status === OrderStatus.DELIVERED_SUCCESS ? (
                              <div className="text-center py-2 text-emerald-500 font-bold text-[11px]">
                                ✓ Neutral Escrow Payout released successfully to your wallet!
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <span className="text-[10px] text-amber-500 uppercase font-bold tracking-widest block">Input Buyer PIN to Release Escrow Payout</span>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={enteredPin}
                                    onChange={(e) => setEnteredPin(e.target.value)}
                                    placeholder="Enter 6-digit PIN"
                                    className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white text-center font-mono"
                                  />
                                  <button
                                    onClick={() => handleVerifyDeliveryPin(order.id)}
                                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                                  >
                                    Verify
                                  </button>
                                </div>
                                {pinError && <p className="text-[10px] font-bold text-red-500">{pinError}</p>}
                                {pinSuccess && <p className="text-[10px] font-bold text-emerald-500">{pinSuccess}</p>}
                              </div>
                            )
                          )}

                        </div>

                      </div>

                      {/* Escrow Dispute Status and File Dispute form */}
                      {order.status === OrderStatus.DISPUTED ? (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs space-y-1.5 animate-fade-in">
                          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping shrink-0" />
                            <span>🚨 Escrow Payout Frozen & Disputed</span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300">
                            <strong>Arbitration Reason:</strong> {activeDispute?.reason || 'The buyer reported that product specifications or physical conditions do not match listings.'}
                          </p>
                          <div className="text-[10px] text-red-500 dark:text-red-400 font-mono font-bold">
                            Case Status: {activeDispute?.resolution === 'PENDING' ? '⏳ Under Review by GoodSale Neutral Arbitration' : `Resolved: ${activeDispute?.resolution}`}
                          </div>
                        </div>
                      ) : (
                        isBuyer && [OrderStatus.PENDING, OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY].includes(order.status) && (
                          <div className="mt-4 border-t border-gray-100 dark:border-slate-800/60 pt-3">
                            {showDisputeFormOrderId === order.id ? (
                              <div className="space-y-3 bg-red-500/5 border border-red-500/10 rounded-2xl p-4 animate-slide-up">
                                <label className="text-[10px] text-red-500 dark:text-red-400 font-extrabold uppercase tracking-widest block">Explain the Dispute (Merchant Fraud, Broken Spec, Delayed Shipment)</label>
                                <textarea
                                  required
                                  rows={3}
                                  placeholder="Please detail why you want to halt the escrow payout. Be professional and detailed. A neutral GoodSale Admin arbiter will review the case..."
                                  value={disputeReason}
                                  onChange={(e) => setDisputeReason(e.target.value)}
                                  className="w-full p-3 text-xs bg-white dark:bg-slate-905 border border-red-500/20 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-500 text-slate-800 dark:text-white"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      if (!disputeReason.trim()) {
                                        alert('Please enter a reason for the dispute.');
                                        return;
                                      }
                                      dbOperations.openDispute(order.id, disputeReason);
                                      setShowDisputeFormOrderId(null);
                                      setDisputeReason('');
                                      alert('Escrow Dispute submitted successfully! Funds are now securely frozen. GoodSale Admin will contact you.');
                                    }}
                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                                  >
                                    Freeze Funds & Dispute
                                  </button>
                                  <button
                                    onClick={() => {
                                      setShowDisputeFormOrderId(null);
                                      setDisputeReason('');
                                    }}
                                    className="px-4 py-2 bg-transparent text-slate-500 hover:text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
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
                                className="text-red-500 hover:text-red-600 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                🚨 File Escrow Dispute / Freeze Capital
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
              <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white text-slate-900 p-6 rounded-3xl max-w-md w-full shadow-2xl relative space-y-4">
                  <div className="text-center border-b border-gray-100 pb-3">
                    <QrCode className="w-10 h-10 text-emerald-500 mx-auto mb-1" />
                    <h3 className="font-sans font-extrabold text-base tracking-tight text-slate-950">GoodSale Payout Escrow Receipt</h3>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-slate-400">Neutral Ledger Certificate</p>
                  </div>

                  <div className="text-xs space-y-2 font-sans text-slate-700">
                    <div className="flex justify-between border-b border-gray-50 pb-1">
                      <span>Receipt ID Reference:</span>
                      <span className="font-mono font-semibold">REC-{selectedReceiptOrder.id}-TXN</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 pb-1">
                      <span>Buyer Client:</span>
                      <span className="font-bold">{user.fullName}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 pb-1">
                      <span>Recipient Address:</span>
                      <span className="font-semibold text-right max-w-[200px] truncate">{selectedReceiptOrder.deliveryAddress}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-50 pb-1">
                      <span>Escrow Capital held:</span>
                      <span className="font-mono font-extrabold text-slate-950">₦{selectedReceiptOrder.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-dashed border-gray-200 text-sm font-bold text-slate-950">
                      <span>Status:</span>
                      <span className="text-emerald-500 font-mono font-extrabold">{selectedReceiptOrder.status}</span>
                    </div>
                  </div>

                  <div className="pt-2 text-center text-[10px] text-gray-400 leading-relaxed border-t border-gray-100">
                    Scanning the unique transaction QR Code verifies secure blockchain ledger registration. Thank you for choosing GoodSale Escrow systems!
                  </div>

                  <button
                    onClick={() => setSelectedReceiptOrder(null)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-sans font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Close Ledger Receipt
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {showPaystackModal && (
          <PaystackPayment 
            email={user.email} 
            amount={totalDue} 
            onSuccess={(ref) => {
              setShowPaystackModal(false);
              handlePayIntoEscrow();
            }} 
            onCancel={() => setShowPaystackModal(false)} 
          />
        )}

      </div>
    </div>
  );
}
