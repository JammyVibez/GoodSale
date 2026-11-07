// components/ProductDetailView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Shield, ShieldCheck, MapPin, MessageSquare,
  ShoppingCart, Star, Zap, Clock, Award, Tag, Send,
  Bell, BellOff, Check, ThumbsUp, CornerDownRight, X,
  Share2, Sparkles, Play, Truck, RotateCcw, ChevronRight, Flame
} from 'lucide-react';
import {
  UserRole, getDBState, saveDBState, dbOperations
} from '../lib/store';
import { SmartAvatar, SmartImage } from './ui/SmartImage';
import { toast } from '@/lib/feedback';
import { trackProductMetric } from '@/lib/productMetrics';
import { computeSellerTrust } from '@/lib/trust';
import VerifiedBadge, { VerifiedMark } from '@/components/verification/VerifiedBadge';
import { isVerifiedSeller } from '@/lib/verification';
import { activeFlashSale } from '@/lib/productPricing';
import AdSlot from './AdSlot';

interface ProductDetailViewProps {
  productId: number;
  onBack: () => void;
  onNavigate: (view: string, payload?: any) => void;
  onAddToCart: (productId: number) => void;
  onOpenAuth?: () => void;
}

type DetailTab = 'overview' | 'specs' | 'reviews' | 'qa';

export default function ProductDetailView({
  productId,
  onBack,
  onNavigate,
  onAddToCart,
  onOpenAuth,
}: ProductDetailViewProps) {
  const [db, setDb] = useState(getDBState());
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [negotiateOffer, setNegotiateOffer] = useState('');
  const [showNegotiateDrawer, setShowNegotiateDrawer] = useState(false);

  // Interactive Hover Zoom state
  const [isZooming, setIsZooming] = useState(false);
  const [zoomCoords, setZoomCoords] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomCoords({ x, y });
  };

  // Auction specific bidding states
  const [customBidAmount, setCustomBidAmount] = useState('');
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSuccess, setBidSuccess] = useState(false);

  // Price Drop Alert States
  const [isAlertSubscribed, setIsAlertSubscribed] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState('');
  const [showThresholdForm, setShowThresholdForm] = useState(false);
  const [priceAlertsList, setPriceAlertsList] = useState<{productId: number, threshold: number}[]>([]);

  // Auction countdown states
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isAuctionEnded, setIsAuctionEnded] = useState<boolean>(false);

  // Comments, Q&A, and Reviews States
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentRating, setNewCommentRating] = useState(5); // 0 means just question/comment, 1-5 means rating review
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [activeReviewFilter, setActiveReviewFilter] = useState<'all' | 'verified' | 'qa'>('all');
  const [replyingToReviewId, setReplyingToReviewId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [reviewSubmitFeedback, setReviewSubmitFeedback] = useState<string | null>(null);

  // Gemini AI Security Tip Banner States
  const [securityTip, setSecurityTip] = useState<{ badgeTitle: string; tip: string; threatLevel: string } | null>(null);
  const [loadingTip, setLoadingTip] = useState(false);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  // Fetch security tip contextually from Gemini API
  useEffect(() => {
    const targetProduct = db.products.find(p => p.id === productId);
    if (!targetProduct) return;

    setLoadingTip(true);
    fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'security_tip',
        payload: {
          category: targetProduct.category,
          title: targetProduct.title
        }
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.tipData) {
        setSecurityTip(data.tipData);
      }
    })
    .catch(err => {
      console.error('Failed to fetch Gemini security tip:', err);
    })
    .finally(() => {
      setLoadingTip(false);
    });
  }, [productId, db.products]);

  // Initialize and load price drop alerts for this product
  useEffect(() => {
    try {
      const saved = localStorage.getItem('goodsale_price_alerts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setPriceAlertsList(parsed);
          const activeSub = parsed.find((item: any) => item.productId === productId);
          if (activeSub) {
            setIsAlertSubscribed(true);
            setAlertThreshold(activeSub.threshold?.toString() || '');
          } else {
            setIsAlertSubscribed(false);
            setAlertThreshold('');
          }
        }
      } else {
        setIsAlertSubscribed(false);
        setAlertThreshold('');
      }
    } catch (e) {
      console.error('Failed to load price alerts:', e);
    }
  }, [productId, db.products]); // depend on products in case price changes

  const togglePriceAlert = (customThreshold?: number) => {
    const targetProduct = db.products.find(p => p.id === productId);
    if (!targetProduct) return;

    let newList = [...priceAlertsList];
    const index = newList.findIndex(item => item.productId === productId);

    if (index >= 0) {
      // Unsubscribe
      newList.splice(index, 1);
      setIsAlertSubscribed(false);
      setAlertThreshold('');
    } else {
      // Subscribe
      const thresholdVal = customThreshold || targetProduct.price;
      newList.push({ productId, threshold: thresholdVal });
      setIsAlertSubscribed(true);
      setAlertThreshold(thresholdVal.toString());
    }
    setPriceAlertsList(newList);
    localStorage.setItem('goodsale_price_alerts', JSON.stringify(newList));

    // Dispatch standard custom event
    window.dispatchEvent(new Event('goodsale_price_alerts_change'));
  };

  const product = db.products.find(p => p.id === productId);
  const seller = product ? db.users.find(u => u.id === product.sellerId) : null;
  const sellerProfile = product ? db.profiles.find(p => p.userId === product.sellerId) : null;
  const business = (product && product.businessId) ? db.businesses.find(b => b.id === product.businessId) : null;
  const isSellerVerified = isVerifiedSeller({
    verificationStatus: sellerProfile?.verificationStatus,
    verificationExpiresAt: sellerProfile?.verificationExpiresAt,
  });
  const sellerTrust = product ? computeSellerTrust(db, product.sellerId) : null;

  // Auction metadata
  const auction = (product && product.isAuction) ? db.auctions.find(a => a.productId === product.id) : null;
  const bids = auction ? db.bids.filter(b => b.auctionId === auction.id).sort((a,b) => b.amount - a.amount) : [];
  const currentHighestBid = bids.length > 0 ? bids[0].amount : (auction?.startingBid || 0);

  // Record a unique listing view for seller analytics (best-effort, never blocking).
  useEffect(() => {
    if (product) trackProductMetric(product.id, 'view', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Initial form values
  useEffect(() => {
    if (auction) {
      const timer = setTimeout(() => {
        setCustomBidAmount((currentHighestBid + 25000).toString());
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [productId, auction, currentHighestBid]);

  // Live ticking countdown timer for active auctions
  useEffect(() => {
    if (!product || !product.isAuction || !auction) return;

    const updateTimer = () => {
      const latestDB = getDBState();
      const latestAuction = latestDB.auctions.find(a => a.id === auction.id);

      if (!latestAuction) {
        return;
      }

      if (!latestAuction.isActive) {
        setIsAuctionEnded(true);
        setTimeLeft('CLOSED');
        return;
      }

      const endMs = new Date(latestAuction.endsAt).getTime();
      const nowMs = Date.now();
      const diff = endMs - nowMs;

      if (diff <= 0) {
        setIsAuctionEnded(true);
        setTimeLeft('CLOSED');

        // Trigger auction closure in DB!
        const closeRes = dbOperations.closeAuction(latestAuction.id);
        if (closeRes) {
          setDb(getDBState()); // Sync state
        }
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const hStr = hours.toString().padStart(2, '0');
        const mStr = minutes.toString().padStart(2, '0');
        const sStr = seconds.toString().padStart(2, '0');

        setTimeLeft(`${hStr}h : ${mStr}m : ${sStr}s`);
        setIsAuctionEnded(false);
      }
    };

    // Run immediately then every second
    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [productId, auction]);

  if (!product) {
    return (
      <div className="p-8 text-center">
        <p className="text-ink-500">Product not found.</p>
        <button onClick={onBack} className="text-jade-500 underline text-xs mt-2">Back to Catalog</button>
      </div>
    );
  }

  // Place official bid
  const handlePlaceBid = () => {
    if (!db.currentUser) {
      onOpenAuth?.();
      return;
    }
    if (!auction) return;
    setBidError(null);
    setBidSuccess(false);

    const amount = Number(customBidAmount);
    if (isNaN(amount) || amount <= 0) {
      setBidError('Please enter a valid numeric bid amount');
      return;
    }

    const res = dbOperations.submitBid(auction.id, amount);
    if (res && 'error' in res) {
      setBidError(res.error || 'Bid placement failed');
    } else {
      setBidSuccess(true);
      setTimeout(() => setBidSuccess(false), 3000);
    }
  };

  // Negotiate offer submission
  const handleSendOffer = async () => {
    if (!db.currentUser) {
      onOpenAuth?.();
      return;
    }
    const amount = Number(negotiateOffer);
    if (isNaN(amount) || amount <= 0) return;

    const roomId = await dbOperations.getOrCreateChatRoom(product.id);
    if (roomId) {
      await dbOperations.sendMessage(
        roomId,
        `SENT PROPOSED NEGOTIATION OFFER: ₦${amount.toLocaleString()}. I would like to purchase via GoodSale Escrow!`
      );
      setShowNegotiateDrawer(false);
      onNavigate('chats', { roomId });
    }
  };

  // Initialize Chat directly
  const handleStartChat = async () => {
    if (!db.currentUser) {
      onOpenAuth?.();
      return;
    }
    const roomId = await dbOperations.getOrCreateChatRoom(product.id);
    if (roomId) {
      onNavigate('chats', { roomId });
    }
  };

  const handleBuyNow = () => {
    if (!db.currentUser) {
      onOpenAuth?.();
      return;
    }
    // Navigate straight to checkout
    onNavigate('checkout', { productId: product.id });
  };

  const handleShareProduct = () => {
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/?product=${product.id}`
      : `https://goodsale.ng/product/${product.id}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      toast.success('Link copied! Product URL loaded to clipboard.');
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
  };

  const handleAddProductComment = () => {
    if (!db.currentUser) {
      onOpenAuth?.();
      return;
    }
    if (!newCommentText.trim()) return;

    dbOperations.submitProductComment(product.id, newCommentRating, newCommentText);

    setNewCommentText('');
    setNewCommentRating(5);
    setReviewSubmitFeedback('Comment posted successfully! +15 GoodPoints awarded.');
    setTimeout(() => setReviewSubmitFeedback(null), 4000);
  };

  const handlePostQuestion = () => {
    if (!db.currentUser) {
      onOpenAuth?.();
      return;
    }
    if (!newCommentText.trim()) return;

    dbOperations.submitProductComment(product.id, 0, newCommentText);

    setNewCommentText('');
    setReviewSubmitFeedback('Question posted. The seller and other buyers can now reply.');
    setTimeout(() => setReviewSubmitFeedback(null), 4000);
  };

  const handleAddReply = (reviewId: number) => {
    if (!replyText.trim()) return;

    dbOperations.submitReplyToReview(reviewId, replyText);

    setReplyText('');
    setReplyingToReviewId(null);
  };

  const handleHelpfulVote = (reviewId: number) => {
    const state = getDBState();
    const rev = state.reviews.find(r => r.id === reviewId);
    if (rev) {
      rev.isHelpfulVotes = (rev.isHelpfulVotes || 0) + 1;
      saveDBState(state);
    }
  };

  // Filter reviews: general comments/reviews for this product, or reviews of this vendor
  const productReviews = db.reviews.filter(r => r.productId === product.id || r.revieweeId === product.sellerId);

  // Calculate average rating
  const reviewsWithRating = productReviews.filter(r => r.rating > 0);
  const averageRating = reviewsWithRating.length > 0
    ? (reviewsWithRating.reduce((sum, r) => sum + r.rating, 0) / reviewsWithRating.length).toFixed(1)
    : '5.0';

  // Filtered views per tab
  const qaReviews = productReviews.filter(r => r.rating === 0);
  const filteredReviews = productReviews.filter(r => {
    if (activeReviewFilter === 'verified') {
      // verified buyer means has order id or a rating
      return r.rating > 0 && r.orderId !== undefined;
    }
    return r.rating > 0;
  });

  // Reference layout helpers — honest, computed from the listing itself.
  const flashSale = activeFlashSale(product);
  const displayedPrice = flashSale?.price ?? product.price;
  const discountPercent = flashSale
    ? flashSale.discountPercent
    : product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : 0;
  const savingsAmount = flashSale
    ? product.price - displayedPrice
    : discountPercent > 0
      ? Number(product.compareAtPrice) - product.price
      : 0;
  const stockLeft = product.quantity;
  const isLowStock = stockLeft > 0 && stockLeft <= 5;
  const unavailableStatus = product.stockStatus === 'SOLD'
    ? 'Sold'
    : product.stockStatus === 'UNAVAILABLE'
      ? 'Unavailable'
      : product.stockStatus === 'OUT_OF_STOCK'
        ? 'Out of stock'
        : null;
  const inStock = !unavailableStatus && stockLeft > 0;
  const prettyWords = (value: string) =>
    value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const conditionLabel = prettyWords(product.condition);
  const deliveryLabel = prettyWords(product.deliveryMethod);
  const returnDays = product.returnPolicy?.match(/(\d+)\s*[- ]?day/i)?.[1];
  const returnsLabel = returnDays ? `${returnDays} Days` : 'Seller policy';
  const subtitle = (() => {
    const first = product.description.split(/(?<=[.!?])\s/)[0] || product.description;
    return first.length > 96 ? `${first.slice(0, 93)}…` : first;
  })();
  const sellerLocation = sellerProfile?.city
    ? `${sellerProfile.city}${sellerProfile.state ? `, ${sellerProfile.state}` : ''}`
    : 'Nigeria';
  const galleryCount = product.images.length || 1;

  return (
    <div className="min-h-screen bg-white pb-24 transition-colors duration-300 dark:bg-ink-950">

      {/* Back row */}
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 pt-4 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700 transition-colors hover:text-jade-600 dark:text-ink-300 dark:hover:text-jade-400 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to marketplace
        </button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-semibold uppercase tracking-wide text-ink-400 sm:block">
            {product.category}
          </span>
          <button
            onClick={() => setShowReport(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-500 transition-colors hover:border-jade-500/50 hover:text-jade-700 dark:border-ink-800 dark:text-ink-400 dark:hover:text-jade-300 cursor-pointer"
          >
            <Shield className="h-3 w-3" /> Report
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-0 pt-3 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">

          {/* ══ Gallery ══ */}
          <div className="min-w-0">
            <div
              onMouseEnter={() => setIsZooming(true)}
              onMouseLeave={() => setIsZooming(false)}
              onMouseMove={handleMouseMove}
              className="group relative aspect-[4/3] w-full overflow-hidden bg-ink-100 sm:rounded-3xl lg:aspect-[4/5] dark:bg-ink-900"
            >
              <div
                className="absolute inset-0 transition-transform duration-100 ease-out"
                style={
                  isZooming && !showVideo
                    ? { transform: 'scale(1.8)', transformOrigin: `${zoomCoords.x}% ${zoomCoords.y}%` }
                    : undefined
                }
              >
                {showVideo && product.videoUrl ? (
                  <video
                    src={product.videoUrl}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    className="h-full w-full bg-black object-contain"
                  />
                ) : (
                  <SmartImage
                    src={product.images[activeImageIndex]}
                    alt={product.title}
                    seed={`product-${product.id}`}
                    className="h-full w-full"
                  />
                )}
              </div>

              {isSellerVerified && (
                <div className="absolute left-3 top-3 z-10">
                  <VerifiedBadge
                    sellerId={product.sellerId}
                    status={sellerProfile?.verificationStatus}
                    expiresAt={sellerProfile?.verificationExpiresAt}
                    fallbackName={seller?.fullName}
                    variant="storefront"
                  />
                </div>
              )}

              <span className="pointer-events-none absolute right-3 top-3 rounded-lg bg-ink-950/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                {showVideo ? 'Video' : `${activeImageIndex + 1} / ${galleryCount}`}
              </span>

              {product.isAuction && (
                <span className="pointer-events-none absolute bottom-10 left-3 inline-flex items-center gap-1 rounded-lg bg-jade-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                  <Zap className="h-3 w-3 fill-white" />
                  Live auction
                </span>
              )}

              {product.videoUrl && (
                <button
                  onClick={() => setShowVideo(v => !v)}
                  className="absolute bottom-9 right-3 inline-flex items-center gap-1.5 rounded-full bg-ink-950/60 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm transition-colors hover:bg-ink-950/80 cursor-pointer"
                >
                  <Play className="h-3 w-3 fill-white" />
                  {showVideo ? 'Photos' : 'Video'}
                </button>
              )}

              {/* Dots */}
              <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
                {product.images.map((_, idx) => (
                  <button
                    key={idx}
                    aria-label={`Show image ${idx + 1}`}
                    onClick={() => { setShowVideo(false); setActiveImageIndex(idx); }}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      !showVideo && activeImageIndex === idx
                        ? 'w-5 bg-gold-300'
                        : 'w-1.5 bg-white/75 hover:bg-white'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ══ Buy box ══ */}
          <div className="min-w-0 px-4 sm:px-0">

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-black leading-tight tracking-tight text-ink-900 dark:text-white sm:text-3xl">
                  {product.title}
                </h1>
                <p className="mt-1 line-clamp-2 text-sm text-ink-500 dark:text-ink-400">
                  {subtitle}
                </p>
              </div>
              <button
                onClick={handleShareProduct}
                title="Copy product link"
                className="flex shrink-0 flex-col items-center gap-1 text-[11px] font-semibold text-ink-600 transition-colors hover:text-jade-600 dark:text-ink-300 dark:hover:text-jade-400 cursor-pointer"
              >
                <Share2 className="h-5 w-5" />
                Share
              </button>
            </div>

            {/* Rating + trust */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-bold text-ink-800 dark:text-ink-100">
                <Star className="h-4 w-4 star-filled" />
                {averageRating}
                <span className="font-normal text-ink-500 dark:text-ink-400">
                  ({reviewsWithRating.length} {reviewsWithRating.length === 1 ? 'review' : 'reviews'})
                </span>
              </span>
              <span aria-hidden className="h-4 w-px bg-ink-200 dark:bg-ink-700" />
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink-700 dark:text-ink-200">
                <ShieldCheck className="h-4 w-4 text-jade-600 dark:text-jade-400" />
                Escrow Protected
              </span>
            </div>

            {!product.isAuction ? (
              <>
                {/* Price */}
                <div className="mt-4 flex flex-wrap items-end gap-x-2.5 gap-y-1">
                  <span className="font-display text-4xl font-black tracking-tight text-jade-700 dark:text-jade-300">
                    ₦{displayedPrice.toLocaleString()}
                  </span>
                  {discountPercent > 0 && (
                    <>
                      <span className="mb-1 text-lg font-semibold text-ink-400 line-through">
                        ₦{(flashSale ? product.price : Number(product.compareAtPrice)).toLocaleString()}
                      </span>
                      <span className="mb-1.5 rounded-full bg-jade-600 px-2.5 py-1 text-sm font-black leading-none text-white">
                        -{discountPercent}%
                      </span>
                    </>
                  )}
                </div>

                {/* Savings banner */}
                {discountPercent > 0 && (
                  <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-jade-100 px-4 py-3 dark:bg-jade-950/70">
                    <Tag className="h-5 w-5 shrink-0 text-jade-700 dark:text-jade-300" />
                    <span className="flex-1 text-sm font-semibold text-jade-900 dark:text-jade-100">
                      {flashSale ? 'Flash Sale' : 'Save'} ₦{savingsAmount.toLocaleString()}
                      {flashSale ? ` until ${new Date(flashSale.endsAt).toLocaleString('en-NG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : ' with this deal!'}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-jade-700 dark:text-jade-300" />
                  </div>
                )}
              </>
            ) : (
              /* Auction panel */
              <div className="mt-4 space-y-3 rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                <div className="flex items-center justify-between rounded-xl bg-jade-700 px-3 py-2 text-white">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
                    <Clock className="h-3.5 w-3.5 animate-pulse" />
                    {auction?.isActive ? 'Auction countdown' : 'Auction status'}
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums">
                    {auction?.isActive ? (timeLeft || 'Calculating…') : 'CLOSED'}
                  </span>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-ink-500">
                      <Zap className="h-3.5 w-3.5" /> {auction?.isActive ? 'Current top bid' : 'Winning bid'}
                    </span>
                    <span className="mt-0.5 block font-display text-3xl font-black text-jade-700 dark:text-jade-300">
                      ₦{currentHighestBid.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-ink-400">Starting bid</span>
                    <span className="block text-sm font-semibold text-ink-600 dark:text-ink-300">
                      ₦{Number(auction?.startingBid || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {auction?.isActive ? (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={customBidAmount}
                        onChange={(e) => setCustomBidAmount(e.target.value)}
                        placeholder="Enter bid amount (₦)"
                        className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                      />
                      <button
                        onClick={handlePlaceBid}
                        className="shrink-0 rounded-xl bg-jade-700 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-jade-800 cursor-pointer"
                      >
                        Place Bid
                      </button>
                    </div>
                    {bidError && <p className="text-xs font-bold text-ink-600 dark:text-ink-300">{bidError}</p>}
                    {bidSuccess && <p className="text-xs font-bold text-jade-600">Bid placed successfully!</p>}

                    {db.currentUser?.id === product.sellerId && (
                      <button
                        onClick={() => {
                          if (auction) {
                            const closeRes = dbOperations.closeAuction(auction.id);
                            if (closeRes) {
                              setDb(getDBState());
                              toast.success('Auction closed. A pending escrow order was generated for the top bidder.');
                            }
                          }
                        }}
                        className="w-full rounded-xl border border-jade-500/30 bg-jade-500/10 px-3 py-2 text-[11px] font-bold text-jade-700 transition-colors hover:bg-jade-500/20 dark:text-jade-300 cursor-pointer"
                      >
                        End auction now & award top bid
                      </button>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-jade-500/20 bg-jade-500/10 p-3 text-center">
                    <span className="mb-1 block text-xs font-bold text-jade-700 dark:text-jade-300">Auction concluded</span>
                    {bids.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-ink-800 dark:text-white">
                          Winner: <span className="text-jade-600">@{bids[0].username}</span> at ₦{bids[0].amount.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          A pending escrow order was generated for the winner to complete payment.
                        </p>
                        {db.currentUser?.id === bids[0].userId && (
                          <button
                            onClick={() => onNavigate('profile')}
                            className="mt-1 rounded-lg bg-jade-700 px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer"
                          >
                            Go to my purchases & pay
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-ink-500">Closed with no active bids.</p>
                    )}
                  </div>
                )}

                <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950/60">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    Bid history ({bids.length})
                  </span>
                  {bids.length === 0 ? (
                    <p className="text-xs italic text-ink-400">No bids yet — be the first.</p>
                  ) : (
                    <div className="max-h-28 space-y-1.5 overflow-y-auto">
                      {bids.map((b) => (
                        <div key={b.id} className="flex items-center justify-between text-xs text-ink-700 dark:text-ink-300">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <SmartAvatar src={b.userAvatar} name={b.username} className="h-4 w-4" />@{b.username}
                          </span>
                          <span className="font-mono font-bold text-ink-900 dark:text-white">₦{b.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Seller card */}
            <button
              onClick={() => seller && onNavigate('seller-profile', { sellerId: seller.id })}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-ink-150 bg-white p-3 text-left transition-colors hover:border-jade-500/40 dark:border-ink-800 dark:bg-ink-900 cursor-pointer"
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-jade-500/10">
                <SmartAvatar
                  src={sellerProfile?.photoUrl}
                  name={seller?.fullName || 'GoodSale Seller'}
                  className="h-full w-full"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-bold text-sm text-ink-900 dark:text-white">
                    {seller?.fullName || 'GoodSale Seller'}
                  </span>
                  {isSellerVerified && (
                    <VerifiedMark
                      status={sellerProfile?.verificationStatus}
                      expiresAt={sellerProfile?.verificationExpiresAt}
                    />
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-500 dark:text-ink-400">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {sellerLocation}
                  {sellerTrust && <span>• {sellerTrust.score}/100 trust</span>}
                </p>
              </div>
              <span className="shrink-0 rounded-xl border border-jade-600 px-3 py-2 text-xs font-bold text-jade-700 dark:text-jade-300">
                Visit Store
              </span>
            </button>

            {/* Trust strip */}
            <div className="mt-3 grid grid-cols-3 divide-x divide-ink-150 overflow-hidden rounded-2xl border border-ink-150 bg-white py-3 dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-900">
              <div className="flex items-start gap-2 px-2.5">
                <ShieldCheck className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold leading-tight text-ink-900 dark:text-white">Buyer Protection</p>
                  <p className="text-[10px] leading-tight text-ink-500 dark:text-ink-400">Escrow secured</p>
                </div>
              </div>
              <div className="flex items-start gap-2 px-2.5">
                <Truck className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold leading-tight text-ink-900 dark:text-white">Fast Delivery</p>
                  <p className="truncate text-[10px] leading-tight text-ink-500 dark:text-ink-400">{deliveryLabel}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 px-2.5">
                <RotateCcw className="h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold leading-tight text-ink-900 dark:text-white">Easy Returns</p>
                  <p className="text-[10px] leading-tight text-ink-500 dark:text-ink-400">{returnsLabel}</p>
                </div>
              </div>
            </div>

            {/* Quantity + stock */}
            {!product.isAuction && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">Quantity</span>
                  <span className="inline-flex h-9 min-w-12 items-center justify-center rounded-full border border-ink-200 px-3 text-sm font-black text-ink-900 dark:border-ink-700 dark:text-white">
                    1
                  </span>
                </div>
                {!inStock ? (
                  <span className="rounded-full bg-ink-100 px-3 py-1.5 text-[11px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                    {unavailableStatus || 'Out of stock'}
                  </span>
                ) : isLowStock ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1.5 text-[11px] font-bold text-gold-800 dark:bg-gold-400/15 dark:text-gold-300">
                    <Flame className="h-3.5 w-3.5" />
                    Only {stockLeft} left
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-100 px-3 py-1.5 text-[11px] font-bold text-jade-800 dark:bg-jade-950 dark:text-jade-200">
                    <Check className="h-3.5 w-3.5" />
                    In stock
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            {!product.isAuction && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    onClick={handleStartChat}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-jade-600 px-3 py-3.5 text-sm font-bold text-jade-700 transition-colors hover:bg-jade-50 dark:text-jade-300 dark:hover:bg-jade-950/60 cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat Seller
                  </button>
                  <button
                    onClick={() => onAddToCart(product.id)}
                    disabled={!inStock}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-jade-700 px-3 py-3.5 text-sm font-bold text-white shadow-lg shadow-jade-700/20 transition-colors hover:bg-jade-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
                  </button>
                </div>

                <button
                  onClick={handleBuyNow}
                  disabled={!inStock}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-400 px-4 py-4 text-base font-black text-ink-900 shadow-lg shadow-gold-400/30 transition-all hover:from-gold-200 hover:to-gold-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  <Zap className="h-5 w-5 fill-ink-900" />
                  Buy Now
                </button>

                {product.isNegotiable && (
                  <div className="mt-2.5 text-center">
                    <button
                      onClick={() => setShowNegotiateDrawer(!showNegotiateDrawer)}
                      className="text-xs font-bold text-jade-700 underline underline-offset-4 hover:text-jade-800 dark:text-jade-300 cursor-pointer"
                    >
                      {showNegotiateDrawer ? 'Hide offer form' : 'Make an offer instead'}
                    </button>

                    {showNegotiateDrawer && (
                      <div className="mt-2.5 flex gap-2 rounded-2xl border border-ink-150 bg-ink-50 p-2.5 dark:border-ink-800 dark:bg-ink-900">
                        <input
                          type="number"
                          value={negotiateOffer}
                          onChange={(e) => setNegotiateOffer(e.target.value)}
                          placeholder="Your offer in ₦"
                          className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                        />
                        <button
                          onClick={handleSendOffer}
                          className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-jade-700 px-3.5 text-xs font-bold text-white hover:bg-jade-800 cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Send
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {product.isAuction && (
              <button
                onClick={handleStartChat}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-jade-600 px-3 py-3.5 text-sm font-bold text-jade-700 transition-colors hover:bg-jade-50 dark:text-jade-300 dark:hover:bg-jade-950/60 cursor-pointer"
              >
                <MessageSquare className="h-4 w-4" />
                Chat Seller
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══ Tabs ══ */}
      <div className="mx-auto mt-8 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="border-b border-ink-150 dark:border-ink-800">
          <div className="scrollbar-hide flex gap-7 overflow-x-auto">
            {([
              { id: 'overview' as DetailTab, label: 'Overview' },
              { id: 'specs' as DetailTab, label: 'Specifications' },
              { id: 'reviews' as DetailTab, label: `Reviews (${reviewsWithRating.length})` },
              { id: 'qa' as DetailTab, label: `Q&A (${qaReviews.length})` },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`-mb-px shrink-0 border-b-2 py-3 text-sm font-bold transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-jade-600 text-jade-700 dark:border-jade-400 dark:text-jade-300'
                    : 'border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="py-6">
          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white">
                  Product Overview
                </h2>
                <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {product.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Brand', value: product.brand || 'Generic' },
                  { label: 'Condition', value: conditionLabel },
                  { label: 'Category', value: product.category },
                  { label: 'Delivery', value: deliveryLabel },
                  { label: 'Warranty', value: product.warranty || 'No warranty' },
                  { label: 'Returns', value: product.returnPolicy || 'No returns' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-ink-150 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-ink-400">{item.label}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs font-bold text-ink-900 dark:text-white">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-jade-500/20 bg-jade-50 p-4 dark:bg-jade-950/40">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-jade-600 dark:text-jade-400" />
                <div>
                  <h3 className="text-xs font-bold text-jade-900 dark:text-jade-100">Escrow Security Shield active</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-jade-800/80 dark:text-jade-200/80">
                    GoodSale holds your payment neutral in escrow. The seller is only paid after you confirm delivery and verify your secret PIN.
                  </p>
                </div>
              </div>

              {!product.isAuction && (
                <div className={`rounded-2xl border p-4 transition-colors ${
                  isAlertSubscribed
                    ? 'border-jade-500/25 bg-jade-50 dark:bg-jade-950/40'
                    : 'border-ink-150 bg-white dark:border-ink-800 dark:bg-ink-900'
                }`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        isAlertSubscribed ? 'bg-jade-500/10 text-jade-600 dark:text-jade-400' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                      }`}>
                        {isAlertSubscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-ink-800 dark:text-ink-100">Price drop alerts</h4>
                        <p className="mt-0.5 truncate text-[11px] text-ink-500 dark:text-ink-400">
                          {isAlertSubscribed
                            ? `Watching for drops below ₦${Number(alertThreshold).toLocaleString()}`
                            : 'Get an instant in-app alert when this price drops.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (isAlertSubscribed) togglePriceAlert();
                        else setShowThresholdForm(!showThresholdForm);
                      }}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                        isAlertSubscribed
                          ? 'border border-ink-200 bg-white text-ink-600 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-300'
                          : 'bg-jade-700 text-white hover:bg-jade-800'
                      }`}
                    >
                      {isAlertSubscribed ? 'Unsubscribe' : 'Notify me'}
                    </button>
                  </div>

                  {showThresholdForm && !isAlertSubscribed && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-ink-150 pt-3 dark:border-ink-800">
                      <p className="text-[11px] text-ink-500 dark:text-ink-400">
                        Target price (defaults to ₦{product.price.toLocaleString()}):
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={alertThreshold}
                          onChange={(e) => setAlertThreshold(e.target.value)}
                          placeholder={product.price.toString()}
                          className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 pl-6 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                        />
                        <button
                          onClick={() => {
                            const val = alertThreshold.trim() ? Number(alertThreshold) : product.price;
                            togglePriceAlert(val);
                            setShowThresholdForm(false);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-jade-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-jade-800 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Activate
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Specifications */}
          {activeTab === 'specs' && (
            <div className="space-y-3">
              <h2 className="font-display text-lg font-black tracking-tight text-ink-900 dark:text-white">
                Specifications
              </h2>
              <div className="overflow-hidden rounded-2xl border border-ink-150 dark:border-ink-800">
                {[
                  { label: 'Brand', value: product.brand || 'Generic' },
                  { label: 'Category', value: product.category },
                  { label: 'Condition', value: conditionLabel },
                  { label: 'Barcode', value: product.barcode || 'N/A' },
                  { label: 'Delivery', value: deliveryLabel },
                  ...(product.quantity > 0 ? [{ label: 'Units available', value: String(product.quantity) }] : []),
                  { label: 'Warranty', value: product.warranty || 'No warranty' },
                  { label: 'Return policy', value: product.returnPolicy || 'No returns' },
                  ...(product.weightKg ? [{ label: 'Weight', value: `${product.weightKg} kg` }] : []),
                  ...(product.dimensionsCm ? [{ label: 'Dimensions', value: product.dimensionsCm }] : []),
                ].map((row, i) => (
                  <div
                    key={row.label}
                    className={`flex items-start justify-between gap-4 px-4 py-3 text-xs ${
                      i % 2 === 0 ? 'bg-white dark:bg-ink-900' : 'bg-ink-50 dark:bg-ink-950/60'
                    }`}
                  >
                    <span className="shrink-0 font-semibold text-ink-500 dark:text-ink-400">{row.label}</span>
                    <span className="text-right font-bold text-ink-900 dark:text-white">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          {activeTab === 'reviews' && (
            <div id="product-reviews-section" className="space-y-8">
              <div className="grid grid-cols-1 items-center gap-6 rounded-2xl border border-ink-150 bg-white p-5 sm:grid-cols-12 dark:border-ink-800 dark:bg-ink-900">
                <div className="space-y-1 text-center sm:col-span-4 sm:border-r sm:border-ink-150 sm:text-left sm:pr-6 dark:sm:border-ink-800">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Overall rating</span>
                  <div className="flex items-baseline justify-center gap-2 sm:justify-start">
                    <span className="font-display text-4xl font-black text-ink-950 dark:text-white">{averageRating}</span>
                    <span className="text-xs text-ink-400">out of 5</span>
                  </div>
                  <div className="my-1 flex items-center justify-center gap-1 sm:justify-start">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < Math.round(Number(averageRating)) ? 'star-filled' : 'star-empty'}`} />
                    ))}
                  </div>
                  <span className="block text-[11px] text-ink-400">Based on {reviewsWithRating.length} verified ratings</span>
                </div>

                <div className="space-y-2 sm:col-span-5 sm:border-r sm:border-ink-150 sm:pr-6 dark:sm:border-ink-800">
                  {[5, 4, 3, 2, 1].map(stars => {
                    const count = reviewsWithRating.filter(r => r.rating === stars).length;
                    const percent = reviewsWithRating.length > 0 ? (count / reviewsWithRating.length) * 100 : 0;
                    return (
                      <div key={stars} className="flex items-center gap-3 text-xs">
                        <span className="w-3 font-bold">{stars}</span>
                        <Star className="star-filled h-3.5 w-3.5 shrink-0" />
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                          <div className="h-full rounded-full bg-jade-500" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="w-8 text-right text-ink-400">{count}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1 text-center sm:col-span-3 sm:text-left">
                  <Award className="mx-auto h-8 w-8 text-jade-600 sm:mx-0" />
                  <h4 className="text-xs font-bold text-ink-950 dark:text-white">Escrow-verified reviews</h4>
                  <p className="text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                    Reviews with a <span className="font-semibold text-ink-600 dark:text-ink-300">Verified Buyer</span> badge come from completed escrow orders.
                  </p>
                </div>
              </div>

              {/* Write a review */}
              <div className="space-y-4 rounded-2xl border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                <h3 className="text-sm font-bold text-ink-900 dark:text-white">Share your review</h3>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ink-500 dark:text-ink-400">Your rating:</span>
                  {[5, 4, 3, 2, 1].map((val) => (
                    <button
                      key={val}
                      type="button"
                      aria-label={`${val} star${val > 1 ? 's' : ''}`}
                      onClick={() => setNewCommentRating(val)}
                      className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors cursor-pointer ${
                        newCommentRating === val
                          ? 'border-gold-400 bg-gold-100'
                          : 'border-ink-150 bg-white hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-950'
                      }`}
                    >
                      <Star className={`h-4 w-4 ${newCommentRating >= val ? 'star-filled' : 'star-empty'}`} />
                    </button>
                  ))}
                </div>

                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Describe condition, fit, courier speed or how the seller handled the escrow…"
                  rows={3}
                  className="w-full rounded-xl border border-ink-200 bg-white p-3.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-jade-500 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1 rounded-lg border border-jade-500/10 bg-jade-500/5 px-2.5 py-1 text-[11px] font-bold text-jade-700 dark:text-jade-300">
                    Earn 15 GoodPoints for a helpful review
                  </span>
                  <button
                    type="button"
                    onClick={handleAddProductComment}
                    className="rounded-xl bg-jade-700 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-jade-800 cursor-pointer"
                  >
                    Post review
                  </button>
                </div>
                {reviewSubmitFeedback && (
                  <p className="text-xs font-bold text-jade-600">{reviewSubmitFeedback}</p>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-150 pb-3 dark:border-ink-800">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'all', label: `All reviews (${reviewsWithRating.length})` },
                    { id: 'verified', label: 'Verified buyers' },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setActiveReviewFilter(filter.id as 'all' | 'verified')}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                        activeReviewFilter === filter.id
                          ? 'bg-jade-600 text-white shadow-sm shadow-jade-600/25'
                          : 'bg-ink-50 text-ink-500 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-400'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-ink-400">Showing {filteredReviews.length}</span>
              </div>

              {/* Review list */}
              <div className="space-y-6">
                {filteredReviews.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center dark:border-ink-800">
                    <p className="text-xs italic text-ink-400">No reviews match this filter yet. Be the first to share one.</p>
                  </div>
                ) : (
                  filteredReviews.map(rev => {
                    const isVerifiedPurchase = rev.orderId !== undefined || rev.rating > 0;
                    return (
                      <div key={rev.id} className="space-y-3 border-b border-ink-100 pb-6 last:border-b-0 dark:border-ink-800/80">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-full border border-ink-200/50 bg-ink-100 dark:border-ink-700/50 dark:bg-ink-800">
                              <SmartAvatar src={rev.reviewerPhoto} name={rev.reviewerName} className="h-full w-full" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-ink-900 dark:text-white">{rev.reviewerName}</span>
                                {isVerifiedPurchase && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-jade-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-jade-700 dark:text-jade-300">
                                    <Check className="h-2.5 w-2.5" /> Verified Buyer
                                  </span>
                                )}
                              </div>
                              <span className="block text-[11px] text-ink-400">
                                {new Date(rev.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          {rev.rating > 0 && (
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`h-3.5 w-3.5 ${i < rev.rating ? 'star-filled' : 'star-empty'}`} />
                              ))}
                            </div>
                          )}
                        </div>

                        <p className="text-xs leading-relaxed text-ink-700 dark:text-ink-300 sm:pl-12">
                          {rev.comment}
                        </p>

                        <div className="flex items-center gap-4 text-xs font-semibold sm:pl-12">
                          <button
                            type="button"
                            onClick={() => handleHelpfulVote(rev.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-150 bg-ink-50 px-2.5 py-1 text-xs text-ink-500 transition-colors hover:text-jade-600 dark:border-ink-800 dark:bg-ink-800 dark:text-ink-400 cursor-pointer"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            Helpful ({rev.isHelpfulVotes || 0})
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyingToReviewId(replyingToReviewId === rev.id ? null : rev.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-jade-500/10 bg-jade-500/5 px-2.5 py-1 text-xs text-jade-600 hover:underline dark:text-jade-300 cursor-pointer"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Reply
                          </button>
                        </div>

                        {replyingToReviewId === rev.id && (
                          <div className="mt-2 flex max-w-2xl gap-2 sm:pl-12">
                            <input
                              type="text"
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Reply as vendor or interested buyer…"
                              className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddReply(rev.id)}
                              className="inline-flex items-center gap-1 rounded-xl bg-jade-700 px-4 py-1.5 text-xs font-bold text-white cursor-pointer"
                            >
                              <Send className="h-3 w-3" />
                              Send
                            </button>
                          </div>
                        )}

                        {rev.replies && rev.replies.length > 0 && (
                          <div className="mt-3 space-y-3 border-l-2 border-jade-500/20 pl-4 sm:pl-16">
                            {rev.replies.map(rep => (
                              <div key={rep.id} className="space-y-2 rounded-2xl bg-ink-50 p-3.5 dark:bg-ink-900/60">
                                <div className="flex items-center gap-2">
                                  <div className="relative h-7 w-7 overflow-hidden rounded-full border border-ink-200/50 bg-ink-100">
                                    <SmartAvatar src={rep.authorPhoto} name={rep.authorName} className="h-full w-full" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-bold text-ink-800 dark:text-ink-200">{rep.authorName}</span>
                                      <span className="rounded bg-jade-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-jade-700 dark:text-jade-300">
                                        {rep.authorRole === 'SELLER' ? 'Vendor' : rep.authorRole === 'ADMIN' ? 'Moderator' : 'Buyer'}
                                      </span>
                                    </div>
                                    <span className="block text-[11px] text-ink-400">
                                      {new Date(rep.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </span>
                                  </div>
                                </div>
                                <p className="flex items-center gap-1 pl-9 text-xs leading-normal text-ink-600 dark:text-ink-400">
                                  <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                                  {rep.comment}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Q&A */}
          {activeTab === 'qa' && (
            <div className="space-y-6">
              <div className="space-y-4 rounded-2xl border border-ink-150 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                <div>
                  <h3 className="text-sm font-bold text-ink-900 dark:text-white">Ask the seller a question</h3>
                  <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                    Questions are public — the seller and other verified buyers can answer.
                  </p>
                </div>
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Ask about shipping, condition, warranty, negotiation or pickup…"
                  rows={3}
                  className="w-full rounded-xl border border-ink-200 bg-white p-3.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-jade-500 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handlePostQuestion}
                    className="rounded-xl bg-jade-700 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-jade-800 cursor-pointer"
                  >
                    Post question
                  </button>
                </div>
                {reviewSubmitFeedback && (
                  <p className="text-xs font-bold text-jade-600">{reviewSubmitFeedback}</p>
                )}
              </div>

              <div className="space-y-4">
                {qaReviews.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-ink-200 p-8 text-center dark:border-ink-800">
                    <p className="text-xs italic text-ink-400">No questions yet. Be the first to ask.</p>
                  </div>
                ) : (
                  qaReviews.map(rev => (
                    <div key={rev.id} className="space-y-3 rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="relative h-8 w-8 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                            <SmartAvatar src={rev.reviewerPhoto} name={rev.reviewerName} className="h-full w-full" />
                          </div>
                          <div>
                            <span className="block text-xs font-bold text-ink-900 dark:text-white">{rev.reviewerName}</span>
                            <span className="block text-[11px] text-ink-400">
                              {new Date(rev.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingToReviewId(replyingToReviewId === rev.id ? null : rev.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-jade-500/15 bg-jade-500/5 px-2.5 py-1 text-[11px] font-bold text-jade-700 dark:text-jade-300 cursor-pointer"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Answer
                        </button>
                      </div>

                      <p className="text-xs leading-relaxed text-ink-700 dark:text-ink-300">{rev.comment}</p>

                      {replyingToReviewId === rev.id && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write your answer…"
                            className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddReply(rev.id)}
                            className="inline-flex items-center gap-1 rounded-xl bg-jade-700 px-4 py-1.5 text-xs font-bold text-white cursor-pointer"
                          >
                            <Send className="h-3 w-3" />
                            Send
                          </button>
                        </div>
                      )}

                      {rev.replies && rev.replies.length > 0 && (
                        <div className="space-y-2 border-l-2 border-jade-500/20 pl-3">
                          {rev.replies.map(rep => (
                            <div key={rep.id} className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-950/60">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-bold text-ink-800 dark:text-ink-200">{rep.authorName}</span>
                                <span className="rounded bg-jade-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-jade-700 dark:text-jade-300">
                                  {rep.authorRole === 'SELLER' ? 'Vendor' : rep.authorRole === 'ADMIN' ? 'Moderator' : 'Buyer'}
                                </span>
                              </div>
                              <p className="mt-0.5 text-[11px] leading-normal text-ink-600 dark:text-ink-400">{rep.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sponsored: product-detail placement */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <AdSlot
          placement="DETAIL"
          onNavigate={onNavigate}
          state={db.profiles.find((profile) => profile.userId === db.currentUser?.id)?.state || ''}
          city={db.profiles.find((profile) => profile.userId === db.currentUser?.id)?.city || ''}
          category={product.category}
          className="mt-2"
        />
      </div>

      {/* Context-aware Gemini Security Tip Banner */}
      <div className="mx-auto mt-8 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-ink-150 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-ink-800 dark:bg-ink-900">
          <div className="pointer-events-none absolute -right-12 -top-12 opacity-5">
            <Shield className="h-48 w-48 text-jade-500" />
          </div>

          <div className="relative z-10 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3.5">
              <div className={`shrink-0 rounded-2xl p-3 ${
                loadingTip ? 'animate-pulse bg-jade-500/10 text-jade-500' :
                securityTip?.threatLevel === 'MEDIUM' ? 'bg-ink-500/10 text-ink-500' :
                'bg-jade-500/10 text-jade-600 dark:text-jade-400'
              }`}>
                <Shield className="h-6 w-6" />
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold tracking-tight text-ink-800 dark:text-white">
                    {loadingTip ? 'Consulting the Trust Engine…' : (securityTip?.badgeTitle || 'Smart verification guide')}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight ${
                    securityTip?.threatLevel === 'MEDIUM'
                      ? 'bg-ink-500/10 text-ink-500'
                      : 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                  }`}>
                    {loadingTip ? 'AI ANALYZING' : `${securityTip?.threatLevel || 'SECURE'} RISK`}
                  </span>
                </div>

                {loadingTip ? (
                  <div className="max-w-2xl space-y-2 py-1">
                    <div className="h-3 w-72 animate-pulse rounded-full bg-ink-200 dark:bg-ink-800" />
                    <div className="h-3 w-56 animate-pulse rounded-full bg-ink-200 dark:bg-ink-800" />
                  </div>
                ) : (
                  <p className="max-w-3xl text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                    {securityTip?.tip || 'Check buyer trust scores and inspect items at a SafeMeet location, or use a verified GoodDispatch partner, before releasing escrow.'}
                  </p>
                )}
              </div>
            </div>

            <span className="inline-flex shrink-0 select-none items-center gap-1 rounded-xl border border-ink-200 px-3.5 py-1.5 text-[11px] font-semibold text-ink-500 dark:border-ink-800 dark:text-ink-400">
              <Sparkles className="h-3.5 w-3.5 text-jade-500" />
              Gemini Security Assistant
            </span>
          </div>
        </div>
      </div>

      {/* Report listing */}
      {showReport && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink-950/50 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-ink-200 bg-white p-5 pb-safe-bottom shadow-2xl dark:border-ink-800 dark:bg-ink-900 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-ink-900 dark:text-white">Report this listing</h3>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  Reports go to the GoodSale trust team. The seller does not see who reported them.
                </p>
              </div>
              <button onClick={() => setShowReport(false)} className="rounded-full p-1 text-ink-400 hover:text-ink-700 dark:hover:text-white cursor-pointer" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {['Counterfeit or fake item', 'Prohibited or unsafe product', 'Misleading description or photos', 'Suspected scam seller', 'Other safety concern'].map((reason) => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                    reportReason === reason
                      ? 'border-jade-500/60 bg-jade-500/[0.06] text-jade-800 dark:text-jade-200'
                      : 'border-ink-200 text-ink-600 hover:border-jade-500/30 dark:border-ink-700 dark:text-ink-300'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              placeholder="Add anything that helps us investigate (optional)"
              className="mt-3 w-full rounded-xl border border-ink-200 px-3 py-2 text-xs outline-none placeholder:text-ink-400 focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setShowReport(false)} className="rounded-xl border border-ink-200 px-3 py-2 text-xs font-bold text-ink-600 dark:border-ink-700 dark:text-ink-300 cursor-pointer">
                Cancel
              </button>
              <button
                disabled={reportBusy || !reportReason}
                onClick={async () => {
                  if (!db.currentUser) {
                    toast.info('Sign in to submit a report');
                    onOpenAuth?.();
                    return;
                  }
                  setReportBusy(true);
                  const res = await dbOperations.createReport({
                    targetType: 'PRODUCT',
                    targetId: product.id,
                    targetLabel: product.title,
                    reason: reportReason,
                    details: reportDetails,
                  });
                  setReportBusy(false);
                  if (res?.error) {
                    toast.error(res.error);
                  } else {
                    toast.success('Report submitted — the trust team will review it');
                    setShowReport(false);
                    setReportReason('');
                    setReportDetails('');
                  }
                }}
                className="rounded-xl bg-jade-600 px-4 py-2 text-xs font-bold text-white hover:bg-jade-700 disabled:opacity-50 cursor-pointer"
              >
                {reportBusy ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
