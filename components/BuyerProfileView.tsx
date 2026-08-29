// components/BuyerProfileView.tsx
'use client';

import React, { useState } from 'react';
import { 
  User, Shield, Award, MapPin, CheckCircle, Package, Clock, AlertTriangle, 
  ChevronRight, Calendar, Star, HelpCircle, ArrowLeft, Key, ThumbsUp, CreditCard,
  Download, Check, FileText, Compass, Sliders, MessageSquare, Truck, Store, LogOut
} from 'lucide-react';
import { useDBState, dbOperations, getDBState, saveDBState, OrderStatus, Order } from '../lib/store';
import LiveSafeMeetMap from './LiveSafeMeetMap';
import LiveDispatchMap from './LiveDispatchMap';
import { SmartAvatar } from './ui/SmartImage';
import { bestCoords } from '@/lib/geo';

interface BuyerProfileViewProps {
  onBack?: () => void;
  onNavigate?: (view: string, payload?: any) => void;
  onOpenAuth?: () => void;
}

export default function BuyerProfileView({ onBack, onNavigate, onOpenAuth }: BuyerProfileViewProps) {
  const db = useDBState();
  const currentUser = db.currentUser;
  
  const currentProfile = currentUser 
    ? db.profiles.find(p => p.userId === currentUser.id) 
    : null;

  // Active orders made by this buyer
  const buyerOrders = currentUser 
    ? db.orders.filter(o => o.buyerId === currentUser.id) 
    : [];

  // Reviews written by this buyer
  const buyerReviews = currentUser 
    ? db.reviews.filter(r => r.reviewerId === currentUser.id) 
    : [];

  // Active PIN Verification Simulation State
  const [selectedOrderForPin, setSelectedOrderForPin] = useState<number | null>(null);
  const [typedPin, setTypedPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // Active SafeMeet™ States
  const [activeSafeMeetOrderId, setActiveSafeMeetOrderId] = useState<number | null>(null);
  const [selectedSafeMeetLocationId, setSelectedSafeMeetLocationId] = useState<number>(1);
  const [safeMeetScheduledTime, setSafeMeetScheduledTime] = useState('');

  // Interactive Reviews state
  const [reviewingOrderId, setReviewingOrderId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const handleReviewSubmit = (orderId: number) => {
    if (!reviewComment.trim()) return;
    dbOperations.submitReview(orderId, reviewRating, reviewComment);
    setReviewingOrderId(null);
    setReviewRating(5);
    setReviewComment('');
    window.dispatchEvent(new CustomEvent('goodsale_toast', { detail: 'Review submitted! You earned +30 GP GoodPoints.' }));
  };

  const handleDownloadReceipt = (order: Order) => {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Header Block
      doc.setFillColor(15, 23, 42); // slate-900 style
      doc.rect(0, 0, 210, 35, 'F');

      // Title & Label
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('GoodSale Nigeria', 15, 18);
      
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Secure Escrow Ledger Transaction Receipt', 15, 25);

      // Meta Info
      doc.setTextColor(51, 65, 85);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('RECEIPT DETAILS', 15, 48);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Receipt Reference: ${order.orderNumber}`, 15, 55);
      doc.text(`Date of Transaction: ${new Date(order.createdAt).toLocaleDateString()}`, 15, 61);
      doc.text(`Escrow Clearance: SUCCESS_RELEASED`, 15, 67);
      doc.text(`Payment Gateway: Secured Escrow Lock (Verified)`, 15, 73);

      // Divider Line
      doc.setDrawColor(226, 232, 240);
      doc.line(15, 80, 195, 80);

      // Itemized Table
      doc.setFont('Helvetica', 'bold');
      doc.text('ITEM DESCRIPTION', 15, 88);
      doc.text('AMOUNT', 160, 88, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.text(order.productTitle, 15, 96);
      doc.text(`₦${order.totalAmount.toLocaleString()}`, 160, 96, { align: 'right' });

      doc.line(15, 103, 195, 103);

      // Pricing Breakdown
      doc.setFontSize(8);
      doc.text('Service & Handling Commission:', 120, 111);
      doc.text('₦0 (Waived for Promos)', 160, 111, { align: 'right' });

      doc.text('Delivery & Logistic Insurance:', 120, 117);
      doc.text('₦0 (GoodSale Protected)', 160, 117, { align: 'right' });

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Total Funds Settled:', 120, 126);
      doc.text(`₦${order.totalAmount.toLocaleString()}`, 160, 126, { align: 'right' });

      // Escrow Protection Certificate
      doc.setFillColor(240, 253, 244);
      doc.rect(15, 138, 180, 22, 'F');
      
      doc.setTextColor(21, 128, 61);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('🛡️ GOODSALE NIGERIA SECURED ESCROW LEDGER', 20, 146);
      
      doc.setTextColor(51, 65, 85);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Verified mutual handshake token completed successfully. Funds disbursed from Escrow ledger.', 20, 152);

      // Footer
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(8);
      doc.text('GoodSale Nigeria • Direct-to-Consumer Trust Network • support@goodsale.ng', 105, 275, { align: 'center' });

      // Save PDF
      doc.save(`GoodSale-Receipt-${order.orderNumber}.pdf`);
      
      // Notify
      window.dispatchEvent(new CustomEvent('goodsale_toast', { detail: 'Receipt PDF generated and downloaded!' }));
    }).catch(err => {
      console.error("Failed to load jsPDF dynamically:", err);
    });
  };

  const handleReleaseEscrow = async (orderId: number, _deliveryPin: string) => {
    setPinError('');
    setPinSuccess('');

    if (!typedPin || typedPin.length < 4) {
      setPinError('Enter your delivery PIN token.');
      return;
    }

    const result = await dbOperations.completeDelivery(orderId, typedPin);
    if (result && 'error' in result) {
      setPinError(result.error || 'Invalid delivery PIN token!');
      return;
    }

    setPinSuccess('Escrow released successfully via server PIN verification.');
    setTypedPin('');
    setSelectedOrderForPin(null);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400 text-[10px] font-black rounded-lg uppercase">Awaiting Escrow Deposit</span>;
      case OrderStatus.PAID_ESCROW:
        return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 text-[10px] font-black rounded-lg uppercase">Funds Held in Escrow</span>;
      case OrderStatus.SHIPPED:
        return <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 text-[10px] font-black rounded-lg uppercase">In Transit</span>;
      case OrderStatus.OUT_FOR_DELIVERY:
        return <span className="px-2.5 py-1 bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 text-[10px] font-black rounded-lg uppercase">Out For Delivery</span>;
      case OrderStatus.DELIVERED_SUCCESS:
        return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 text-[10px] font-black rounded-lg uppercase flex items-center gap-1">✓ Escrow Released</span>;
      case OrderStatus.DISPUTED:
        return <span className="px-2.5 py-1 bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 text-[10px] font-black rounded-lg uppercase flex items-center gap-1">⚠️ Disputed Escrow</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-black rounded-lg uppercase">{status}</span>;
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-orange-500/10 dark:bg-orange-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-500/20">
          <Key className="w-8 h-8 text-orange-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Access Your Safe Escrow Hub</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Sign in or create a GoodSale account to view your purchase history, release escrow delivery funds, track loyalty GoodPoints, and check seller reviews.
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
            className="w-full py-3 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-gray-200/50 dark:border-slate-800"
          >
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      
      {/* 1. Header with back link */}
      <div className="mb-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white mb-3 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </button>
        
        {/* Profile Card Backdrop */}
        <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/80 rounded-[32px] overflow-hidden shadow-sm relative">
          
          <div className="h-32 bg-gradient-to-r from-orange-400 via-orange-500 to-amber-500 relative">
            <div className="absolute top-4 right-4 bg-black/30 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Member Since 2026
            </div>
          </div>

          <div className="p-6 sm:p-8 pt-0 relative flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
            
            {/* Avatar & Basic Credentials */}
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-10 sm:-mt-12 relative z-10">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white dark:border-slate-900 bg-gray-150 relative overflow-hidden shadow-md">
                <SmartAvatar 
                  src={currentProfile?.photoUrl} 
                  name={currentUser.fullName}
                  seed={currentUser.username}
                  className="w-full h-full"
                />
              </div>

              <div className="pb-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-display font-black text-slate-900 dark:text-white leading-none">{currentUser.fullName}</h1>
                  <span className="px-2 py-0.5 bg-orange-500 text-white text-[9px] font-mono font-black rounded uppercase tracking-wider">
                    Buyer
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-1">@{currentUser.username} • {currentUser.email}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium max-w-lg leading-relaxed">{currentProfile?.bio || 'Verified buyer on GoodSale Nigeria Escrow network.'}</p>
              </div>
            </div>

            {/* Loyalty/Status Hub info */}
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-gray-150 dark:border-slate-800 p-4 rounded-2xl flex flex-row sm:flex-col justify-between gap-4 w-full sm:w-auto shrink-0 self-start sm:self-auto">
              <div className="text-center sm:text-right">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono block">Escrow Trust Rating</span>
                <span className="font-display font-black text-2xl text-emerald-500">{currentUser.trustScore}%</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-bold">Excellent Releaser</span>
              </div>
              <div className="border-l sm:border-l-0 sm:border-t border-gray-200 dark:border-slate-800 pl-4 sm:pl-0 sm:pt-2 text-center sm:text-right">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono block">Loyalty GoodPoints</span>
                <span className="font-display font-black text-xl text-amber-500 flex items-center justify-center sm:justify-end gap-1">
                  ⭐ {currentUser.goodPoints}
                </span>
                <span className="text-[9px] text-slate-400 block">Level: {currentUser.sellerLevel}</span>
              </div>
            </div>

          </div>

          {/* Location & Preferred shipping footer */}
          <div className="bg-gray-50/50 dark:bg-slate-800/20 border-t border-gray-100 dark:border-slate-800/80 px-6 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <MapPin className="w-4 h-4 text-orange-500" />
              <span>Address: {currentProfile?.address || 'Not specified'}, {currentProfile?.city || 'Lagos'}</span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-500">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span>Escrow Mode: {currentProfile?.deliveryPreference === 'GOODSALE_PARTNER' ? 'GoodSale Partner Rider Courier' : 'Direct Dispatch Courier'}</span>
            </div>
          </div>

        </div>
      </div>

      {/* Quick Portals & Mobile Navigation helper */}
      <div className="mb-8 bg-slate-50 dark:bg-slate-900/50 border border-gray-150 dark:border-slate-850 p-5 rounded-[28px] space-y-4">
        <h3 className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5 select-none">
          <Compass className="w-4 h-4 text-emerald-500 animate-pulse" />
          Quick Portals & Courier Network
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Dispatch Partner Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate?.('dispatch')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                GoodDispatch™ Network
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                Accept delivery jobs & track riders.
              </p>
            </div>
          </button>

          {/* Seller Hub / Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate?.('dashboard')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors">
                Merchant Seller Hub
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                Manage your store and inventory.
              </p>
            </div>
          </button>

          {/* Settings panel */}
          <button
            type="button"
            onClick={() => onNavigate?.('settings')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                System Settings
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                Configure your account parameters.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Interactive Escrow Orders Tracking List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Orders list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] shadow-sm">
            <h2 className="font-display font-black text-lg text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Package className="w-5.5 h-5.5 text-orange-500" />
              My Escrow Protected Transactions
            </h2>
            <p className="text-xs text-slate-400 mb-6">Track transit states, fetch delivery verification tokens, and release funds safely upon inspection.</p>

            {buyerOrders.length === 0 ? (
              <div className="py-12 text-center bg-gray-50 dark:bg-slate-800/20 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-bold">No active orders found.</p>
                <p className="text-[10px] text-slate-400 mt-1">Purchases you make will populate here under escrow protection.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {buyerOrders.map((order) => {
                  const isSelected = selectedOrderForPin === order.id;
                  
                  // Progress tracker helper variables
                  const isPaid = order.status === OrderStatus.PAID_ESCROW || order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.DELIVERED_SUCCESS;
                  const isShipped = order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.DELIVERED_SUCCESS;
                  const isOutForDelivery = order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.DELIVERED_SUCCESS;
                  const isDelivered = order.status === OrderStatus.DELIVERED_SUCCESS;

                  return (
                    <div 
                      key={order.id} 
                      className={`border rounded-2xl overflow-hidden transition-all ${
                        isSelected 
                          ? 'border-orange-500 bg-orange-500/[0.01]' 
                          : 'border-gray-150 dark:border-slate-800 hover:border-gray-200 dark:hover:border-slate-750'
                      }`}
                    >
                      {/* Top Summary Bar */}
                      <div className="bg-slate-50 dark:bg-slate-800/40 px-4 py-3 border-b border-gray-150 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="font-mono text-slate-500 font-semibold">
                          Order Number: <span className="font-bold text-slate-800 dark:text-white">#{order.orderNumber}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</span>
                          {getStatusBadge(order.status)}
                        </div>
                      </div>

                      {/* Content details */}
                      <div className="p-4 flex gap-4">
                        <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0 border border-gray-100 dark:border-slate-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={order.productImage} alt={order.productTitle} className="w-full h-full object-cover" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">{order.productTitle}</h4>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">Total payment protected: <span className="font-black text-slate-800 dark:text-slate-200">₦{order.totalAmount.toLocaleString()}</span></p>
                          <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">Deliver to: {order.deliveryAddress}, {order.deliveryCity}</p>
                        </div>
                      </div>

                      {/* Escrow Progress Tracker */}
                      <div className="px-4 pb-4">
                        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/20 border border-gray-100 dark:border-slate-800/60 rounded-xl">
                          <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 mb-4 font-mono uppercase tracking-wider">
                            <span>Escrow Progress Tracker</span>
                            <span className="text-emerald-500">Secure Escrow Milestone</span>
                          </div>

                          <div className="relative flex items-center justify-between px-3 mt-4">
                            {/* Horizontal Line background */}
                            <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-gray-200 dark:bg-slate-800 -translate-y-1/2 z-0" />
                            
                            {/* Active Line Progress overlay */}
                            <div 
                              className="absolute left-6 top-1/2 h-0.5 bg-emerald-500 -translate-y-1/2 transition-all duration-500 z-0"
                              style={{
                                width: !isPaid ? '0%' :
                                       !isShipped ? '0%' :
                                       !isOutForDelivery ? '33.3%' :
                                       !isDelivered ? '66.6%' : '100%'
                              }}
                            />

                            {/* Timeline Milestones */}
                            {[
                              { label: 'Payment Confirmed', active: isPaid },
                              { label: 'Goods Dispatched', active: isShipped },
                              { label: 'Buyer Received', active: isOutForDelivery },
                              { label: 'Funds Released', active: isDelivered },
                            ].map((step, idx) => (
                              <div key={idx} className="flex flex-col items-center relative z-10">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 ${
                                  step.active 
                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/15' 
                                    : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-slate-400'
                                }`}>
                                  {step.active ? '✓' : idx + 1}
                                </div>
                                <span className={`text-[8px] font-bold mt-1.5 whitespace-nowrap ${step.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                  {step.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Escrow actions panel */}
                      <div className="bg-slate-50/50 dark:bg-slate-800/20 px-4 py-3 border-t border-gray-150 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[10px] text-slate-500 max-w-[280px]">
                          {order.status === OrderStatus.PAID_ESCROW || order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY ? (
                            <span className="text-orange-600 dark:text-orange-400 font-bold flex items-center gap-1">
                              <Shield className="w-3.5 h-3.5 shrink-0" />
                              Escrow payout active. Release PIN only when verified!
                            </span>
                          ) : order.status === OrderStatus.DELIVERED_SUCCESS ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Payment successfully released. Deal concluded.
                            </span>
                          ) : order.status === OrderStatus.PENDING ? (
                            <span className="text-amber-600 dark:text-amber-500 font-bold flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              Awaiting Escrow Deposit payment.
                            </span>
                          ) : (
                            <span>Funds are safe in local escrow vault.</span>
                          )}
                        </div>

                        {order.status === OrderStatus.PENDING && (
                          <button
                            onClick={() => {
                              dbOperations.payPendingOrder(order.id);
                              window.dispatchEvent(new Event('goodsale_db_state_change'));
                              alert(`Escrow deposit of ₦${order.totalAmount.toLocaleString()} completed successfully! Your funds are now locked in secure escrow, and the seller has been notified to ship the item.`);
                            }}
                            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            Complete Escrow Deposit (Pay Now)
                          </button>
                        )}

                        {/* PIN Verification trigger */}
                        {(order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.PAID_ESCROW) && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedOrderForPin(isSelected ? null : order.id);
                                setTypedPin('');
                                setPinError('');
                                setPinSuccess('');
                                setActiveSafeMeetOrderId(null); // Close safemeet if open
                              }}
                              className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-display font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <Key className="w-3.5 h-3.5" />
                              {isSelected ? 'Close Release Terminal' : 'View & Enter Delivery PIN'}
                            </button>

                            <button
                              onClick={() => {
                                setActiveSafeMeetOrderId(activeSafeMeetOrderId === order.id ? null : order.id);
                                setSelectedOrderForPin(null); // Close pin if open
                                setSelectedSafeMeetLocationId(1);
                                setSafeMeetScheduledTime(new Date(Date.now() + 86400000).toISOString().slice(0, 16)); // tomorrow
                              }}
                              className={`px-3.5 py-1.5 font-display font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeSafeMeetOrderId === order.id
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400 dark:hover:bg-indigo-950/40'
                              }`}
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              {activeSafeMeetOrderId === order.id ? 'Close SafeMeet™' : 'SafeMeet™ Coordinator'}
                            </button>
                          </div>
                        )}

                        {/* DELIVERED ACTIONS: Download Receipt & Leave Review */}
                        {order.status === OrderStatus.DELIVERED_SUCCESS && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownloadReceipt(order)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-white font-sans font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                              title="Download dynamic PDF transaction summary"
                            >
                              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                              Download Receipt
                            </button>

                            {!db.reviews.some(r => r.orderId === order.id) ? (
                              <button
                                onClick={() => {
                                  setReviewingOrderId(reviewingOrderId === order.id ? null : order.id);
                                  setReviewRating(5);
                                  setReviewComment('');
                                }}
                                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-black text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <Star className="w-3.5 h-3.5 fill-white/20" />
                                {reviewingOrderId === order.id ? 'Cancel' : 'Leave Review'}
                              </button>
                            ) : (
                              <div className="text-[10px] text-emerald-500 font-bold bg-emerald-500/5 px-2.5 py-1.5 rounded-xl flex items-center gap-1 border border-emerald-500/10">
                                <Check className="w-3.5 h-3.5" />
                                Reviewed
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Interactive inline Review submission drawer */}
                      {reviewingOrderId === order.id && (
                        <div className="border-t border-emerald-500/20 p-4 bg-emerald-500/[0.01] space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">Rate your escrow exchange experience</h5>
                            <span className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">Rewards: +30 GP Points</span>
                          </div>

                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setReviewRating(star)}
                                className="p-1 hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                              >
                                <Star className={`w-5 h-5 transition-colors ${star <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-slate-700'}`} />
                              </button>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input 
                              type="text"
                              placeholder="Describe product authenticity, merchant response speed, waybill delivery reliability..."
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-white font-sans"
                            />
                            <button
                              onClick={() => handleReviewSubmit(order.id)}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm shadow-emerald-500/10"
                            >
                              Submit
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Expanded PIN entering UI */}
                      {isSelected && (
                        <div className="border-t border-orange-200 dark:border-orange-500/20 p-5 bg-orange-500/[0.02] space-y-4">
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
                              const pickup = bestCoords({ lat: order.pickupLat, lng: order.pickupLng }, null);
                              const rider =
                                job?.currentLat != null && job?.currentLng != null
                                  ? { lat: job.currentLat, lng: job.currentLng }
                                  : null;
                              return (
                                <LiveDispatchMap
                                  rider={rider}
                                  destination={dest}
                                  pickup={pickup}
                                  speedKmh={job?.currentSpeed}
                                  statusLabel={rider ? 'Your dispatch rider is live' : 'Waiting for rider GPS'}
                                  height="220px"
                                />
                              );
                            })()}

                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 border border-orange-100 dark:border-orange-950 rounded-2xl">
                            <div>
                              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono font-bold block mb-0.5">My Delivery PIN Code</span>
                              <span className="text-xl font-mono font-black tracking-widest text-orange-600 dark:text-orange-400">{order.deliveryPin}</span>
                            </div>

                            <p className="text-[10px] leading-relaxed text-slate-500 max-w-sm">
                              This is your secure escrow verification token. Hand this to the merchant/rider only after you have physically inspected the package and confirmed everything is correct.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-sans font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Confirm delivery manually (Enter 6-digit PIN)</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                maxLength={6}
                                placeholder="Enter Delivery PIN"
                                value={typedPin}
                                onChange={(e) => setTypedPin(e.target.value.replace(/\D/g, ''))}
                                className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold tracking-widest max-w-[150px] text-center focus:outline-none focus:border-orange-500 text-slate-800 dark:text-white"
                              />
                              <button
                                onClick={() => handleReleaseEscrow(order.id, order.deliveryPin)}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                              >
                                Match PIN & Release Funds
                              </button>
                            </div>

                            {pinError && (
                              <p className="text-[10px] font-bold text-red-500 flex items-center gap-1 mt-1.5 animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {pinError}
                              </p>
                            )}
                            {pinSuccess && (
                              <p className="text-[10px] font-bold text-emerald-500 flex items-center gap-1 mt-1.5">
                                <CheckCircle className="w-3.5 h-3.5" />
                                {pinSuccess}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Interactive SafeMeet™ Coordinator Widget */}
                      {activeSafeMeetOrderId === order.id && (() => {
                        const meetup = db.safeMeetMeetups.find(m => m.orderId === order.id);
                        const selectedLoc = db.safeMeetLocations.find(l => l.id === (meetup ? meetup.locationId : selectedSafeMeetLocationId)) || db.safeMeetLocations[0];
                        
                        return (
                          <div className="border-t border-indigo-200 dark:border-indigo-50/20 p-5 bg-indigo-500/[0.02] space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-display font-black text-xs text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Shield className="w-4 h-4 text-indigo-500" />
                                GoodSale SafeMeet™ Portal
                              </h4>
                              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-150/50 dark:bg-indigo-950/40 px-2 py-0.5 rounded uppercase tracking-wider">
                                Police-Verified Meetup Protocol
                              </span>
                            </div>

                            {!meetup ? (
                              /* Setup Proposal Form */
                              <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950/40 p-4 rounded-2xl space-y-4">
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                  Request an in-person exchange at one of our police-verified, well-lit public SafeMeet™ partner locations. 
                                  GoodPoints (+50 GP) are awarded on completed handshakes!
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-wider">Select Verified SafeZone</label>
                                    <select
                                      value={selectedSafeMeetLocationId}
                                      onChange={(e) => setSelectedSafeMeetLocationId(parseInt(e.target.value))}
                                      className="w-full p-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-bold"
                                    >
                                      {db.safeMeetLocations.map(loc => (
                                        <option key={loc.id} value={loc.id}>
                                          {loc.name} ({loc.distanceKm}km away)
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-wider">Scheduled Date & Time</label>
                                    <input
                                      type="datetime-local"
                                      value={safeMeetScheduledTime}
                                      onChange={(e) => setSafeMeetScheduledTime(e.target.value)}
                                      className="w-full p-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl font-bold font-mono"
                                    />
                                  </div>
                                </div>

                                {/* Selected Location Preview */}
                                <div className="p-3 bg-indigo-500/[0.02] border border-indigo-100 dark:border-indigo-950 rounded-xl text-[11px] space-y-1">
                                  <p className="font-extrabold text-slate-800 dark:text-slate-200">{selectedLoc.name}</p>
                                  <p className="text-slate-400">{selectedLoc.address}</p>
                                  <div className="flex gap-4 text-[10px] text-indigo-500 font-mono mt-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <span>👮 Safety Rating: {selectedLoc.safetyRating} / 5</span>
                                    <span>🕒 Distance: {selectedLoc.distanceKm} km ({selectedLoc.travelTimeMinutes} mins)</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!safeMeetScheduledTime) {
                                      alert('Please specify a valid meeting date and time.');
                                      return;
                                    }
                                    dbOperations.createSafeMeetMeetup(order.id, selectedSafeMeetLocationId, safeMeetScheduledTime);
                                    alert('SafeMeet™ proposal successfully registered & sent to merchant. Awaiting confirmation!');
                                  }}
                                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                                >
                                  Send Proposal to Seller
                                </button>
                              </div>
                            ) : (
                              /* Active Meetup Coordinator Dashboard */
                              <div className="space-y-4">
                                {/* Location specification details */}
                                <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950 p-4 rounded-2xl">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="text-[8px] font-mono font-black text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                        Zone Coordinates
                                      </span>
                                      <h5 className="font-black text-slate-850 dark:text-white mt-1 text-xs">{selectedLoc.name}</h5>
                                      <p className="text-[10px] text-slate-400 mt-0.5">{selectedLoc.address}</p>
                                    </div>
                                    <div className="text-right text-[10px] font-mono text-indigo-500 font-bold">
                                      <p>👮 Police Patrol: Active</p>
                                      <p>📸 CCTV Cameras: Online</p>
                                    </div>
                                  </div>

                                  {/* Interactive Google Map Visualizer */}
                                  <div className="mt-3">
                                    <LiveSafeMeetMap 
                                      location={selectedLoc} 
                                      buyerArrived={meetup.buyerConfirmedArrival} 
                                      sellerArrived={meetup.sellerConfirmedArrival} 
                                    />
                                  </div>
                                </div>

                                {/* Status controller UI */}
                                <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-950 p-4 rounded-2xl text-xs space-y-3">
                                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <span className="font-bold text-slate-600">Proposal Date:</span>
                                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                      {new Date(meetup.scheduledAt).toLocaleString()}
                                    </span>
                                  </div>

                                  {/* Status alert message */}
                                  <div className="p-3 rounded-xl text-[11px] font-semibold leading-relaxed border flex items-center gap-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100/50">
                                    <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                                    <div>
                                      {meetup.status === 'PENDING_CONFIRMATION' && (
                                        <p className="text-indigo-600 dark:text-indigo-400">
                                          Awaiting seller check-in configuration. The seller has been notified to confirm or decline this meetup date.
                                        </p>
                                      )}
                                      {meetup.status === 'SCHEDULED' && (
                                        <p className="text-slate-600 dark:text-slate-300">
                                          Meetup approved! Proceed to coordinates. Tap the button below once you have arrived physically at the safe spot.
                                        </p>
                                      )}
                                      {(meetup.status === 'BUYER_ARRIVED' || meetup.status === 'SELLER_ARRIVED') && (
                                        <p className="text-indigo-600 dark:text-indigo-400">
                                          {meetup.buyerConfirmedArrival ? '✓ You have checked in as arrived.' : '⚠️ Seller has arrived & checked in at the spot!'} Please arrive promptly and check-in.
                                        </p>
                                      )}
                                      {meetup.status === 'COMPLETED' && (
                                        <p className="text-emerald-600 dark:text-emerald-400 font-extrabold">
                                          ✓ Meetup confirmed by both parties! Please inspect the item. Ready to exchange the PIN code to unlock escrow.
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status action buttons */}
                                  <div className="flex gap-2">
                                    {meetup.status !== 'COMPLETED' && (
                                      <>
                                        <button
                                          type="button"
                                          disabled={meetup.buyerConfirmedArrival}
                                          onClick={() => {
                                            dbOperations.confirmArrival(meetup.id, true);
                                            alert('Arrival confirmed! You are checked-in at the SafeMeet™ zone.');
                                          }}
                                          className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                                            meetup.buyerConfirmedArrival 
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 cursor-not-allowed' 
                                              : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                                          }`}
                                        >
                                          {meetup.buyerConfirmedArrival ? '✓ My Arrival Logged' : 'Mark Myself as Arrived'}
                                        </button>
                                        
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (confirm('Cancel this physical meetup proposal?')) {
                                              dbOperations.cancelMeetup(meetup.id);
                                              alert('Meetup successfully canceled.');
                                            }
                                          }}
                                          className="px-3 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Column: reviews written list & stats */}
        <div className="space-y-6">
          
          {/* Quick Settings & Navigation Center */}
          <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 rounded-[32px] shadow-sm space-y-4">
            <div>
              <h3 className="font-display font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Compass className="w-5 h-5 text-[#e00000]" />
                Navigation Center
              </h3>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">Quickly navigate across the platform&apos;s key features.</p>
            </div>

            <div className="space-y-2.5">
              {/* 1. Settings Link */}
              <button
                type="button"
                onClick={() => onNavigate?.('settings')}
                className="w-full text-left p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800/30 dark:hover:bg-slate-850/50 border border-gray-100 dark:border-slate-800/80 transition-all flex items-center gap-3 group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Sliders className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-850 dark:text-white group-hover:text-indigo-500 transition-colors">Settings & Safety</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">Configure credentials, security, and alerts.</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>

              {/* 2. Chat Link */}
              <button
                type="button"
                onClick={() => onNavigate?.('chats')}
                className="w-full text-left p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800/30 dark:hover:bg-slate-850/50 border border-gray-100 dark:border-slate-800/80 transition-all flex items-center gap-3 group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <MessageSquare className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-850 dark:text-white group-hover:text-emerald-500 transition-colors">Chats & Negotiations</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">Open secure private messenger inbox.</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>

              {/* 3. Loyalty Link */}
              <button
                type="button"
                onClick={() => onNavigate?.('loyalty')}
                className="w-full text-left p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800/30 dark:hover:bg-slate-850/50 border border-gray-100 dark:border-slate-800/80 transition-all flex items-center gap-3 group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Award className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-850 dark:text-white group-hover:text-amber-500 transition-colors">GoodPoints Hub (GP)</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">Claim rewards and check loyalty ledger.</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>

              {/* 4. Seller Hub (conditional) */}
              {currentUser && ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'].includes(currentUser.role) && (
                <button
                  type="button"
                  onClick={() => onNavigate?.('dashboard')}
                  className="w-full text-left p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800/30 dark:hover:bg-slate-850/50 border border-gray-100 dark:border-slate-800/80 transition-all flex items-center gap-3 group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <User className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-850 dark:text-white group-hover:text-orange-500 transition-colors">Go to Merchant Hub</span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">Manage listings, orders, and sales metrics.</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              )}

              {/* 5. Admin Panel (conditional) */}
              {currentUser && ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role) && (
                <button
                  type="button"
                  onClick={() => onNavigate?.('admin')}
                  className="w-full text-left p-3 rounded-2xl bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800/30 dark:hover:bg-slate-850/50 border border-gray-100 dark:border-slate-800/80 transition-all flex items-center gap-3 group cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Shield className="w-4.5 h-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-850 dark:text-white group-hover:text-red-500 transition-colors">Platform Administration</span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">Moderate disputes, check IDs, and monitor health.</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              )}

              {/* 6. Log Out Button */}
              <button
                type="button"
                onClick={() => {
                  dbOperations.logout();
                  onNavigate?.('landing');
                }}
                className="w-full text-left p-3 rounded-2xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/15 hover:border-red-500/30 transition-all flex items-center gap-3 group cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <LogOut className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-red-650 dark:text-red-400 group-hover:text-red-500 transition-colors">Log Out Session</span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate font-sans">Exit current secure session and return to home page.</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>
            </div>
          </div>

          {/* Credit Account Info Card */}
          <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <h3 className="font-display font-black text-base mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-500" />
              Escrow Wallet Summary
            </h3>

            <div className="space-y-4">
              <div className="bg-slate-950/60 p-4 border border-slate-800 rounded-2xl">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-mono">GoodPoints Rewards Balance</span>
                <span className="text-3xl font-display font-black text-amber-400 mt-1 block">⭐ {currentUser.goodPoints} GP</span>
                <span className="text-[10px] text-slate-400 block mt-1.5">Earn +100 GP for every successful escrow completion. Redeemable for discounts.</span>
              </div>

              <div className="space-y-2 text-xs font-mono text-slate-300">
                <div className="flex justify-between">
                  <span>Transactions Total:</span>
                  <span className="text-white font-bold">{buyerOrders.length} operations</span>
                </div>
                <div className="flex justify-between">
                  <span>Escrow Released:</span>
                  <span className="text-emerald-400 font-bold">{buyerOrders.filter(o => o.status === OrderStatus.DELIVERED_SUCCESS).length} completed</span>
                </div>
                <div className="flex justify-between">
                  <span>Active Holds:</span>
                  <span className="text-amber-400 font-bold">{buyerOrders.filter(o => o.status === OrderStatus.PAID_ESCROW || o.status === OrderStatus.SHIPPED || o.status === OrderStatus.OUT_FOR_DELIVERY).length} holding</span>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback & Review Written Log */}
          <div className="bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
            <h3 className="font-display font-black text-sm text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Star className="w-4.5 h-4.5 text-yellow-500 fill-yellow-500/10" />
              My Vendor Feedbacks ({buyerReviews.length})
            </h3>
            
            {buyerReviews.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No feedback reviews written yet. Complete escrow deliveries to post comments.</p>
            ) : (
              <div className="space-y-3">
                {buyerReviews.map((review) => (
                  <div key={review.id} className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl border border-gray-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star 
                            key={s} 
                            className={`w-3.5 h-3.5 ${s <= review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-slate-200'}`} 
                          />
                        ))}
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">{new Date(review.createdAt).toLocaleDateString()}</span>
                    </div>

                    <p className="text-[11px] text-slate-700 dark:text-slate-300 font-sans italic leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
                    
                    {review.sellerReply && (
                      <div className="mt-2 pl-2 border-l-2 border-orange-400 bg-orange-500/5 p-1.5 rounded-r-lg text-[10px]">
                        <span className="font-bold text-orange-600 dark:text-orange-400 block mb-0.5">Merchant Reply:</span>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">{review.sellerReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
