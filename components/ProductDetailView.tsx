// components/ProductDetailView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Shield, MapPin, CheckCircle, MessageSquare, 
  ShoppingCart, Star, Zap, Trash, Clock, Award, Tag, Send,
  Bell, BellOff, Check, TrendingDown, ThumbsUp, CornerDownRight,
  Share2, Sparkles
} from 'lucide-react';
import { 
  Product, UserRole, getDBState, saveDBState, dbOperations, OrderStatus 
} from '../lib/store';
import { SmartAvatar } from './ui/SmartImage';
import { toast } from '@/lib/feedback';

interface ProductDetailViewProps {
  productId: number;
  onBack: () => void;
  onNavigate: (view: string, payload?: any) => void;
  onAddToCart: (productId: number) => void;
  onOpenAuth?: () => void;
}

export default function ProductDetailView({
  productId,
  onBack,
  onNavigate,
  onAddToCart,
  onOpenAuth,
}: ProductDetailViewProps) {
  const [db, setDb] = useState(getDBState());
  const [activeImageIndex, setActiveImageIndex] = useState(0);
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
  const isSellerVerified = seller ? (seller.role === UserRole.VERIFIED_SELLER || seller.role === UserRole.VERIFIED_BUSINESS) : false;

  // Auction metadata
  const auction = (product && product.isAuction) ? db.auctions.find(a => a.productId === product.id) : null;
  const bids = auction ? db.bids.filter(b => b.auctionId === auction.id).sort((a,b) => b.amount - a.amount) : [];
  const currentHighestBid = bids.length > 0 ? bids[0].amount : (auction?.startingBid || 0);

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

  // Filters
  const filteredReviews = productReviews.filter(r => {
    if (activeReviewFilter === 'verified') {
      // verified buyer means has orderId or rating > 0
      return r.rating > 0 && r.orderId !== undefined;
    }
    if (activeReviewFilter === 'qa') {
      return r.rating === 0;
    }
    return true; // 'all'
  });

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        
        {/* Back navigation header */}
        <div className="flex justify-between items-center mb-6">
          <button 
            onClick={onBack}
            className="inline-flex items-center gap-1 text-xs font-sans font-bold text-ink-700 dark:text-ink-300 hover:text-jade-500 mb-0 cursor-pointer bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 px-3 py-1.5 rounded-xl transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </button>

          <button
            onClick={handleShareProduct}
            className="inline-flex items-center gap-1.5 text-xs font-sans font-bold text-ink-700 dark:text-ink-300 hover:text-jade-500 cursor-pointer bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 px-3.5 py-1.5 rounded-xl transition-all"
            title="Copy unique link to clipboard"
          >
            <Share2 className="w-4 h-4 text-ink-400 group-hover:text-jade-500" />
            Share Product
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* A. Left side: Image Gallery & Previews (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            
            <div 
              onMouseEnter={() => setIsZooming(true)}
              onMouseLeave={() => setIsZooming(false)}
              onMouseMove={handleMouseMove}
              className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl overflow-hidden shadow-sm relative h-96 flex items-center justify-center cursor-zoom-in group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={product.images[activeImageIndex]} 
                alt={product.title} 
                className="w-full h-full object-cover transition-transform duration-100 ease-out" 
                style={isZooming ? {
                  transform: 'scale(1.8)',
                  transformOrigin: `${zoomCoords.x}% ${zoomCoords.y}%`
                } : undefined}
              />
              
              {product.isAuction && (
                <div className="absolute top-4 left-4 px-3 py-1 bg-ink-500 text-white text-xs font-bold uppercase rounded-lg tracking-wider flex items-center gap-1 shadow-lg shadow-ink-500/15 pointer-events-none">
                  <Zap className="w-3.5 h-3.5 text-white fill-white" />
                  Live Auction Event
                </div>
              )}
            </div>

            {/* Gallery Previews horizontal list */}
            {product.images.length > 1 && (
              <div className="flex gap-2">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`w-20 h-20 rounded-xl border overflow-hidden relative cursor-pointer ${activeImageIndex === idx ? 'border-jade-500 ring-2 ring-jade-500/20' : 'border-ink-200 dark:border-ink-800'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Premium Escrow explanation Box */}
            <div className="p-4 bg-jade-50 dark:bg-jade-950/20 border border-jade-500/20 rounded-2xl flex items-start gap-3">
              <Shield className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-sans font-bold text-xs text-jade-800 dark:text-jade-400">Escrow Security Shield Active</h5>
                <p className="text-xs text-jade-700 dark:text-jade-300/80 leading-relaxed mt-0.5">
                  Your funds are secure! GoodSale holds the payment neutral in escrow. The seller only receives payout once you receive delivery and verify your secret PIN.
                </p>
              </div>
            </div>

          </div>

          {/* B. Right side: Dynamic buy & information details (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-4">
              
              {/* Product Header Row */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-300 text-xs font-extrabold rounded uppercase tracking-wider">
                    {product.condition.replace('_', ' ')}
                  </span>
                  <span className="text-xs font-semibold text-jade-500 uppercase tracking-widest">{product.category}</span>
                </div>
                <h1 className="font-sans font-extrabold text-2xl text-ink-900 dark:text-white leading-snug">
                  {product.title}
                </h1>
                
                {/* Location indicator */}
                <div className="flex items-center gap-1.5 text-xs text-ink-400 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-jade-500" />
                  <span>{sellerProfile?.city || 'Lagos'}, {sellerProfile?.state || 'Lagos State'} • Nigeria</span>
                </div>
              </div>

              {/* Pricing section or Auction Bid info */}
              {!product.isAuction ? (
                <div className="space-y-3">
                  <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-ink-400 uppercase tracking-widest block font-medium">Escrow Purchase Price</span>
                      <span className="font-sans font-extrabold text-2xl text-ink-900 dark:text-white">₦{product.price.toLocaleString()}</span>
                    </div>
                    {product.isNegotiable && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-ink-500/10 border border-ink-500/20 rounded-lg text-xs font-bold text-ink-600 dark:text-ink-400">
                        <Tag className="w-3.5 h-3.5" />
                        Price Negotiable
                      </span>
                    )}
                  </div>

                  {/* Price alert subscription panel */}
                  <div className={`p-4 rounded-2xl border transition-all duration-300 ${isAlertSubscribed ? 'bg-jade-500/5 border-jade-500/20 dark:border-jade-500/30' : 'bg-ink-50 dark:bg-ink-800/10 border-ink-100 dark:border-ink-800/60'}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${isAlertSubscribed ? 'bg-jade-500/10 text-jade-500 ring-4 ring-jade-500/5' : 'bg-ink-100 dark:bg-ink-800 text-ink-400'}`}>
                          {isAlertSubscribed ? <Bell className="w-4 h-4 animate-pulse" /> : <BellOff className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-ink-800 dark:text-ink-200">Price Drop Alerts</h4>
                          <p className="text-xs text-ink-400 leading-normal mt-0.5 truncate">
                            {isAlertSubscribed 
                              ? `Subscribed to drops below ₦${Number(alertThreshold).toLocaleString()}` 
                              : 'Get an instant in-app alert when this price drops.'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (isAlertSubscribed) {
                            togglePriceAlert();
                          } else {
                            setShowThresholdForm(!showThresholdForm);
                          }
                        }}
                        className={`px-3 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer select-none shrink-0 ${isAlertSubscribed ? 'bg-ink-500/10 hover:bg-ink-500/20 text-ink-500 border border-ink-500/15' : 'bg-jade-500 hover:bg-jade-600 text-white shadow-sm shadow-jade-500/10'}`}
                      >
                        {isAlertSubscribed ? 'Unsubscribe' : 'Notify Me'}
                      </button>
                    </div>

                    {/* Threshold custom input form */}
                    {showThresholdForm && !isAlertSubscribed && (
                      <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800/60 flex flex-col gap-2">
                        <p className="text-xs font-medium text-ink-500 dark:text-ink-400">
                          Set target price (defaults to current: ₦{product.price.toLocaleString()}):
                        </p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-2 text-xs text-ink-400 font-mono">₦</span>
                            <input
                              type="number"
                              value={alertThreshold}
                              onChange={(e) => setAlertThreshold(e.target.value)}
                              placeholder={product.price.toString()}
                              className="w-full pl-6 pr-3 py-1.5 text-xs bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-jade-500 text-ink-800 dark:text-white"
                            />
                          </div>
                          <button
                            onClick={() => {
                              const val = alertThreshold.trim() ? Number(alertThreshold) : product.price;
                              togglePriceAlert(val);
                              setShowThresholdForm(false);
                            }}
                            className="px-3 py-1.5 bg-jade-500 hover:bg-jade-600 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Active Alert
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-ink-500/5 border border-ink-500/20 rounded-2xl space-y-4">
                  {/* Live Countdown Timer */}
                  <div className="flex items-center justify-between p-3 bg-ink-900 text-white rounded-xl border border-ink-500/30 shadow-md">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-ink-500 animate-pulse" />
                      <span className="text-xs font-mono tracking-widest uppercase font-extrabold text-ink-400">
                        {auction?.isActive ? 'AUCTION COUNTDOWN' : 'AUCTION STATUS'}
                      </span>
                    </div>
                    <div className="font-mono text-xs font-black tracking-widest text-ink-400">
                      {auction?.isActive ? (timeLeft || 'Calculating...') : 'CLOSED'}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-xs text-ink-500 uppercase tracking-widest font-bold flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" /> {auction?.isActive ? 'Current Top Bid' : 'Winning Bid'}
                      </span>
                      <span className="font-sans font-extrabold text-2xl text-ink-900 dark:text-white block mt-1">
                        ₦{currentHighestBid.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-ink-400 block uppercase">Starting Bid</span>
                      <span className="font-sans font-semibold text-xs text-ink-500 dark:text-ink-400">₦{auction?.startingBid.toLocaleString()}</span>
                    </div>
                  </div>

                  {auction?.isActive ? (
                    <>
                      {/* Bidding interactive form */}
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={customBidAmount}
                            onChange={(e) => setCustomBidAmount(e.target.value)}
                            placeholder="Enter bid amount (₦)"
                            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-ink-500 text-ink-800 dark:text-white"
                          />
                          <button
                            onClick={handlePlaceBid}
                            className="px-5 py-2 bg-ink-500 hover:bg-ink-600 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            Place Bid
                          </button>
                        </div>
                        {bidError && <p className="text-xs font-bold text-ink-500">{bidError}</p>}
                        {bidSuccess && <p className="text-xs font-bold text-jade-500 flex items-center gap-1">Bid Placed Successfully!</p>}
                      </div>

                      {/* Fast-Forward Simulator */}
                      <div className="pt-1 flex justify-end">
                        <button
                          onClick={() => {
                            if (auction) {
                              const closeRes = dbOperations.closeAuction(auction.id);
                              if (closeRes) {
                                setDb(getDBState());
                                toast.success('Auction force-closed and pending escrow order generated.');
                              }
                            }
                          }}
                          className="px-2 py-1 bg-ink-500/10 hover:bg-ink-500/20 text-ink-500 text-xs font-mono uppercase tracking-widest border border-ink-500/25 rounded-lg cursor-pointer"
                          title="Simulate timer hitting 0 immediately"
                        >
                          Simulate Fast-Forward End
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 bg-jade-500/10 border border-jade-500/20 rounded-xl text-center">
                      <span className="text-xs text-jade-600 dark:text-jade-400 font-extrabold uppercase tracking-widest block mb-1">
                        Auction Concluded
                      </span>
                      {bids.length > 0 ? (
                        <div className="space-y-2 mt-1">
                          <p className="text-xs font-bold text-ink-800 dark:text-white">
                            Winner: <span className="text-jade-500">@{bids[0].username}</span> with top bid of <span className="font-mono text-jade-600 dark:text-jade-400">₦{bids[0].amount.toLocaleString()}</span>!
                          </p>
                          <p className="text-xs text-ink-400 leading-normal">
                            A pending escrow order has been automatically generated for @{bids[0].username} to complete deposit.
                          </p>
                          {db.currentUser?.id === bids[0].userId && (
                            <button
                              onClick={() => onNavigate('profile')}
                              className="mt-1.5 px-3 py-1.5 bg-jade-500 hover:bg-jade-600 text-white text-xs font-black uppercase tracking-wider rounded-lg cursor-pointer inline-block"
                            >
                              Go to My Purchases & Pay
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-400 mt-1">Closed with no active bids.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Primary C2C CTA Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {!product.isAuction ? (
                  <>
                    <button
                      onClick={handleBuyNow}
                      className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-sans font-extrabold text-sm rounded-xl transition-all shadow-lg shadow-jade-500/10 cursor-pointer"
                    >
                      Buy Now (Escrow)
                    </button>
                    
                    <button
                      onClick={() => onAddToCart(product.id)}
                      className="w-full py-3 bg-white dark:bg-ink-900 text-ink-900 dark:text-white border border-ink-200 dark:border-ink-800 font-sans font-bold text-sm rounded-xl hover:bg-ink-50 transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <ShoppingCart className="w-4 h-4 text-jade-500" />
                      Add to Shopping Cart
                    </button>
                  </>
                ) : (
                  <div className="col-span-2 p-3 bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl">
                    <span className="text-xs font-extrabold text-ink-400 uppercase tracking-widest block mb-2">Bid History Log ({bids.length})</span>
                    {bids.length === 0 ? (
                      <p className="text-xs text-ink-400 italic">No bids placed yet. Be the first!</p>
                    ) : (
                      <div className="space-y-2 max-h-32 overflow-y-auto divide-y divide-ink-100 dark:divide-ink-800">
                        {bids.map((b) => (
                          <div key={b.id} className="flex justify-between items-center text-xs pt-1.5 first:pt-0 font-sans text-ink-700 dark:text-ink-300">
                            <span className="font-bold flex items-center gap-1.5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.userAvatar} alt="" className="w-4 h-4 rounded-full" />
                              @{b.username}
                            </span>
                            <span className="font-mono font-bold text-ink-950 dark:text-white">₦{b.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Negotiation offering drawer triggers */}
              {product.isNegotiable && !product.isAuction && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowNegotiateDrawer(!showNegotiateDrawer)}
                    className="w-full py-2 bg-ink-500/10 hover:bg-ink-500/20 text-ink-500 border border-ink-500/20 font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Submit Negotiation Custom Offer Price
                  </button>
                  
                  {showNegotiateDrawer && (
                    <div className="mt-3 p-4 bg-ink-500/5 border border-ink-500/20 rounded-2xl flex gap-2">
                      <input
                        type="number"
                        value={negotiateOffer}
                        onChange={(e) => setNegotiateOffer(e.target.value)}
                        placeholder="Offer price in ₦ (e.g. 110000)"
                        className="flex-1 px-3 py-2 text-xs bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl focus:ring-1 focus:ring-ink-500 focus:outline-none text-ink-800 dark:text-white"
                      />
                      <button
                        onClick={handleSendOffer}
                        className="px-4 bg-ink-500 hover:bg-ink-600 text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send Offer
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Chat with Merchant connector */}
              <button
                onClick={handleStartChat}
                className="w-full py-2.5 bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300 font-bold text-xs rounded-xl hover:bg-ink-200 dark:hover:bg-ink-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-jade-500" />
                Chat Real-Time with Seller
              </button>

            </div>

            {/* C. Seller Information Widget */}
            <div 
              onClick={() => seller && onNavigate('seller-profile', { sellerId: seller.id })}
              className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-5 shadow-sm flex items-center justify-between gap-4 cursor-pointer hover:border-jade-500/50 hover:shadow-md transition-all group"
              title="Click to view seller storefront"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-jade-500/10 overflow-hidden relative">
                  <SmartAvatar src={sellerProfile?.photoUrl} name={seller?.fullName || 'GoodSale Seller'} className="w-full h-full" />
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="font-sans font-bold text-sm text-ink-950 dark:text-white group-hover:text-jade-500 transition-colors">{seller?.fullName || 'GoodSale Seller'}</span>
                    {isSellerVerified && <CheckCircle className="w-4 h-4 text-ink-500 fill-ink-500/10" />}
                  </div>
                  <span className="text-xs text-ink-400 font-mono">Level: {seller?.sellerLevel} • Trust Score: {seller?.trustScore}% • View Storefront</span>
                </div>
              </div>

              {business ? (
                <div className="text-right border-l border-ink-100 dark:border-ink-800 pl-4 hidden sm:block">
                  <span className="text-xs text-jade-500 uppercase tracking-widest font-bold block">Business Merchant</span>
                  <span className="font-sans font-bold text-xs text-ink-800 dark:text-ink-300 group-hover:text-jade-500 transition-colors">{business.name}</span>
                </div>
              ) : (
                <span className="text-xs text-jade-500 font-bold group-hover:underline flex items-center gap-1 font-mono uppercase tracking-wider">
                  View Store
                </span>
              )}
            </div>

            {/* D. Specifications & Descriptions Sheet */}
            <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white border-b border-ink-100 dark:border-ink-800 pb-2">
                Item Specifications & Description
              </h3>
              
              <p className="text-xs text-ink-600 dark:text-ink-400 leading-relaxed">
                {product.description}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-ink-50 dark:border-ink-800">
                    <span className="text-ink-400">Brand</span>
                    <span className="font-bold text-ink-800 dark:text-ink-200">{product.brand || 'Generic'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-ink-50 dark:border-ink-800">
                    <span className="text-ink-400">Condition</span>
                    <span className="font-bold text-ink-800 dark:text-ink-200">{product.condition}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-ink-50 dark:border-ink-800">
                    <span className="text-ink-400">Barcode</span>
                    <span className="font-mono font-bold text-ink-800 dark:text-ink-200">{product.barcode || 'N/A'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-ink-50 dark:border-ink-800">
                    <span className="text-ink-400">Delivery</span>
                    <span className="font-bold text-ink-800 dark:text-ink-200">{product.deliveryMethod.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-ink-50 dark:border-ink-800">
                    <span className="text-ink-400">Warranty</span>
                    <span className="font-bold text-ink-800 dark:text-ink-200">{product.warranty || 'No Warranty'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-ink-50 dark:border-ink-800">
                    <span className="text-ink-400">Return Policy</span>
                    <span className="font-bold text-ink-800 dark:text-ink-200">{product.returnPolicy || 'No Returns'}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* E. Product Reviews, Comments & Vendor QA Section */}
        <div id="product-reviews-section" className="mt-12 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-8">
          
          <div className="border-b border-ink-100 dark:border-ink-800 pb-5">
            <h2 className="font-sans font-extrabold text-xl text-ink-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-jade-500" />
              Customer Reviews & Verified Merchant QA
            </h2>
            <p className="text-xs text-ink-400 mt-1">
              Read verified purchase reviews, ask product questions, or discuss delivery options with other verified members.
            </p>
          </div>

          {/* Metrics summary widget */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center bg-ink-50 dark:bg-ink-900/50 p-6 rounded-3xl border border-ink-100 dark:border-ink-800/80">
            <div className="md:col-span-4 text-center md:text-left space-y-1 border-r border-ink-100 dark:border-ink-800 pr-0 md:pr-6">
              <span className="text-xs text-ink-400 uppercase tracking-widest font-bold">Overall Rating</span>
              <div className="flex items-baseline justify-center md:justify-start gap-2">
                <span className="font-sans font-extrabold text-4xl text-ink-950 dark:text-white">{averageRating}</span>
                <span className="text-xs text-ink-400">out of 5</span>
              </div>
              <div className="flex items-center justify-center md:justify-start gap-1 text-ink-500 my-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-4 h-4 ${i < Math.round(Number(averageRating)) ? 'fill-ink-500' : 'text-ink-200 dark:text-ink-800'}`} 
                  />
                ))}
              </div>
              <span className="text-xs text-ink-400 block font-mono">Based on {reviewsWithRating.length} verified ratings</span>
            </div>

            {/* Progress Bars */}
            <div className="md:col-span-5 space-y-2 border-r border-ink-100 dark:border-ink-800 pr-0 md:pr-6">
              {[5, 4, 3, 2, 1].map(stars => {
                const count = reviewsWithRating.filter(r => r.rating === stars).length;
                const percent = reviewsWithRating.length > 0 ? (count / reviewsWithRating.length) * 100 : 0;
                return (
                  <div key={stars} className="flex items-center gap-3 text-xs">
                    <span className="font-bold w-3 font-mono">{stars}</span>
                    <Star className="w-3.5 h-3.5 text-ink-500 fill-ink-500 shrink-0" />
                    <div className="flex-1 h-2 bg-ink-200 dark:bg-ink-800 rounded-full overflow-hidden">
                      <div className="h-full bg-ink-500 rounded-full" style={{ width: `${percent}%` }}></div>
                    </div>
                    <span className="text-ink-400 font-mono w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Shield and Guarantee Info */}
            <div className="md:col-span-3 space-y-2 text-center md:text-left">
              <Award className="w-8 h-8 text-jade-500 mx-auto md:mx-0 shrink-0" />
              <h4 className="text-xs font-bold text-ink-950 dark:text-white">Escrow-Verified Reviews</h4>
              <p className="text-xs text-ink-500 dark:text-ink-400 leading-relaxed">
                Reviews with the <span className="text-ink-500 font-semibold">Verified Buyer</span> badge correspond to completed escrow transactions on GoodSale.
              </p>
            </div>
          </div>

          {/* Write a comment/review box */}
          <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white flex items-center gap-1.5">
              Share Your Thoughts or Ask a Question
            </h3>
            
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="text-ink-500">Your Rating:</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { val: 5, label: '5 — Excellent' },
                  { val: 4, label: '4 — Great' },
                  { val: 3, label: '3 — Good' },
                  { val: 2, label: '2 — Fair' },
                  { val: 1, label: '1 — Poor' },
                  { val: 0, label: 'Just Ask Question (No Rating)' }
                ].map(item => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setNewCommentRating(item.val)}
                    className={`px-2.5 py-1 rounded-lg font-medium text-xs transition-all cursor-pointer ${newCommentRating === item.val ? 'bg-jade-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-400 hover:bg-ink-200'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <textarea
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder={newCommentRating === 0 ? "Ask the vendor a question about shipping, negotiation or condition..." : "Write your verified product review, size fit description, courier speed..."}
                rows={3}
                className="w-full p-3.5 bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-jade-500 text-ink-800 dark:text-white"
              />
              
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="text-xs text-jade-500 font-bold bg-jade-500/5 px-2.5 py-1 rounded-lg border border-jade-500/10 flex items-center gap-1">
                  Reward Active: Earn 15 GoodPoints for submitting high-quality posts!
                </span>
                
                <button
                  type="button"
                  onClick={handleAddProductComment}
                  className="px-5 py-2 bg-jade-500 hover:bg-jade-600 text-white font-sans font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Post Comment & Review
                </button>
              </div>
              {reviewSubmitFeedback && (
                <p className="text-xs text-jade-500 font-bold flex items-center gap-1">{reviewSubmitFeedback}</p>
              )}
            </div>
          </div>

          {/* Filtering Chips */}
          <div className="flex items-center justify-between border-b border-ink-100 dark:border-ink-800 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: 'all', label: `All Discussions (${productReviews.length})` },
                { id: 'verified', label: `Ratings & Reviews (${reviewsWithRating.length})` },
                { id: 'qa', label: `Questions & Answers (${productReviews.length - reviewsWithRating.length})` }
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setActiveReviewFilter(filter.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${activeReviewFilter === filter.id ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 shadow-sm' : 'bg-ink-50 dark:bg-ink-800 text-ink-500 dark:text-ink-400 hover:bg-ink-100'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-400 font-mono">Showing {filteredReviews.length} results</span>
          </div>

          {/* Review Cards list */}
          <div className="space-y-6">
            {filteredReviews.length === 0 ? (
              <div className="p-8 text-center bg-ink-50 dark:bg-ink-900/20 rounded-3xl border border-dashed border-ink-200 dark:border-ink-800">
                <p className="text-xs text-ink-400 italic">No comments or ratings matched the filter yet. Be the first to start the conversation!</p>
              </div>
            ) : (
              filteredReviews.map(rev => {
                const isVerifiedPurchase = rev.orderId !== undefined || rev.rating > 0;
                return (
                  <div key={rev.id} className="border-b border-ink-100 dark:border-ink-800/80 pb-6 last:border-b-0 space-y-3">
                    
                    {/* Review Header */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden relative border border-ink-200/50 dark:border-ink-700/50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={rev.reviewerPhoto} alt={rev.reviewerName} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-sans font-bold text-xs text-ink-900 dark:text-white">
                              {rev.reviewerName}
                            </span>
                            {isVerifiedPurchase ? (
                              <span className="px-1.5 py-0.5 bg-ink-500/10 border border-ink-500/20 text-xs font-extrabold text-ink-600 dark:text-ink-400 rounded uppercase tracking-wider flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" /> Verified Buyer
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-ink-100 dark:bg-ink-800 text-xs font-semibold text-ink-500 rounded uppercase tracking-wider">
                                Community
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-ink-400 block font-mono">{new Date(rev.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>

                      {/* Stars for review */}
                      {rev.rating > 0 && (
                        <div className="flex gap-0.5 text-ink-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star 
                              key={i} 
                              className={`w-3.5 h-3.5 ${i < rev.rating ? 'fill-ink-500' : 'text-ink-200 dark:text-ink-800'}`} 
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Comment content */}
                    <p className="text-xs text-ink-700 dark:text-ink-300 leading-relaxed font-sans font-normal pl-0 sm:pl-12">
                      {rev.comment}
                    </p>

                    {/* Helpful Votes, Reply Button Actions */}
                    <div className="flex items-center gap-4 text-xs font-semibold pl-0 sm:pl-12">
                      <button
                        type="button"
                        onClick={() => handleHelpfulVote(rev.id)}
                        className="inline-flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400 hover:text-jade-500 transition-colors bg-ink-50 dark:bg-ink-800 px-2.5 py-1 rounded-lg border border-ink-100 dark:border-ink-800 cursor-pointer"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        Helpful ({rev.isHelpfulVotes || 0})
                      </button>

                      <button
                        type="button"
                        onClick={() => setReplyingToReviewId(replyingToReviewId === rev.id ? null : rev.id)}
                        className="inline-flex items-center gap-1 text-xs text-jade-500 hover:underline cursor-pointer bg-jade-500/5 px-2.5 py-1 rounded-lg border border-jade-500/10"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Reply / Comment
                      </button>
                    </div>

                    {/* Replying input field */}
                    {replyingToReviewId === rev.id && (
                      <div className="pl-0 sm:pl-12 mt-2 flex gap-2 max-w-2xl">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your reply as vendor or interested buyer..."
                          className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-800 rounded-xl focus:ring-1 focus:ring-jade-500 focus:outline-none text-ink-800 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddReply(rev.id)}
                          className="px-4 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          Send
                        </button>
                      </div>
                    )}

                    {/* Indented Replies List */}
                    {rev.replies && rev.replies.length > 0 && (
                      <div className="pl-4 sm:pl-16 space-y-3 mt-3 border-l-2 border-jade-500/20">
                        {rev.replies.map(rep => (
                          <div key={rep.id} className="bg-ink-50 dark:bg-ink-900/60 p-3.5 rounded-2xl space-y-2">
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-ink-100 overflow-hidden relative border border-ink-200/50">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={rep.authorPhoto} alt={rep.authorName} className="w-full h-full object-cover" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-ink-800 dark:text-ink-200">{rep.authorName}</span>
                                    
                                    {rep.authorRole === 'SELLER' ? (
                                      <span className="px-1.5 py-0.2 bg-jade-500/10 border border-jade-500/20 text-[10px] font-extrabold text-jade-600 dark:text-jade-400 rounded uppercase tracking-wider">
                                        Vendor Merchant
                                      </span>
                                    ) : rep.authorRole === 'ADMIN' ? (
                                      <span className="px-1.5 py-0.2 bg-jade-500/10 border border-jade-500/20 text-[10px] font-extrabold text-jade-600 rounded uppercase tracking-wider">
                                        Moderator
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 bg-ink-100 dark:bg-ink-800 text-[10px] font-semibold text-ink-500 rounded uppercase tracking-wider">
                                        Buyer
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-ink-400 block font-mono">{new Date(rep.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-ink-600 dark:text-ink-400 leading-normal pl-9 flex items-center gap-1">
                              <CornerDownRight className="w-3.5 h-3.5 text-ink-300 shrink-0" />
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

        {/* Context-aware Gemini Security Tip Banner */}
        <div id="gemini-security-tip-banner" className="mt-12 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm overflow-hidden relative group transition-all duration-300 hover:shadow-md">
          <div className="absolute -top-12 -right-12 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10">
            <Shield className="w-48 h-48 text-jade-500" />
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl shrink-0 transition-colors duration-300 ${
                loadingTip ? 'bg-jade-500/10 text-jade-500 animate-pulse' :
                securityTip?.threatLevel === 'HIGH' ? 'bg-jade-500/10 text-jade-500 dark:bg-jade-500/20' :
                securityTip?.threatLevel === 'MEDIUM' ? 'bg-ink-500/10 text-ink-500 dark:bg-ink-500/20' :
                'bg-jade-500/10 text-jade-500 dark:bg-jade-500/20'
              }`}>
                <Shield className="w-6 h-6 animate-pulse" />
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans font-bold text-sm tracking-tight text-ink-800 dark:text-white">
                    {loadingTip ? 'Consulting Gemini Trust Engine...' : (securityTip?.badgeTitle || 'Smart Verification Guide')}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                    loadingTip ? 'bg-jade-500/10 text-jade-500 animate-pulse' :
                    securityTip?.threatLevel === 'HIGH' ? 'bg-jade-500/10 text-jade-500 border border-jade-500/20' :
                    securityTip?.threatLevel === 'MEDIUM' ? 'bg-ink-500/10 text-ink-500 border border-ink-500/20' :
                    'bg-jade-500/10 text-jade-500 border border-jade-500/20'
                  }`}>
                    {loadingTip ? 'AI ANALYZING' : `${securityTip?.threatLevel || 'SECURE'} RISK`}
                  </span>
                </div>
                
                {loadingTip ? (
                  <div className="space-y-2 py-1 max-w-2xl">
                    <div className="h-3 bg-ink-200 dark:bg-ink-800 rounded-full w-96 animate-pulse" />
                    <div className="h-3 bg-ink-200 dark:bg-ink-800 rounded-full w-80 animate-pulse" />
                  </div>
                ) : (
                  <p className="text-xs text-ink-500 dark:text-ink-400 leading-relaxed max-w-3xl">
                    {securityTip?.tip || 'Always check buyer trust scores and inspect items physically at a SafeMeet™ location or utilize verified GoodDispatch™ partner service before releasing escrow.'}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0">
              <span className="inline-flex items-center gap-1 bg-ink-50 dark:bg-ink-950 border border-ink-200/60 dark:border-ink-800/80 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-ink-500 dark:text-ink-400 select-none">
                <Sparkles className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                Gemini Security Assistant
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
