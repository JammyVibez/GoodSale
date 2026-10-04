// components/SellerProfileView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, CheckCircle, MapPin, MessageSquare, Star, 
  Shield, Award, Share2, Store, Clock, UserCheck, UserPlus, Eye, Heart
} from 'lucide-react';
import { 
  getDBState, dbOperations, UserRole, Product 
} from '../lib/store';
import { SmartAvatar } from './ui/SmartImage';

interface SellerProfileViewProps {
  sellerId: number;
  onBack: () => void;
  onNavigate: (view: string, payload?: any) => void;
}

export default function SellerProfileView({
  sellerId,
  onBack,
  onNavigate,
}: SellerProfileViewProps) {
  const [db, setDb] = useState(getDBState());
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const seller = db.users.find(u => u.id === sellerId);
  const profile = db.profiles.find(p => p.userId === sellerId);
  const business = db.businesses.find(b => b.ownerId === sellerId);
  const isSellerVerified = seller 
    ? (seller.role === UserRole.VERIFIED_SELLER || seller.role === UserRole.VERIFIED_BUSINESS) 
    : false;

  useEffect(() => {
    if (business) {
      setFollowersCount(business.followers);
    } else {
      // Real followers from the follower_relations table — never fabricated
      setFollowersCount(db.followerRelations.filter((f) => f.followedUserId === sellerId).length);
    }
    const me = db.currentUser;
    setIsFollowing(
      !!me &&
        db.followerRelations.some((f) => f.followerId === me.id && f.followedUserId === sellerId)
    );
  }, [sellerId, business, db.followerRelations, db.currentUser]);

  if (!seller) {
    return (
      <div className="p-8 text-center" id="seller-not-found">
        <p className="text-ink-500">Seller not found.</p>
        <button onClick={onBack} className="text-jade-500 underline text-xs mt-2">
          Back to Catalog
        </button>
      </div>
    );
  }

  // Filter listings only owned by this seller
  const sellerProducts = db.products.filter(p => p.sellerId === seller.id);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleFollow = () => {
    const me = db.currentUser;
    if (!me) {
      triggerToast('Sign in to follow this seller.');
      return;
    }
    const next = !isFollowing;
    setIsFollowing(next);
    if (next) {
      setFollowersCount((c) => c + 1);
      dbOperations.followSeller(me.id, sellerId);
      triggerToast(`You are now following @${seller.username}!`);
    } else {
      setFollowersCount((c) => Math.max(0, c - 1));
      dbOperations.unfollowSeller(me.id, sellerId);
      triggerToast(`You unfollowed @${seller.username}.`);
    }
  };

  const handleStartChat = async () => {
    // Look for existing product or first product of this seller to initiate chat room
    const dummyProduct = sellerProducts[0] || db.products[0];
    if (dummyProduct) {
      const roomId = await dbOperations.getOrCreateChatRoom(dummyProduct.id);
      if (roomId) {
        onNavigate('chats', { roomId });
      }
    } else {
      triggerToast('Cannot start chat: No listing context available.');
    }
  };

  const toggleFavorite = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(fId => fId !== id) : [...prev, id]
    );
    triggerToast(favorites.includes(id) ? 'Removed from saved' : 'Added to saved items');
  };

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen pb-16 transition-colors duration-300" id={`seller-profile-${seller.id}`}>
      
      {/* Toast banner inside component */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-ink-900 text-white dark:bg-white dark:text-ink-950 px-4 py-3 rounded-xl font-sans font-semibold text-xs shadow-2xl flex items-center gap-2 border border-ink-800 dark:border-ink-200 animate-slide-in">
          <span className="w-2 h-2 bg-jade-500 rounded-full animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Cover Banner */}
      <div className="relative h-48 sm:h-64 bg-gradient-to-r from-ink-900 via-ink-800 to-jade-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-jade-500/10 via-transparent to-transparent pointer-events-none" />
        
        {/* Back navigation absolute */}
        <div className="absolute top-4 left-4 z-10">
          <button 
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-sans font-bold text-ink-800 dark:text-ink-200 bg-white/90 dark:bg-ink-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl hover:bg-white transition-all shadow-md cursor-pointer border border-ink-100 dark:border-ink-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Share Button */}
        <div className="absolute top-4 right-4 z-10">
          <button 
            onClick={() => triggerToast(`Copied profile link for @${seller.username}!`)}
            className="p-2.5 bg-white/90 dark:bg-ink-900/90 backdrop-blur-md rounded-xl hover:bg-white transition-all shadow-md cursor-pointer border border-ink-100 dark:border-ink-800 text-ink-700 dark:text-ink-300"
            title="Share Profile"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24 relative z-20">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Vendor Bio Card */}
          <div className="lg:col-span-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-6">
            
            <div className="flex flex-col items-center text-center">
              
              {/* Profile Photo */}
              <div className="w-28 h-28 rounded-full border-4 border-white dark:border-ink-900 shadow-xl overflow-hidden bg-ink-100 dark:bg-ink-800 relative mb-4">
                <SmartAvatar 
                  src={profile?.photoUrl} 
                  name={seller.fullName} 
                  seed={seller.username}
                  className="w-full h-full" 
                />
              </div>

              {/* Identity & Badges */}
              <div className="flex items-center gap-1.5">
                <h2 className="font-sans font-extrabold text-xl text-ink-900 dark:text-white leading-none">
                  {seller.fullName}
                </h2>
                {isSellerVerified && (
                  <span title="Certified Gold Verified Seller">
                    <CheckCircle className="w-5 h-5 text-ink-500 fill-ink-500/10" />
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-ink-400 mt-1">@{seller.username}</p>

              {/* City & State location badge */}
              <div className="inline-flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400 mt-3 bg-ink-50 dark:bg-ink-800/55 px-3 py-1.5 rounded-full border border-ink-100 dark:border-ink-800">
                <MapPin className="w-3.5 h-3.5 text-jade-500" />
                <span>{profile?.city || 'Lagos'}, {profile?.state || 'Nigeria'}</span>
              </div>
            </div>

            {/* Premium Stat Row (Bento Style) */}
            <div className="grid grid-cols-3 gap-2 text-center border-y border-ink-100 dark:border-ink-800 py-4">
              <div>
                <span className="text-xs text-ink-400 uppercase tracking-widest block font-bold">Trust Score</span>
                <span className="font-sans font-black text-jade-500 text-lg leading-tight block mt-0.5">
                  {seller.trustScore}%
                </span>
              </div>
              <div className="border-x border-ink-100 dark:border-ink-800">
                <span className="text-xs text-ink-400 uppercase tracking-widest block font-bold">Level</span>
                <span className="font-sans font-black text-ink-800 dark:text-ink-100 text-sm leading-tight block mt-1 uppercase tracking-wider">
                  {seller.sellerLevel}
                </span>
              </div>
              <div>
                <span className="text-xs text-ink-400 uppercase tracking-widest block font-bold">Followers</span>
                <span className="font-sans font-black text-ink-800 dark:text-ink-100 text-lg leading-tight block mt-0.5">
                  {followersCount}
                </span>
              </div>
            </div>

            {/* Bio info */}
            <div>
              <h4 className="font-sans font-bold text-xs text-ink-900 dark:text-white uppercase tracking-wider mb-2">Merchant Bio</h4>
              <p className="text-xs text-ink-500 dark:text-ink-400 leading-relaxed font-sans">
                {profile?.bio || 'Certified C2C merchant operating securely in Nigeria. All products are verified and transaction safe.'}
              </p>
            </div>

            {/* Action buttons (Follow & Chat) */}
            <div className="space-y-3.5">
              <button
                onClick={handleToggleFollow}
                className={`w-full py-2.5 rounded-xl font-sans font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${isFollowing ? 'bg-ink-100 dark:bg-ink-800 border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-300' : 'bg-jade-500 border-jade-500 hover:bg-jade-600 text-white shadow-md shadow-jade-500/10'}`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Follow Store
                  </>
                )}
              </button>

              <button
                onClick={handleStartChat}
                className="w-full py-2.5 bg-ink-900 hover:bg-ink-800 text-white dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100 rounded-xl font-sans font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <MessageSquare className="w-4 h-4 text-jade-500" />
                Chat Real-Time
              </button>
            </div>

            {/* Escrow Shield indicator */}
            <div className="p-4 bg-jade-50 dark:bg-jade-950/15 border border-jade-500/20 rounded-2xl flex gap-3">
              <Shield className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-sans font-bold text-xs text-jade-800 dark:text-jade-400">Neutral Escrow Payouts</h5>
                <p className="text-xs text-jade-700 dark:text-jade-300/80 leading-relaxed mt-0.5">
                  Transactions with @{seller.username} are fully insured under the GoodSale Escrow. Your funds are held safely until delivery.
                </p>
              </div>
            </div>

          </div>

          {/* Right Column: Business storefront or Listings catalog */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* If Business details exist, show business highlight card */}
            {business && (
              <div className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-jade-500/5 to-jade-500/5 pointer-events-none" />
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-jade-500/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={business.logoUrl} alt={business.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-sans font-extrabold text-base text-ink-900 dark:text-white">{business.name}</h3>
                        <span title="Certified Premium Store Badge">
                          <CheckCircle className="w-4.5 h-4.5 text-ink-500 fill-ink-500/10" />
                        </span>
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400 font-sans mt-0.5">{business.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 bg-ink-500/10 border border-ink-500/20 rounded-xl px-3 py-1.5 text-ink-600 dark:text-ink-400 text-xs font-bold">
                    <Star className="w-3.5 h-3.5 text-ink-400 fill-ink-400" />
                    <span>{business.rating} Rating ({business.reviewsCount} Reviews)</span>
                  </div>
                </div>

                <div className="border-t border-ink-100 dark:border-ink-800/80 mt-4 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans text-ink-500 dark:text-ink-400">
                  <div className="flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-jade-500 shrink-0" />
                    <span>Store address: {business.address}, {business.city}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-jade-500 shrink-0" />
                    <span>Opening Hours: {business.openingHours}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Listings Header and Count */}
            <div>
              <h3 className="font-sans font-extrabold text-lg text-ink-950 dark:text-white flex items-center gap-2 mb-4">
                Active Merchant Listings
                <span className="text-xs font-mono font-medium text-ink-400 bg-ink-100 dark:bg-ink-800 px-2 py-0.5 rounded-full">
                  {sellerProducts.length}
                </span>
              </h3>

              {/* Catalog Grid using the compact, scannable cards style */}
              {sellerProducts.length === 0 ? (
                <div className="p-12 text-center bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-800 shadow-sm">
                  <p className="text-ink-400 italic text-sm">This merchant currently has no active listings.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="seller-listings-grid">
                  {sellerProducts.map((product) => {
                    return (
                      <div 
                        key={product.id}
                        onClick={() => onNavigate('product', { id: product.id })}
                        className="bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group cursor-pointer flex flex-col justify-between"
                      >
                        
                        {/* Compact Product image container */}
                        <div className="h-40 bg-ink-100 dark:bg-ink-800 relative overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={product.images[0]} 
                            alt={product.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                          />
                          
                          {/* Favorite button */}
                          <button 
                            onClick={(e) => toggleFavorite(product.id, e)}
                            className="absolute top-2 right-2 p-1.5 bg-white/80 dark:bg-ink-900/80 backdrop-blur-sm rounded-full text-ink-500 dark:text-ink-400 hover:text-ink-500 dark:hover:text-ink-400 transition-colors cursor-pointer shadow-sm"
                          >
                            <Heart className={`w-3.5 h-3.5 ${favorites.includes(product.id) ? 'fill-ink-500 text-ink-500' : ''}`} />
                          </button>

                          {/* Condition badge */}
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-ink-900/85 text-white text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                            {product.condition.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Card metadata block */}
                        <div className="p-3 flex-1 flex flex-col justify-between gap-2 text-xs">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-jade-500 uppercase tracking-widest truncate max-w-[65%]">
                                {product.category}
                              </span>
                              <div className="flex items-center gap-0.5 font-semibold text-xs text-ink-500 dark:text-ink-400 shrink-0">
                                <Star className="w-3 h-3 text-ink-400 fill-ink-400" />
                                <span>{seller.trustScore}%</span>
                              </div>
                            </div>

                            <h4 className="font-sans font-bold text-sm text-ink-900 dark:text-white group-hover:text-jade-500 transition-colors line-clamp-2 leading-snug mb-1">
                              {product.title}
                            </h4>

                            {/* Location & specs details */}
                            <div className="flex items-center gap-1 text-xs text-ink-400 mt-1">
                              <MapPin className="w-3 h-3 text-jade-500 shrink-0" />
                              <span className="truncate">{profile?.city || 'Lagos'}</span>
                            </div>
                          </div>

                          <div className="border-t border-ink-100 dark:border-ink-800/80 pt-2.5 mt-1 flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-ink-400 uppercase tracking-wider block leading-none mb-0.5">Escrow Price</span>
                              <span className="font-sans font-extrabold text-sm text-ink-900 dark:text-white leading-none">
                                ₦{product.price.toLocaleString()}
                              </span>
                            </div>

                            <span className="px-2 py-1 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-0.5 shrink-0">
                              <Eye className="w-3 h-3" />
                              View
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

    </div>
  );
}
