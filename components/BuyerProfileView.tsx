// components/BuyerProfileView.tsx
'use client';

import React, { useState } from 'react';
import { 
  Shield, Award, MapPin, CheckCircle, Package, Clock, AlertTriangle, 
  ChevronRight, Calendar, Star, ArrowLeft, Key, CreditCard, Lock,
  Download, Check, Compass, Sliders, Truck, Store, Camera, Loader2, ShieldCheck, Gift,
  Heart, Pencil, Wallet, Sparkles, LayoutGrid, Mail, Phone, ReceiptText, Inbox, Filter,
} from 'lucide-react';
import { useDBState, dbOperations, OrderStatus, Order, UserRole } from '../lib/store';
import LiveSafeMeetMap from './LiveSafeMeetMap';
import OrderTrackingCard, { hasLiveTracking } from './OrderTrackingCard';
import { SmartAvatar, SmartImage } from './ui/SmartImage';
import Card from './ui/Card';
import Chip from './ui/Chip';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import { toast, confirmDialog } from '@/lib/feedback';
import { computeSellerTrust } from '@/lib/trust';
import { isVerifiedSeller } from '@/lib/verification';
import { resolveEntitlements, membershipLabel } from '@/lib/entitlements';
import { useWishlist } from '@/lib/hooks/useWishlist';
import VerifiedBadge from '@/components/verification/VerifiedBadge';

interface BuyerProfileViewProps {
  onBack?: () => void;
  onNavigate?: (view: string, payload?: any) => void;
  onOpenAuth?: () => void;
}

type YouSection = 'you-overview' | 'you-saved' | 'you-listings' | 'you-orders' | 'you-reviews';

export default function BuyerProfileView({ onBack, onNavigate, onOpenAuth }: BuyerProfileViewProps) {
  const db = useDBState();
  const wishlist = useWishlist();
  const currentUser = db.currentUser;
  const myTrust = currentUser ? computeSellerTrust(db, currentUser.id) : null;
  
  const currentProfile = currentUser 
    ? db.profiles.find(p => p.userId === currentUser.id) 
    : null;
  const profileVerified = isVerifiedSeller({
    verificationStatus: currentProfile?.verificationStatus,
    verificationExpiresAt: currentProfile?.verificationExpiresAt,
  });

  // Buying is open to every signed-in role. Only seller / business accounts can
  // list, so buyers are pointed at Settings to switch their account type.
  const canSell = currentUser
    ? [
        UserRole.SELLER,
        UserRole.VERIFIED_SELLER,
        UserRole.BUSINESS,
        UserRole.VERIFIED_BUSINESS,
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
      ].includes(currentUser.role)
    : false;

  // Active orders made by this buyer
  const buyerOrders = currentUser 
    ? db.orders.filter(o => o.buyerId === currentUser.id) 
    : [];

  // Reviews written by this buyer
  const buyerReviews = currentUser 
    ? db.reviews.filter(r => r.reviewerId === currentUser.id) 
    : [];

  // Everything else that belongs to this account, surfaced in one place.
  const entitlements = resolveEntitlements(db, currentUser?.id);
  const wallet = currentUser ? db.wallets.find((w) => w.userId === currentUser.id) : null;
  const myListings = currentUser ? db.products.filter((p) => p.sellerId === currentUser.id) : [];
  const savedProducts = db.products.filter((p) => wishlist.favorites.includes(p.id));
  const memberSince = (() => {
    const stamps = [
      ...buyerOrders.map((o) => o.createdAt),
      ...myListings.map((p) => p.createdAt),
      ...buyerReviews.map((r) => r.createdAt),
      currentProfile?.onboardingCompletedAt,
    ].filter(Boolean) as string[];
    if (!stamps.length) return null;
    const earliest = stamps.reduce((a, b) => (new Date(a) < new Date(b) ? a : b));
    const date = new Date(earliest);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
  })();
  /** Orders newest first — the ledger list used to render in insertion order. */
  const sortedOrders = [...buyerOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const sortedReviews = [...buyerReviews].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const sortedListings = [...myListings].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const activeOrders = sortedOrders.filter((o) =>
    [OrderStatus.PENDING, OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY].includes(o.status)
  );
  const completedOrders = sortedOrders.filter((o) => o.status === OrderStatus.DELIVERED_SUCCESS);
  const closedOrders = sortedOrders.filter((o) =>
    [OrderStatus.CANCELLED, OrderStatus.REFUNDED, OrderStatus.DISPUTED, OrderStatus.REFUND_REQUESTED].includes(o.status)
  );

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Which account surface is open. Tabs beat one long scroll here: every panel
  // starts at the top of the viewport, so nothing hides under the sticky bar.
  const [section, setSection] = useState<YouSection>('you-overview');
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed' | 'closed'>('all');

  // Switching panels while scrolled deep into a long order list would leave the
  // new panel half-read, so bring the hub back to the top of the view.
  const openSection = (next: YouSection, filter?: 'all' | 'active' | 'completed' | 'closed') => {
    setSection(next);
    if (filter) setOrderFilter(filter);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const visibleOrders =
    orderFilter === 'active' ? activeOrders
    : orderFilter === 'completed' ? completedOrders
    : orderFilter === 'closed' ? closedOrders
    : sortedOrders;

  const unreviewedDelivered = sortedOrders.filter(
    (o) => o.status === OrderStatus.DELIVERED_SUCCESS && !db.reviews.some((r) => r.orderId === o.id)
  );

  // Active PIN verification state
  const [selectedOrderForPin, setSelectedOrderForPin] = useState<number | null>(null);
  const [typedPin, setTypedPin] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);

  /** Cover photo: image → /api/upload → store + Supabase, shown on the profile banner. */
  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCover(true);
    try {
      const { uploadMedia } = await import('@/lib/upload');
      const url = await uploadMedia(file, 'avatars');
      const res = await dbOperations.updateCoverPhoto(url, 'USER');
      if ('error' in res && res.error) throw new Error(res.error);
      toast.success('Cover photo updated.');
    } catch {
      toast.error('Cover upload failed. Try a smaller image.');
    } finally {
      setUploadingCover(false);
    }
  };
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
    if (!reviewComment.trim()) {
      toast.error('Add a sentence about the exchange before submitting.');
      return;
    }
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
      [OrderStatus.REFUND_REQUESTED]: { label: 'Refund requested', tone: 'neutral' },
      [OrderStatus.REFUNDED]: { label: 'Refunded', tone: 'outline' },
      [OrderStatus.CANCELLED]: { label: 'Cancelled', tone: 'outline' },
    };
    const entry = map[status] || { label: status.replace(/_/g, ' '), tone: 'outline' as const };
    return (
      <Chip tone={entry.tone} className="tracking-tight">
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
        <h2 className="font-display font-bold text-2xl text-ink-900 dark:text-white mb-2">Access Your Safe Escrow Hub</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Sign in or create a GoodSale account to view your purchase history, release escrow delivery funds, track loyalty GoodPoints, and check seller reviews.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-jade-500 to-jade-600 hover:from-jade-600 hover:to-jade-700 text-white font-sans font-bold text-xs tracking-tight rounded-xl cursor-pointer shadow-md shadow-jade-500/10 transition-all"
          >
            Sign In / Register Account
          </button>
          <button
            onClick={onBack}
            className="w-full py-3 bg-ink-100 dark:bg-ink-900 hover:bg-ink-200 dark:hover:bg-ink-800 text-ink-700 dark:text-ink-300 font-sans font-bold text-xs tracking-tight rounded-xl cursor-pointer transition-all border border-ink-200/50 dark:border-ink-800"
          >
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      
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
          
          <div className="relative h-40 overflow-hidden bg-ink-900 sm:h-48">
            {currentProfile?.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentProfile.coverUrl}
                alt="Profile cover"
                className="absolute inset-0 h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 aurora-bg opacity-70" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 to-transparent" />

            <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
              <Calendar className="h-3.5 w-3.5" />
              {memberSince ? `Member since ${memberSince}` : 'New GoodSale member'}
            </div>

            <label className="absolute left-4 top-4 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/90 px-3 py-1.5 text-xs font-bold text-ink-800 shadow-md backdrop-blur-md transition hover:bg-white dark:bg-ink-900/90 dark:text-ink-100">
              {uploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {uploadingCover ? 'Uploading…' : 'Change cover'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleCoverFileChange}
              />
            </label>
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
                  <h1 className="font-display text-2xl font-bold leading-none tracking-tight text-ink-900 dark:text-white">{currentUser.fullName}</h1>
                  <Chip tone="solid" className="tracking-tight" title={currentUser.role}>
                    {(() => {
                      switch (currentUser.role) {
                        case UserRole.VERIFIED_BUSINESS:
                          return profileVerified ? 'Verified Business' : 'Business';
                        case UserRole.BUSINESS:
                          return 'Business';
                        case UserRole.VERIFIED_SELLER:
                          return profileVerified ? 'Verified Seller' : 'Seller';
                        case UserRole.SELLER:
                          return 'Seller';
                        case UserRole.SUPER_ADMIN:
                          return 'Super Admin';
                        case UserRole.ADMIN:
                          return 'Admin';
                        case UserRole.RIDER:
                          return 'Rider';
                        default:
                          return 'Buyer';
                      }
                    })()}
                  </Chip>
                  <VerifiedBadge
                    sellerId={currentUser.id}
                    status={currentProfile?.verificationStatus}
                    expiresAt={currentProfile?.verificationExpiresAt}
                    variant="pill"
                    fallbackName={currentUser.fullName}
                  />
                </div>
                <p className="mt-1.5 font-mono text-xs text-ink-500">@{currentUser.username} · {currentUser.email}</p>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-500">{currentProfile?.bio || 'GoodSale member on the escrow-protected marketplace.'}</p>
              </div>
            </div>

            {/* Account snapshot — trust, membership and the way back into settings */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:flex-col sm:items-end sm:self-auto">
              {entitlements.tier !== 'NONE' && (
                <Chip
                  tone="neutral"
                  icon={<Sparkles className="h-3.5 w-3.5 text-gold-600 dark:text-gold-300" />}
                  className="border border-gold-400/30 bg-gold-300/10 tracking-tight text-ink-800 dark:text-gold-100"
                >
                  {membershipLabel(entitlements)}
                </Chip>
              )}
              {/* Seller trust is meaningless for a pure buyer — they get the
                  buyer-protection state instead of a score they cannot move. */}
              {canSell ? (
                <Chip
                  tone="jade"
                  className="shrink-0"
                  icon={<Shield className="h-3.5 w-3.5" />}
                >
                  Trust {myTrust?.score ?? currentUser.trustScore}% · {currentUser.sellerLevel}
                </Chip>
              ) : (
                <Chip
                  tone="jade"
                  className="shrink-0"
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                >
                  Escrow-protected buyer
                </Chip>
              )}
              <button
                type="button"
                onClick={() => onNavigate?.('settings')}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-bold text-ink-700 transition-colors hover:border-jade-500 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit profile
              </button>
            </div>
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

        {/* Account vitals — the whole account at a glance */}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Orders', value: buyerOrders.length.toLocaleString(), icon: Package },
            { label: 'Escrow held', value: `₦${escrowHeldAsBuyer.toLocaleString()}`, icon: Lock },
            { label: 'Wallet balance', value: `₦${(wallet?.balance || 0).toLocaleString()}`, icon: Wallet },
            { label: 'GoodPoints', value: currentUser.goodPoints.toLocaleString(), icon: Award },
            { label: 'Saved items', value: savedProducts.length.toLocaleString(), icon: Heart },
          ].map((stat) => (
            <Card key={stat.label} variant="muted" className="p-4">
              <stat.icon className="mb-2 h-4 w-4 text-jade-600 dark:text-jade-400" />
              <p className="font-mono text-lg font-bold leading-none text-ink-900 dark:text-white">
                {stat.value}
              </p>
              <p className="mt-1 font-mono text-xs tracking-tight text-ink-500">
                {stat.label}
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* Section tabs — one panel at a time, always starting at the same point */}
      <nav
        role="tablist"
        aria-label="Your account sections"
        className="sticky top-[116px] z-30 mb-6 overflow-x-auto rounded-2xl border border-ink-200 bg-white/95 p-1.5 shadow-sm backdrop-blur-xl scrollbar-hide dark:border-ink-800 dark:bg-ink-900/95"
      >
        <div className="flex min-w-max items-center gap-1">
          {([
            { id: 'you-overview', label: 'Overview', icon: LayoutGrid },
            { id: 'you-orders', label: 'Orders', icon: Package, count: buyerOrders.length },
            { id: 'you-saved', label: 'Saved', icon: Heart, count: savedProducts.length },
            ...(canSell ? [{ id: 'you-listings', label: 'Listings', icon: Store, count: myListings.length }] : []),
            { id: 'you-reviews', label: 'Reviews', icon: Star, count: buyerReviews.length },
          ] as { id: YouSection; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[]).map(
            (tab) => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => openSection(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                    active
                      ? 'bg-jade-600 text-white shadow-sm shadow-jade-600/20'
                      : 'text-ink-600 hover:bg-jade-500/10 hover:text-jade-700 dark:text-ink-300 dark:hover:text-jade-300'
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {typeof tab.count === 'number' && tab.count > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            }
          )}
        </div>
      </nav>

      {/* Overview — membership, account details, wallet and shortcuts */}
      <div
        id="panel-you-overview"
        role="tabpanel"
        hidden={section !== 'you-overview'}
        className="space-y-4"
      >
        {(!entitlements.business || entitlements.businessPlan === 'PRO') && canSell && currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.SUPER_ADMIN && (
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-gold-400/30 bg-gold-300/10 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-gold-600 dark:text-gold-300" />
              <div>
                <p className="text-sm font-bold text-ink-900 dark:text-white">
                  {entitlements.business ? 'Upgrade to Business Premium' : 'Grow with a Business membership'}
                </p>
                <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-500">
                  Staff accounts, priority campaign review and deeper analytics — from the Revenue Hub.
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => onNavigate?.('revenue')}>
              View plans <ChevronRight className="h-4 w-4" />
            </Button>
          </Card>
        )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Account details — the record the rest of the app reads from */}
        <Card className="p-5 sm:p-6 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
              <Compass className="h-5 w-5 text-jade-600 dark:text-jade-400" />
              Account details
            </h2>
            <button
              type="button"
              onClick={() => onNavigate?.('settings')}
              className="inline-flex items-center gap-1 text-xs font-bold text-jade-700 hover:underline dark:text-jade-300"
            >
              Manage <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {[
              { label: 'Full name', value: currentUser.fullName, icon: LayoutGrid },
              { label: 'Username', value: `@${currentUser.username}`, icon: Compass },
              { label: 'Email', value: currentUser.email, icon: Mail },
              { label: 'Phone', value: currentUser.phoneNumber || 'Not added', icon: Phone },
              {
                label: 'Location',
                value:
                  [currentProfile?.address, currentProfile?.city, currentProfile?.state]
                    .filter(Boolean)
                    .join(', ') || 'No address on file',
                icon: MapPin,
              },
              { label: 'Member since', value: memberSince || 'New member', icon: Calendar },
              {
                label: 'Delivery',
                value:
                  currentProfile?.deliveryPreference === 'GOODSALE_PARTNER'
                    ? 'GoodSale partner rider'
                    : 'Direct dispatch courier',
                icon: Truck,
              },
              { label: 'Account type', value: currentUser.role.replace(/_/g, ' ').toLowerCase(), icon: Shield },
            ].map((row) => (
              <div key={row.label} className="flex items-start gap-2.5 border-b border-ink-100 pb-2.5 last:border-0 dark:border-ink-800">
                <row.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <dt className="font-mono text-[10px] font-bold uppercase tracking-tight text-ink-400">{row.label}</dt>
                  <dd className="truncate text-xs font-bold capitalize text-ink-800 dark:text-ink-100">{row.value}</dd>
                </div>
              </div>
            ))}
          </dl>

          {unreviewedDelivered.length > 0 && (
            <button
              type="button"
              onClick={() => openSection('you-orders', 'completed')}
              className="mt-4 flex w-full items-center justify-between gap-2 rounded-xl border border-gold-400/40 bg-gold-300/10 px-3.5 py-2.5 text-left text-xs font-bold text-ink-800 transition-colors hover:bg-gold-300/20 dark:text-gold-100"
            >
              <span className="flex items-center gap-2">
                <Star className="star-filled h-3.5 w-3.5" />
                {unreviewedDelivered.length === 1
                  ? '1 delivered order still needs your review'
                  : `${unreviewedDelivered.length} delivered orders still need your review`}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          )}
        </Card>

        {/* Wallet & escrow summary */}
        <Card className="relative overflow-hidden border-0 bg-ink-900 p-6 text-white lg:col-span-2 dark:bg-ink-950">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-jade-500/20 blur-3xl" />

          <div className="relative mb-4 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
              <CreditCard className="h-5 w-5 text-jade-400" />
              Wallet &amp; escrow
            </h3>
            <button
              type="button"
              onClick={() => onNavigate?.('wallet')}
              className="text-xs font-bold text-jade-300 hover:text-white"
            >
              History
            </button>
          </div>

          <div className="relative space-y-3">
            <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
              <span className="block font-mono text-xs tracking-tight text-ink-400">Currently held in escrow</span>
              <span className="mt-1 block font-mono text-3xl font-bold text-jade-400">
                ₦{escrowHeldAsBuyer.toLocaleString()}
              </span>
              <span className="mt-1.5 block text-xs text-ink-400">
                Released to sellers only after you confirm delivery.
              </span>
            </div>

            <dl className="space-y-2 font-mono text-xs text-ink-300">
              <div className="flex justify-between gap-3">
                <dt>Available balance</dt>
                <dd className="font-bold text-white">₦{(wallet?.balance || 0).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Purchases</dt>
                <dd className="font-bold text-white">{buyerOrders.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Released to sellers</dt>
                <dd className="font-bold text-white">₦{escrowReleasedAsBuyer.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>GoodPoints</dt>
                <dd className="font-bold text-ink-200">{currentUser.goodPoints.toLocaleString()} GP</dd>
              </div>
            </dl>

            <Button variant="primary" className="relative w-full" onClick={() => onNavigate?.('wallet')}>
              Open wallet
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>

      {/* Quick portals */}
      <Card className="mb-8 space-y-4 p-5">
        <h3 className="flex select-none items-center gap-2 font-mono text-xs font-bold tracking-tight text-ink-500">
          <Compass className="h-4 w-4 text-jade-600 dark:text-jade-400" />
          Quick access
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                {currentUser.role === UserRole.RIDER ? 'Rider Dashboard' : 'GoodDispatch™ Network'}
              </h4>
              <p className="text-xs text-ink-400 mt-0.5 leading-snug">
                {currentUser.role === UserRole.RIDER
                  ? 'Go online, accept deliveries and track earnings.'
                  : 'Apply to deliver or manage rider operations.'}
              </p>
            </div>
          </button>

          {/* Seller Hub / Dashboard — buyers switch account type first */}
          <button
            type="button"
            onClick={() => onNavigate?.(canSell ? 'dashboard' : 'settings')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:border-jade-500 dark:hover:border-jade-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400 group-hover:bg-jade-500 group-hover:text-white transition-all">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink-900 dark:text-white group-hover:text-jade-500 transition-colors">
                {canSell ? 'Seller Hub' : 'Become a seller'}
              </h4>
              <p className="text-xs text-ink-400 mt-0.5 leading-snug">
                {canSell ? 'Manage your store and inventory.' : 'Switch your account type in Settings.'}
              </p>
            </div>
          </button>

          {/* Referral & rewards centre */}
          <button
            type="button"
            onClick={() => onNavigate?.('referrals')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:border-gold-400 dark:hover:border-gold-400 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-gold-400/15 text-gold-700 dark:text-gold-300 group-hover:bg-gold-400 group-hover:text-jade-950 transition-all">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink-900 dark:text-white group-hover:text-gold-600 transition-colors">
                Referrals &amp; rewards
              </h4>
              <p className="text-xs text-ink-400 mt-0.5 leading-snug">
                Share your code and earn GoodSale Coins.
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

          {/* Support & buyer protection */}
          <button
            type="button"
            onClick={() => onNavigate?.('support')}
            className="flex items-center gap-3 p-3.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 hover:border-jade-500 dark:hover:border-jade-500 rounded-2xl shadow-xs text-left cursor-pointer transition-all group"
          >
            <div className="p-2.5 rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400 group-hover:bg-jade-500 group-hover:text-white transition-all">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-ink-900 dark:text-white group-hover:text-jade-500 transition-colors">
                Support &amp; refunds
              </h4>
              <p className="text-xs text-ink-400 mt-0.5 leading-snug">
                Cancel an order, request a refund or open a ticket.
              </p>
            </div>
          </button>
        </div>
      </Card>
      </div>

      {/* Saved items — the same wishlist the header heart writes to */}
      <div id="panel-you-saved" role="tabpanel" hidden={section !== 'you-saved'}>
      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
            <Heart className="h-5 w-5 text-jade-600 dark:text-jade-400" />
            Saved items
            <Chip tone="neutral">{savedProducts.length}</Chip>
          </h2>
          <button
            type="button"
            onClick={() => onNavigate?.('marketplace')}
            className="text-xs font-bold text-jade-700 hover:underline dark:text-jade-300"
          >
            Browse more
          </button>
        </div>

        {savedProducts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500 dark:border-ink-700">
            Tap the heart on any listing to keep it here for later.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {savedProducts.map((product) => (
              <div
                key={product.id}
                className="group overflow-hidden rounded-2xl border border-ink-150 bg-white dark:border-ink-800 dark:bg-ink-900"
              >
                <button
                  type="button"
                  onClick={() => onNavigate?.('product', { id: product.id })}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-ink-100 dark:bg-ink-800">
                    <SmartImage
                      src={product.images?.[0]}
                      alt={product.title}
                      seed={`saved-${product.id}`}
                      className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 text-xs font-bold leading-snug text-ink-900 dark:text-white">
                      {product.title}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold text-ink-900 dark:text-white">
                      ₦{product.price.toLocaleString()}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => wishlist.toggle(product.id)}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-ink-100 py-2 text-[11px] font-bold text-ink-500 hover:text-red-600 dark:border-ink-800"
                >
                  <Heart className="h-3 w-3" /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      </div>

      {/* Your listings — visible only to accounts that can sell */}
      {canSell && (
        <div id="panel-you-listings" role="tabpanel" hidden={section !== 'you-listings'}>
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
              <Store className="h-5 w-5 text-jade-600 dark:text-jade-400" />
              Your listings
              <Chip tone="neutral">{sortedListings.length}</Chip>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate?.('dashboard')}
              className="inline-flex items-center gap-1 text-xs font-bold text-jade-700 hover:underline dark:text-jade-300"
            >
              Manage in Seller Hub <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {myListings.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-ink-200 px-4 py-5 dark:border-ink-700">
              <p className="text-sm text-ink-500">You have not published a listing yet.</p>
              <Button variant="secondary" onClick={() => onNavigate?.('dashboard')}>
                Create a listing
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-ink-100 dark:divide-ink-800">
              {sortedListings.slice(0, 8).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onNavigate?.('product', { id: product.id })}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
                    <SmartImage
                      src={product.images?.[0]}
                      alt={product.title}
                      seed={`listing-${product.id}`}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-ink-900 dark:text-white">{product.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-500">
                      ₦{product.price.toLocaleString()} · {product.quantity} in stock
                    </p>
                  </div>
                  <Chip tone={product.quantity > 0 ? 'jade' : 'outline'} className="shrink-0">
                    {product.stockStatus.replace(/_/g, ' ').toLowerCase()}
                  </Chip>
                </button>
              ))}
            </div>
          )}
        </Card>
        </div>
      )}

      {/* 2. Interactive Escrow Orders Tracking List */}
      <div id="panel-you-orders" role="tabpanel" hidden={section !== 'you-orders'}>
        <div className="space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
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

            {buyerOrders.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-1.5">
                <Filter className="mr-1 h-3.5 w-3.5 text-ink-400" />
                {([
                  { id: 'all', label: 'All', count: sortedOrders.length },
                  { id: 'active', label: 'Active', count: activeOrders.length },
                  { id: 'completed', label: 'Delivered', count: completedOrders.length },
                  { id: 'closed', label: 'Cancelled & refunds', count: closedOrders.length },
                ] as const).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={orderFilter === filter.id}
                    onClick={() => setOrderFilter(filter.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                      orderFilter === filter.id
                        ? 'border-jade-500 bg-jade-500/10 text-jade-700 dark:text-jade-300'
                        : 'border-ink-200 text-ink-500 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:text-ink-400'
                    }`}
                  >
                    {filter.label}
                    <span className="font-mono text-[10px] opacity-70">{filter.count}</span>
                  </button>
                ))}
              </div>
            )}

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
              visibleOrders.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500 dark:border-ink-700">
                  Nothing in this view. Switch the filter to see the rest of your orders.
                </p>
              ) : (
              <div className="space-y-4">
                {visibleOrders.map((order) => {
                  const isSelected = selectedOrderForPin === order.id;
                  
                  // Progress tracker helper variables
                  const isPaid = order.status === OrderStatus.PAID_ESCROW || order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.DELIVERED_SUCCESS;
                  const isShipped = order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.DELIVERED_SUCCESS;
                  const isOutForDelivery = order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.DELIVERED_SUCCESS;
                  const isDelivered = order.status === OrderStatus.DELIVERED_SUCCESS;
                  // Four long milestone labels cannot fit a phone width, so on
                  // small screens the rail names only the current stage.
                  const activeStepLabel = isDelivered
                    ? 'Funds released'
                    : isOutForDelivery
                    ? 'Buyer received'
                    : isShipped
                    ? 'Goods dispatched'
                    : isPaid
                    ? 'Payment confirmed'
                    : 'Awaiting deposit';

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
                          <span className="font-mono text-ink-500">{formatDate(order.createdAt)}</span>
                          {getStatusBadge(order.status)}
                        </div>
                      </div>

                      {/* Content details */}
                      <div className="flex gap-4 p-4">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-ink-100 dark:bg-ink-800">
                          <SmartImage
                            src={order.productImage}
                            alt={order.productTitle}
                            seed={`order-${order.id}`}
                            className="h-full w-full"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="truncate font-display text-sm font-bold text-ink-900 dark:text-white">{order.productTitle}</h4>
                          <p className="mt-1 font-mono text-sm font-bold text-ink-900 dark:text-white">
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
                          <div className="mb-4 flex items-center justify-between font-mono text-xs font-bold tracking-tight text-ink-400">
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
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                                  step.active 
                                    ? 'bg-jade-500 border-jade-500 text-white shadow-md shadow-jade-500/15' 
                                    : 'bg-white dark:bg-ink-900 border-ink-200 dark:border-ink-800 text-ink-400'
                                }`}>
                                  {step.active ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                                </div>
                                <span className={`mt-1.5 hidden whitespace-nowrap text-xs font-bold sm:block ${step.active ? 'text-jade-600 dark:text-jade-400' : 'text-ink-400'}`}>
                                  {step.label}
                                </span>
                              </div>
                            ))}
                          </div>

                          <p className="mt-3 text-center text-[11px] font-bold text-jade-600 sm:hidden dark:text-jade-400">
                            {activeStepLabel}
                          </p>
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

                        {order.hasGoodSaleProtect &&
                          [OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.PARTIAL_DEPOSIT_PAID, OrderStatus.DELIVERED_SUCCESS].includes(order.status) && (
                            <button
                              type="button"
                              onClick={() => {
                                const reason = window.prompt(
                                  'Describe the problem for your GoodSale Protect claim (15+ characters). Escrow stays protected while it is reviewed.'
                                );
                                if (!reason?.trim()) return;
                                void (async () => {
                                  const res = await fetch('/api/buyer-protection/claims', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ orderId: order.id, reason }),
                                  });
                                  const payload = await res.json().catch(() => ({}));
                                  if (!res.ok || !payload.success) {
                                    toast.error(payload.error || 'Could not file the protection claim');
                                    return;
                                  }
                                  toast.success(`Protection claim ${payload.claim?.reference || ''} is under priority review.`);
                                })();
                              }}
                              className="flex items-center gap-1.5 rounded-xl border border-jade-500/30 bg-jade-500/10 px-3.5 py-1.5 text-xs font-bold text-jade-700 transition-colors hover:bg-jade-500/15 dark:text-jade-300"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              GoodSale Protect claim
                            </button>
                          )}

                        {order.status === OrderStatus.PENDING && (
                          <button
                            onClick={() => {
                              dbOperations.payPendingOrder(order.id);
                              window.dispatchEvent(new Event('goodsale_db_state_change'));
                              toast.success(`Escrow funded: ₦${order.totalAmount.toLocaleString()} locked in escrow.`, 'Deposit complete');
                            }}
                            className="px-3.5 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-display font-bold text-xs tracking-tight rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
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
                              className="px-3.5 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-display font-bold text-xs tracking-tight rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
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
                              className={`px-3.5 py-1.5 font-display font-bold text-xs tracking-tight rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
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
                              className="px-3 py-1.5 bg-ink-100 hover:bg-ink-200 dark:bg-ink-800 dark:hover:bg-ink-700 text-ink-700 dark:text-white font-sans font-bold text-xs tracking-tight rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
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
                                className="px-3.5 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-display font-bold text-xs tracking-tight rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <Star className="star-filled h-3.5 w-3.5" />
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
                                <Star className={`w-5 h-5 transition-colors ${star <= reviewRating ? 'star-filled' : 'star-empty'}`} />
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
                              className="px-4 py-2 bg-jade-500 hover:bg-jade-600 text-white font-display font-semibold text-xs tracking-tight rounded-xl transition-all cursor-pointer shadow-sm shadow-jade-500/10"
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
                            hasLiveTracking(db.deliveryJobs.find((j) => j.orderId === order.id)) && (() => {
                              const job = db.deliveryJobs.find((j) => j.orderId === order.id);
                              const partner = job?.partnerId
                                ? db.deliveryPartners.find((p) => p.id === job.partnerId)
                                : undefined;
                              return (
                                <OrderTrackingCard
                                  order={order}
                                  job={job}
                                  partnerName={partner?.fullName}
                                  height="340px"
                                />
                              );
                            })()}

                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-950 rounded-2xl">
                            <div>
                              <span className="text-xs text-ink-400 tracking-tight font-mono font-bold block mb-0.5">My Delivery PIN Code</span>
                              <span className="text-xl font-mono font-bold tracking-widest text-ink-600 dark:text-ink-400">{order.deliveryPin}</span>
                            </div>

                            <p className="text-xs leading-relaxed text-ink-500 max-w-sm">
                              This is your secure escrow verification token. Hand this to the merchant/rider only after you have physically inspected the package and confirmed everything is correct.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-sans font-bold text-ink-500 dark:text-ink-400 tracking-tight">Confirm delivery manually (Enter 6-digit PIN)</label>
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
                                className="px-4 py-2 bg-jade-500 hover:bg-jade-600 text-white font-display font-semibold text-xs tracking-tight rounded-xl transition-all cursor-pointer"
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

                        if (!selectedLoc) {
                          return (
                            <div className="border-t border-ink-200 p-5 text-xs text-ink-500 dark:border-ink-800">
                              SafeMeet™ locations are not available in your area yet. Use the delivery PIN or contact support to arrange an alternative handover.
                            </div>
                          );
                        }

                        return (
                          <div className="border-t border-jade-200 dark:border-jade-50/20 p-5 bg-jade-500/[0.02] space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-display font-bold text-xs text-ink-800 dark:text-white tracking-tight flex items-center gap-1.5">
                                <Shield className="w-4 h-4 text-jade-500" />
                                GoodSale SafeMeet™ Portal
                              </h4>
                              <span className="text-xs font-bold text-jade-600 bg-jade-150/50 dark:bg-jade-950/40 px-2 py-0.5 rounded tracking-tight">
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
                                    <label className="text-xs font-sans font-bold text-ink-400 tracking-tight">Select Verified SafeZone</label>
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
                                    <label className="text-xs font-sans font-bold text-ink-400 tracking-tight">Scheduled Date & Time</label>
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
                                  <p className="font-semibold text-ink-800 dark:text-ink-200">{selectedLoc.name}</p>
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
                                  className="w-full py-2.5 bg-jade-600 hover:bg-jade-700 text-white rounded-xl text-xs font-bold tracking-tight cursor-pointer"
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
                                      <span className="text-xs font-mono font-bold text-jade-600 bg-jade-100 px-1.5 py-0.5 rounded tracking-tight">
                                        Zone Coordinates
                                      </span>
                                      <h5 className="font-bold text-ink-850 dark:text-white mt-1 text-xs">{selectedLoc.name}</h5>
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
                                        <p className="text-jade-600 dark:text-jade-400 font-semibold">
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
                                          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
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
                                          className="px-3 py-2 bg-jade-500/10 hover:bg-jade-500 text-jade-700 hover:text-white dark:text-jade-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
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
              )
            )}
          </Card>
        </div>
      </div>

      {/* Reviews — its own panel instead of being buried under the order list */}
      <div id="panel-you-reviews" role="tabpanel" hidden={section !== 'you-reviews'}>
        <Card className="p-6 sm:p-8">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                <Star className="star-filled h-5 w-5" />
                Reviews you&apos;ve written
                <Chip tone="neutral">{buyerReviews.length}</Chip>
              </h3>
              {buyerReviews.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1 font-mono text-xs font-bold text-ink-600 dark:border-ink-700 dark:text-ink-300">
                  <Star className="star-filled h-3.5 w-3.5" />
                  {(buyerReviews.reduce((sum, r) => sum + r.rating, 0) / buyerReviews.length).toFixed(1)} average given
                </span>
              )}
            </div>
            <p className="mb-4 text-sm text-ink-500">
              Ratings you leave feed the seller&apos;s public trust score — they are never editable after they post.
            </p>

            {buyerReviews.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink-200 px-4 py-10 text-center dark:border-ink-700">
                <Inbox className="mx-auto mb-2 h-8 w-8 text-ink-300 dark:text-ink-600" />
                <p className="text-sm font-bold text-ink-800 dark:text-ink-100">No reviews yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-500">
                  {completedOrders.length > 0
                    ? 'Your delivered orders are ready to rate — open one and tap Leave Review.'
                    : 'After an escrow delivery is confirmed you can rate the seller and earn +30 GP.'}
                </p>
                <Button
                  className="mt-4"
                  variant="secondary"
                  onClick={() => openSection('you-orders', completedOrders.length > 0 ? 'completed' : 'all')}
                >
                  <ReceiptText className="h-4 w-4" />
                  {completedOrders.length > 0 ? 'Rate a delivered order' : 'View your orders'}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedReviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-ink-100 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-800/40">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`h-3.5 w-3.5 ${s <= review.rating ? 'star-filled' : 'star-empty'}`}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-xs text-ink-400">{formatDate(review.createdAt)}</span>
                    </div>

                    <p className="font-sans text-xs italic leading-relaxed text-ink-700 dark:text-ink-300">&ldquo;{review.comment}&rdquo;</p>

                    {review.sellerReply && (
                      <div className="mt-2 rounded-r-lg border-l-2 border-ink-400 bg-ink-500/5 p-1.5 text-xs">
                        <span className="mb-0.5 block font-bold text-ink-600 dark:text-ink-400">Merchant reply</span>
                        <p className="font-medium text-ink-500 dark:text-ink-400">{review.sellerReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
        </Card>
      </div>

    </div>
  );
}
