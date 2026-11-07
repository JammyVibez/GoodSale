// components/SellerProfileView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Camera, Clock, Flag, Flame, Heart,
  Loader2, MapPin, MessageSquare, Package, Share2, Shield, ShieldCheck,
  ShoppingCart, Sparkles, Star, Store, Tag, Truck, UserCheck, UserPlus, Users,
} from 'lucide-react';
import {
  getDBState, dbOperations, UserRole,
  type GoodSaleDBState,
} from '../lib/store';
import { SmartAvatar, SmartImage } from './ui/SmartImage';
import Button from './ui/Button';
import Chip from './ui/Chip';
import { toast } from '@/lib/feedback';
import { uploadMedia } from '@/lib/upload';
import { computeSellerTrust } from '@/lib/trust';
import VerifiedBadge from '@/components/verification/VerifiedBadge';
import Dialog from '@/components/ui/Dialog';
import { isVerifiedSeller } from '@/lib/verification';

interface SellerProfileViewProps {
  sellerId: number;
  onBack: () => void;
  onNavigate: (view: string, payload?: any) => void;
  onAddToCart?: (productId: number) => void;
}

type StoreTab = 'home' | 'products' | 'reviews' | 'about';

const REPORT_REASONS = [
  'Counterfeit or fake listing',
  'Scam / refused to deliver',
  'Item not as described',
  'Abusive or unsafe behaviour',
  'Impersonating another store',
  'Something else',
];

/** Gold review stars — the one deliberate accent colour. */
function Stars({ rating, className = '' }: { rating: number; className?: string }) {
  const rounded = Math.round(rating);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${rating.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rounded ? 'star-filled' : 'star-empty'}`} />
      ))}
    </span>
  );
}

function conditionLabel(condition: string) {
  return String(condition).replace(/_/g, ' ').toLowerCase();
}

/** 2100 → "2.1k" — compact counts like the storefront reference. */
function compact(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}

function discountPercent(price: number, compareAt?: number) {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export default function SellerProfileView({
  sellerId,
  onBack,
  onNavigate,
  onAddToCart,
}: SellerProfileViewProps) {
  const [db, setDb] = useState<GoodSaleDBState>(getDBState());
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [activeTab, setActiveTab] = useState<StoreTab>('home');

  const coverInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleStateChange = () => setDb(getDBState());
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const seller = db.users.find((u) => u.id === sellerId);
  const profile = db.profiles.find((p) => p.userId === sellerId);
  const business = db.businesses.find((b) => b.ownerId === sellerId);
  const me = db.currentUser;
  const isOwner = !!me && me.id === sellerId;

  const trust = computeSellerTrust(db, sellerId);
  const sellerProducts = db.products.filter((p) => p.sellerId === sellerId);
  const sellerReviews = db.reviews.filter((r) => r.revieweeId === sellerId && r.rating > 0);
  const avgRating = sellerReviews.length
    ? sellerReviews.reduce((sum, r) => sum + r.rating, 0) / sellerReviews.length
    : 0;

  const isVerified = isVerifiedSeller({
    verificationStatus: profile?.verificationStatus,
    verificationExpiresAt: profile?.verificationExpiresAt,
  });

  // Verified+ is a paid seller membership. It is deliberately rendered as a
  // separate label from identity/business verification.
  const verifiedPlusUntil = db.verifiedPlusSubscriptions
    .filter((entry) => entry.userId === sellerId)
    .map((entry) => entry.expiresAt)
    .filter((expiresAt) => new Date(expiresAt).getTime() > Date.now())
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  useEffect(() => {
    if (business) {
      setFollowersCount(business.followers);
    } else {
      // Real followers from follower_relations — never fabricated.
      setFollowersCount(db.followerRelations.filter((f) => f.followedUserId === sellerId).length);
    }
    const current = db.currentUser;
    setIsFollowing(
      !!current &&
        db.followerRelations.some((f) => f.followerId === current.id && f.followedUserId === sellerId)
    );
  }, [sellerId, business, db.followerRelations, db.currentUser]);

  if (!seller) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center" id="seller-not-found">
        <Store className="mx-auto mb-4 h-10 w-10 text-ink-300" />
        <p className="text-sm text-ink-500">This storefront is no longer available.</p>
        <Button variant="outline" size="sm" className="mt-5" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to marketplace
        </Button>
      </div>
    );
  }

  const displayName = business?.name || seller.fullName;
  const cityLabel =
    [profile?.city, profile?.state].filter(Boolean).join(', ') ||
    [business?.city, business?.state].filter(Boolean).join(', ') ||
    'Nigeria';
  // A business banner is the storefront cover; a personal seller uses the
  // cover photo from their own profile.
  const coverUrl = business?.bannerUrl || profile?.coverUrl || '';
  const tagline = (business?.description || profile?.bio || '').split(/[.!?]/)[0]?.trim();

  const handleToggleFollow = () => {
    if (!me) {
      toast.info('Sign in to follow this store.');
      return;
    }
    const next = !isFollowing;
    setIsFollowing(next);
    if (next) {
      setFollowersCount((c) => c + 1);
      dbOperations.followSeller(me.id, sellerId, business?.id);
      toast.success(`You are now following ${displayName}.`);
    } else {
      setFollowersCount((c) => Math.max(0, c - 1));
      dbOperations.unfollowSeller(me.id, sellerId, business?.id);
      toast.info(`You unfollowed ${displayName}.`);
    }
  };

  const handleStartChat = async () => {
    if (!me) {
      toast.info('Sign in to message this store.');
      return;
    }
    const context = sellerProducts[0];
    if (!context) {
      toast.info('This store has no active listings to chat about yet.');
      return;
    }
    const roomId = await dbOperations.getOrCreateChatRoom(context.id);
    if (roomId) onNavigate('chats', { roomId });
    else toast.info('You cannot open a chat with your own store.');
  };

  /** Upload the storefront cover: image → /api/upload → store + Supabase. */
  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCover(true);
    try {
      const url = await uploadMedia(file, 'avatars');
      const res = await dbOperations.updateCoverPhoto(url, business ? 'BUSINESS' : 'USER');
      if ('error' in res && res.error) throw new Error(res.error);
      setDb(getDBState());
      toast.success('Cover photo updated.');
    } catch {
      toast.error('Cover upload failed. Try a smaller image.');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleShare = async () => {
    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/?store=${seller.username}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Storefront link copied.');
    } catch {
      toast.info(link);
    }
  };

  const submitReport = async () => {
    if (!me) {
      toast.info('Sign in to report a store.');
      return;
    }
    setSendingReport(true);
    const res = await dbOperations.createReport({
      targetType: 'USER',
      targetId: seller.id,
      targetLabel: displayName,
      reason: reportReason,
      details: reportDetails.trim(),
    });
    setSendingReport(false);
    if ('error' in res && res.error) {
      toast.error(res.error);
      return;
    }
    setReportOpen(false);
    setReportDetails('');
    toast.success('Report sent to GoodSale review.');
  };

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = favorites.includes(id);
    setFavorites((prev) => (next ? prev.filter((f) => f !== id) : [...prev, id]));
    toast.info(next ? 'Removed from saved items.' : 'Saved to your items.');
  };

  const topProducts = [...sellerProducts]
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    .slice(0, 4);

  const bestDiscount = sellerProducts.reduce(
    (max, p) => Math.max(max, discountPercent(p.price, p.compareAtPrice)),
    0
  );
  const discountedProducts = sellerProducts
    .filter((p) => discountPercent(p.price, p.compareAtPrice) > 0)
    .slice(0, 3);

  /** Reference-style product card: discount pill, heart, price, rating, cart. */
  const renderProductCard = (product: typeof sellerProducts[number]) => {
    const productReviews = db.reviews.filter((r) => r.productId === product.id && r.rating > 0);
    const productRating = productReviews.length
      ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
      : 0;
    const saved = favorites.includes(product.id);
    const off = discountPercent(product.price, product.compareAtPrice);

    return (
      <div
        key={product.id}
        onClick={() => onNavigate('product', { id: product.id })}
        className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-ink-150 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-jade-500/40 hover:shadow-lg dark:border-ink-800 dark:bg-ink-900"
      >
        <div className="relative aspect-square shrink-0 overflow-hidden bg-ink-100 dark:bg-ink-800">
          <SmartImage
            src={product.images?.[0]}
            alt={product.title}
            seed={`listing-${product.id}`}
            className="h-full w-full"
            imgClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {off > 0 && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-jade-700 px-2.5 py-1 text-[11px] font-black leading-none text-white shadow-sm">
              -{off}%
            </span>
          )}

          <button
            onClick={(e) => toggleFavorite(product.id, e)}
            title={saved ? 'Remove from saved' : 'Save item'}
            className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-ink-500 shadow-sm backdrop-blur-sm transition-colors hover:text-jade-600 dark:bg-ink-900/95 dark:text-ink-300 cursor-pointer"
          >
            <Heart className={`h-4 w-4 ${saved ? 'fill-jade-600 text-jade-600' : ''}`} />
          </button>

          {product.quantity > 0 && product.quantity <= 5 && (
            <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800 shadow-sm">
              Only {product.quantity} left
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-between gap-2 p-3">
          <div className="space-y-1.5">
            <h3 className="line-clamp-2 min-h-[2.4rem] text-sm font-semibold leading-snug text-ink-900 transition-colors group-hover:text-jade-700 dark:text-white dark:group-hover:text-jade-300">
              {product.title}
            </h3>

            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-base font-black tracking-tight text-jade-700 dark:text-jade-300">
                ₦{product.price.toLocaleString()}
              </span>
              {off > 0 && (
                <span className="text-[11px] font-medium text-ink-400 line-through">
                  ₦{Number(product.compareAtPrice).toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-ink-500 dark:text-ink-400">
              {productRating > 0 ? (
                <>
                  <Star className="star-filled h-3.5 w-3.5" />
                  <span className="font-bold text-ink-700 dark:text-ink-200">{productRating.toFixed(1)}</span>
                  <span>({compact(productReviews.length)})</span>
                </>
              ) : (
                <span className="text-ink-400">{conditionLabel(product.condition)} · no reviews yet</span>
              )}
            </div>
          </div>

          <div className="flex items-end justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onAddToCart) onAddToCart(product.id);
                else onNavigate('product', { id: product.id });
              }}
              title="Add to cart"
              className="grid h-9 w-9 place-items-center rounded-xl bg-jade-100 text-jade-700 transition-colors hover:bg-jade-200 dark:bg-jade-950 dark:text-jade-300 dark:hover:bg-jade-900 cursor-pointer"
            >
              <ShoppingCart className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="min-h-screen bg-white pb-24 transition-colors duration-300 dark:bg-ink-950"
      id={`seller-profile-${seller.id}`}
    >
      {/* ── Store banner ─────────────────────────────────────────────── */}
      <div className="relative h-44 w-full overflow-hidden bg-jade-950 sm:h-56">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${displayName} cover`}
            className="absolute inset-0 h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-jade-800 via-jade-900 to-jade-950" />
        )}

        {/* Gold aurora + ring, echoing the storefront reference */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full border-[10px] border-gold-400/25" />
          <div className="absolute -left-16 bottom-[-4rem] h-40 w-40 rounded-full bg-jade-500/25 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-jade-950/95 via-jade-950/45 to-jade-950/20" />
        </div>

        <button
          onClick={onBack}
          className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/90 px-3.5 py-2 text-xs font-bold text-ink-800 shadow-md backdrop-blur-md transition hover:bg-white dark:border-ink-800 dark:bg-ink-900/90 dark:text-ink-100 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <button
            onClick={handleShare}
            title="Share storefront"
            className="rounded-xl border border-white/20 bg-white/90 p-2.5 text-ink-800 shadow-md backdrop-blur-md transition hover:bg-white dark:border-ink-800 dark:bg-ink-900/90 dark:text-ink-100 cursor-pointer"
          >
            <Share2 className="h-4 w-4" />
          </button>
          {isOwner && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 bg-white/90 px-3 py-2.5 text-xs font-bold text-ink-800 shadow-md backdrop-blur-md transition hover:bg-white dark:border-ink-800 dark:bg-ink-900/90 dark:text-ink-100">
              {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              <span className="hidden sm:inline">{uploadingCover ? 'Uploading…' : 'Change cover'}</span>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleCoverFileChange}
              />
            </label>
          )}
        </div>

        <div className="absolute inset-x-4 bottom-14 z-10 sm:inset-x-6 sm:bottom-16 lg:mx-auto lg:max-w-6xl">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-black tracking-tight text-white drop-shadow-sm sm:text-3xl">
              {displayName}
            </h1>
            {isVerified && (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white/95" title="Verified by GoodSale">
                <BadgeCheck className="h-4 w-4 text-jade-700" />
              </span>
            )}
          </div>
          {tagline && (
            <p className="mt-1 max-w-md italic font-semibold text-gold-300">
              {tagline}
              <span className="not-italic text-gold-200/70">.</span>
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">

        {/* ── Identity row ──────────────────────────────────────────── */}
        <div className="relative -mt-10 flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 items-end gap-3">
            <div className="relative h-24 w-24 shrink-0 rounded-full border-4 border-white bg-ink-100 shadow-lg dark:border-ink-950 dark:bg-ink-800">
              <div className="h-full w-full overflow-hidden rounded-full">
                <SmartAvatar
                  src={business?.logoUrl || profile?.photoUrl}
                  name={displayName}
                  seed={seller.username}
                  className="h-full w-full"
                />
              </div>
              {isVerified && (
                <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow-sm dark:bg-ink-900">
                  <BadgeCheck className="h-5 w-5 text-jade-600" />
                </span>
              )}
            </div>

            <div className="min-w-0 pb-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate font-display text-lg font-black tracking-tight text-ink-900 dark:text-white sm:text-xl">
                  {displayName}
                </h2>
                {isVerified && (
                  <VerifiedBadge
                    sellerId={sellerId}
                    status={profile?.verificationStatus}
                    expiresAt={profile?.verificationExpiresAt}
                    fallbackName={displayName}
                  />
                )}
                {verifiedPlusUntil && (
                  <span
                    title={`Verified+ member until ${new Date(verifiedPlusUntil).toLocaleDateString('en-NG')}. Paid seller membership, not identity verification.`}
                    aria-label="Verified+ member. Paid seller membership, not identity verification."
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold-400/40 bg-gold-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold-700 dark:border-gold-300/25 dark:bg-gold-300/10 dark:text-gold-200"
                  >
                    <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                    Verified+ member
                  </span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500 dark:text-ink-400">
                <span className="font-semibold text-ink-600 dark:text-ink-300">
                  {business ? 'Official Store' : 'Seller Store'}
                </span>
                <span aria-hidden>•</span>
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{cityLabel}</span>
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs">
                <Star className="star-filled h-3.5 w-3.5" />
                <span className="font-bold text-ink-800 dark:text-ink-100">
                  {avgRating > 0 ? avgRating.toFixed(1) : 'New'}
                </span>
                <span className="text-ink-500 dark:text-ink-400">
                  {avgRating > 0 ? `(${compact(sellerReviews.length)} reviews)` : '— no reviews yet'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-1">
            {!isOwner ? (
              <>
                <button
                  onClick={handleStartChat}
                  title="Message store"
                  className="grid h-11 w-11 place-items-center rounded-full border border-ink-200 text-ink-600 transition-colors hover:border-jade-500 hover:text-jade-700 dark:border-ink-700 dark:text-ink-300 cursor-pointer"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
                <button
                  onClick={handleToggleFollow}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer ${
                    isFollowing
                      ? 'bg-ink-600 hover:bg-ink-700'
                      : 'bg-jade-800 hover:bg-jade-900'
                  }`}
                >
                  {isFollowing ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </>
            ) : (
              <button
                onClick={() => onNavigate('dashboard')}
                className="inline-flex items-center gap-2 rounded-full bg-jade-800 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-jade-900 cursor-pointer"
              >
                <Package className="h-4 w-4" /> Manage
              </button>
            )}
          </div>
        </div>

        {/* ── Store stats ───────────────────────────────────────────── */}
        <div className="mt-5 grid grid-cols-3 divide-x divide-ink-150 rounded-2xl bg-ink-50 py-3 dark:divide-ink-800 dark:bg-ink-900/60">
          <div className="flex items-center gap-2.5 px-3">
            <Package className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black leading-tight text-ink-900 dark:text-white">
                {compact(sellerProducts.length)}
              </p>
              <p className="truncate text-[10px] text-ink-500 dark:text-ink-400">Products</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3">
            <Users className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black leading-tight text-ink-900 dark:text-white">
                {compact(followersCount)}
              </p>
              <p className="truncate text-[10px] text-ink-500 dark:text-ink-400">Followers</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3">
            <Shield className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black leading-tight text-ink-900 dark:text-white">
                {trust.score}<span className="text-[10px] font-bold text-ink-400">/100</span>
              </p>
              <p className="truncate text-[10px] text-ink-500 dark:text-ink-400">{trust.bandLabel} · Trust</p>
            </div>
          </div>
        </div>

        {/* ── Trust strip ───────────────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-3 divide-x divide-ink-150 rounded-2xl border border-ink-150 bg-white py-3 dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center gap-2 px-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold leading-tight text-ink-900 dark:text-white">
                {isVerified ? 'Verified Seller' : 'Seller Store'}
              </p>
              <p className="text-[10px] leading-tight text-ink-500 dark:text-ink-400">
                {isVerified ? 'ID checked' : 'Onboarding'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3">
            <Truck className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold leading-tight text-ink-900 dark:text-white">Fast Delivery</p>
              <p className="text-[10px] leading-tight text-ink-500 dark:text-ink-400">Across Nigeria</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3">
            <ShieldCheck className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold leading-tight text-ink-900 dark:text-white">Escrow</p>
              <p className="text-[10px] leading-tight text-ink-500 dark:text-ink-400">Buyer protected</p>
            </div>
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <div className="mt-6 border-b border-ink-150 dark:border-ink-800">
          <div className="scrollbar-hide flex gap-7 overflow-x-auto">
            {([
              { id: 'home' as StoreTab, label: 'Store Home' },
              { id: 'products' as StoreTab, label: `All Products (${sellerProducts.length})` },
              { id: 'reviews' as StoreTab, label: `Reviews (${sellerReviews.length})` },
              { id: 'about' as StoreTab, label: 'About' },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`-mb-px shrink-0 border-b-2 py-3 text-sm font-bold transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-jade-700 text-jade-800 dark:border-jade-400 dark:text-jade-300'
                    : 'border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="py-6">

          {/* ── Store Home ─────────────────────────────────────────── */}
          {activeTab === 'home' && (
            <div className="space-y-8">
              {bestDiscount >= 5 && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-jade-800 via-jade-900 to-jade-950 px-5 py-6 text-white sm:px-8">
                  <div aria-hidden className="pointer-events-none absolute -right-8 -top-12 h-40 w-40 rounded-full border-[8px] border-gold-400/25" />
                  <div aria-hidden className="pointer-events-none absolute -bottom-10 left-1/3 h-32 w-32 rounded-full bg-gold-400/10 blur-2xl" />

                  <div className="relative z-10 flex items-center justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-200">
                        <Tag className="h-3 w-3" /> Selected items
                      </span>
                      <p className="mt-2 text-sm font-semibold text-white/90">Up to</p>
                      <p className="font-display text-3xl font-black leading-none text-gold-300">
                        {bestDiscount}% OFF
                      </p>
                      <button
                        onClick={() => setActiveTab('products')}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-300 px-4 py-2 text-xs font-black text-jade-950 transition-colors hover:bg-gold-200 cursor-pointer"
                      >
                        Shop Now <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="hidden shrink-0 items-center gap-2 sm:flex">
                      {discountedProducts.map((p) => (
                        <div
                          key={p.id}
                          className="h-20 w-16 overflow-hidden rounded-xl border border-white/15 bg-white/5"
                        >
                          <SmartImage
                            src={p.images?.[0]}
                            alt={p.title}
                            seed={`promo-${p.id}`}
                            className="h-full w-full"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 font-display text-lg font-black tracking-tight text-ink-900 dark:text-white">
                    <Flame className="h-5 w-5 text-gold-500" />
                    Top Products
                  </h2>
                  <button
                    onClick={() => setActiveTab('products')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-jade-700 hover:underline dark:text-jade-300 cursor-pointer"
                  >
                    See All <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {sellerProducts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ink-200 p-10 text-center dark:border-ink-800">
                    <Store className="mx-auto mb-3 h-8 w-8 text-ink-300" />
                    <p className="text-sm text-ink-500">
                      {isOwner
                        ? 'You have no active listings yet — add one from your seller dashboard.'
                        : 'This store has no active listings right now. Follow it to hear when stock lands.'}
                    </p>
                    {isOwner && (
                      <Button size="sm" className="mt-4" onClick={() => onNavigate('dashboard')}>
                        <Package className="h-4 w-4" /> Add a listing
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" id="seller-top-products">
                    {topProducts.map(renderProductCard)}
                  </div>
                )}
              </div>

              {business?.description && (
                <div className="rounded-2xl border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                  <h2 className="text-sm font-bold text-ink-900 dark:text-white">About {business.name}</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                    {business.description}
                  </p>
                  <button
                    onClick={() => setActiveTab('about')}
                    className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-jade-700 hover:underline dark:text-jade-300 cursor-pointer"
                  >
                    More about this store <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── All Products ──────────────────────────────────────── */}
          {activeTab === 'products' && (
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white">
                  All Products
                  <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                    {sellerProducts.length}
                  </span>
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-100 px-3 py-1.5 text-[11px] font-bold text-jade-800 dark:bg-jade-950 dark:text-jade-200">
                  <Shield className="h-3.5 w-3.5" /> Every order escrow protected
                </span>
              </div>

              {sellerProducts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-ink-200 p-10 text-center dark:border-ink-800">
                  <Store className="mx-auto mb-3 h-8 w-8 text-ink-300" />
                  <p className="text-sm text-ink-500">No listings yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" id="seller-listings-grid">
                  {sellerProducts.map(renderProductCard)}
                </div>
              )}
            </div>
          )}

          {/* ── Reviews ───────────────────────────────────────────── */}
          {activeTab === 'reviews' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                <div className="text-center">
                  <p className="font-display text-4xl font-black text-ink-900 dark:text-white">
                    {avgRating > 0 ? avgRating.toFixed(1) : '—'}
                  </p>
                  <Stars rating={avgRating} className="mt-1 justify-center" />
                  <p className="mt-1 text-[11px] text-ink-400">{sellerReviews.length} store reviews</p>
                </div>
                <div className="border-l border-ink-150 pl-4 text-xs leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
                  Every rating below comes from a completed escrow order — sellers cannot edit or delete reviews.
                </div>
              </div>

              {sellerReviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-ink-200 p-10 text-center dark:border-ink-800">
                  <Star className="mx-auto mb-3 h-8 w-8 text-ink-300" />
                  <p className="text-sm text-ink-500">No reviews yet. Buyers can review after delivery.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sellerReviews.map((rev) => (
                    <div key={rev.id} className="rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                            <SmartAvatar src={rev.reviewerPhoto} name={rev.reviewerName} className="h-full w-full" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-ink-900 dark:text-white">{rev.reviewerName}</p>
                            <p className="text-[11px] text-ink-400">
                              {new Date(rev.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <Stars rating={rev.rating} />
                      </div>
                      <p className="mt-2.5 text-xs leading-relaxed text-ink-700 dark:text-ink-300">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── About ─────────────────────────────────────────────── */}
          {activeTab === 'about' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                <h2 className="text-sm font-bold text-ink-900 dark:text-white">About this store</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  {business?.description ||
                    profile?.bio ||
                    'Selling on GoodSale with escrow-protected checkout, tracked delivery and buyer protection on every order.'}
                </p>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                    <MapPin className="h-4 w-4 shrink-0 text-jade-600" />
                    <p className="text-xs text-ink-600 dark:text-ink-300">
                      {business?.address ? `${business.address}, ` : ''}{cityLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                    <Clock className="h-4 w-4 shrink-0 text-jade-600" />
                    <p className="text-xs text-ink-600 dark:text-ink-300">
                      {business?.openingHours ? `Open ${business.openingHours}` : 'In-app support on every order.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                    <Truck className="h-4 w-4 shrink-0 text-jade-600" />
                    <p className="text-xs text-ink-600 dark:text-ink-300">
                      GoodDispatch delivery or pickup in {cityLabel}.
                    </p>
                  </div>
                </div>

                {!isOwner && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleStartChat}>
                      <MessageSquare className="h-4 w-4 text-jade-500" /> Message store
                    </Button>
                    <button
                      onClick={() => setReportOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 px-3.5 py-2 text-xs font-bold text-ink-500 transition hover:border-ink-300 hover:text-ink-700 dark:border-ink-800 dark:text-ink-400 cursor-pointer"
                    >
                      <Flag className="h-4 w-4" /> Report store
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                <div className="flex flex-wrap items-center gap-2">
                  <Shield className={`h-4 w-4 ${isVerified ? 'text-jade-600' : 'text-ink-400'}`} />
                  <h2 className="text-sm font-bold text-ink-900 dark:text-white">Verification</h2>
                  {isVerified ? (
                    <Chip tone="jade" icon={<Shield className="h-3 w-3" />}>Verified</Chip>
                  ) : (
                    <span className="rounded-full border border-ink-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-700 dark:text-ink-400">
                      Not verified
                    </span>
                  )}
                </div>

                {isVerified ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      This store passed GoodSale verification and shows the badge across the marketplace.
                    </p>
                    <VerifiedBadge
                      sellerId={sellerId}
                      status={profile?.verificationStatus}
                      expiresAt={profile?.verificationExpiresAt}
                      variant="pill"
                      fallbackName={displayName}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                    {isOwner
                      ? 'Your store has not completed GoodSale verification yet. Apply from the Verification Center — a reviewer checks every document before the badge is issued.'
                      : 'This store has not completed GoodSale verification. Keep payments inside GoodSale escrow for protection.'}
                  </p>
                )}

                {!isVerified && isOwner && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => {
                      if (!me) {
                        toast.info('Sign in to apply for verification.');
                        return;
                      }
                      onNavigate('verification');
                    }}
                  >
                    <Shield className="h-4 w-4" />
                    Open Verification Center
                  </Button>
                )}

                {isOwner && (
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => onNavigate('dashboard')}>
                    <Package className="h-4 w-4" /> Manage listings
                  </Button>
                )}
              </div>

              <div className="rounded-2xl border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-jade-600 dark:text-jade-400" />
                    <h2 className="text-sm font-bold text-ink-900 dark:text-white">Seller Trust Score</h2>
                    <Chip tone="jade">{trust.score}/100 · {trust.bandLabel}</Chip>
                  </div>
                  <button
                    onClick={() => onNavigate('trust-safety')}
                    className="text-[11px] font-bold text-jade-700 hover:text-jade-600 dark:text-jade-300 cursor-pointer"
                  >
                    How this is calculated →
                  </button>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  Calculated from live marketplace records — never edited by the seller.
                </p>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {trust.factors.map((factor) => (
                    <div key={factor.key} className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-950">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-ink-700 dark:text-ink-200">{factor.label}</span>
                        <span className="tabular-nums text-ink-500 dark:text-ink-400">{factor.points}/{factor.weight}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                        <div className="h-full rounded-full bg-jade-500" style={{ width: `${(factor.points / factor.weight) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-ink-400">{factor.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Report store dialog ─────────────────────────────────────── */}
      <Dialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Report ${displayName}`}
        description="Reports go straight to GoodSale admins for triage. False reports can affect your account."
      >
        <div className="space-y-3">
          <label className="block text-xs font-bold text-ink-700 dark:text-ink-200">
            Reason
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs text-ink-800 focus:border-jade-500 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
            >
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-bold text-ink-700 dark:text-ink-200">
            What happened? <span className="font-medium text-ink-400">(optional)</span>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              placeholder="Share order numbers, dates or links so the admin can verify quickly."
              className="mt-1.5 w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs text-ink-800 placeholder:text-ink-400 focus:border-jade-500 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
            />
          </label>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button variant="secondary" className="flex-1" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" loading={sendingReport} onClick={submitReport}>
              <Flag className="h-4 w-4" /> Send report
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
