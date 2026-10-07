// components/SellerProfileView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, BadgeCheck, Camera, Clock, Flag, Heart, Loader2,
  MapPin, MessageSquare, Package, Share2, Shield, Star, Store, Truck,
  UserCheck, UserPlus, X,
} from 'lucide-react';
import {
  getDBState, dbOperations, UserRole, VerificationKind, VerificationStatus,
  type GoodSaleDBState,
} from '../lib/store';
import { SmartAvatar, SmartImage } from './ui/SmartImage';
import Button from './ui/Button';
import Chip from './ui/Chip';
import Card from './ui/Card';
import { toast } from '@/lib/feedback';
import { uploadMedia } from '@/lib/upload';

interface SellerProfileViewProps {
  sellerId: number;
  onBack: () => void;
  onNavigate: (view: string, payload?: any) => void;
}

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

export default function SellerProfileView({
  sellerId,
  onBack,
  onNavigate,
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

  const sellerProducts = db.products.filter((p) => p.sellerId === sellerId);
  const sellerReviews = db.reviews.filter((r) => r.revieweeId === sellerId && r.rating > 0);
  const avgRating = sellerReviews.length
    ? sellerReviews.reduce((sum, r) => sum + r.rating, 0) / sellerReviews.length
    : 0;

  const isVerified = !!seller
    ? seller.role === UserRole.VERIFIED_SELLER || seller.role === UserRole.VERIFIED_BUSINESS
    : false;

  const applications = db.verifications.filter(
    (v) =>
      v.userId === sellerId &&
      (v.applicationKind === VerificationKind.SELLER || v.applicationKind === VerificationKind.BUSINESS)
  );
  const latestApplication = [...applications].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  )[0];

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

  return (
    <div
      className="min-h-screen bg-ink-50 pb-20 transition-colors duration-300 dark:bg-ink-950"
      id={`seller-profile-${seller.id}`}
    >
      {/* ── Cover banner ─────────────────────────────────────────────── */}
      <div className="relative h-52 w-full overflow-hidden bg-ink-900 sm:h-72">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${displayName} cover`}
            className="absolute inset-0 h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-jade-950" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/25 to-transparent" />

        <button
          onClick={onBack}
          className="absolute left-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/90 px-3.5 py-2 text-xs font-bold text-ink-800 shadow-md backdrop-blur-md transition hover:bg-white dark:border-ink-800 dark:bg-ink-900/90 dark:text-ink-100 dark:hover:bg-ink-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
          <button
            onClick={handleShare}
            title="Share storefront"
            className="rounded-xl border border-white/20 bg-white/90 p-2.5 text-ink-800 shadow-md backdrop-blur-md transition hover:bg-white dark:border-ink-800 dark:bg-ink-900/90 dark:text-ink-100 dark:hover:bg-ink-900"
          >
            <Share2 className="h-4 w-4" />
          </button>
          {isOwner && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/20 bg-white/90 px-3.5 py-2.5 text-xs font-bold text-ink-800 shadow-md backdrop-blur-md transition hover:bg-white dark:border-ink-800 dark:bg-ink-900/90 dark:text-ink-100 dark:hover:bg-ink-900">
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

        <div className="absolute inset-x-4 bottom-5 z-10 flex flex-wrap items-center gap-2 sm:inset-x-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <Shield className="h-3.5 w-3.5 text-jade-300" /> Escrow protected
          </span>
          {avgRating > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
              <Star className="star-filled h-3.5 w-3.5" />
              {avgRating.toFixed(1)}
              <span className="text-white/70">({sellerReviews.length})</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <MapPin className="h-3.5 w-3.5 text-jade-300" /> {cityLabel}
          </span>
        </div>
      </div>

      {/* ── Storefront body ─────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto -mt-16 max-w-7xl px-4 sm:px-6 lg:-mt-20 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">

          {/* Vendor card */}
          <div className="space-y-5 lg:col-span-4">
            <Card className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-ink-100 shadow-lg dark:border-ink-900 dark:bg-ink-800">
                  <SmartAvatar
                    src={business?.logoUrl || profile?.photoUrl}
                    name={displayName}
                    seed={seller.username}
                    className="h-full w-full"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                  <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-ink-900 dark:text-white">
                    {displayName}
                  </h1>
                  {isVerified && (
                    <BadgeCheck className="h-5 w-5 text-jade-500" aria-label="Verified by GoodSale" />
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-400">@{seller.username}</p>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  <Chip tone="jade" icon={<Shield className="h-3.5 w-3.5" />}>
                    Trust {seller.trustScore}%
                  </Chip>
                  <Chip tone="neutral">{String(seller.sellerLevel).toLowerCase()} tier</Chip>
                </div>

                {isVerified ? (
                  <p className="mt-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                    {seller.role === UserRole.VERIFIED_BUSINESS ? 'Verified business' : 'Verified seller'} —
                    identity and documents checked by GoodSale.
                  </p>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-ink-400">
                    Not yet verified by GoodSale.
                  </p>
                )}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 border-y border-ink-100 py-4 text-center dark:border-ink-800">
                <div>
                  <p className="text-base font-bold text-ink-900 dark:text-white">{sellerProducts.length}</p>
                  <p className="text-[0.65rem] text-ink-400">Listings</p>
                </div>
                <div className="border-x border-ink-100 dark:border-ink-800">
                  <p className="text-base font-bold text-ink-900 dark:text-white">{followersCount}</p>
                  <p className="text-[0.65rem] text-ink-400">Followers</p>
                </div>
                <div>
                  <p className="text-base font-bold text-gold-500">
                    {avgRating > 0 ? avgRating.toFixed(1) : '—'}
                  </p>
                  <p className="text-[0.65rem] text-ink-400">Rating</p>
                </div>
              </div>

              <div className="mt-5">
                <h2 className="text-xs font-bold text-ink-900 dark:text-white">About this store</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  {business?.description ||
                    profile?.bio ||
                    'Selling on GoodSale with escrow-protected checkout, tracked delivery and buyer protection on every order.'}
                </p>
              </div>

              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                  <Shield className="h-4 w-4 shrink-0 text-jade-500" />
                  <p className="text-xs text-ink-600 dark:text-ink-300">
                    Funds held in escrow until you confirm delivery.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                  <Truck className="h-4 w-4 shrink-0 text-jade-500" />
                  <p className="text-xs text-ink-600 dark:text-ink-300">
                    GoodDispatch delivery or pickup in {cityLabel}.
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                  <Clock className="h-4 w-4 shrink-0 text-jade-500" />
                  <p className="text-xs text-ink-600 dark:text-ink-300">
                    {business?.openingHours ? `Open ${business.openingHours}` : 'In-app support on every order.'}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                {!isOwner && (
                  <>
                    <Button
                      variant={isFollowing ? 'secondary' : 'primary'}
                      className="w-full"
                      onClick={handleToggleFollow}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="h-4 w-4" /> Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" /> Follow store
                        </>
                      )}
                    </Button>
                    <Button variant="outline" className="w-full" onClick={handleStartChat}>
                      <MessageSquare className="h-4 w-4 text-jade-500" /> Message store
                    </Button>
                    <button
                      onClick={() => setReportOpen(true)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-ink-200 px-4 py-2.5 text-xs font-bold text-ink-500 transition hover:border-ink-300 hover:text-ink-700 dark:border-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
                    >
                      <Flag className="h-4 w-4" /> Report this store
                    </button>
                  </>
                )}
                {isOwner && (
                  <Button variant="outline" className="w-full" onClick={() => onNavigate('dashboard')}>
                    <Package className="h-4 w-4" /> Manage listings
                  </Button>
                )}
              </div>
            </Card>

            {/* Verification status — sellers and businesses apply, admin approves */}
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <BadgeCheck className={`h-4 w-4 ${isVerified ? 'text-jade-500' : 'text-ink-300'}`} />
                <h2 className="text-xs font-bold text-ink-900 dark:text-white">Verification</h2>
              </div>

              {isVerified ? (
                <p className="mt-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  This store passed GoodSale verification and shows the badge across the marketplace.
                </p>
              ) : latestApplication ? (
                <div className="mt-2 space-y-1.5">
                  <Chip
                    tone={latestApplication.status === VerificationStatus.REJECTED ? 'outline' : 'neutral'}
                  >
                    {latestApplication.status === VerificationStatus.PENDING
                      ? 'Under review by GoodSale'
                      : latestApplication.status === VerificationStatus.APPROVED
                        ? 'Approved'
                        : 'Not approved'}
                  </Chip>
                  <p className="text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                    {latestApplication.status === VerificationStatus.PENDING
                      ? `Submitted ${new Date(latestApplication.createdAt).toLocaleDateString()} — an admin is checking the ${latestApplication.documents?.length || 1} document(s) you uploaded.`
                      : latestApplication.rejectionReason
                        ? `Reason: ${latestApplication.rejectionReason}`
                        : 'You can submit a new application with updated documents.'}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  {business
                    ? 'Apply for the verified business badge with your CAC, ID and proof of address.'
                    : 'Apply for the verified seller badge with your ID, selfie and proof of address.'}
                </p>
              )}

              {!isVerified && (isOwner || !latestApplication) && (
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
                  <BadgeCheck className="h-4 w-4" />
                  {latestApplication && latestApplication.status === VerificationStatus.REJECTED
                    ? 'Re-apply with new documents'
                    : 'Apply for verification'}
                </Button>
              )}
            </Card>
          </div>

          {/* Listings column */}
          <div className="space-y-6 lg:col-span-8">

            {/* Business identity strip */}
            {business && (
              <Card className="overflow-hidden">
                <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-800">
                      {business.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={business.logoUrl}
                          alt={business.name}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center">
                          <Store className="h-6 w-6 text-ink-300" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                          {business.name}
                        </h2>
                        {isVerified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-jade-500/10 px-2 py-0.5 text-[0.65rem] font-bold text-jade-700 dark:text-jade-300">
                            <BadgeCheck className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                        {business.description}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-ink-50 px-2.5 py-1.5 dark:bg-ink-800/50">
                          <Store className="h-3.5 w-3.5 text-jade-500" />
                          {business.address ? `${business.address}, ${business.city}` : business.city}
                        </span>
                        {business.openingHours && (
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-ink-50 px-2.5 py-1.5 dark:bg-ink-800/50">
                            <Clock className="h-3.5 w-3.5 text-jade-500" />
                            {business.openingHours}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 rounded-xl bg-ink-50 px-2.5 py-1.5 dark:bg-ink-800/50">
                          <UserPlus className="h-3.5 w-3.5 text-jade-500" />
                          {followersCount} followers
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-2xl border border-ink-100 px-4 py-3 text-center dark:border-ink-800">
                    <div className="flex items-center justify-center gap-1">
                      <Stars rating={business.rating || avgRating} />
                    </div>
                    <p className="mt-1.5 text-xs font-bold text-ink-700 dark:text-ink-200">
                      {(business.rating || avgRating || 0).toFixed(1)} <span className="font-medium text-ink-400">/ 5</span>
                    </p>
                    <p className="text-[0.65rem] text-ink-400">{business.reviewsCount} store reviews</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Listings */}
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                  <Package className="h-4 w-4 text-jade-500" />
                  Listings from {displayName}
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                    {sellerProducts.length}
                  </span>
                </h2>
                <Chip tone="jade" icon={<Shield className="h-3.5 w-3.5" />}>
                  Every order escrow protected
                </Chip>
              </div>

              {sellerProducts.length === 0 ? (
                <Card className="p-12 text-center">
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
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" id="seller-listings-grid">
                  {sellerProducts.map((product) => {
                    const productReviews = db.reviews.filter(
                      (r) => r.productId === product.id && r.rating > 0
                    );
                    const productRating = productReviews.length
                      ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
                      : 0;
                    const saved = favorites.includes(product.id);

                    return (
                      <div
                        key={product.id}
                        onClick={() => onNavigate('product', { id: product.id })}
                        className="group flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-ink-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-jade-500/40 hover:shadow-lg dark:border-ink-800 dark:bg-ink-900 dark:hover:border-jade-500/30"
                      >
                        {/* Image */}
                        <div className="relative aspect-square shrink-0 overflow-hidden border-b border-ink-100 bg-ink-100 dark:border-ink-800 dark:bg-ink-800">
                          <SmartImage
                            src={product.images?.[0]}
                            alt={product.title}
                            seed={`listing-${product.id}`}
                            className="h-full w-full"
                            imgClassName="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />

                          <span className="absolute left-2.5 top-2.5 rounded-lg bg-ink-900/85 px-2 py-0.5 text-[0.65rem] font-semibold text-white backdrop-blur-sm">
                            {conditionLabel(product.condition)}
                          </span>

                          <button
                            onClick={(e) => toggleFavorite(product.id, e)}
                            title={saved ? 'Remove from saved' : 'Save item'}
                            className="absolute right-2.5 top-2.5 rounded-full bg-white/95 p-1.5 text-ink-500 shadow-sm backdrop-blur-sm transition-colors hover:text-jade-600 dark:bg-ink-900/95 dark:text-ink-300"
                          >
                            <Heart className={`h-3.5 w-3.5 ${saved ? 'fill-jade-500 text-jade-500' : ''}`} />
                          </button>

                          {product.quantity !== undefined && product.quantity > 0 && product.quantity <= 5 && (
                            <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-jade-500 px-2 py-0.5 text-[0.65rem] font-semibold text-white shadow-sm">
                              Only {product.quantity} left
                            </span>
                          )}

                          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-lg border border-jade-500/20 bg-ink-900/90 px-1.5 py-0.5 text-[0.65rem] font-medium text-jade-400 backdrop-blur-md">
                            <Shield className="h-2.5 w-2.5" /> Escrow
                          </span>
                        </div>

                        {/* Details */}
                        <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                          <div className="space-y-2">
                            <p className="text-[0.7rem] font-semibold text-ink-400">{product.category}</p>
                            <h3 className="line-clamp-2 min-h-[2.6rem] font-display text-sm font-bold leading-snug tracking-tight text-ink-900 transition-colors group-hover:text-jade-600 dark:text-white dark:group-hover:text-jade-400">
                              {product.title}
                            </h3>

                            <div className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
                              {productRating > 0 ? (
                                <>
                                  <Stars rating={productRating} />
                                  <span className="font-bold text-ink-700 dark:text-ink-200">
                                    {productRating.toFixed(1)}
                                  </span>
                                  <span className="text-ink-400">({productReviews.length})</span>
                                </>
                              ) : (
                                <span className="text-ink-400">No reviews yet</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 text-xs text-ink-400">
                              <MapPin className="h-3 w-3 shrink-0 text-jade-500" />
                              <span className="truncate">{profile?.city || business?.city || 'Nigeria'}</span>
                              {product.pickupAvailable && <span className="shrink-0">· pickup</span>}
                            </div>
                          </div>

                          <div className="flex items-end justify-between gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
                            <div>
                              <p className="text-[0.65rem] font-medium text-ink-400">Escrow price</p>
                              <p className="font-display text-lg font-bold leading-none tracking-tight text-ink-900 dark:text-white">
                                ₦{product.price.toLocaleString()}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-jade-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition group-hover:bg-jade-600">
                              View listing
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Report store dialog ─────────────────────────────────────── */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-6 shadow-2xl animate-fade-in-scale dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                  Report {displayName}
                </h2>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  Reports go straight to GoodSale admins for triage. False reports can affect your account.
                </p>
              </div>
              <button
                onClick={() => setReportOpen(false)}
                className="rounded-xl p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
                aria-label="Close report dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-4 block text-xs font-bold text-ink-700 dark:text-ink-200">Reason</label>
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

            <label className="mt-3 block text-xs font-bold text-ink-700 dark:text-ink-200">
              What happened? <span className="font-medium text-ink-400">(optional)</span>
            </label>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              placeholder="Share order numbers, dates or links so the admin can verify quickly."
              className="mt-1.5 w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs text-ink-800 placeholder:text-ink-400 focus:border-jade-500 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
            />

            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setReportOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" className="flex-1" loading={sendingReport} onClick={submitReport}>
                <Flag className="h-4 w-4" /> Send report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
