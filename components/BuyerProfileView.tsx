// components/BuyerProfileView.tsx
'use client';

import React, { useState } from 'react';
import { 
  Shield, Award, MapPin, CheckCircle, Package, Clock, AlertTriangle, 
  ChevronRight, Calendar, Star, ArrowLeft, Key, CreditCard, Lock,
  Download, Check, Compass, Sliders, Truck, Store
} from 'lucide-react';
import { useDBState, dbOperations, OrderStatus, Order, UserRole } from '../lib/store';
import LiveSafeMeetMap from './LiveSafeMeetMap';
import LiveDispatchMap from './LiveDispatchMap';
import { SmartAvatar } from './ui/SmartImage';
import Card from './ui/Card';
import Chip from './ui/Chip';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import { bestCoords } from '@/lib/geo';
import { toast, confirmDialog } from '@/lib/feedback';

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
    toast.success('Review submitted! You earned +30 GP GoodPoints.');
  };

  const handleDownloadReceipt = (order: Order) => {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Header Block
      doc.setFillColor(15, 23, 42); // ink-900 style
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
      doc.text('GOODSALE NIGERIA SECURED ESCROW LEDGER', 20, 146);
      
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
      toast.success('Receipt PDF generated and downloaded!');
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
    const map: Partial<Record<OrderStatus, { label: string; tone: 'jade' | 'neutral' | 'outline' }>> = {
      [OrderStatus.PENDING]: { label: 'Awaiting deposit', tone: 'neutral' },
      [OrderStatus.PAID_ESCROW]: { label: 'Held in escrow', tone: 'jade' },
      [OrderStatus.SHIPPED]: { label: 'In transit', tone: 'jade' },
      [OrderStatus.OUT_FOR_DELIVERY]: { label: 'Out for delivery', tone: 'jade' },
      [OrderStatus.DELIVERED_SUCCESS]: { label: 'Escrow released', tone: 'jade' },
      [OrderStatus.DISPUTED]: { label: 'Disputed', tone: 'neutral' },
    };
    const entry = map[status] || { label: status.replace(/_/g, ' '), tone: 'outline' as const };
    return (
      <Chip tone={entry.tone} className="uppercase tracking-wider">
        {entry.label}
      </Chip>
    );
  };

  const escrowHeldAsBuyer = buyerOrders
    .filter((o) =>
      [OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY].includes(o.status)
    )
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const escrowReleasedAsBuyer = buyerOrders
    .filter((o) => o.status === OrderStatus.DELIVERED_SUCCESS)
    .reduce((sum, o) => sum + o.totalAmount, 0);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-ink-500/10 dark:bg-ink-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-ink-500/20">
          <Key className="w-8 h-8 text-ink-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-ink-900 dark:text-white mb-2">Access Your Safe Escrow Hub</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Sign in or create a GoodSale account to view your purchase history, release escrow delivery funds, track loyalty GoodPoints, and check seller reviews.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-jade-500 to-jade-600 hover:from-jade-600 hover:to-jade-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-jade-500/10 transition-all"
          >
            Sign In / Register Account
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 bg-ink-100 dark:bg-ink-900 hover:bg-ink-200 dark:hover:bg-ink-800 text-ink-700 dark:text-ink-300 font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all border border-ink-200/50 dark:border-ink-800"
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
          className="flex items-center gap-2 text-xs font-bold text-ink-500 hover:text-ink-900 dark:hover:text-white mb-3 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </button>
        
        {/* Profile Card Backdrop */}
        <Card className="overflow-hidden">
          
          <div className="relative h-32 overflow-hidden bg-ink-900">
            <div className="absolute inset-0 aurora-bg opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 to-transparent" />
            <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
              <Calendar className="h-3.5 w-3.5" />
              Member since {new Date().getFullYear()}
            </div>
          </div>

          <div className="p-6 sm:p-8 pt-0 relative flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
            
            {/* Avatar & Basic Credentials */}
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-10 sm:-mt-12 relative z-10">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white dark:border-ink-900 bg-ink-150 relative overflow-hidden shadow-md">
                <SmartAvatar 
                  src={currentProfile?.photoUrl} 
                  name={currentUser.fullName}
                  seed={currentUser.username}
                  className="w-full h-full"
                />
              </div>

              <div className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-black leading-none tracking-tight text-ink-900 dark:text-white">{currentUser.fullName}</h1>
                  <Chip tone="solid" className="uppercase tracking-wider" title={currentUser.role}>
                    {(() => {
                      switch (currentUser.role) {
                        case UserRole.VERIFIED_BUSINESS:
                          return 'Verified Business';
                        case UserRole.BUSINESS:
                          return 'Business';
                        case UserRole.VERIFIED_SELLER:
                          return 'Verified Seller';
                        case UserRole.SELLER:
                          return 'Seller';
                        case UserRole.SUPER_ADMIN:
                          return 'Super Admin';
                        case UserRole.ADMIN:
                          return 'Admin';
                        default:
                          return 'Buyer';
                      }
                    })()}
                  </Chip>
                </div>
                <p className="mt-1.5 font-mono text-xs text-ink-500">@{currentUser.username} · {currentUser.email}</p>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-500">{currentProfile?.bio || 'Verified buyer on the GoodSale escrow network.'}</p>
              </div>
            </div>

            {/* Trust snapshot (full detail lives in the vitals grid below) */}
            <Chip
              tone="jade"
              className="shrink-0 self-start sm:self-auto"
              icon={<Shield className="h-3.5 w-3.5" />}
            >
              Trust {currentUser.trustScore}% · {currentUser.sellerLevel}
            </Chip>
          </div>

          {/* Location & delivery preference */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 bg-ink-50/60 px-6 py-4 text-xs sm:px-8 dark:border-ink-800 dark:bg-ink-950/40">
            <div className="flex items-center gap-2 text-ink-600 dark:text-ink-400">
              <MapPin className="h-4 w-4 text-jade-500" />
              <span>
                {currentProfile?.address || 'No address on file'}
                {currentProfile?.city ? `, ${currentProfile.city}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-ink-500">
              <Shield className="h-4 w-4 text-jade-500" />
              <span>
                {currentProfile?.deliveryPreference === 'GOODSALE_PARTNER'
                  ? 'GoodSale partner rider'
                  : 'Direct dispatch courier'}
              </span>
            </div>
          </div>
        </Card>

        {/* Account vitals */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Trust score', value: `${currentUser.trustScore}%`, icon: Shield },
            { label: 'Escrow held', value: `₦${escrowHeldAsBuyer.toLocaleString()}`, icon: Lock },
            { label: 'Escrow released', value: `₦${escrowReleasedAsBuyer.toLocaleString()}`, icon: CheckCircle },
            { label: 'GoodPoints', value: currentUser.goodPoints.toLocaleString(), icon: Award },
          ].map((stat) => (
            <Card key={stat.label} variant="muted" className="p-4">
              <stat.icon className="mb-2 h-4 w-4 text-jade-600 dark:text-jade-400" />
              <p className="font-mono text-lg font-black leading-none text-ink-900 dark:text-white">
                {stat.value}
              </p>
              <p className="mt-1 font-mono text-xs uppercase tracking-widest text-ink-500">
                {stat.label}
              </p>
            </Card>
          ))}
        </div>
      </div>


      {/* Quick portals */}
      <Card className="mb-8 space-y-4 p-5">
        <h3 className="flex select-none items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-ink-500">
          <Compass className="h-4 w-4 text-jade-600 dark:text-jade-400" />
          Quick access
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Dispatch Partner Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate?.('dispatch')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:border-jade-500 dark:hover:border-jade-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400 group-hover:bg-jade-500 group-hover:text-white transition-all">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink-900 dark:text-white group-hover:text-jade-500 transition-colors">
                GoodDispatch™ Network
              </h4>
              <p className="text-xs text-ink-400 mt-0.5 leading-snug">
                Accept delivery jobs & track riders.
              </p>
            </div>
          </button>

          {/* Seller Hub / Dashboard */}
          <button
            type="button"
            onClick={() => onNavigate?.('dashboard')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:border-ink-500 dark:hover:border-ink-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-ink-500/10 text-ink-600 dark:text-ink-400 group-hover:bg-ink-500 group-hover:text-white transition-all">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink-900 dark:text-white group-hover:text-ink-500 transition-colors">
                Merchant Seller Hub
              </h4>
              <p className="text-xs text-ink-400 mt-0.5 leading-snug">
                Manage your store and inventory.
              </p>
            </div>
          </button>

          {/* Settings panel */}
          <button
            type="button"
            onClick={() => onNavigate?.('settings')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:border-jade-500 dark:hover:border-jade-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400 group-hover:bg-jade-500 group-hover:text-white transition-all">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink-900 dark:text-white group-hover:text-jade-500 transition-colors">
                System Settings
              </h4>
              <p className="text-xs text-ink-400 mt-0.5 leading-snug">
                Configure your account parameters.
              </p>
            </div>
          </button>
        </div>
      </Card>

      {/* 2. Interactive Escrow Orders Tracking List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Orders list */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-black tracking-tight text-ink-900 dark:text-white">
                  <Package className="h-5 w-5 text-jade-600 dark:text-jade-400" />
                  Escrow-protected purchases
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Track transit, get your delivery PIN, and release funds only after inspection.
                </p>
              </div>
              {buyerOrders.length > 0 && (
                <Chip tone="neutral" icon={<Lock className="h-3.5 w-3.5" />}>
                  ₦{escrowHeldAsBuyer.toLocaleString()} in escrow
                </Chip>
              )}
            </div>

            {buyerOrders.length === 0 ? (
              <EmptyState
                state="empty-cart"
                size="md"
                icon={<Package />}
                title="No purchases yet"
                description="Orders you place will appear here with escrow protection and a delivery PIN."
                action={
                  <Button onClick={() => onNavigate?.('marketplace')}>
                    Browse the marketplace
                  </Button>
                }
              />
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
                      className={`overflow-hidden rounded-3xl border transition-all ${
                        isSelected 
                          ? 'border-jade-500/60 ring-1 ring-jade-500/20' 
                          : 'border-ink-200 hover:border-jade-500/40 dark:border-ink-800'
                      }`}
                    >
                      {/* Top Summary Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-150 bg-ink-50 px-4 py-3 text-xs dark:border-ink-800 dark:bg-ink-950/50">
                        <div className="font-mono text-ink-500">
                          Order <span className="font-bold text-ink-900 dark:text-white">#{order.orderNumber}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-ink-500">{new Date(order.createdAt).toLocaleDateString()}</span>
                          {getStatusBadge(order.status)}
                        </div>
                      </div>

                      {/* Content details */}
                      <div className="flex gap-4 p-4">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-ink-100 dark:bg-ink-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={order.productImage} alt={order.productTitle} className="h-full w-full object-cover" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="truncate font-display text-sm font-bold text-ink-900 dark:text-white">{order.productTitle}</h4>
                          <p className="mt-1 font-mono text-sm font-black text-ink-900 dark:text-white">
                            ₦{order.totalAmount.toLocaleString()}
                          </p>
                          <p className="mt-1 line-clamp-1 text-xs text-ink-500">
                            Deliver to {order.deliveryAddress}, {order.deliveryCity}
                          </p>
                        </div>
                      </div>

                      {/* Escrow Progress Tracker */}
                      <div className="px-4 pb-4">
                        <div className="rounded-2xl border border-ink-100 bg-ink-50/70 p-4 dark:border-ink-800 dark:bg-ink-950/40">
                          <div className="mb-4 flex items-center justify-between font-mono text-xs font-bold uppercase tracking-widest text-ink-400">
                            <span>Escrow progress</span>
                            <span className="text-jade-600 dark:text-jade-400">Protected</span>
                          </div>

                          <div className="relative flex items-center justify-between px-3 mt-4">
                            {/* Horizontal Line background */}
                            <div className="absolute left-6 right-6 top-1/2 h-0.5 bg-ink-200 dark:bg-ink-800 -translate-y-1/2 z-0" />
                            
                            {/* Active Line Progress overlay */}
                            <div 
                              className="absolute left-6 top-1/2 h-0.5 bg-jade-500 -translate-y-1/2 transition-all duration-500 z-0"
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
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border-2 ${
                                  step.active 
                                    ? 'bg-jade-500 border-jade-500 text-white shadow-md shadow-jade-500/15' 
                                    : 'bg-white dark:bg-ink-900 border-ink-200 dark:border-ink-800 text-ink-400'
                                }`}>
                                  {step.active ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                                </div>
                                <span className={`text-[10px] font-bold mt-1.5 whitespace-nowrap ${step.active ? 'text-jade-600 dark:text-jade-400' : 'text-ink-400'}`}>
                                  {step.label}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Escrow actions panel */}
                      <div className="bg-ink-50/50 dark:bg-ink-800/20 px-4 py-3 border-t border-ink-150 dark:border-ink-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-ink-500 max-w-[280px]">
                          {order.status === OrderStatus.PAID_ESCROW || order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY ? (
                            <span className="text-ink-600 dark:text-ink-400 font-bold flex items-center gap-1">
                              <Shield className="w-3.5 h-3.5 shrink-0" />
                              Escrow payout active. Release PIN only when verified!
                            </span>
                          ) : order.status === OrderStatus.DELIVERED_SUCCESS ? (
                            <span className="text-jade-600 dark:text-jade-400 font-bold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Payment successfully released. Deal concluded.
                            </span>
                          ) : order.status === OrderStatus.PENDING ? (
                            <span className="text-ink-600 dark:text-ink-500 font-bold flex items-center gap-1 animate-pulse">
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
                              toast.success(`Escrow funded: ₦${order.totalAmount.toLocaleString()} locked in escrow.`, 'Deposit complete');
                            }}
                            className="px-3.5 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-display font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
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
                              className="px-3.5 py-1.5 bg-ink-500 hover:bg-ink-600 text-white font-display font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
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
                              className={`px-3.5 py-1.5 font-display font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                                activeSafeMeetOrderId === order.id
                                  ? 'bg-jade-600 text-white hover:bg-jade-700'
                                  : 'bg-jade-50 hover:bg-jade-100 text-jade-600 dark:bg-jade-950/20 dark:text-jade-400 dark:hover:bg-jade-950/40'
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
                              className="px-3 py-1.5 bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700 text-ink-700 dark:text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                              title="Download dynamic PDF transaction summary"
                            >
                              <Download className="w-3.5 h-3.5 text-ink-500 dark:text-ink-400" />
                              Download Receipt
                            </button>

                            {!db.reviews.some(r => r.orderId === order.id) ? (
                              <button
                                onClick={() => {
                                  setReviewingOrderId(reviewingOrderId === order.id ? null : order.id);
                                  setReviewRating(5);
                                  setReviewComment('');
                                }}
                                className="px-3.5 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-display font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <Star className="w-3.5 h-3.5 fill-white/20" />
                                {reviewingOrderId === order.id ? 'Cancel' : 'Leave Review'}
                              </button>
                            ) : (
                              <div className="text-xs text-jade-500 font-bold bg-jade-500/5 px-2.5 py-1.5 rounded-xl flex items-center gap-1 border border-jade-500/10">
                                <Check className="w-3.5 h-3.5" />
                                Reviewed
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Interactive inline Review submission drawer */}
                      {reviewingOrderId === order.id && (
                        <div className="border-t border-jade-500/20 p-4 bg-jade-500/[0.01] space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-ink-800 dark:text-ink-200">Rate your escrow exchange experience</h5>
                            <span className="text-xs font-bold text-jade-500 bg-jade-500/10 px-2 py-0.5 rounded">Rewards: +30 GP Points</span>
                          </div>

                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onClick={() => setReviewRating(star)}
                                className="p-1 hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                              >
                                <Star className={`w-5 h-5 transition-colors ${star <= reviewRating ? 'text-ink-400 fill-ink-400' : 'text-ink-200 dark:text-ink-700'}`} />
                              </button>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <input 
                              type="text"
                              placeholder="Describe product authenticity, merchant response speed, waybill delivery reliability..."
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              className="flex-1 px-3 py-2 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white font-sans"
                            />
                            <button
                              onClick={() => handleReviewSubmit(order.id)}
                              className="px-4 py-2 bg-jade-500 hover:bg-jade-600 text-white font-display font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-sm shadow-jade-500/10"
                            >
                              Submit
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Expanded PIN entering UI */}
                      {isSelected && (
                        <div className="border-t border-ink-200 dark:border-ink-500/20 p-5 bg-ink-500/[0.02] space-y-4">
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

                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-950 rounded-2xl">
                            <div>
                              <span className="text-xs text-ink-400 uppercase tracking-widest font-mono font-bold block mb-0.5">My Delivery PIN Code</span>
                              <span className="text-xl font-mono font-black tracking-widest text-ink-600 dark:text-ink-400">{order.deliveryPin}</span>
                            </div>

                            <p className="text-xs leading-relaxed text-ink-500 max-w-sm">
                              This is your secure escrow verification token. Hand this to the merchant/rider only after you have physically inspected the package and confirmed everything is correct.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-sans font-black text-ink-500 dark:text-ink-400 uppercase tracking-wider">Confirm delivery manually (Enter 6-digit PIN)</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                maxLength={6}
                                placeholder="Enter Delivery PIN"
                                value={typedPin}
                                onChange={(e) => setTypedPin(e.target.value.replace(/\D/g, ''))}
                                className="px-4 py-2 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl text-xs font-mono font-bold tracking-widest max-w-[150px] text-center focus:outline-none focus:border-ink-500 text-ink-800 dark:text-white"
                              />
                              <button
                                onClick={() => handleReleaseEscrow(order.id, order.deliveryPin)}
                                className="px-4 py-2 bg-jade-500 hover:bg-jade-600 text-white font-display font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                              >
                                Match PIN & Release Funds
                              </button>
                            </div>

                            {pinError && (
                              <p className="text-xs font-bold text-ink-500 flex items-center gap-1 mt-1.5 animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {pinError}
                              </p>
                            )}
                            {pinSuccess && (
                              <p className="text-xs font-bold text-jade-500 flex items-center gap-1 mt-1.5">
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
                          <div className="border-t border-jade-200 dark:border-jade-50/20 p-5 bg-jade-500/[0.02] space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-display font-black text-xs text-ink-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                <Shield className="w-4 h-4 text-jade-500" />
                                GoodSale SafeMeet™ Portal
                              </h4>
                              <span className="text-xs font-bold text-jade-600 bg-jade-150/50 dark:bg-jade-950/40 px-2 py-0.5 rounded uppercase tracking-wider">
                                Police-Verified Meetup Protocol
                              </span>
                            </div>

                            {!meetup ? (
                              /* Setup Proposal Form */
                              <div className="bg-white dark:bg-ink-900 border border-jade-100 dark:border-jade-950/40 p-4 rounded-2xl space-y-4">
                                <p className="text-xs text-ink-500 leading-relaxed">
                                  Request an in-person exchange at one of our police-verified, well-lit public SafeMeet™ partner locations. 
                                  GoodPoints (+50 GP) are awarded on completed handshakes!
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                  <div className="space-y-1">
                                    <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider">Select Verified SafeZone</label>
                                    <select
                                      value={selectedSafeMeetLocationId}
                                      onChange={(e) => setSelectedSafeMeetLocationId(parseInt(e.target.value))}
                                      className="w-full p-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl font-bold"
                                    >
                                      {db.safeMeetLocations.map(loc => (
                                        <option key={loc.id} value={loc.id}>
                                          {loc.name} ({loc.distanceKm}km away)
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-xs font-sans font-black text-ink-400 uppercase tracking-wider">Scheduled Date & Time</label>
                                    <input
                                      type="datetime-local"
                                      value={safeMeetScheduledTime}
                                      onChange={(e) => setSafeMeetScheduledTime(e.target.value)}
                                      className="w-full p-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-xl font-bold font-mono"
                                    />
                                  </div>
                                </div>

                                {/* Selected Location Preview */}
                                <div className="p-3 bg-jade-500/[0.02] border border-jade-100 dark:border-jade-950 rounded-xl text-xs space-y-1">
                                  <p className="font-extrabold text-ink-800 dark:text-ink-200">{selectedLoc.name}</p>
                                  <p className="text-ink-400">{selectedLoc.address}</p>
                                  <div className="flex gap-4 text-xs text-jade-500 font-mono mt-1 pt-1 border-t border-ink-100 dark:border-ink-800">
                                    <span>Safety Rating: {selectedLoc.safetyRating} / 5</span>
                                    <span>Distance: {selectedLoc.distanceKm} km ({selectedLoc.travelTimeMinutes} mins)</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!safeMeetScheduledTime) {
                                      toast.error('Please specify a valid meeting date and time.');
                                      return;
                                    }
                                    dbOperations.createSafeMeetMeetup(order.id, selectedSafeMeetLocationId, safeMeetScheduledTime);
                                    toast.success('SafeMeet™ proposal sent to the merchant. Awaiting confirmation!');
                                  }}
                                  className="w-full py-2.5 bg-jade-600 hover:bg-jade-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                                >
                                  Send Proposal to Seller
                                </button>
                              </div>
                            ) : (
                              /* Active Meetup Coordinator Dashboard */
                              <div className="space-y-4">
                                {/* Location specification details */}
                                <div className="bg-white dark:bg-ink-900 border border-jade-100 dark:border-jade-950 p-4 rounded-2xl">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="text-[10px] font-mono font-black text-jade-600 bg-jade-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                        Zone Coordinates
                                      </span>
                                      <h5 className="font-black text-ink-850 dark:text-white mt-1 text-xs">{selectedLoc.name}</h5>
                                      <p className="text-xs text-ink-400 mt-0.5">{selectedLoc.address}</p>
                                    </div>
                                    <div className="text-right text-xs font-mono text-jade-500 font-bold">
                                      <p>Police Patrol: Active</p>
                                      <p>CCTV Cameras: Online</p>
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
                                <div className="bg-white dark:bg-ink-900 border border-jade-100 dark:border-jade-950 p-4 rounded-2xl text-xs space-y-3">
                                  <div className="flex justify-between items-center pb-2 border-b border-ink-100 dark:border-ink-800">
                                    <span className="font-bold text-ink-600">Proposal Date:</span>
                                    <span className="font-mono font-bold text-ink-800 dark:text-ink-200">
                                      {new Date(meetup.scheduledAt).toLocaleString()}
                                    </span>
                                  </div>

                                  {/* Status alert message */}
                                  <div className="p-3 rounded-xl text-xs font-semibold leading-relaxed border flex items-center gap-2.5 bg-jade-50/50 dark:bg-jade-950/20 border-jade-100/50">
                                    <Clock className="w-4 h-4 text-jade-500 shrink-0" />
                                    <div>
                                      {meetup.status === 'PENDING_CONFIRMATION' && (
                                        <p className="text-jade-600 dark:text-jade-400">
                                          Awaiting seller check-in configuration. The seller has been notified to confirm or decline this meetup date.
                                        </p>
                                      )}
                                      {meetup.status === 'SCHEDULED' && (
                                        <p className="text-ink-600 dark:text-ink-300">
                                          Meetup approved! Proceed to coordinates. Tap the button below once you have arrived physically at the safe spot.
                                        </p>
                                      )}
                                      {(meetup.status === 'BUYER_ARRIVED' || meetup.status === 'SELLER_ARRIVED') && (
                                        <p className="text-jade-600 dark:text-jade-400">
                                          {meetup.buyerConfirmedArrival ? 'You have checked in as arrived.' : 'Seller has arrived & checked in at the spot!'} Please arrive promptly and check-in.
                                        </p>
                                      )}
                                      {meetup.status === 'COMPLETED' && (
                                        <p className="text-jade-600 dark:text-jade-400 font-extrabold">
                                          Meetup confirmed by both parties! Please inspect the item. Ready to exchange the PIN code to unlock escrow.
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
                                            toast.success('Arrival confirmed! You are checked-in at the SafeMeet™ zone.');
                                          }}
                                          className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                                            meetup.buyerConfirmedArrival 
                                              ? 'bg-jade-100 text-jade-800 dark:bg-jade-950/20 dark:text-jade-400 cursor-not-allowed' 
                                              : 'bg-jade-600 hover:bg-jade-700 text-white cursor-pointer'
                                          }`}
                                        >
                                          {meetup.buyerConfirmedArrival ? 'Arrival Logged' : 'Mark Myself as Arrived'}
                                        </button>
                                        
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (await confirmDialog({ message: 'Cancel this physical meetup proposal?', confirmText: 'Cancel meetup', danger: true })) {
                                              dbOperations.cancelMeetup(meetup.id);
                                              toast.info('Meetup successfully canceled.');
                                            }
                                          }}
                                          className="px-3 py-2 bg-ink-500/10 hover:bg-ink-500 text-ink-500 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
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
          </Card>
        </div>

        {/* Right Side Column: reviews written list & stats */}
        <div className="space-y-6">
          
          {/* Wallet & escrow summary */}
          <Card className="relative overflow-hidden border-0 bg-ink-900 p-6 text-white dark:bg-ink-950">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-jade-500/20 blur-3xl" />

            <h3 className="relative mb-5 flex items-center gap-2 font-display text-base font-black tracking-tight">
              <CreditCard className="h-5 w-5 text-jade-400" />
              Wallet &amp; escrow
            </h3>

            <div className="relative space-y-4">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
                <span className="block font-mono text-xs uppercase tracking-widest text-ink-400">
                  Currently held in escrow
                </span>
                <span className="mt-1 block font-mono text-3xl font-black text-jade-400">
                  ₦{escrowHeldAsBuyer.toLocaleString()}
                </span>
                <span className="mt-1.5 block text-xs text-ink-400">
                  Released safely to sellers only after you confirm delivery.
                </span>
              </div>

              <dl className="space-y-2 font-mono text-xs text-ink-300">
                <div className="flex justify-between gap-3">
                  <dt>Purchases</dt>
                  <dd className="font-bold text-white">{buyerOrders.length}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Released</dt>
                  <dd className="font-bold text-jade-400">
                    {buyerOrders.filter((o) => o.status === OrderStatus.DELIVERED_SUCCESS).length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Active holds</dt>
                  <dd className="font-bold text-ink-200">
                    {buyerOrders.filter((o) =>
                      [OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY].includes(o.status)
                    ).length}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>GoodPoints</dt>
                  <dd className="font-bold text-ink-200">{currentUser.goodPoints.toLocaleString()} GP</dd>
                </div>
              </dl>

              <Button
                variant="primary"
                className="relative w-full"
                onClick={() => onNavigate?.('wallet')}
              >
                Open wallet
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* Reviews written */}
          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-display text-base font-black tracking-tight text-ink-900 dark:text-white">
              <Star className="h-5 w-5 fill-jade-500/15 text-jade-600 dark:text-jade-400" />
              Reviews you&apos;ve written
              <Chip tone="neutral">{buyerReviews.length}</Chip>
            </h3>

            {buyerReviews.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing yet — complete an escrow delivery to leave feedback for a seller.</p>
            ) : (
              <div className="space-y-3">
                {buyerReviews.map((review) => (
                  <div key={review.id} className="p-3 bg-ink-50 dark:bg-ink-800/40 rounded-xl border border-ink-100 dark:border-ink-800">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star 
                            key={s} 
                            className={`w-3.5 h-3.5 ${s <= review.rating ? 'text-ink-500 fill-ink-500' : 'text-ink-200'}`} 
                          />
                        ))}
                      </div>
                      <span className="text-xs text-ink-400 font-mono">{new Date(review.createdAt).toLocaleDateString()}</span>
                    </div>

                    <p className="text-xs text-ink-700 dark:text-ink-300 font-sans italic leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
                    
                    {review.sellerReply && (
                      <div className="mt-2 pl-2 border-l-2 border-ink-400 bg-ink-500/5 p-1.5 rounded-r-lg text-xs">
                        <span className="font-bold text-ink-600 dark:text-ink-400 block mb-0.5">Merchant Reply:</span>
                        <p className="text-ink-500 dark:text-ink-400 font-medium">{review.sellerReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

      </div>

    </div>
  );
}
