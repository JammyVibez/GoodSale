// lib/store.ts
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { enforceSessionScope } from '@/lib/auth/session';
import { createEmptyState } from '@/lib/data/empty-state';
import {
  loadMarketplaceState,
  subscribeMarketplaceRealtime,
  findProfileByAuthId,
  insertOrderWithEscrow,
  insertMessage,
  upsertProduct,
  updateDeliveryJobLocation,
  updatePartnerLocation,
  upsertDeliveryPartner,
  upsertDeliveryJob,
} from '@/lib/data/sync';
import {
  withClient,
  insertBid,
  insertReview,
  insertReviewReply,
  upsertSafeMeetMeetup,
  updateSafeMeetMeetup,
  insertSponsoredAd,
  updateSponsoredAd,
  insertAnnouncement,
  updateAnnouncement,
  deleteAnnouncementById,
  insertBundle,
  upsertRevenueSettings,
  upsertPaymentSettings,
  insertNotification,
  insertFeaturedListing,
  toggleMessageReaction,
  insertCall,
  updateCall,
  insertReport,
  updateReport,
  deleteReportById,
  upsertServiceArea,
  updateServiceAreaFlags,
  deleteServiceAreaById,
  upsertShippingSettings,
  insertShippingZone,
  updateShippingZone,
  deleteShippingZone,
  insertShippingTier,
  updateShippingTier,
  deleteShippingTier,
  insertShippingRule,
  updateShippingRule,
  deleteShippingRule,
  insertShippingCourier,
  updateShippingCourier,
  deleteShippingCourier,
  insertManualQuote,
  updateManualQuote,
  deleteManualQuote,
  upsertSellerShippingSettings,
  insertShippingAuditLog,
  insertVerificationApplication,
  updateVerificationReview,
  updateDeliveryPartnerReview,
} from '@/lib/data/persist';
import { resolveCityCoords, bestCoords } from '@/lib/geo';
import { makeOrderNumber } from '@/lib/ids';
import { notificationAllowed } from '@/lib/notificationPrefs';
import { computePlatformFee } from '@/lib/fees';
import type {
  GoodSaleDBState,
  User,
  Product,
  Order,
  Message,
  ShippingSettings,
  ShippingZone,
  ShippingDistanceTier,
  ShippingRule,
  ShippingCourier,
  ShippingManualQuote,
  ShippingDeliveryMethod,
  ShippingBreakdown,
  DeliveryStatus,
  AvailableDelivery,
  DeliveryTrackingView,
  DeliveryAnalytics,
} from '@/lib/types';
import {
  UserRole,
  Profile,
  Referral,
  ProductCondition,
  OrderStatus,
  DocumentType,
  VerificationStatus,
  DeliveryVehicleType,
  DeliveryJobStatus,
  Bid,
  DeliveryJob,
  Dispute,
  IdentityVerification,
  Review,
  SafeMeetMeetup,
  DeliveryPartner,
  SponsoredAd,
  AuditLog,
  Announcement,
  RevenueSettings,
  PaymentSettings,
  ProductBundle,
  Notification,
  Escrow,
  Auction,
  ChatRoom,
  GoodPointsTransaction,
  FollowerRelation,
  Wallet,
  WalletTransaction,
  Business,
  BusinessSubscription,
  VerifiedPlusSubscription,
  Call,
  CallKind,
  CallStatus,
  MessageReaction,
  Report,
  ReportStatus,
  ReportTargetType,
  ServiceArea,
  VerificationKind,
  VerificationDocument,
} from '@/lib/types';

// Re-export domain types so existing imports from '../lib/store' keep working
export * from '@/lib/types';

const STORE_CHANGE_EVENT = 'goodsale_db_state_change';

let dbInstance: GoodSaleDBState | null = null;
let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;
let realtimeUnsub: (() => void) | null = null;
let reloadInFlight = false;
let reloadQueued = false;

function notify() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORE_CHANGE_EVENT));
  }
}

export function getDBState(): GoodSaleDBState {
  if (!dbInstance) {
    dbInstance = createEmptyState();
  }
  return dbInstance;
}

export function saveDBState(state: GoodSaleDBState) {
  dbInstance = state;
  notify();
}

export async function reloadFromSupabase() {
  const client = createClient();
  if (!client) {
    dbInstance = createEmptyState();
    notify();
    return;
  }
  const { data: sessionData } = await client.auth.getSession();
  const authId = sessionData.session?.user?.id ?? null;
  const next = await loadMarketplaceState(client, authId);
  // Preserve in-flight currentUser if profile lag after signup
  if (!next.currentUser && dbInstance?.currentUser) {
    next.currentUser = dbInstance.currentUser;
  }
  dbInstance = next;
  notify();
}

/**
 * Serialize realtime reloads: only one full reload runs at a time, and any
 * change that arrives while one is in flight coalesces into a single follow-up
 * reload instead of stacking overlapping queries.
 */
async function runCoalescedReload(): Promise<void> {
  if (reloadInFlight) {
    reloadQueued = true;
    return;
  }
  reloadInFlight = true;
  try {
    await reloadFromSupabase();
  } finally {
    reloadInFlight = false;
    if (reloadQueued) {
      reloadQueued = false;
      void runCoalescedReload();
    }
  }
}

export async function bootstrapStore(): Promise<void> {
  if (bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const client = createClient();
    // “Keep me signed in” unchecked → a new browser session starts signed out.
    if (client) await enforceSessionScope(client);
    await reloadFromSupabase();
    if (client && !realtimeUnsub) {
      let reloadTimer: ReturnType<typeof setTimeout> | null = null;
      realtimeUnsub = subscribeMarketplaceRealtime(client, {
        onChange: () => {
          if (reloadTimer) clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => {
            void runCoalescedReload();
          }, 400);
        },
      });
      client.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          await reloadFromSupabase();
        }
        if (event === 'SIGNED_OUT') {
          const empty = createEmptyState();
          // Still load public catalog
          const loaded = await loadMarketplaceState(client, null);
          loaded.currentUser = null;
          dbInstance = loaded;
          notify();
        }
      });
    }
    bootstrapped = true;
  })();
  return bootstrapPromise;
}

export function isLiveBackendConfigured(): boolean {
  return isSupabaseConfigured();
}

/** Thin POST wrapper for the delivery APIs — they enforce all server rules. */
async function postDeliveryApi(path: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success) {
      return { error: (payload?.error as string) || 'Delivery update failed. Please retry.' };
    }
    await reloadFromSupabase();
    return { success: true as const, data: payload.data ?? payload };
  } catch {
    return { error: 'Could not reach the delivery service. Please retry.' };
  }
}

export const dbOperations = {
  // Authentication Actions — Supabase Auth (profile created by DB trigger)
  async registerUser(
    fullName: string,
    username: string,
    email: string,
    phoneNumber: string,
    role: UserRole,
    password: string,
    referralCodeUsed?: string
  ) {
    const client = createClient();
    if (!client) {
      throw new Error('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    }

    // Email confirmation is disabled for now: the account is created
    // server-side (auto-confirmed) and we sign in right away so the user lands
    // in onboarding instead of an email-verification step.
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        fullName,
        username,
        phoneNumber,
        role: role || UserRole.BUYER,
        referralCodeUsed: referralCodeUsed || null,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      throw new Error(payload.error || 'Registration failed');
    }
    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) throw signInError;

    const { data: authUser } = await client.auth.getUser();
    const authId = authUser.user?.id ?? (payload.userId as string | undefined) ?? null;

    let profile: User | null = null;
    for (let i = 0; i < 8 && authId; i++) {
      profile = await findProfileByAuthId(client, authId);
      if (profile) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    if (profile && role && role !== UserRole.BUYER) {
      await client.from('profiles').update({ role }).eq('id', profile.id);
      profile.role = role;
    }

    // Referral attribution happens atomically inside /api/auth/register using
    // the service role. The browser never inserts referrals or decides rewards.

    await reloadFromSupabase();
    const state = getDBState();
    if (profile) {
      state.currentUser = profile;
      saveDBState(state);
      return profile;
    }
    return getDBState().currentUser;
  },

  async loginWithPassword(emailOrPhone: string, password: string) {
    const client = createClient();
    if (!client) {
      throw new Error('Supabase is not configured. Add credentials to continue.');
    }

    let email = emailOrPhone.trim();
    if (!email.includes('@')) {
      const { data } = await client.from('profiles').select('email').eq('phone_number', email).maybeSingle();
      if (!data?.email) throw new Error('No account found for that phone number.');
      email = data.email;
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('Login failed');

    await reloadFromSupabase();
    const user = getDBState().currentUser;
    if (!user) throw new Error('Profile not found. Ensure supabase/schema.sql has been applied.');
    if (user.isSuspended) {
      await client.auth.signOut();
      const state = getDBState();
      state.currentUser = null;
      saveDBState(state);
      throw new Error('This account has been suspended by an administrator.');
    }
    return user;
  },

  loginUser(userId: number) {
    const state = getDBState();
    const user = state.users.find((u) => u.id === userId);
    if (user) {
      state.currentUser = user;
      saveDBState(state);
    }
  },

  loginAsGuest() {
    throw new Error('Guest login removed. Please create a real account.');
  },

  async logout() {
    const client = createClient();
    if (client) {
      await client.auth.signOut();
    }
    const state = getDBState();
    state.currentUser = null;
    saveDBState(state);
  },

  /**
   * Account-type switch. Buyers can promote themselves to Individual Seller or
   * Business Owner (and switch back) from Settings at any time — buying is
   * always available to every role. GoodSale-verified tiers and staff roles
   * stay locked to review. The database mirrors this rule in migration 011.
   */
  updateCurrentUserRole(role: UserRole) {
    const state = getDBState();
    const current = state.currentUser;
    if (!current) return { error: 'Not signed in' } as const;

    const selfService: UserRole[] = [UserRole.BUYER, UserRole.SELLER, UserRole.BUSINESS];
    const isAdmin = current.role === UserRole.ADMIN || current.role === UserRole.SUPER_ADMIN;
    if (!isAdmin) {
      if (!selfService.includes(role)) {
        return { error: 'That account type is granted by GoodSale review.' } as const;
      }
      if (!selfService.includes(current.role)) {
        return {
          error: 'Your verified account type can only be changed by GoodSale support.',
        } as const;
      }
    }

    current.role = role;
    const dbUser = state.users.find((u) => u.id === current.id);
    if (dbUser) dbUser.role = role;
    saveDBState(state);

    // Mirror the change to Supabase so it survives a reload. The DB allows
    // self-service switches among the public tiers only (migration 011).
    const client = createClient();
    const profileId = current.id;
    if (client) {
      void (async () => {
        const { error } = await client.rpc('set_own_role', { p_role: role });
        if (error) {
          await client.from('profiles').update({ role }).eq('id', profileId);
        }
        await reloadFromSupabase();
      })();
    }
    return { success: true } as const;
  },

  async updateProfile(bio: string, address: string, city: string, stateName: string, deliveryPref: string) {
    const state = getDBState();
    if (!state.currentUser) return;
    const profile = state.profiles.find((p) => p.userId === state.currentUser!.id);
    if (profile) {
      profile.bio = bio;
      profile.address = address;
      profile.city = city;
      profile.state = stateName;
      profile.deliveryPreference = deliveryPref;
      saveDBState(state);
    }
    const client = createClient();
    if (client && state.currentUser) {
      await client.from('profiles').update({
        bio,
        address,
        city,
        state: stateName,
        delivery_preference: deliveryPref,
      }).eq('id', state.currentUser.id);
    }
  },

  // Business Profile Updates
  updateBusinessDetails(name: string, description: string, address: string, city: string, stateName: string, hours: string) {
    const state = getDBState();
    if (!state.currentUser) return;
    const biz = state.businesses.find((b) => b.ownerId === state.currentUser!.id);
    if (biz) {
      biz.name = name;
      biz.description = description;
      biz.address = address;
      biz.city = city;
      biz.state = stateName;
      biz.openingHours = hours;
      saveDBState(state);
    }
  },

  // Products Actions
  async addProduct(
    title: string,
    description: string,
    category: string,
    brand: string,
    condition: ProductCondition,
    price: number,
    isNegotiable: boolean,
    quantity: number,
    images: string[],
    barcode: string | undefined,
    deliveryMethod: string,
    pickupAvailable: boolean,
    warranty?: string,
    returnPolicy?: string,
    weightKg?: number,
    dimensionsCm?: string,
    isAuction: boolean = false,
    auctionDurationHours: number = 24,
    paymentMethods?: string[],
    partialPercent?: number,
    partialRemainingDays?: number
  ) {
    const state = getDBState();
    if (!state.currentUser) return;

    const newProdId = Math.max(...state.products.map((p) => p.id), 100) + 1;
    const business = state.businesses.find((b) => b.ownerId === state.currentUser!.id);

    const newProduct: Product = {
      id: newProdId,
      sellerId: state.currentUser.id,
      businessId: business?.id,
      title,
      description,
      category,
      brand,
      condition,
      price,
      isNegotiable,
      quantity,
      stockStatus: 'IN_STOCK',
      images: images && images.length > 0 ? images : [],
      barcode,
      deliveryMethod,
      pickupAvailable,
      warranty,
      returnPolicy,
      weightKg,
      dimensionsCm,
      isAuction,
      viewCount: 0,
      createdAt: new Date().toISOString(),
      paymentMethods: paymentMethods || ['escrow', 'card'],
      partialPercent: partialPercent || 30,
      partialRemainingDays: partialRemainingDays || 7
    };

    state.products.unshift(newProduct);

    if (isAuction) {
      const newAucId = state.auctions.length + 1;
      const ends = new Date();
      ends.setHours(ends.getHours() + Number(auctionDurationHours));
      state.auctions.push({
        id: newAucId,
        productId: newProdId,
        startingBid: price * 0.75, // Starting bid 25% lower than retail
        reservePrice: price * 0.9,
        endsAt: ends.toISOString(),
        isActive: true,
      });
    }

    // Award GoodPoints for listing
    state.currentUser.goodPoints += 15;
    const dbUser = state.users.find(u => u.id === state.currentUser!.id);
    if (dbUser) dbUser.goodPoints += 15;

    state.goodPoints.push({
      id: state.goodPoints.length + 1,
      userId: state.currentUser.id,
      points: 15,
      reason: `Listed new product: ${title}`,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        const saved = await upsertProduct(client, newProduct);
        // Replace temp id with DB id
        const idx = state.products.findIndex((x) => x.id === newProduct.id);
        if (idx >= 0) state.products[idx] = { ...newProduct, id: saved.id };
        if (isAuction) {
          const auc = state.auctions.find((a) => a.productId === newProduct.id);
          if (auc) {
            auc.productId = saved.id;
            await client.from('auctions').insert({
              product_id: saved.id,
              starting_bid: auc.startingBid,
              reserve_price: auc.reservePrice,
              ends_at: auc.endsAt,
              is_active: true,
            });
          }
        }
        saveDBState(state);
        return { ...newProduct, id: saved.id };
      } catch (err) {
        console.error('Failed to persist product:', err);
      }
    }
    return newProduct;
  },

  // Submit Bid for Auction
  submitBid(auctionId: number, amount: number) {
    const state = getDBState();
    if (!state.currentUser) return;

    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction || !auction.isActive) return;

    const product = state.products.find((p) => p.id === auction.productId);
    if (!product) return;

    const newBid: Bid = {
      id: state.bids.length + 1,
      auctionId,
      userId: state.currentUser.id,
      username: state.currentUser.username,
      userAvatar: state.profiles.find((p) => p.userId === state.currentUser!.id)?.photoUrl || '',
      amount,
      createdAt: new Date().toISOString(),
    };

    // Find previous highest bidder to notify them
    const bidsForAuction = state.bids.filter((b) => b.auctionId === auctionId);
    const highestBid = bidsForAuction.length > 0 ? Math.max(...bidsForAuction.map((b) => b.amount)) : auction.startingBid;

    if (amount <= highestBid) return { error: `Bid must be higher than current top bid of ₦${highestBid.toLocaleString()}` };

    state.bids.push(newBid);

    // Notify previous bidders
    const uniqueBidders = Array.from(new Set(bidsForAuction.map((b) => b.userId))).filter(id => id !== state.currentUser!.id);
    uniqueBidders.forEach((bidderId) => {
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: bidderId,
        title: 'You’ve been outbid!',
        message: `Another bidder has placed a bid of ₦${amount.toLocaleString()} on ${product.title}. Place a higher bid now to stay in the auction!`,
        type: 'BID',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    });

    saveDBState(state);

    withClient(async (client) => {
      await insertBid(client, {
        auctionId,
        userId: state.currentUser!.id,
        amount,
      });
      for (const bidderId of uniqueBidders) {
        await insertNotification(client, {
          userId: bidderId,
          title: 'You’ve been outbid!',
          message: `Another bidder placed ₦${amount.toLocaleString()} on ${product.title}.`,
          type: 'BID',
        });
      }
      await reloadFromSupabase();
    });

    return { success: true };
  },

  // Escrow Orders
  async placeOrder(
    productId: number,
    deliveryAddress: string,
    deliveryCity: string,
    deliveryState: string,
    paymentMethod: string,
    deliveryMethod: string,
    usePoints: boolean = false,
    selectedPartnerId?: number,
    serviceType: 'ECONOMY' | 'STANDARD' | 'EXPRESS' = 'STANDARD',
    hasGoodSaleProtect: boolean = false,
    bankReceipt?: string,
    invoiceTerms?: string,
    deliveryCoords?: { lat: number; lng: number },
    quantity: number = 1,
    shipping?: {
      fee: number;
      breakdown?: ShippingBreakdown;
      quoteId?: string;
      ruleId?: number;
      zoneId?: number;
      etaMin?: number;
      etaMax?: number;
    },
    deliveryContact?: {
      phone?: string;
      instructions?: string;
      checkoutGroupId?: string;
    }
  ) {
    const state = getDBState();
    if (!state.currentUser) return null;

    const product = state.products.find((p) => p.id === productId);
    if (!product) return null;

    // Inventory guard: never sell a listing that is sold, unavailable or depleted.
    if (
      product.stockStatus === 'SOLD' ||
      product.stockStatus === 'UNAVAILABLE' ||
      product.stockStatus === 'OUT_OF_STOCK' ||
      product.quantity <= 0
    ) {
      return null;
    }

    const orderNumber = makeOrderNumber();
    const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit release pin

    // Delivery price is supplied by the server-authoritative shipping quote. Never
    // fall back to a hardcoded checkout fee.
    const deliveryFee = Math.max(0, Math.round(Number(shipping?.fee) || 0));

    // Cart quantity is bounded by the seller's remaining stock at order time.
    const qty = Math.max(1, Math.min(Math.floor(quantity) || 1, product.quantity));
    const itemsSubtotal = product.price * qty;

    // Per-item platform fee — admin-controlled, OFF by default at launch.
    const taxAmount = computePlatformFee(state.revenueSettings, itemsSubtotal).amount;
    const protectFee = hasGoodSaleProtect ? (state.revenueSettings?.goodSaleProtectFee || 1500) : 0;

    let pointsDiscount = 0;
    let pointsUsed = 0;
    if (usePoints && state.currentUser.goodPoints > 50) {
      // 1 GoodPoint = 10 Naira
      pointsUsed = Math.min(state.currentUser.goodPoints, Math.floor(itemsSubtotal / 10));
      pointsDiscount = pointsUsed * 10;
      state.currentUser.goodPoints -= pointsUsed;
      const dbUser = state.users.find(u => u.id === state.currentUser!.id);
      if (dbUser) dbUser.goodPoints -= pointsUsed;

      state.goodPoints.push({
        id: state.goodPoints.length + 1,
        userId: state.currentUser.id,
        points: -pointsUsed,
        reason: `GoodPoints Escrow Discount on order ${orderNumber}`,
        createdAt: new Date().toISOString(),
      });
    }

    const totalAmount = itemsSubtotal + deliveryFee + taxAmount + protectFee - pointsDiscount;

    // Determine initial order status based on payment channel chosen
    // Card/escrow start PENDING — Paystack verify/webhook marks PAID_ESCROW
    let initialStatus = OrderStatus.PENDING;
    const pmLower = paymentMethod.toLowerCase();
    if (pmLower === 'bank') {
      initialStatus = OrderStatus.PENDING_BANK_TRANSFER;
    } else if (pmLower === 'cod') {
      initialStatus = OrderStatus.COD_PENDING;
    } else if (pmLower === 'invoice') {
      initialStatus = OrderStatus.INVOICE_SENT;
    } else if (pmLower === 'partial') {
      initialStatus = OrderStatus.PENDING; // deposit paid after Paystack verify
    } else if (pmLower === 'escrow' || pmLower === 'card') {
      initialStatus = OrderStatus.PENDING;
    }

    // Set custom payment parameters
    let depositPercent: number | undefined;
    let depositRemainingDays: number | undefined;
    let depositAmountPaid: number | undefined;
    let balanceRemaining: number | undefined;
    let isBalanceSettled: boolean | undefined;

    if (pmLower === 'partial') {
      depositPercent = product.partialPercent || 30;
      depositRemainingDays = product.partialRemainingDays || 7;
      depositAmountPaid = Math.round(totalAmount * (depositPercent / 100));
      balanceRemaining = totalAmount - depositAmountPaid;
      isBalanceSettled = false;
    }

    const newOrder: Order = {
      id: Math.max(...state.orders.map((o) => o.id), 2000) + 1,
      orderNumber,
      buyerId: state.currentUser.id,
      sellerId: product.sellerId,
      productId: product.id,
      productTitle: product.title,
      productImage: product.images[0],
      totalAmount,
      discountAmount: pointsDiscount,
      deliveryFee,
      taxAmount,
      paymentMethod: paymentMethod.toUpperCase(),
      deliveryMethod,
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryPhone: deliveryContact?.phone,
      deliveryInstructions: deliveryContact?.instructions,
      checkoutGroupId: deliveryContact?.checkoutGroupId,
      deliveryLat: deliveryCoords?.lat ?? resolveCityCoords(deliveryCity, deliveryState, deliveryAddress).lat,
      deliveryLng: deliveryCoords?.lng ?? resolveCityCoords(deliveryCity, deliveryState, deliveryAddress).lng,
      pickupLat: undefined,
      pickupLng: undefined,
      deliveryPin,
      qrCodeToken: `QR-GS-${orderNumber}`,
      status: initialStatus,
      goodPointsUsed: pointsUsed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      selectedPartnerId,
      serviceType,
      hasGoodSaleProtect,
      protectFee,
      depositPercent,
      depositRemainingDays,
      depositAmountPaid,
      balanceRemaining,
      isBalanceSettled,
      bankTransferReceipt: bankReceipt,
      invoiceTerms,
      shippingBreakdown: shipping?.breakdown,
      shippingRuleId: shipping?.ruleId ?? shipping?.breakdown?.ruleId,
      shippingZoneId: shipping?.zoneId ?? shipping?.breakdown?.zoneId,
      shippingQuoteId: shipping?.quoteId,
      estimatedDeliveryMinDays: shipping?.etaMin ?? shipping?.breakdown?.etaMinDays,
      estimatedDeliveryMaxDays: shipping?.etaMax ?? shipping?.breakdown?.etaMaxDays,
    };

    // Infer seller pickup from seller profile when available
    const sellerProfile = state.profiles.find((p) => p.userId === product.sellerId);
    if (sellerProfile) {
      const pickup = bestCoords(
        { lat: sellerProfile.lat, lng: sellerProfile.lng },
        null,
        sellerProfile.city,
        sellerProfile.state,
        sellerProfile.address
      );
      newOrder.pickupLat = pickup.lat;
      newOrder.pickupLng = pickup.lng;
    } else {
      const lagos = resolveCityCoords('Lagos', 'Lagos');
      newOrder.pickupLat = lagos.lat;
      newOrder.pickupLng = lagos.lng;
    }

    // Add order
    state.orders.unshift(newOrder);

    // Escrow ledger: held amount recorded; release only after PAID_ESCROW via payment verify
    const heldEscrowAmount =
      pmLower === 'partial'
        ? depositAmountPaid || totalAmount
        : pmLower === 'invoice' || pmLower === 'cod'
          ? 0
          : totalAmount;

    state.escrows.push({
      id: state.escrows.length + 1,
      orderId: newOrder.id,
      heldAmount: heldEscrowAmount,
      isReleased: false,
      isRefunded: false,
    });

    // Create Payment transaction log (pending until Paystack verify for card/escrow)
    const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
    const txStatus = (
      pmLower === 'escrow' || pmLower === 'card' || pmLower === 'partial' || pmLower === 'bank'
        ? 'PENDING'
        : pmLower === 'invoice' || pmLower === 'cod'
          ? 'PENDING'
          : 'PENDING'
    ) as 'PENDING' | 'REFUNDED' | 'SUCCESS' | 'FAILED';
    state.transactions.push({
      id: state.transactions.length + 1,
      transactionId: txId,
      orderId: newOrder.id,
      buyerId: state.currentUser.id,
      sellerId: product.sellerId,
      amount: heldEscrowAmount || totalAmount,
      paymentMethod: paymentMethod.toUpperCase(),
      status: txStatus,
      purpose: 'ORDER_PAYMENT',
      createdAt: new Date().toISOString(),
    });

    // If Invoice payment option is chosen, create an Invoice object
    if (pmLower === 'invoice') {
      const days = invoiceTerms === 'Net 30' ? 30 : invoiceTerms === 'Net 60' ? 60 : 15;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);

      const business = state.businesses.find(b => b.ownerId === product.sellerId);
      const businessId = business ? business.id : 0;

      state.invoices.push({
        id: state.invoices.length + 1,
        orderId: newOrder.id,
        invoiceNumber: `INV-${orderNumber}`,
        buyerId: state.currentUser.id,
        sellerId: product.sellerId,
        businessId,
        amount: totalAmount,
        dueDate: dueDate.toISOString(),
        status: 'SENT',
        terms: invoiceTerms || 'Net 15',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Reduce product quantity and derive the new availability status.
    product.quantity -= qty;
    if (product.quantity <= 0) {
      product.quantity = 0;
      product.stockStatus = 'SOLD';
    } else if (product.quantity <= 5) {
      product.stockStatus = 'LOW_STOCK';
    } else if (product.stockStatus === 'LOW_STOCK') {
      product.stockStatus = 'IN_STOCK';
    }

    if (notificationAllowed('stock') && (product.stockStatus === 'SOLD' || product.stockStatus === 'LOW_STOCK')) {
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: product.sellerId,
        title: product.stockStatus === 'SOLD' ? 'Listing sold out' : 'Low stock warning',
        message: product.stockStatus === 'SOLD'
          ? `"${product.title}" is now sold out and hidden from purchase until you restock.`
          : `"${product.title}" has ${product.quantity} unit${product.quantity === 1 ? '' : 's'} left. Restock to keep it visible.`,
        type: 'STOCK',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    // Auto-create Delivery Job if using GoodDispatch network
    if (deliveryMethod === 'GOODSALE_PARTNER') {
      const commissionPercent = state.revenueSettings.deliveryCommissionPercentage;
      const commission = Math.round(deliveryFee * (commissionPercent / 100));
      const earnings = deliveryFee - commission;
      const pin = deliveryPin.slice(0, 4); // 4-digit driver pin

      const newJob: DeliveryJob = {
        id: Math.max(...state.deliveryJobs.map(j => j.id), 0) + 1,
        orderId: newOrder.id,
        partnerId: selectedPartnerId,
        status: selectedPartnerId ? DeliveryJobStatus.ACCEPTED : DeliveryJobStatus.PENDING,
        serviceType,
        deliveryFee,
        platformCommission: commission,
        courierEarnings: earnings,
        estPickupTime: '15-30 mins',
        estDeliveryTime: serviceType === 'EXPRESS' ? '1 hr' : serviceType === 'STANDARD' ? '3 hrs' : 'Same Day',
        pin,
        trackingHistory: [
          { status: 'PENDING', time: new Date().toISOString(), note: 'Delivery job initiated on checkout' }
        ],
        createdAt: new Date().toISOString(),
      };

      if (selectedPartnerId) {
        const partner = state.deliveryPartners.find(p => p.id === selectedPartnerId);
        if (partner) {
          partner.activeDeliveriesCount += 1;
          newJob.trackingHistory.push({
            status: 'ACCEPTED',
            time: new Date().toISOString(),
            note: `Pre-assigned courier ${partner.fullName} (activates after escrow payment).`
          });
          // Do NOT mark OUT_FOR_DELIVERY until payment is verified
        }
      }

      state.deliveryJobs.push(newJob);
    }

    // Create a transaction record for GoodSale Protect if activated
    if (hasGoodSaleProtect && protectFee > 0) {
      let wallet = state.wallets.find(w => w.userId === state.currentUser!.id);
      if (!wallet) {
        wallet = { id: state.wallets.length + 1, userId: state.currentUser.id, balance: 0 };
        state.wallets.push(wallet);
      }
      state.walletTransactions.push({
        id: state.walletTransactions.length + 1,
        walletId: wallet.id,
        amount: -protectFee,
        type: 'DEBIT_PROTECT',
        description: `Purchased optional GoodSale Protect™ for Order ${orderNumber}`,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });
    }

    // Notify Buyer — awaiting payment for card/escrow
    const awaitingPay = [OrderStatus.PENDING, OrderStatus.PENDING_BANK_TRANSFER].includes(initialStatus);
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: state.currentUser.id,
      title: awaitingPay ? 'Order Created — Complete Payment' : 'Order Created',
      message: awaitingPay
        ? `Order ${orderNumber} is ready. Complete Paystack checkout to lock ₦${totalAmount.toLocaleString()} in escrow. Your delivery PIN will be ${deliveryPin}.`
        : `Order ${orderNumber} created. Delivery PIN: ${deliveryPin}.`,
      type: 'ORDER',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    // Notify Seller
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: product.sellerId,
      title: awaitingPay ? 'New Pending Order' : 'New Order',
      message: awaitingPay
        ? `A buyer started checkout for "${product.title}". Escrow funds lock after payment verification.`
        : `A buyer placed an order for "${product.title}".`,
      type: 'ORDER',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        const saved = await insertOrderWithEscrow(client, newOrder, totalAmount);
        const oi = state.orders.findIndex((o) => o.id === newOrder.id);
        if (oi >= 0) state.orders[oi] = { ...newOrder, ...saved, id: saved.id };
        const ei = state.escrows.findIndex((e) => e.orderId === newOrder.id);
        if (ei >= 0) state.escrows[ei].orderId = saved.id;
        if (deliveryMethod === 'GOODSALE_PARTNER') {
          await client.from('delivery_jobs').insert({
            order_id: saved.id,
            partner_id: selectedPartnerId || null,
            status: selectedPartnerId ? 'ACCEPTED' : 'PENDING',
            service_type: serviceType,
            delivery_fee: deliveryFee,
            platform_commission: Math.round(deliveryFee * ((state.revenueSettings?.deliveryCommissionPercentage || 10) / 100)),
            courier_earnings: deliveryFee - Math.round(deliveryFee * ((state.revenueSettings?.deliveryCommissionPercentage || 10) / 100)),
            pin: deliveryPin,
            current_lat: newOrder.pickupLat ?? null,
            current_lng: newOrder.pickupLng ?? null,
            tracking_history: [{ status: selectedPartnerId ? 'ACCEPTED' : 'PENDING', time: new Date().toISOString(), note: selectedPartnerId ? 'Courier pre-assigned near buyer' : 'Awaiting courier' }],
          });
        }
        saveDBState(state);
        void reloadFromSupabase();
        return { ...newOrder, ...saved, id: saved.id };
      } catch (err) {
        console.error('Failed to persist order:', err);
      }
    }
    return newOrder;
  },

  /**
   * Server re-prices newly created unpaid orders from the stored quote, so a
   * browser cannot alter shipping fees before payment. Safe to retry.
   */
  async applyVerifiedShipping(quoteId: string, orderIds: number[]) {
    let lastError = 'Could not verify delivery fees. Please retry.';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch('/api/shipping/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteId, orderIds }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) {
          lastError = payload?.error || lastError;
        } else {
          await reloadFromSupabase();
          return {
            success: true as const,
            orders: (payload.orders || []) as { orderId: number; totalAmount: number; deliveryFee: number }[],
          };
        }
      } catch {
        lastError = 'Could not reach the shipping verifier. Please retry.';
      }
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 450));
    }
    return { error: lastError };
  },

  // Escrow delivery flow
  async shipOrder(orderId: number) {
    const state = getDBState();
    const order = state.orders.find((o) => o.id === orderId);
    if (order && order.status === OrderStatus.PAID_ESCROW) {
      order.status = OrderStatus.SHIPPED;
      order.updatedAt = new Date().toISOString();
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: 'Order Dispatched & Shipped',
        message: `The seller has dispatched your product for Order ${order.orderNumber}. It is on transit.`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      saveDBState(state);
    }
    try {
      await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: 'SHIPPED' }),
      });
      await reloadFromSupabase();
    } catch (err) {
      console.error('Failed to persist ship status:', err);
    }
  },

  async outForDelivery(orderId: number) {
    const state = getDBState();
    const order = state.orders.find((o) => o.id === orderId);
    if (order && (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.PAID_ESCROW)) {
      order.status = OrderStatus.OUT_FOR_DELIVERY;
      order.updatedAt = new Date().toISOString();
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: 'Arriving Today!',
        message: `Your package for Order ${order.orderNumber} is out for delivery. Have your Delivery PIN ready for verification.`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      saveDBState(state);
    }
    try {
      await fetch('/api/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status: 'OUT_FOR_DELIVERY' }),
      });
      await reloadFromSupabase();
    } catch (err) {
      console.error('Failed to persist out-for-delivery status:', err);
    }
  },

  async completeDelivery(orderId: number, enteredPin: string) {
    try {
      const res = await fetch('/api/orders/release-escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, pin: enteredPin }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        return { error: payload.error || 'Incorrect Delivery PIN! Escrow funds cannot be released.' };
      }
      await reloadFromSupabase();
      return { success: true };
    } catch (err) {
      console.error('Escrow release request failed:', err);
      return { error: 'Could not reach escrow service. Try again.' };
    }
  },


  // ---- Phase 1 delivery & tracking ----
  /** Validated lifecycle transition (seller readiness, rider steps, admin). */
  async advanceDelivery(
    deliveryId: number,
    status: DeliveryStatus,
    options?: { note?: string; failureReason?: string }
  ) {
    return postDeliveryApi('/api/deliveries/status', {
      deliveryId,
      status,
      note: options?.note,
      failureReason: options?.failureReason,
    });
  },

  /** Seller confirms availability / marks preparing / ready for pickup. */
  async sellerDeliveryAction(
    deliveryId: number,
    action: 'CONFIRM_AVAILABILITY' | 'PREPARING' | 'READY_FOR_PICKUP'
  ) {
    return postDeliveryApi('/api/deliveries/seller-action', { deliveryId, action });
  },

  async assignDeliveryRider(deliveryId: number, riderId: number) {
    return postDeliveryApi('/api/deliveries/assign', { deliveryId, riderId });
  },

  async setDeliveryCourier(
    deliveryId: number,
    courier: { courierName: string; trackingNumber?: string; estimatedDeliveryDate?: string }
  ) {
    return postDeliveryApi('/api/deliveries/assign', {
      deliveryId,
      courierName: courier.courierName,
      trackingNumber: courier.trackingNumber,
      estimatedDeliveryDate: courier.estimatedDeliveryDate,
    });
  },

  async autoAssignDelivery(deliveryId: number) {
    return postDeliveryApi('/api/deliveries/assign', { deliveryId, auto: true });
  },

  async updateDeliverySettings(settings: Record<string, unknown>) {
    return postDeliveryApi('/api/admin/delivery-settings', settings);
  },

  async fetchDeliveryTracking(deliveryId: number): Promise<{ data?: DeliveryTrackingView; error?: string }> {
    try {
      const res = await fetch(`/api/deliveries/tracking?deliveryId=${deliveryId}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        return { error: (payload?.error as string) || 'Could not load live tracking' };
      }
      return { data: payload.data as DeliveryTrackingView };
    } catch {
      return { error: 'Could not reach the tracking service. Please retry.' };
    }
  },

  async riderSetLocationSharing(sharing: boolean, permission: 'GRANTED' | 'DENIED' | 'UNKNOWN') {
    return postDeliveryApi('/api/rider/location', { action: 'SHARING', sharing, permission });
  },

  async riderUpdateLocation(input: {
    deliveryId: number;
    lat: number;
    lng: number;
    accuracyM?: number;
    speedKmh?: number;
    headingDegrees?: number;
  }): Promise<{ success?: boolean; error?: string; data?: Record<string, unknown> }> {
    // Deliberately does not reload the whole marketplace on every GPS tick.
    try {
      const res = await fetch('/api/rider/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE', ...input }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        return { error: (payload?.error as string) || 'Could not update location' };
      }
      return { success: true, data: payload.data };
    } catch {
      return { error: 'Could not reach the location service. Please retry.' };
    }
  },

  async reportDeliveryFailure(deliveryId: number, reasonCode: string, note: string) {
    return postDeliveryApi('/api/deliveries/failure', {
      action: 'REPORT',
      deliveryId,
      reasonCode,
      note,
    });
  },

  async resolveDeliveryFailure(
    failureId: number,
    resolution: 'REASSIGN' | 'RESCHEDULE' | 'RETURN' | 'CANCEL' | 'REFUND_REQUESTED' | 'RESOLVE',
    note = '',
    rescheduleDate?: string
  ) {
    return postDeliveryApi('/api/deliveries/failure', {
      action: 'RESOLVE',
      failureId,
      resolution,
      note,
      rescheduleDate,
    });
  },

  async updateDeliveryReturn(returnId: number, status: 'INITIATED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED', note = '') {
    return postDeliveryApi('/api/deliveries/failure', {
      action: 'RETURN_UPDATE',
      returnId,
      status,
      note,
    });
  },

  async adminCourierRequest(body: Record<string, unknown>) {
    return postDeliveryApi('/api/admin/couriers', body);
  },

  async fetchDeliveryAnalytics(from?: string, to?: string): Promise<{ data?: DeliveryAnalytics; error?: string }> {
    try {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const res = await fetch(`/api/admin/delivery-analytics?${query.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        return { error: (payload?.error as string) || 'Could not load delivery analytics' };
      }
      return { data: payload.data as DeliveryAnalytics };
    } catch {
      return { error: 'Could not reach the analytics service. Please retry.' };
    }
  },

  async setDeliveryInstructions(deliveryId: number, instructions: string) {
    return postDeliveryApi('/api/deliveries/instructions', { deliveryId, instructions });
  },

  /** Buyer-only reveal of the one-time delivery confirmation code. */
  async revealDeliveryCode(deliveryId: number) {
    return postDeliveryApi('/api/deliveries/confirmation-code', { deliveryId });
  },

  /** Rider / operator submits the buyer's one-time code. Never releases escrow. */
  async confirmDeliveryWithCode(deliveryId: number, code: string) {
    return postDeliveryApi('/api/deliveries/confirm', { deliveryId, code });
  },

  // ---- Phase 2 rider management ----
  async riderApply(data: Record<string, unknown>) {
    return postDeliveryApi('/api/rider/register', data);
  },

  async riderAvailability(input: {
    online: boolean;
    lat?: number;
    lng?: number;
    state?: string;
    city?: string;
    serviceStates?: string[];
  }) {
    return postDeliveryApi('/api/rider/availability', input);
  },

  async riderRequests(): Promise<{ data?: AvailableDelivery[]; error?: string }> {
    try {
      const res = await fetch('/api/rider/requests', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        return { error: (payload?.error as string) || 'Could not load delivery requests' };
      }
      return { data: (payload.data || []) as AvailableDelivery[] };
    } catch {
      return { error: 'Could not reach the delivery service. Please retry.' };
    }
  },

  async riderAcceptDelivery(deliveryId: number) {
    return postDeliveryApi('/api/rider/accept', { deliveryId });
  },

  async riderRejectDelivery(deliveryId: number, reason?: string) {
    return postDeliveryApi('/api/rider/reject', { deliveryId, reason });
  },

  async riderMarkArrival(deliveryId: number, stage: 'PICKUP' | 'DESTINATION') {
    return postDeliveryApi('/api/rider/arrival', { deliveryId, stage });
  },

  async riderRecordFailedAttempt(deliveryId: number, reason: string) {
    return postDeliveryApi('/api/rider/failed-attempt', { deliveryId, reason });
  },

  async riderContactSeller(deliveryId: number): Promise<{ data?: { full_name: string; phone: string }; error?: string }> {
    try {
      const res = await fetch('/api/rider/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        return { error: (payload?.error as string) || 'Could not load seller contact' };
      }
      return { data: payload.data };
    } catch {
      return { error: 'Could not reach the delivery service. Please retry.' };
    }
  },

  async adminReviewRider(riderId: number, status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED', reason?: string) {
    return postDeliveryApi('/api/admin/riders', { action: 'REVIEW', riderId, status, reason });
  },

  async expireRiderAssignments() {
    return postDeliveryApi('/api/admin/riders', { action: 'EXPIRE' });
  },

  async adminSetRiderCommission(riderId: number, percentage: number | null) {
    return postDeliveryApi('/api/admin/riders', { action: 'COMMISSION', riderId, percentage });
  },

  async adminSetRiderServiceAreas(
    riderId: number,
    states: string[],
    state?: string,
    city?: string
  ) {
    return postDeliveryApi('/api/admin/riders', {
      action: 'SERVICE_AREAS',
      riderId,
      states,
      state,
      city,
    });
  },

  async adminSetRiderEarningStatus(
    earningId: number,
    status: 'PENDING' | 'APPROVED' | 'PAID' | 'VOID',
    payoutReference = '',
    notes = ''
  ) {
    return postDeliveryApi('/api/admin/riders', {
      action: 'EARNING_STATUS',
      earningId,
      status,
      payoutReference,
      notes,
    });
  },

  async adminAdjustRiderEarning(earningId: number, delta: number, reason: string) {
    return postDeliveryApi('/api/admin/riders', { action: 'ADJUST_EARNING', earningId, delta, reason });
  },

  async cancelDelivery(deliveryId: number, reason: string) {
    return postDeliveryApi('/api/deliveries/cancel', { deliveryId, reason, action: 'CANCEL' });
  },

  async initiateDeliveryReturn(deliveryId: number, reason: string) {
    return postDeliveryApi('/api/deliveries/cancel', { deliveryId, reason, action: 'RETURN' });
  },

  async openDispute(orderId: number, reason: string) {
    try {
      const res = await fetch('/api/disputes/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, reason }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        // Fallback when the dispute RPC is unavailable
        const state = getDBState();
        const order = state.orders.find((o) => o.id === orderId);
        if (!order) return { error: payload.error || 'Order not found' };
        order.status = OrderStatus.DISPUTED;
        order.updatedAt = new Date().toISOString();
        state.disputes.push({
          id: state.disputes.length + 1,
          orderId,
          orderNumber: order.orderNumber,
          openedById: order.buyerId,
          openedByName: state.users.find((u) => u.id === order.buyerId)?.fullName || 'Buyer',
          reason,
          resolution: 'PENDING',
          createdAt: new Date().toISOString(),
        });
        saveDBState(state);
        return { success: true, local: true, error: payload.error };
      }
      await reloadFromSupabase();
      return { success: true, data: payload.data };
    } catch (err) {
      console.error('Open dispute failed:', err);
      return { error: 'Could not open dispute' };
    }
  },

  async resolveDispute(disputeId: number, resolution: 'REFUND_BUYER' | 'RELEASE_SELLER', adminNotes: string) {
    dbOperations.requireAdmin();
    try {
      const res = await fetch('/api/disputes/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeId, resolution, notes: adminNotes }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        return { error: payload.error || 'Failed to resolve dispute' };
      }
      await reloadFromSupabase();
      return { success: true, data: payload.data };
    } catch (err) {
      console.error('Resolve dispute failed:', err);
      return { error: 'Could not resolve dispute' };
    }
  },

  /** Buyer cancels before fulfilment starts. Held escrow is marked refunded. */
  async cancelOrder(orderId: number, reason: string) {
    const state = getDBState();
    const user = state.currentUser;
    if (!user) return { error: 'Please sign in.' };
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return { error: 'Order not found.' };
    if (order.buyerId !== user.id) return { error: 'Only the buyer can cancel this order.' };

    const cancellable: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.PENDING_BANK_TRANSFER,
      OrderStatus.PAID_ESCROW,
      OrderStatus.PARTIAL_DEPOSIT_PAID,
    ];
    if (!cancellable.includes(order.status)) {
      return { error: 'This order has already been shipped. Open a dispute or request a refund instead.' };
    }

    const fundsHeld = order.status === OrderStatus.PAID_ESCROW || order.status === OrderStatus.PARTIAL_DEPOSIT_PAID;
    const now = new Date().toISOString();

    order.status = fundsHeld ? OrderStatus.REFUNDED : OrderStatus.CANCELLED;
    order.updatedAt = now;

    const escrow = state.escrows.find((e) => e.orderId === order.id);
    if (escrow) escrow.isRefunded = fundsHeld;

    const tx = state.transactions.find((t) => t.orderId === order.id);
    if (fundsHeld && tx) tx.status = 'REFUNDED';

    if (fundsHeld) {
      // Refund is queued for provider processing; money never reaches the seller.
      state.refunds.push({
        id: Math.max(...state.refunds.map((r) => r.id), 0) + 1,
        refundNumber: `RF-${Date.now().toString().slice(-6)}`,
        transactionId: tx?.transactionId || order.orderNumber,
        orderId: order.id,
        amount: escrow?.heldAmount || order.totalAmount,
        reason: reason || 'Buyer cancelled before shipment',
        status: 'PENDING',
        createdAt: now,
      });
    }

    // Return the unit to the seller's inventory.
    const product = state.products.find((p) => p.id === order.productId);
    if (product) {
      product.quantity += 1;
      if (product.stockStatus === 'SOLD' || product.stockStatus === 'OUT_OF_STOCK') {
        product.stockStatus = product.quantity <= 5 ? 'LOW_STOCK' : 'IN_STOCK';
      }
    }

    state.notifications.push({
      id: state.notifications.length + 1,
      userId: order.sellerId,
      title: `Order ${order.orderNumber} cancelled`,
      message: `The buyer cancelled before shipment. ${fundsHeld ? 'Escrow funds are being returned to the buyer — do not dispatch.' : 'No payment was captured.'}`,
      type: 'ORDER',
      isRead: false,
      createdAt: now,
    });
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: order.buyerId,
      title: fundsHeld ? 'Cancellation confirmed — refund pending' : 'Order cancelled',
      message: fundsHeld
        ? `₦${(escrow?.heldAmount || order.totalAmount).toLocaleString()} is protected and queued for refund to your original payment method.`
        : `Order ${order.orderNumber} was cancelled.`,
      type: fundsHeld ? 'ESCROW' : 'ORDER',
      isRead: false,
      createdAt: now,
    });

    saveDBState(state);
    return { success: true, refunded: fundsHeld };
  },

  /** Buyer asks for a refund after payment but before/around delivery. Funds stay protected. */
  async requestRefund(orderId: number, reason: string) {
    const state = getDBState();
    const user = state.currentUser;
    if (!user) return { error: 'Please sign in.' };
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return { error: 'Order not found.' };
    if (order.buyerId !== user.id) return { error: 'Only the buyer can request this refund.' };
    if (!reason.trim() || reason.trim().length < 10) return { error: 'Tell us what went wrong (10+ characters).' };

    const refundable: OrderStatus[] = [
      OrderStatus.PAID_ESCROW,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.PARTIAL_DEPOSIT_PAID,
    ];
    if (!refundable.includes(order.status)) {
      return { error: 'A refund cannot be requested for this order in its current state.' };
    }
    if (state.refunds.some((r) => r.orderId === orderId && r.status === 'PENDING')) {
      return { error: 'A refund request is already under review for this order.' };
    }

    const now = new Date().toISOString();
    const escrow = state.escrows.find((e) => e.orderId === order.id);
    const tx = state.transactions.find((t) => t.orderId === order.id);

    state.refunds.push({
      id: Math.max(...state.refunds.map((r) => r.id), 0) + 1,
      refundNumber: `RF-${Date.now().toString().slice(-6)}`,
      transactionId: tx?.transactionId || order.orderNumber,
      orderId: order.id,
      amount: escrow?.heldAmount || order.totalAmount,
      reason: reason.trim(),
      status: 'PENDING',
      createdAt: now,
    });
    order.status = OrderStatus.REFUND_REQUESTED;
    order.updatedAt = now;

    state.notifications.push({
      id: state.notifications.length + 1,
      userId: order.sellerId,
      title: 'Refund requested',
      message: `Buyer requested a refund on ${order.orderNumber}: ${reason.trim()}. Respond in Support within 48 hours.`,
      type: 'ESCROW',
      isRead: false,
      createdAt: now,
    });

    saveDBState(state);

    // Persist through the server so admins see the request from any device.
    void (async () => {
      try {
        await fetch('/api/refunds/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, reason: reason.trim() }),
        });
      } catch {
        // Offline: the local refund record still protects the buyer's view.
      }
    })();

    return { success: true };
  },

  /** Admin decision on a refund request. Refunds are provider-processed, never seller-released. */
  async reviewRefund(refundId: number, decision: 'APPROVED' | 'REJECTED', notes?: string) {
    let state: GoodSaleDBState;
    try {
      state = dbOperations.requireAdmin();
    } catch {
      return { error: 'Administrator access required.' };
    }
    const refund = state.refunds.find((r) => r.id === refundId);
    if (!refund) return { error: 'Refund not found.' };
    if (refund.status !== 'PENDING') return { error: 'This refund has already been decided.' };

    const now = new Date().toISOString();
    refund.status = decision;
    const order = state.orders.find((o) => o.id === refund.orderId);
    const escrow = order ? state.escrows.find((e) => e.orderId === order.id) : undefined;
    const tx = order ? state.transactions.find((t) => t.orderId === order.id) : undefined;

    if (decision === 'APPROVED' && order) {
      order.status = OrderStatus.REFUNDED;
      order.updatedAt = now;
      if (escrow) { escrow.isRefunded = true; escrow.isReleased = false; }
      if (tx) tx.status = 'REFUNDED';
    } else if (order && order.status === OrderStatus.REFUND_REQUESTED) {
      order.status = OrderStatus.PAID_ESCROW;
      order.updatedAt = now;
    }

    // Route approved refunds through the existing admin escrow RPC so the
    // server ledger, escrow flag and refund row stay authoritative.
    let serverApplied = false;
    if (decision === 'APPROVED' && order) {
      try {
        const res = await fetch('/api/admin/escrow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id, action: 'REFUND_BUYER', notes: notes || refund.reason }),
        });
        serverApplied = res.ok;
      } catch {
        serverApplied = false;
      }
    }

    if (order) {
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: decision === 'APPROVED' ? 'Refund approved' : 'Refund request declined',
        message: decision === 'APPROVED'
          ? `₦${refund.amount.toLocaleString()} for ${order.orderNumber} is being returned to your original payment method.`
          : `Your refund request for ${order.orderNumber} was declined. ${notes || 'Contact support if you need help.'}`,
        type: 'ESCROW',
        isRead: false,
        createdAt: now,
      });
    }

    saveDBState(state);
    return { success: true, serverApplied };
  },

  // Submit User Verification — persisted for admin review
  async submitVerification(docType: DocumentType, docNum: string, docImageUrl?: string) {
    const state = getDBState();
    if (!state.currentUser) return;

    state.verifications = state.verifications.filter(v => v.userId !== state.currentUser!.id || v.status !== VerificationStatus.PENDING);

    const selfie = state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || '';
    const newVer: IdentityVerification = {
      id: Math.max(...state.verifications.map(v => v.id), 0) + 1,
      userId: state.currentUser.id,
      fullName: state.currentUser.fullName,
      documentType: docType,
      documentNumber: docNum,
      documentImageUrl: docImageUrl || '',
      selfieImageUrl: selfie,
      proofOfAddressUrl: '',
      applicationKind: VerificationKind.IDENTITY,
      documents: docImageUrl ? [{ label: 'ID document', url: docImageUrl }] : [],
      businessName: '',
      businessAddress: '',
      status: VerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
    };
    state.verifications.push(newVer);
    saveDBState(state);

    const client = createClient();
    if (client) {
      await client.from('identity_verifications').insert({
        user_id: state.currentUser.id,
        full_name: state.currentUser.fullName,
        document_type: docType,
        document_number: docNum,
        document_image_url: docImageUrl || '',
        selfie_image_url: selfie,
        proof_of_address_url: '',
        status: 'PENDING',
      });
      await reloadFromSupabase();
    }
  },

  // Approve / Reject Verification (Admin tool)
  async handleVerificationApproval(
    verId: number,
    status: VerificationStatus,
    notes: string,
    targetRole?: UserRole
  ) {
    const state = getDBState();
    const ver = state.verifications.find((v) => v.id === verId);
    if (!ver) return;

    ver.status = status;
    ver.adminNotes = notes;

    const user = state.users.find((u) => u.id === ver.userId);
    if (user && status === VerificationStatus.APPROVED) {
      const resolvedRole =
        targetRole ||
        (user.role === UserRole.BUSINESS ? UserRole.VERIFIED_BUSINESS : UserRole.VERIFIED_SELLER);
      user.role = resolvedRole;
      if (state.currentUser?.id === user.id) state.currentUser.role = resolvedRole;

      const biz = state.businesses.find(b => b.ownerId === user.id);
      if (biz) biz.isVerified = true;

      user.trustScore = 100;
      user.goodPoints += 200;

      state.goodPoints.push({
        id: state.goodPoints.length + 1,
        userId: user.id,
        points: 200,
        reason: 'Identity verification approved reward',
        createdAt: new Date().toISOString(),
      });

      state.notifications.push({
        id: state.notifications.length + 1,
        userId: user.id,
        title: 'Identity Verification Approved!',
        message: `Congratulations! Your identity has been verified as ${resolvedRole}. You received a gold trust badge and 200 GoodPoints!`,
        type: 'VERIFICATION',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    } else if (user && status === VerificationStatus.REJECTED) {
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: user.id,
        title: 'Verification Request Rejected',
        message: `Admin review rejected your identity documents. Notes: ${notes}. Please re-submit valid credentials.`,
        type: 'VERIFICATION',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    saveDBState(state);

    const client = createClient();
    if (client) {
      // Record who decided, when, and why so the applicant's file is auditable.
      try {
        await updateVerificationReview(client, verId, {
          status,
          admin_notes: notes,
          rejection_reason: status === VerificationStatus.REJECTED ? notes : '',
          reviewed_by: state.currentUser?.id ?? 0,
          reviewed_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to record verification review:', err);
        await client.from('identity_verifications').update({
          status,
          admin_notes: notes,
        }).eq('id', verId);
      }
      if (status === VerificationStatus.APPROVED && ver) {
        const roleToSet =
          targetRole ||
          (user?.role === UserRole.VERIFIED_BUSINESS
            ? UserRole.VERIFIED_BUSINESS
            : UserRole.VERIFIED_SELLER);
        const { error: roleErr } = await client.rpc('admin_set_profile_role', {
          p_user_id: ver.userId,
          p_role: roleToSet,
        });
        if (roleErr) {
          console.warn('admin_set_profile_role failed (apply 002 migration):', roleErr.message);
        }
      }
      await reloadFromSupabase();
    }
  },

  // Chat/Messages flow
  async sendMessage(roomId: number, text?: string, imgUrl?: string, videoUrl?: string, receiptDetails?: any, productDetails?: any, replyToId?: number) {
    const state = getDBState();
    if (!state.currentUser) return;

    const room = state.chatRooms.find((r) => r.id === roomId);
    if (!room) return;

    const client = createClient();
    if (client) {
      try {
        const saved = await insertMessage(client, {
          roomId,
          senderId: state.currentUser.id,
          messageText: text,
          imageUrl: imgUrl,
          videoUrl,
          receiptDetails,
          productDetails,
          replyToId,
        });
        state.messages.push(saved);
        const preview = text || (imgUrl ? 'Sent an image' : videoUrl ? 'Sent a video' : 'Sent an attachment');
        room.lastMessage = preview;
        room.lastMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        await client.from('chat_rooms').update({
          last_message: preview,
          last_message_time: new Date().toISOString(),
        }).eq('id', roomId);
        saveDBState(state);
        return saved;
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    }

    const newMsg: Message = {
      id: Math.max(...state.messages.map((m) => m.id), 0) + 1,
      roomId,
      senderId: state.currentUser.id,
      messageText: text,
      imageUrl: imgUrl,
      videoUrl,
      receiptDetails,
      productDetails,
      replyToId,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(newMsg);
    room.lastMessage = text || 'Sent an attachment';
    room.lastMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    saveDBState(state);
  },

  async getOrCreateChatRoom(productId: number) {
    const state = getDBState();
    if (!state.currentUser) return null;

    const product = state.products.find((p) => p.id === productId);
    if (!product) return null;

    const seller = state.users.find((u) => u.id === product.sellerId);
    if (!seller) return null;

    // Do not chat with yourself
    if (product.sellerId === state.currentUser.id) return null;

    let room = state.chatRooms.find(
      (r) => r.buyerId === state.currentUser!.id && r.sellerId === product.sellerId && r.productId === productId
    );

    if (!room) {
      const newRoomId = state.chatRooms.length + 1;
      room = {
        id: newRoomId,
        buyerId: state.currentUser.id,
        sellerId: product.sellerId,
        productId,
        productTitle: product.title,
        productPrice: product.price,
        productImage: product.images[0],
        sellerName: seller.fullName,
        buyerName: state.currentUser.fullName,
        lastMessage: 'Chat started',
        lastMessageTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      state.chatRooms.unshift(room);

      const client = createClient();
      if (client) {
        try {
          const { data, error } = await client.from('chat_rooms').insert({
            buyer_id: room.buyerId,
            seller_id: room.sellerId,
            product_id: room.productId,
            product_title: room.productTitle,
            product_price: room.productPrice,
            product_image: room.productImage,
            seller_name: room.sellerName,
            buyer_name: room.buyerName,
            last_message: 'Chat started',
            last_message_time: new Date().toISOString(),
          }).select('*').single();
          if (!error && data) {
            room.id = Number(data.id);
          }
        } catch (err) {
          console.error('Failed to create chat room:', err);
        }
      }

      // Add a welcoming automated first message
      state.messages.push({
        id: state.messages.length + 1,
        roomId: newRoomId,
        senderId: product.sellerId,
        messageText: `Hello! Thanks for your interest in "${product.title}". Is there any specific detail or negotiation offer you would like to discuss? I support nationwide escrow shipping or pickup.`,
        createdAt: new Date().toISOString(),
      });

      saveDBState(state);
    }

    return room.id;
  },

  // Submit product review
  submitReview(orderId: number, rating: number, comment: string) {
    const state = getDBState();
    if (!state.currentUser) return;

    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    // Negative id = optimistic row until Supabase assigns the real one. The old
    // `length + 1` id collided with real ids after a reload, which mis-keyed
    // replies and helpful votes onto the wrong review.
    const newRev: Review = {
      id: -Date.now(),
      orderId,
      productId: order.productId,
      reviewerId: state.currentUser.id,
      reviewerName: state.currentUser.fullName,
      reviewerPhoto: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || '',
      revieweeId: order.sellerId,
      rating,
      comment,
      isHelpfulVotes: 0,
      createdAt: new Date().toISOString(),
    };

    state.reviews.push(newRev);

    // Reward points for review
    state.currentUser.goodPoints += 30;
    const dbUser = state.users.find(u => u.id === state.currentUser!.id);
    if (dbUser) dbUser.goodPoints += 30;

    state.goodPoints.push({
      id: state.goodPoints.length + 1,
      userId: state.currentUser.id,
      points: 30,
      reason: `Submitted verified review for Order: ${order.orderNumber}`,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);

    withClient(async (client) => {
      const id = await insertReview(client, {
        orderId,
        productId: order.productId,
        reviewerId: state.currentUser!.id,
        revieweeId: order.sellerId,
        rating,
        comment,
      });
      // Re-key the optimistic row with the real DB id (also makes the rating show
      // on the product page, which keys off product_id).
      const local = getDBState().reviews.find((r) => r.id === newRev.id);
      if (local && id != null && id !== local.id) {
        local.id = id;
        saveDBState(getDBState());
      }
      await reloadFromSupabase();
    });
  },

  submitProductComment(productId: number, rating: number, comment: string) {
    const state = getDBState();
    if (!state.currentUser) return;

    const product = state.products.find(p => p.id === productId);
    
    const newRev: Review = {
      id: -Date.now(),
      productId,
      reviewerId: state.currentUser.id,
      reviewerName: state.currentUser.fullName,
      reviewerPhoto: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || '',
      revieweeId: product?.sellerId,
      rating,
      comment,
      isHelpfulVotes: 0,
      replies: [],
      createdAt: new Date().toISOString(),
    };

    state.reviews.push(newRev);

    // Reward some points for participating in discussions
    state.currentUser.goodPoints += 15;
    const dbUser = state.users.find(u => u.id === state.currentUser!.id);
    if (dbUser) dbUser.goodPoints += 15;

    state.goodPoints.push({
      id: state.goodPoints.length + 1,
      userId: state.currentUser.id,
      points: 15,
      reason: `Wrote interactive review/comment on item: ${product?.title || 'Product'}`,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);

    withClient(async (client) => {
      const id = await insertReview(client, {
        productId,
        reviewerId: state.currentUser!.id,
        revieweeId: product?.sellerId,
        rating,
        comment,
      });
      const local = getDBState().reviews.find((r) => r.id === newRev.id);
      if (local && id != null && id !== local.id) {
        local.id = id;
        saveDBState(getDBState());
      }
      await reloadFromSupabase();
    });

    return newRev;
  },

  submitReplyToReview(reviewId: number, commentText: string) {
    const state = getDBState();
    if (!state.currentUser) return;

    const review = state.reviews.find(r => r.id === reviewId);
    if (!review) return;

    if (!review.replies) {
      review.replies = [];
    }

    // Determine role string
    let roleStr = 'BUYER';
    if (state.currentUser.role === UserRole.VERIFIED_SELLER || state.currentUser.role === UserRole.VERIFIED_BUSINESS || state.currentUser.role === UserRole.BUSINESS) {
      roleStr = 'SELLER';
    } else if (state.currentUser.role === UserRole.ADMIN) {
      roleStr = 'ADMIN';
    }

    const newReply = {
      id: review.replies.length + 1,
      authorId: state.currentUser.id,
      authorName: state.currentUser.fullName,
      authorPhoto: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || '',
      authorRole: roleStr,
      comment: commentText,
      createdAt: new Date().toISOString(),
    };

    review.replies.push(newReply);
    saveDBState(state);

    // Persist the reply. The review_replies table existed but was never written,
    // so every nested reply disappeared on the next reload. Only reviews that
    // already have a real DB id can be replied to durably.
    if (review.id > 0) {
      const reviewDbId = review.id;
      const author = {
        authorId: state.currentUser.id,
        authorName: state.currentUser.fullName,
        authorPhoto: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || '',
        authorRole: roleStr,
        comment: commentText,
      };
      withClient(async (client) => {
        await insertReviewReply(client, { reviewId: reviewDbId, ...author });
        await reloadFromSupabase();
      });
    }

    return newReply;
  },

  clearNotifications(userId: number) {
    const state = getDBState();
    state.notifications.forEach((n) => {
      if (n.userId === userId) n.isRead = true;
    });
    saveDBState(state);
    // Persist so the read state survives the next realtime reload
    const client = createClient();
    if (client) {
      void (async () => {
        try {
          await client
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId);
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to persist clear notifications:', err);
        }
      })();
    }
  },

  toggleNotificationRead(notificationId: number) {
    const state = getDBState();
    const notif = state.notifications.find(n => n.id === notificationId);
    if (!notif) return;
    const nextRead = !notif.isRead;
    notif.isRead = nextRead;
    saveDBState(state);
    const client = createClient();
    if (client) {
      void (async () => {
        try {
          await client
            .from('notifications')
            .update({ is_read: nextRead })
            .eq('id', notificationId);
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to persist notification read state:', err);
        }
      })();
    }
  },

  deleteNotification(notificationId: number) {
    const state = getDBState();
    state.notifications = state.notifications.filter(n => n.id !== notificationId);
    saveDBState(state);
    const client = createClient();
    if (client) {
      void (async () => {
        try {
          await client
            .from('notifications')
            .delete()
            .eq('id', notificationId);
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to delete notification:', err);
        }
      })();
    }
  },

  createCustomNotification(userId: number, title: string, message: string, type: Notification['type']) {
    // Respect the recipient's saved notification preferences for this category.
    const prefKey = type === 'ORDER' || type === 'BID' ? 'orders'
      : type === 'ESCROW' || type === 'POINTS' ? 'payments'
      : type === 'CHAT' ? 'messages'
      : type === 'DELIVERY' ? 'deliveries'
      : type === 'STOCK' ? 'stock'
      : type === 'PROMOTION' ? 'promotions'
      : 'security';
    if (!notificationAllowed(prefKey)) return;
    const state = getDBState();
    state.notifications.push({
      id: state.notifications.length + 1,
      userId,
      title,
      message,
      type,
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    saveDBState(state);
    const client = createClient();
    if (client) {
      void (async () => {
        try {
          await client
            .from('notifications')
            .insert({ user_id: userId, title, message, type, is_read: false });
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to persist notification:', err);
        }
      })();
    }
  },

  claimDailyReward() {
    const state = getDBState();
    if (!state.currentUser) return { error: 'Please login first' };
    const userId = state.currentUser.id;
    const user = state.users.find(u => u.id === userId);
    if (!user) return { error: 'User not found' };

    const lastLoginPoints = state.goodPoints.filter(p => p.userId === userId && (p.reason.includes('Daily Login') || p.reason.includes('Daily Reward')));
    const todayString = new Date().toISOString().split('T')[0];
    const alreadyClaimed = lastLoginPoints.some(p => p.createdAt.startsWith(todayString));

    if (alreadyClaimed) {
      return { error: 'Daily reward already claimed today. Come back tomorrow!' };
    }

    user.goodPoints += 10;
    state.currentUser.goodPoints = user.goodPoints;
    state.goodPoints.push({
      id: state.goodPoints.length + 1,
      userId: user.id,
      points: 10,
      reason: 'Daily Reward Loyalty Claim',
      createdAt: new Date().toISOString(),
    });

    state.notifications.push({
      id: state.notifications.length + 1,
      userId: user.id,
      title: 'GoodPoints Claimed!',
      message: 'You claimed 10 GoodPoints daily loyalty reward! Keep streak active to level up.',
      type: 'POINTS',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    return { success: true };
  },

  subtractUserPoints(cost: number) {
    const state = getDBState();
    if (!state.currentUser) return;
    const user = state.users.find(u => u.id === state.currentUser!.id);
    if (user && user.goodPoints >= cost) {
      user.goodPoints -= cost;
      state.currentUser.goodPoints = user.goodPoints;
      state.goodPoints.push({
        id: state.goodPoints.length + 1,
        userId: user.id,
        points: -cost,
        reason: 'Redeemed voucher reward',
        createdAt: new Date().toISOString(),
      });

      state.notifications.push({
        id: state.notifications.length + 1,
        userId: user.id,
        title: 'GoodPoints Redeemed!',
        message: `You successfully redeemed ${cost} GoodPoints for a voucher. Your voucher code is: GS-VOUCH-${Math.floor(100000 + Math.random() * 900000)}`,
        type: 'POINTS',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      saveDBState(state);
    }
  },

  followSeller(followerId: number, followedUserId?: number, followedBusinessId?: number) {
    const state = getDBState();
    const existing = state.followerRelations.find(f => 
      f.followerId === followerId && 
      (followedUserId ? f.followedUserId === followedUserId : f.followedBusinessId === followedBusinessId)
    );
    if (!existing) {
      const newId = Math.max(...state.followerRelations.map(f => f.id), 0) + 1;
      state.followerRelations.push({
        id: newId,
        followerId,
        followedUserId,
        followedBusinessId,
        createdAt: new Date().toISOString()
      });
      if (followedUserId) {
        state.notifications.push({
          id: state.notifications.length + 1,
          userId: followedUserId,
          title: 'New Follower Alert!',
          message: `${state.currentUser?.fullName || 'A buyer'} started following you!`,
          type: 'VERIFICATION',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
      saveDBState(state);

      const client = createClient();
      if (client) {
        void (async () => {
          try {
            await client.from('follower_relations').insert({
              follower_id: followerId,
              followed_user_id: followedUserId ?? null,
              followed_business_id: followedBusinessId ?? null,
            });
            if (followedUserId) {
              await client.from('notifications').insert({
                user_id: followedUserId,
                title: 'New Follower Alert!',
                message: `${state.currentUser?.fullName || 'A buyer'} started following you!`,
                type: 'VERIFICATION',
                is_read: false,
              });
            }
            await reloadFromSupabase();
          } catch (err) {
            console.error('Failed to persist follow:', err);
          }
        })();
      }
    }
  },

  unfollowSeller(followerId: number, followedUserId?: number, followedBusinessId?: number) {
    const state = getDBState();
    state.followerRelations = state.followerRelations.filter(f => 
      !(f.followerId === followerId && 
        (followedUserId ? f.followedUserId === followedUserId : f.followedBusinessId === followedBusinessId))
    );
    saveDBState(state);

    const client = createClient();
    if (client) {
      void (async () => {
        try {
          let query = client
            .from('follower_relations')
            .delete()
            .eq('follower_id', followerId);
          if (followedUserId != null) {
            query = query.eq('followed_user_id', followedUserId);
          } else if (followedBusinessId != null) {
            query = query.eq('followed_business_id', followedBusinessId);
          }
          await query;
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to persist unfollow:', err);
        }
      })();
    }
  },

  createSafeMeetMeetup(orderId: number, locationId: number, scheduledAt: string) {
    const state = getDBState();
    state.safeMeetMeetups = state.safeMeetMeetups.filter(m => m.orderId !== orderId);
    
    const newId = Math.max(...state.safeMeetMeetups.map(m => m.id), 0) + 1;
    const loc = state.safeMeetLocations.find(l => l.id === locationId);
    const order = state.orders.find(o => o.id === orderId);

    const meetup: SafeMeetMeetup = {
      id: newId,
      orderId,
      locationId,
      scheduledAt,
      status: 'PENDING_CONFIRMATION',
      buyerConfirmedArrival: false,
      sellerConfirmedArrival: false,
      createdAt: new Date().toISOString()
    };
    state.safeMeetMeetups.push(meetup);

    if (order) {
      const notifyUserId = state.currentUser?.id === order.buyerId ? order.sellerId : order.buyerId;
      const roleName = state.currentUser?.id === order.buyerId ? 'Buyer' : 'Seller';
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: notifyUserId,
        title: 'SafeMeet™ Meetup Requested',
        message: `${roleName} has proposed a SafeMeet™ meetup at "${loc?.name || 'Safe Location'}" for ${new Date(scheduledAt).toLocaleString()}. Please confirm!`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString()
      });
    }

    saveDBState(state);

    withClient(async (client) => {
      await upsertSafeMeetMeetup(client, {
        orderId,
        locationId,
        scheduledAt,
        status: 'PENDING_CONFIRMATION',
        buyerConfirmedArrival: false,
        sellerConfirmedArrival: false,
      });
      if (order) {
        const notifyUserId = state.currentUser?.id === order.buyerId ? order.sellerId : order.buyerId;
        await insertNotification(client, {
          userId: notifyUserId,
          title: 'SafeMeet™ Meetup Requested',
          message: `SafeMeet proposed at "${loc?.name || 'Safe Location'}" for ${new Date(scheduledAt).toLocaleString()}.`,
          type: 'ORDER',
        });
      }
      await reloadFromSupabase();
    });

    return meetup;
  },

  confirmSafeMeetMeetup(meetupId: number) {
    const state = getDBState();
    const meetup = state.safeMeetMeetups.find(m => m.id === meetupId);
    if (meetup) {
      meetup.status = 'SCHEDULED';
      const order = state.orders.find(o => o.id === meetup.orderId);
      if (order) {
        const notifyUserId = state.currentUser?.id === order.buyerId ? order.sellerId : order.buyerId;
        state.notifications.push({
          id: state.notifications.length + 1,
          userId: notifyUserId,
          title: 'SafeMeet™ Meetup Confirmed!',
          message: `Your scheduled meetup has been confirmed for ${new Date(meetup.scheduledAt).toLocaleString()}. Secure GPS routing is now ready.`,
          type: 'ORDER',
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }
      saveDBState(state);

      withClient(async (client) => {
        await updateSafeMeetMeetup(client, meetupId, { status: 'SCHEDULED' });
        await reloadFromSupabase();
      });
    }
  },

  confirmArrival(meetupId: number, isBuyer: boolean) {
    const state = getDBState();
    const meetup = state.safeMeetMeetups.find(m => m.id === meetupId);
    if (meetup) {
      if (isBuyer) {
        meetup.buyerConfirmedArrival = true;
      } else {
        meetup.sellerConfirmedArrival = true;
      }

      const order = state.orders.find(o => o.id === meetup.orderId);

      if (meetup.buyerConfirmedArrival && meetup.sellerConfirmedArrival) {
        meetup.status = 'COMPLETED';
        if (order) {
          order.status = OrderStatus.OUT_FOR_DELIVERY;
          state.notifications.push({
            id: state.notifications.length + 1,
            userId: order.buyerId,
            title: 'Both Parties Arrived at SafeMeet™',
            message: `Handshake active! Inspect the items and give your 6-digit Delivery PIN (${order.deliveryPin}) to the seller to release escrow funds.`,
            type: 'ORDER',
            isRead: false,
            createdAt: new Date().toISOString()
          });
          state.notifications.push({
            id: state.notifications.length + 1,
            userId: order.sellerId,
            title: 'Both Parties Arrived at SafeMeet™',
            message: `Handshake active! Collect the 6-digit Delivery PIN from the buyer after they inspect the item to release your funds.`,
            type: 'ORDER',
            isRead: false,
            createdAt: new Date().toISOString()
          });
        }
      } else {
        if (order) {
          const notifyUserId = isBuyer ? order.sellerId : order.buyerId;
          const roleName = isBuyer ? 'Buyer' : 'Seller';
          meetup.status = isBuyer ? 'BUYER_ARRIVED' : 'SELLER_ARRIVED';
          state.notifications.push({
            id: state.notifications.length + 1,
            userId: notifyUserId,
            title: `SafeMeet™: ${roleName} Arrived`,
            message: `The ${roleName.toLowerCase()} has marked themselves as Arrived at the meetup location. Please check-in.`,
            type: 'ORDER',
            isRead: false,
            createdAt: new Date().toISOString()
          });
        }
      }
      saveDBState(state);

      withClient(async (client) => {
        await updateSafeMeetMeetup(client, meetupId, {
          status: meetup.status,
          buyer_confirmed_arrival: meetup.buyerConfirmedArrival,
          seller_confirmed_arrival: meetup.sellerConfirmedArrival,
        });
        if (order && meetup.status === 'COMPLETED') {
          await client.from('orders').update({ status: 'OUT_FOR_DELIVERY' }).eq('id', order.id);
        }
        await reloadFromSupabase();
      });
    }
  },

  cancelMeetup(meetupId: number) {
    const state = getDBState();
    const meetup = state.safeMeetMeetups.find(m => m.id === meetupId);
    if (meetup) {
      meetup.status = 'CANCELLED';
      const order = state.orders.find(o => o.id === meetup.orderId);
      if (order) {
        const notifyUserId = state.currentUser?.id === order.buyerId ? order.sellerId : order.buyerId;
        state.notifications.push({
          id: state.notifications.length + 1,
          userId: notifyUserId,
          title: 'SafeMeet™ Meetup Cancelled',
          message: `The scheduled meetup has been cancelled. Please request a new meet or contact support if disputed.`,
          type: 'ORDER',
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }
      saveDBState(state);
      withClient(async (client) => {
        await updateSafeMeetMeetup(client, meetupId, { status: 'CANCELLED' });
        await reloadFromSupabase();
      });

    }
  },

  closeAuction(auctionId: number) {
    const state = getDBState();
    const auction = state.auctions.find((a) => a.id === auctionId);
    if (!auction || !auction.isActive) return null;

    auction.isActive = false;

    const product = state.products.find((p) => p.id === auction.productId);
    if (!product) {
      saveDBState(state);
      return null;
    }

    const bidsForAuction = state.bids.filter((b) => b.auctionId === auctionId).sort((a, b) => b.amount - a.amount);
    
    if (bidsForAuction.length === 0) {
      saveDBState(state);
      return { success: true, winner: null };
    }

    const winningBid = bidsForAuction[0];
    const winnerId = winningBid.userId;
    const winnerUser = state.users.find((u) => u.id === winnerId);

    // Create a pending order for the winner to pay
    const orderNumber = makeOrderNumber();
    const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString();
    // Auction orders have no delivery address yet; use the admin-configured
    // local base as a transparent placeholder until a destination is confirmed.
    const deliveryFee = Math.max(0, Number(state.shippingSettings?.localBaseFee) || 0);
    const taxAmount = computePlatformFee(state.revenueSettings, winningBid.amount).amount;
    const totalAmount = winningBid.amount + deliveryFee + taxAmount;

    const newOrder: Order = {
      id: Math.max(...state.orders.map((o) => o.id), 2000) + 1,
      orderNumber,
      buyerId: winnerId,
      sellerId: product.sellerId,
      productId: product.id,
      productTitle: product.title,
      productImage: product.images[0],
      totalAmount,
      discountAmount: 0,
      deliveryFee,
      taxAmount,
      paymentMethod: 'ESCROW_WALLET',
      deliveryMethod: 'GOODSALE_PARTNER',
      deliveryAddress: 'Main Delivery Address (Won in Auction)',
      deliveryCity: 'Lagos',
      deliveryState: 'Lagos State',
      deliveryPin,
      qrCodeToken: `QR-GS-${orderNumber}`,
      status: OrderStatus.PENDING, // Pending payment!
      goodPointsUsed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add order
    state.orders.unshift(newOrder);

    // Reduce product quantity
    product.quantity = Math.max(0, product.quantity - 1);
    if (product.quantity <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
    }

    // Notify Buyer
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: winnerId,
      title: 'You won the auction',
      message: `Congratulations! Your bid of ₦${winningBid.amount.toLocaleString()} on "${product.title}" won the auction! A secure pending escrow order (${orderNumber}) has been generated for you to make your payment deposit.`,
      type: 'ORDER',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    // Notify Seller
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: product.sellerId,
      title: 'Auction Completed successfully!',
      message: `Your auction for "${product.title}" has closed. The winning bid is ₦${winningBid.amount.toLocaleString()} by @${winningBid.username}. Secure pending escrow order ${orderNumber} has been generated.`,
      type: 'ORDER',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    return { success: true, winner: winnerUser, order: newOrder };
  },

  payPendingOrder(orderId: number) {
    // Never mark paid client-side — buyer must complete Paystack verify
    return {
      error: 'Complete payment via Paystack checkout. Orders cannot be marked paid from the client.',
      orderId,
    };
  },

  async completeDeliveryJobWithPin(jobId: number, pin: string) {
    try {
      const res = await fetch('/api/orders/complete-delivery-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, pin }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        return { success: false, message: payload.error || 'Invalid delivery pin code. Please verify with buyer.' };
      }
      await reloadFromSupabase();
      return { success: true, message: 'Delivery completed. Escrow released.' };
    } catch (err) {
      console.error('completeDeliveryJobWithPin failed:', err);
      return { success: false, message: 'Could not reach delivery service.' };
    }
  },

  /** Server-authoritative wallet checkout into escrow for a pending buyer order. */
  async payOrderWithWallet(orderId: number) {
    try {
      const res = await fetch('/api/wallet/pay-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        return { success: false, message: payload.error || 'Could not pay with wallet' };
      }
      await reloadFromSupabase();
      return { success: true, data: payload.data };
    } catch (err) {
      console.error('payOrderWithWallet failed:', err);
      return { success: false, message: 'Could not reach wallet service' };
    }
  },

  async withdrawFromWallet(
    userId: number,
    amount: number,
    bankDetails: { name: string; number: string; bank: string }
  ) {
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          bankName: bankDetails.bank,
          accountName: bankDetails.name,
          accountNumber: bankDetails.number,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        return { success: false, message: payload.error || 'Withdrawal failed' };
      }
      await reloadFromSupabase();
      return { success: true, data: payload.data };
    } catch (err) {
      console.error('withdrawFromWallet failed:', err);
      return { success: false, message: 'Could not reach wallet service' };
    }
  },

  async adminForceEscrowAction(orderId: number, action: 'RELEASE_SELLER' | 'REFUND_BUYER', notes: string) {
    dbOperations.requireAdmin();
    try {
      const res = await fetch('/api/admin/escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action, notes }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        return { error: payload.error || 'Admin escrow action failed' };
      }
      dbOperations.addAuditLog(
        getDBState().currentUser!.id,
        `ADMIN_ESCROW_${action}`,
        'ORDER',
        orderId,
        notes
      );
      await reloadFromSupabase();
      return { success: true, data: payload.data };
    } catch (err) {
      console.error('adminForceEscrowAction failed:', err);
      return { error: 'Could not reach admin escrow service' };
    }
  },

  sendNegotiationOffer(roomId: number, productId: number, amount: number) {
    const state = getDBState();
    if (!state.currentUser) return null;

    const newMsg: Message = {
      id: state.messages.length + 1,
      roomId,
      senderId: state.currentUser.id,
      messageText: `PROPOSED NEGOTIATION OFFER: ₦${amount.toLocaleString()}. I would like to purchase via GoodSale Escrow!`,
      offerDetails: {
        amount,
        productId,
        status: 'PENDING',
        proposedBy: state.currentUser.id,
      },
      createdAt: new Date().toISOString(),
    };

    state.messages.push(newMsg);
    
    const room = state.chatRooms.find(r => r.id === roomId);
    if (room) {
      room.lastMessage = `Propose: ₦${amount.toLocaleString()}`;
      room.lastMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    saveDBState(state);
    return newMsg;
  },

  updateOfferStatus(messageId: number, status: 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'DECLINED', counterAmount?: number, updaterId?: number) {
    const state = getDBState();
    const message = state.messages.find(m => m.id === messageId);
    if (!message || !message.offerDetails) return null;

    message.offerDetails.status = status;
    if (counterAmount !== undefined) {
      message.offerDetails.counterAmount = counterAmount;
    }
    if (updaterId !== undefined) {
      message.offerDetails.proposedBy = updaterId;
    }

    if (status === 'ACCEPTED') {
      const activeAmount = message.offerDetails.counterAmount || message.offerDetails.amount;
      const product = state.products.find(p => p.id === message.offerDetails!.productId);
      if (product) {
        const orderNumber = makeOrderNumber();
        const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString();
        // Negotiated orders default to the admin-configured local base; the
        // checkout quote remains authoritative once a destination is provided.
        const deliveryFee = Math.max(0, Number(state.shippingSettings?.localBaseFee) || 0);
        const taxAmount = computePlatformFee(state.revenueSettings, activeAmount).amount;
        const totalAmount = activeAmount + deliveryFee + taxAmount;

        const buyerId = message.senderId === product.sellerId ? (state.chatRooms.find(r => r.id === message.roomId)?.buyerId || 0) : message.senderId;

        const newOrder: Order = {
          id: Math.max(...state.orders.map((o) => o.id), 2000) + 1,
          orderNumber,
          buyerId,
          sellerId: product.sellerId,
          productId: product.id,
          productTitle: product.title,
          productImage: product.images[0],
          totalAmount,
          discountAmount: 0,
          deliveryFee,
          taxAmount,
          paymentMethod: 'PAYSTACK_ESCROW',
          deliveryMethod: 'GOODSALE_PARTNER',
          deliveryAddress: 'Main Delivery Address (Negotiated Deal)',
          deliveryCity: 'Lagos',
          deliveryState: 'Lagos State',
          deliveryPin,
          qrCodeToken: `QR-GS-${orderNumber}`,
          status: OrderStatus.PAID_ESCROW, // Automatically active escrow order
          goodPointsUsed: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        state.orders.unshift(newOrder);

        state.escrows.push({
          id: state.escrows.length + 1,
          orderId: newOrder.id,
          heldAmount: activeAmount,
          isReleased: false,
          isRefunded: false,
        });

        product.quantity = Math.max(0, product.quantity - 1);
        if (product.quantity <= 0) {
          product.stockStatus = 'OUT_OF_STOCK';
        }

        // Notify Buyer & Seller
        state.notifications.push({
          id: state.notifications.length + 1,
          userId: buyerId,
          title: 'Negotiated deal accepted',
          message: `Your negotiation offer of ₦${activeAmount.toLocaleString()} has been accepted. A secure escrow order (${orderNumber}) has been generated and activated!`,
          type: 'ORDER',
          isRead: false,
          createdAt: new Date().toISOString(),
        });

        state.notifications.push({
          id: state.notifications.length + 1,
          userId: product.sellerId,
          title: 'Negotiation Deal Settled & Escrow Locked',
          message: `The offer of ₦${activeAmount.toLocaleString()} has been concluded. Escrow order ${orderNumber} is now active.`,
          type: 'ORDER',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
        
        // Post receipt message in chat
        state.messages.push({
          id: state.messages.length + 1,
          roomId: message.roomId,
          senderId: updaterId || product.sellerId,
          messageText: `NEGOTIATED OFFER ACCEPTED! Secure Escrow contract ${orderNumber} generated successfully for ₦${activeAmount.toLocaleString()}. Funds are safe inside the GoodSale Escrow vault.`,
          createdAt: new Date().toISOString(),
        });
      }
    } else if (status === 'COUNTERED') {
      state.messages.push({
        id: state.messages.length + 1,
        roomId: message.roomId,
        senderId: updaterId || message.senderId,
        messageText: `COUNTER OFFER SUBMITTED: ₦${counterAmount?.toLocaleString()}. Do you accept?`,
        offerDetails: {
          amount: message.offerDetails.amount,
          productId: message.offerDetails.productId,
          status: 'PENDING',
          counterAmount: counterAmount,
          proposedBy: updaterId || message.senderId,
        },
        createdAt: new Date().toISOString(),
      });
    } else if (status === 'DECLINED') {
      state.messages.push({
        id: state.messages.length + 1,
        roomId: message.roomId,
        senderId: updaterId || message.senderId,
        messageText: `Offer was declined by trading partner.`,
        createdAt: new Date().toISOString(),
      });
    }

    saveDBState(state);
    return message;
  },

  registerDeliveryPartner(partnerData: any) {
    const state = getDBState();
    const newId = Math.max(...state.deliveryPartners.map(p => p.id), 0) + 1;
    const seedLoc = resolveCityCoords(partnerData.city, partnerData.state, partnerData.address);
    const partner: DeliveryPartner = {
      id: newId,
      userId: partnerData.userId,
      fullName: partnerData.fullName,
      phone: partnerData.phone,
      email: partnerData.email,
      vehicleType: partnerData.vehicleType,
      brand: partnerData.brand,
      model: partnerData.model,
      plateNumber: partnerData.plateNumber,
      color: partnerData.color,
      year: partnerData.year,
      capacity: partnerData.capacity,
      photoUrl: partnerData.photoUrl || '',
      status: 'PENDING',
      isAvailable: false,
      trustScore: 80,
      rating: 0,
      completedDeliveries: 0,
      acceptanceRate: 100,
      activeDeliveriesCount: 0,
      address: partnerData.address,
      state: partnerData.state,
      city: partnerData.city,
      lastLat: partnerData.lastLat ?? seedLoc.lat,
      lastLng: partnerData.lastLng ?? seedLoc.lng,
      lastLocationAt: new Date().toISOString(),
      locationPermission: 'UNKNOWN',
      locationSharing: false,
      nin: partnerData.nin,
      selfieUrl: partnerData.selfieUrl || '',
      licenseUrl: partnerData.licenseUrl,
      serviceStates: Array.isArray(partnerData.serviceStates) ? partnerData.serviceStates : [],
      // Keep every uploaded file in one reviewable list for the admin.
      documents: [
        ...(Array.isArray(partnerData.documents) ? partnerData.documents : []),
        ...(partnerData.selfieUrl ? [{ label: 'Passport photograph', url: partnerData.selfieUrl, kind: 'SELFIE' }] : []),
        ...(partnerData.licenseUrl ? [{ label: "Driver's licence", url: partnerData.licenseUrl, kind: 'LICENSE' }] : []),
        ...(partnerData.nin ? [{ label: 'NIN number', url: '', kind: 'IDENTITY' as const, note: String(partnerData.nin) }] : []),
      ],
      createdAt: new Date().toISOString(),
    };
    state.deliveryPartners.push(partner);
    
    state.auditLogs.push({
      id: state.auditLogs.length + 1,
      userId: partnerData.userId,
      action: 'REGISTER_DELIVERY_PARTNER',
      entityType: 'deliveryPartners',
      entityId: newId,
      details: `Registered as ${partnerData.vehicleType} partner. Under review.`,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);

    const client = createClient();
    if (client) {
      void upsertDeliveryPartner(client, {
        user_id: partner.userId,
        full_name: partner.fullName,
        phone: partner.phone,
        email: partner.email,
        vehicle_type: partner.vehicleType,
        brand: partner.brand,
        model: partner.model,
        plate_number: partner.plateNumber,
        color: partner.color,
        year: partner.year,
        capacity: partner.capacity,
        photo_url: partner.photoUrl,
        status: partner.status,
        is_available: partner.isAvailable,
        trust_score: partner.trustScore,
        rating: partner.rating,
        completed_deliveries: partner.completedDeliveries,
        acceptance_rate: partner.acceptanceRate,
        active_deliveries_count: partner.activeDeliveriesCount,
        address: partner.address,
        state: partner.state,
        city: partner.city,
        last_lat: partner.lastLat,
        last_lng: partner.lastLng,
        last_location_at: partner.lastLocationAt,
        nin: partner.nin,
        selfie_url: partner.selfieUrl,
        license_url: partner.licenseUrl ?? null,
        documents: partner.documents ?? [],
      }).then(() => reloadFromSupabase()).catch((err) => console.error('Failed to persist partner:', err));
    }

    return partner;
  },

  async approveDeliveryPartner(partnerId: number) {
    // Phase 2 review RPC handles role, audit, notification and suspension state.
    const reviewed = await postDeliveryApi('/api/admin/riders', {
      action: 'REVIEW',
      riderId: partnerId,
      status: 'APPROVED',
    });
    if (!reviewed.error) {
      return getDBState().deliveryPartners.find((p) => p.id === partnerId) || null;
    }
    const state = getDBState();
    const partner = state.deliveryPartners.find(p => p.id === partnerId);
    if (!partner) return null;

    partner.status = 'APPROVED';
    partner.isAvailable = true;
    partner.reviewedBy = state.currentUser?.id;
    partner.reviewedAt = new Date().toISOString();

    state.notifications.push({
      id: state.notifications.length + 1,
      userId: partner.userId,
      title: 'Delivery partner approved',
      message: 'Congratulations! Your GoodDispatch™ Delivery Partner application has been approved. Your courier dashboard is now unlocked and you can set yourself to active.',
      type: 'VERIFICATION',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    state.auditLogs.push({
      id: state.auditLogs.length + 1,
      userId: state.currentUser?.id || 0,
      action: 'APPROVE_DELIVERY_PARTNER',
      entityType: 'deliveryPartners',
      entityId: partnerId,
      details: `Approved delivery partner: ${partner.fullName}`,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await updateDeliveryPartnerReview(client, partnerId, {
          status: 'APPROVED',
          rejection_reason: '',
          reviewed_by: state.currentUser?.id ?? 0,
          reviewed_at: partner.reviewedAt,
        });
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to record partner approval:', err);
      }
    }
    return partner;
  },

  togglePartnerAvailability(userId: number, isAvailable: boolean, coords?: { lat: number; lng: number }) {
    const state = getDBState();
    const partner = state.deliveryPartners.find(p => p.userId === userId);
    if (!partner) return null;

    partner.isAvailable = isAvailable;
    if (coords) {
      partner.lastLat = coords.lat;
      partner.lastLng = coords.lng;
      partner.lastLocationAt = new Date().toISOString();
    }
    saveDBState(state);

    const client = createClient();
    if (client) {
      const payload: Record<string, unknown> = { is_available: isAvailable };
      if (coords) {
        payload.last_lat = coords.lat;
        payload.last_lng = coords.lng;
        payload.last_location_at = partner.lastLocationAt;
      }
      void (async () => {
        try {
          await client.from('delivery_partners').update(payload).eq('id', partner.id);
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to update partner availability:', err);
        }
      })();
    }
    return partner;
  },

  updatePartnerLiveLocation(partnerId: number, lat: number, lng: number) {
    const state = getDBState();
    const partner = state.deliveryPartners.find((p) => p.id === partnerId);
    if (!partner) return null;
    partner.lastLat = lat;
    partner.lastLng = lng;
    partner.lastLocationAt = new Date().toISOString();
    saveDBState(state);

    const client = createClient();
    if (client) {
      void updatePartnerLocation(client, partnerId, lat, lng).catch((err) =>
        console.error('Failed to persist partner GPS:', err)
      );
    }
    return partner;
  },

  async createDeliveryJob(orderId: number, serviceType: 'ECONOMY' | 'STANDARD' | 'EXPRESS', deliveryFee: number) {
    const state = getDBState();
    const existing = state.deliveryJobs.find(j => j.orderId === orderId);
    if (existing) return existing;

    const commissionPercent = state.revenueSettings.deliveryCommissionPercentage;
    const commission = Math.round(deliveryFee * (commissionPercent / 100));
    const earnings = deliveryFee - commission;
    const pin = Math.floor(1000 + Math.random() * 9000).toString();

    const newJob: DeliveryJob = {
      id: Math.max(...state.deliveryJobs.map(j => j.id), 0) + 1,
      orderId,
      status: DeliveryJobStatus.PENDING,
      serviceType,
      deliveryFee,
      platformCommission: commission,
      courierEarnings: earnings,
      estPickupTime: '30 mins',
      estDeliveryTime: serviceType === 'EXPRESS' ? '1 hr' : serviceType === 'STANDARD' ? '3 hrs' : 'Same Day',
      pin,
      trackingHistory: [
        { status: 'PENDING', time: new Date().toISOString(), note: 'Delivery request initiated by customer' }
      ],
      createdAt: new Date().toISOString(),
    };

    state.deliveryJobs.push(newJob);
    saveDBState(state);

    // Persist so riders and buyers receive the request through Realtime.
    const client = createClient();
    if (!client) return newJob;
    try {
      const saved = await upsertDeliveryJob(client, {
        order_id: newJob.orderId,
        status: newJob.status,
        service_type: newJob.serviceType,
        delivery_fee: newJob.deliveryFee,
        platform_commission: newJob.platformCommission,
        courier_earnings: newJob.courierEarnings,
        pin: newJob.pin,
        tracking_history: newJob.trackingHistory,
      });
      const idx = state.deliveryJobs.findIndex((j) => j.id === newJob.id && j.orderId === orderId);
      if (idx >= 0) {
        state.deliveryJobs[idx] = saved;
        saveDBState(state);
      }
      await reloadFromSupabase();
      return saved;
    } catch (err) {
      console.error('Failed to persist delivery job:', err);
      return newJob;
    }
  },

  acceptDeliveryJob(jobId: number, partnerId: number) {
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === jobId);
    const partner = state.deliveryPartners.find(p => p.id === partnerId);
    if (!job || !partner) return null;

    job.partnerId = partnerId;
    job.status = DeliveryJobStatus.ACCEPTED;
    if (partner.lastLat != null && partner.lastLng != null) {
      job.currentLat = partner.lastLat;
      job.currentLng = partner.lastLng;
    }
    job.trackingHistory.push({
      status: 'ACCEPTED',
      time: new Date().toISOString(),
      note: `Delivery partner ${partner.fullName} accepted the request.`
    });

    partner.activeDeliveriesCount += 1;

    const order = state.orders.find(o => o.id === job.orderId);
    if (order) {
      order.status = OrderStatus.OUT_FOR_DELIVERY;
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: 'Dispatch rider assigned',
        message: `${partner.fullName} (${partner.vehicleType}) has been assigned to your order ${order.orderNumber}. ETA: ${job.estDeliveryTime}.`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    saveDBState(state);

    const client = createClient();
    if (client) {
      void (async () => {
        try {
          await client
            .from('delivery_jobs')
            .update({
              partner_id: partnerId,
              status: DeliveryJobStatus.ACCEPTED,
              current_lat: job.currentLat ?? null,
              current_lng: job.currentLng ?? null,
              tracking_history: job.trackingHistory,
            })
            .eq('id', jobId);
          await client
            .from('delivery_partners')
            .update({ active_deliveries_count: partner.activeDeliveriesCount })
            .eq('id', partnerId);
          if (order) {
            await client.from('orders').update({ status: OrderStatus.OUT_FOR_DELIVERY }).eq('id', order.id);
          }
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to persist job accept:', err);
        }
      })();
    }

    return job;
  },

  updateDeliveryJobStatus(jobId: number, status: DeliveryJobStatus, currentLoc?: { lat: number; lng: number; speed?: number }) {
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === jobId);
    if (!job) return null;

    job.status = status;
    if (currentLoc) {
      job.currentLat = currentLoc.lat;
      job.currentLng = currentLoc.lng;
      if (currentLoc.speed != null) job.currentSpeed = currentLoc.speed;
      else delete job.currentSpeed;
    }

    let note = '';
    if (status === DeliveryJobStatus.PICKED_UP) {
      note = 'Package picked up from seller location.';
    } else if (status === DeliveryJobStatus.IN_TRANSIT) {
      note = currentLoc
        ? `Package in transit. Live GPS ${currentLoc.lat.toFixed(5)}, ${currentLoc.lng.toFixed(5)}${currentLoc.speed != null ? ` @ ${Math.round(currentLoc.speed)} km/h` : ''}.`
        : 'Package is currently in transit to destination.';
    } else if (status === DeliveryJobStatus.ARRIVED) {
      note = 'Dispatch rider arrived at buyer destination.';
    }

    // Avoid flooding tracking history on every GPS tick
    const last = job.trackingHistory[job.trackingHistory.length - 1];
    const shouldAppendNote =
      !currentLoc ||
      !last ||
      last.status !== status ||
      status === DeliveryJobStatus.PICKED_UP ||
      status === DeliveryJobStatus.ARRIVED;

    if (shouldAppendNote && note) {
      job.trackingHistory.push({
        status,
        time: new Date().toISOString(),
        note
      });
    }

    // Mirror rider coords onto partner last-known for Smart Match
    if (currentLoc && job.partnerId) {
      const partner = state.deliveryPartners.find((p) => p.id === job.partnerId);
      if (partner) {
        partner.lastLat = currentLoc.lat;
        partner.lastLng = currentLoc.lng;
        partner.lastLocationAt = new Date().toISOString();
      }
    }

    saveDBState(state);

    const client = createClient();
    if (client && currentLoc) {
      void updateDeliveryJobLocation(client, jobId, {
        lat: currentLoc.lat,
        lng: currentLoc.lng,
        speed: currentLoc.speed,
        status,
        trackingHistory: shouldAppendNote ? job.trackingHistory : undefined,
      }).catch((err) => console.error('Failed to persist job GPS:', err));

      if (job.partnerId) {
        void updatePartnerLocation(client, job.partnerId, currentLoc.lat, currentLoc.lng).catch(() => undefined);
      }
    } else if (client) {
      void (async () => {
        try {
          await client
            .from('delivery_jobs')
            .update({ status, tracking_history: job.trackingHistory })
            .eq('id', jobId);
          await reloadFromSupabase();
        } catch (err) {
          console.error('Failed to persist job status:', err);
        }
      })();
    }

    return job;
  },


  subscribeBusiness(userId: number, plan: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE') {
    const state = getDBState();
    const cost = plan === 'PRO' ? state.revenueSettings.subProPrice : plan === 'PREMIUM' ? state.revenueSettings.subPremiumPrice : plan === 'ENTERPRISE' ? state.revenueSettings.subEnterprisePrice : 0;
    
    if (cost > 0) {
      let wallet = state.wallets.find(w => w.userId === userId);
      if (!wallet || wallet.balance < cost) {
        return { success: false, message: 'Insufficient wallet balance' };
      }
      wallet.balance -= cost;

      state.walletTransactions.push({
        id: state.walletTransactions.length + 1,
        walletId: wallet.id,
        amount: -cost,
        type: 'DEBIT_SUBCRIPTION',
        description: `Subscription to Business ${plan} Plan`,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
      });
    }

    const existing = state.businessSubscriptions.find(s => s.userId === userId);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    if (existing) {
      existing.plan = plan;
      existing.expiresAt = expiresAt;
    } else {
      state.businessSubscriptions.push({
        id: state.businessSubscriptions.length + 1,
        userId,
        plan,
        expiresAt,
        createdAt: new Date().toISOString()
      });
    }

    const user = state.users.find(u => u.id === userId);
    if (user && plan !== 'FREE') {
      user.role = UserRole.BUSINESS;
    }

    state.notifications.push({
      id: state.notifications.length + 1,
      userId,
      title: 'Subscription activated',
      message: `Your GoodSale Business ${plan} subscription is now active until ${new Date(expiresAt).toLocaleDateString()}.`,
      type: 'VERIFICATION',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    return { success: true, plan };
  },

  subscribeVerifiedPlus(userId: number) {
    const state = getDBState();
    const cost = state.revenueSettings.verifiedPlusPrice;

    let wallet = state.wallets.find(w => w.userId === userId);
    if (!wallet || wallet.balance < cost) {
      return { success: false, message: 'Insufficient wallet balance' };
    }
    wallet.balance -= cost;

    state.walletTransactions.push({
      id: state.walletTransactions.length + 1,
      walletId: wallet.id,
      amount: -cost,
      type: 'DEBIT_SUBCRIPTION',
      description: 'Activated Verified+ Premium Membership',
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    state.verifiedPlusSubscriptions.push({
      id: state.verifiedPlusSubscriptions.length + 1,
      userId,
      expiresAt,
      createdAt: new Date().toISOString()
    });

    const user = state.users.find(u => u.id === userId);
    if (user) {
      if (user.role === UserRole.SELLER) user.role = UserRole.VERIFIED_SELLER;
      else if (user.role === UserRole.BUSINESS) user.role = UserRole.VERIFIED_BUSINESS;
      user.trustScore = Math.min(100, user.trustScore + 10);
    }

    state.notifications.push({
      id: state.notifications.length + 1,
      userId,
      title: 'Verified+ status activated',
      message: 'Verified+ benefits are now unlocked! You have received a Premium verification badge, boosted search listings priority, and enhanced Trust score.',
      type: 'VERIFICATION',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    return { success: true };
  },

  promoteListingFeatured(productId: number, durationDays: number) {
    const state = getDBState();
    const product = state.products.find(p => p.id === productId);
    if (!product) return { success: false, message: 'Product not found' };

    const settings = state.revenueSettings;
    const cost = durationDays === 3 ? settings.featured3DaysPrice : durationDays === 7 ? settings.featured7DaysPrice : durationDays === 14 ? settings.featured14DaysPrice : settings.featured30DaysPrice;

    let wallet = state.wallets.find(w => w.userId === product.sellerId);
    if (!wallet || wallet.balance < cost) {
      return { success: false, message: 'Insufficient wallet balance. Please credit wallet.' };
    }
    wallet.balance -= cost;

    state.walletTransactions.push({
      id: state.walletTransactions.length + 1,
      walletId: wallet.id,
      amount: -cost,
      type: 'DEBIT_FEES',
      description: `Promoted "${product.title}" as Featured Listing for ${durationDays} Days`,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    });

    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    state.featuredListings.push({
      id: state.featuredListings.length + 1,
      productId,
      sellerId: product.sellerId,
      durationDays,
      expiresAt,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    });

    state.notifications.push({
      id: state.notifications.length + 1,
      userId: product.sellerId,
      title: 'Listing featured successfully',
      message: `Your product "${product.title}" has been promoted to Featured status for ${durationDays} days and will rank higher in search results!`,
      type: 'POINTS',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    withClient(async (client) => {
      const ends = new Date();
      ends.setDate(ends.getDate() + durationDays);
      await insertFeaturedListing(client, {
        productId,
        sellerId: product.sellerId,
        featureType: 'FEATURED',
        startsAt: new Date().toISOString(),
        endsAt: ends.toISOString(),
        amountPaid: cost,
      });
      await reloadFromSupabase();
    });
    return { success: true };
  },

  promoteListingFlashSale(productId: number) {
    const state = getDBState();
    const product = state.products.find(p => p.id === productId);
    if (!product) return { success: false, message: 'Product not found' };

    const cost = state.revenueSettings.flashSaleFeaturePrice;
    let wallet = state.wallets.find(w => w.userId === product.sellerId);
    if (!wallet || wallet.balance < cost) {
      return { success: false, message: 'Insufficient wallet balance.' };
    }
    wallet.balance -= cost;

    state.walletTransactions.push({
      id: state.walletTransactions.length + 1,
      walletId: wallet.id,
      amount: -cost,
      type: 'DEBIT_FEES',
      description: `Promoted "${product.title}" to Flash Sales`,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    });

    state.notifications.push({
      id: state.notifications.length + 1,
      userId: product.sellerId,
      title: 'Flash sale listing confirmed',
      message: `Your product "${product.title}" is now officially scheduled to be featured in the next high-traffic Flash Sale block.`,
      type: 'POINTS',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    withClient(async (client) => {
      const ends = new Date();
      ends.setHours(ends.getHours() + 24);
      await insertFeaturedListing(client, {
        productId,
        sellerId: product.sellerId,
        featureType: 'FLASH_SALE',
        startsAt: new Date().toISOString(),
        endsAt: ends.toISOString(),
        amountPaid: cost,
      });
      await reloadFromSupabase();
    });
    return { success: true };
  },

  createSponsoredAd(sellerId: number, type: 'PRODUCT' | 'BUSINESS' | 'BANNER_HOME' | 'BANNER_CATEGORY', targetId: number, title: string, budget: number, bannerUrl?: string) {
    const state = getDBState();
    let wallet = state.wallets.find(w => w.userId === sellerId);
    if (!wallet || wallet.balance < budget) {
      return { success: false, message: 'Insufficient wallet balance' };
    }
    wallet.balance -= budget;

    state.walletTransactions.push({
      id: state.walletTransactions.length + 1,
      walletId: wallet.id,
      amount: -budget,
      type: 'DEBIT_AD',
      description: `Created Sponsored Ad campaign: "${title}"`,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    });

    const newAd: SponsoredAd = {
      id: Math.max(...state.sponsoredAds.map(a => a.id), 0) + 1,
      sellerId,
      type,
      targetId,
      title,
      bannerUrl,
      status: 'ACTIVE',
      budget,
      spent: 0,
      clicks: 0,
      impressions: 0,
      createdAt: new Date().toISOString()
    };

    state.sponsoredAds.push(newAd);
    saveDBState(state);
    return { success: true, ad: newAd };
  },

  interactSponsoredAd(adId: number, actionType: 'IMPRESSION' | 'CLICK') {
    const state = getDBState();
    const ad = state.sponsoredAds.find(a => a.id === adId);
    if (!ad || ad.status !== 'ACTIVE') return null;

    if (actionType === 'IMPRESSION') {
      ad.impressions += 1;
    } else {
      ad.clicks += 1;
      // A budget of 0 means "unlimited" (the default for admin house ads), so
      // the ad never self-completes from spend.
      if (ad.budget > 0) {
        const cpc = state.revenueSettings.adCpcPrice;
        if (ad.spent + cpc <= ad.budget) {
          ad.spent += cpc;
          if (ad.spent + cpc > ad.budget) {
            ad.status = 'COMPLETED';
          }
        } else {
          ad.status = 'COMPLETED';
        }
      }
    }

    saveDBState(state);
    withClient(async (client) => {
      await updateSponsoredAd(client, ad.id, {
        impressions: ad.impressions,
        clicks: ad.clicks,
        spent: ad.spent,
        status: ad.status,
      });
      await reloadFromSupabase();
    });
    return ad;
  },

  /** Admin-only: create a house ad with an uploaded image/video and placements. */
  createAdminAd(input: {
    title: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    ctaText?: string;
    clickView?: string;
    placements?: string[];
    budget?: number;
  }) {
    const state = getDBState();
    if (!state.currentUser) return { success: false, message: 'Not signed in' };
    const isStaff =
      state.currentUser.role === UserRole.ADMIN || state.currentUser.role === UserRole.SUPER_ADMIN;
    if (!isStaff) return { success: false, message: 'Admins only' };
    if (!input.title.trim()) return { success: false, message: 'Ad title is required' };
    if (!input.mediaUrl) return { success: false, message: 'Upload an image or video first' };

    const newAd: SponsoredAd = {
      id: Math.max(...state.sponsoredAds.map((a) => a.id), 0) + 1,
      sellerId: state.currentUser.id,
      type: 'BANNER_HOME',
      targetId: 0,
      title: input.title.trim(),
      bannerUrl: input.mediaUrl,
      mediaUrl: input.mediaUrl,
      mediaType: input.mediaType || 'image',
      ctaText: input.ctaText || '',
      clickView: input.clickView || '',
      placements: (input.placements?.length ? input.placements : ['HOME']) as SponsoredAd['placements'],
      status: 'ACTIVE',
      budget: input.budget ?? 0,
      spent: 0,
      clicks: 0,
      impressions: 0,
      createdAt: new Date().toISOString(),
    };

    state.sponsoredAds.push(newAd);
    saveDBState(state);
    this.addAuditLog(
      state.currentUser.id,
      'CREATE_AD',
      'SPONSORED_AD',
      newAd.id,
      `Created ad "${newAd.title}" for ${newAd.placements?.join(', ')}`
    );

    withClient(async (client) => {
      await insertSponsoredAd(client, {
        sellerId: newAd.sellerId,
        type: newAd.type,
        targetId: newAd.targetId,
        title: newAd.title,
        budget: newAd.budget,
        bannerUrl: newAd.bannerUrl,
        mediaUrl: newAd.mediaUrl,
        mediaType: newAd.mediaType,
        ctaText: newAd.ctaText,
        clickView: newAd.clickView,
        placements: (newAd.placements || ['HOME']) as string[],
      });
      await reloadFromSupabase();
    });

    return { success: true, ad: newAd };
  },

  /** Admin-only: pause / resume an ad. */
  setAdStatus(adId: number, status: 'ACTIVE' | 'PAUSED' | 'COMPLETED') {
    const state = getDBState();
    const ad = state.sponsoredAds.find((a) => a.id === adId);
    if (!ad) return { success: false, message: 'Ad not found' };
    ad.status = status;
    saveDBState(state);
    withClient(async (client) => {
      await updateSponsoredAd(client, adId, { status });
      await reloadFromSupabase();
    });
    return { success: true };
  },

  /** Admin-only: publish an announcement that pops up for users on entry. */
  createAnnouncement(input: {
    title: string;
    body: string;
    kind?: Announcement['kind'];
    audience?: Announcement['audience'];
    imageUrl?: string;
  }) {
    const state = getDBState();
    if (!state.currentUser) return { success: false, message: 'Not signed in' };
    const isStaff =
      state.currentUser.role === UserRole.ADMIN || state.currentUser.role === UserRole.SUPER_ADMIN;
    if (!isStaff) return { success: false, message: 'Admins only' };
    if (!input.title.trim()) return { success: false, message: 'Add a headline' };
    if (!input.body.trim()) return { success: false, message: 'Add the message' };

    const item: Announcement = {
      id: Math.max(...state.announcements.map((a) => a.id), 0) + 1,
      title: input.title.trim(),
      body: input.body.trim(),
      kind: input.kind || 'ANNOUNCEMENT',
      audience: input.audience || 'ALL',
      imageUrl: input.imageUrl || '',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    state.announcements.unshift(item);
    saveDBState(state);
    withClient(async (client) => {
      await insertAnnouncement(client, {
        title: item.title,
        body: item.body,
        kind: item.kind,
        audience: item.audience,
        imageUrl: item.imageUrl,
        isActive: true,
      });
      await reloadFromSupabase();
    });
    return { success: true, announcement: item };
  },

  setAnnouncementActive(id: number, isActive: boolean) {
    const state = getDBState();
    const item = state.announcements.find((a) => a.id === id);
    if (!item) return { success: false };
    item.isActive = isActive;
    saveDBState(state);
    withClient(async (client) => {
      await updateAnnouncement(client, id, { is_active: isActive });
      await reloadFromSupabase();
    });
    return { success: true };
  },

  deleteAnnouncement(id: number) {
    const state = getDBState();
    state.announcements = state.announcements.filter((a) => a.id !== id);
    saveDBState(state);
    withClient(async (client) => {
      await deleteAnnouncementById(client, id);
      await reloadFromSupabase();
    });
    return { success: true };
  },

  /** Admin-only: remove an ad everywhere it renders. */
  deleteAd(adId: number) {
    const state = getDBState();
    state.sponsoredAds = state.sponsoredAds.filter((a) => a.id !== adId);
    saveDBState(state);
    withClient(async (client) => {
      const { error } = await client.from('sponsored_ads').delete().eq('id', adId);
      if (error) return;
      await reloadFromSupabase();
    });
    return { success: true };
  },

  /** Wallet funding is server-only and requires verified Paystack payment. */
  depositToWallet() {
    return {
      error:
        'Wallet funding must be completed through Paystack checkout and server verification. Local credits are disabled.',
    };
  },

  addAuditLog(userId: number, action: string, entityType: string, entityId: number, details: string) {
    const state = getDBState();
    const log: AuditLog = {
      id: state.auditLogs.length + 1,
      userId,
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };
    state.auditLogs.push(log);
    saveDBState(state);
    return log;
  },

  updateRevenueSettings(userId: number, settings: Partial<RevenueSettings>) {
    const state = getDBState();
    state.revenueSettings = {
      ...state.revenueSettings,
      ...settings
    };
    
    const changedFields = Object.keys(settings).map(key => {
      const val = (settings as any)[key];
      return `${key} modified to ${val}`;
    }).join(', ');
    
    const details = `Admin updated settings: ${changedFields}`;
    const log: AuditLog = {
      id: state.auditLogs.length + 1,
      userId,
      action: 'UPDATE_REVENUE_SETTINGS',
      entityType: 'REVENUE_SETTINGS',
      entityId: 1,
      details,
      createdAt: new Date().toISOString(),
    };
    state.auditLogs.push(log);
    saveDBState(state);

    withClient(async (client) => {
      await upsertRevenueSettings(client, {
        platform_fee_enabled: state.revenueSettings.platformFeeEnabled,
        escrow_percentage_fee: state.revenueSettings.escrowPercentageFee,
        escrow_min_fee: state.revenueSettings.escrowMinFee,
        escrow_max_fee: state.revenueSettings.escrowMaxFee,
        delivery_commission_percentage: state.revenueSettings.deliveryCommissionPercentage,
        featured_3_days_price: state.revenueSettings.featured3DaysPrice,
        featured_7_days_price: state.revenueSettings.featured7DaysPrice,
        featured_14_days_price: state.revenueSettings.featured14DaysPrice,
        featured_30_days_price: state.revenueSettings.featured30DaysPrice,
        sub_pro_price: state.revenueSettings.subProPrice,
        sub_premium_price: state.revenueSettings.subPremiumPrice,
        sub_enterprise_price: state.revenueSettings.subEnterprisePrice,
        verified_plus_price: state.revenueSettings.verifiedPlusPrice,
        flash_sale_feature_price: state.revenueSettings.flashSaleFeaturePrice,
        auction_success_fee_percentage: state.revenueSettings.auctionSuccessFeePercentage,
        ad_cpc_price: state.revenueSettings.adCpcPrice,
        good_sale_protect_fee: state.revenueSettings.goodSaleProtectFee,
      });
      await reloadFromSupabase();
    });

    return { success: true, settings: state.revenueSettings, log };
  },

  updatePaymentSettings(userId: number, settings: Partial<PaymentSettings>) {
    const state = getDBState();
    state.paymentSettings = {
      ...state.paymentSettings,
      ...settings
    };
    
    const details = `Admin updated payment settings: enabledMethods=${JSON.stringify(state.paymentSettings.enabledMethods)}`;
    const log: AuditLog = {
      id: state.auditLogs.length + 1,
      userId,
      action: 'UPDATE_PAYMENT_SETTINGS',
      entityType: 'PAYMENT_SETTINGS',
      entityId: 1,
      details,
      createdAt: new Date().toISOString(),
    };
    state.auditLogs.push(log);
    saveDBState(state);

    withClient(async (client) => {
      await upsertPaymentSettings(client, {
        enabled_methods: state.paymentSettings.enabledMethods,
      });
      await reloadFromSupabase();
    });

    return { success: true, settings: state.paymentSettings, log };
  },

  createBundle(sellerId: number, title: string, description: string, productIds: number[], price: number, discountPercentage: number, quantity: number) {
    const state = getDBState();
    const newId = Math.max(...state.productBundles.map(b => b.id), 300) + 1;
    const bundle: ProductBundle = {
      id: newId,
      sellerId,
      title,
      description,
      productIds,
      price,
      discountPercentage,
      quantity,
      createdAt: new Date().toISOString()
    };
    state.productBundles.push(bundle);
    saveDBState(state);
    withClient(async (client) => {
      await insertBundle(client, {
        sellerId: bundle.sellerId,
        title: bundle.title,
        description: bundle.description,
        productIds: bundle.productIds,
        price: bundle.price,
        discountPercentage: bundle.discountPercentage,
        quantity: bundle.quantity,
      });
      await reloadFromSupabase();
    });

    return bundle;
  },

  // ---------- Admin CRUD ----------
  requireAdmin() {
    const state = getDBState();
    const role = state.currentUser?.role;
    if (!state.currentUser || (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN)) {
      throw new Error('Admin privileges required');
    }
    return state;
  },

  async adminSetUserRole(userId: number, role: UserRole) {
    const state = dbOperations.requireAdmin();
    const user = state.users.find((u) => u.id === userId);
    if (!user) return { error: 'User not found' };
    user.role = role;
    if (state.currentUser?.id === userId) state.currentUser.role = role;
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_SET_ROLE', 'USER', userId, `Role set to ${role}`);
    saveDBState(state);

    const client = createClient();
    if (client) {
      const { error } = await client.rpc('admin_set_profile_role', { p_user_id: userId, p_role: role });
      if (error) {
        await client.from('profiles').update({ role }).eq('id', userId);
      }
      await reloadFromSupabase();
    }
    return { success: true, user };
  },

  async adminSuspendUser(userId: number, suspended: boolean) {
    const state = dbOperations.requireAdmin();
    const user = state.users.find((u) => u.id === userId);
    if (!user) return { error: 'User not found' };
    user.isSuspended = suspended;
    if (suspended) user.trustScore = Math.min(user.trustScore, 20);
    dbOperations.addAuditLog(
      state.currentUser!.id,
      suspended ? 'ADMIN_SUSPEND_USER' : 'ADMIN_UNSUSPEND_USER',
      'USER',
      userId,
      suspended ? 'User suspended' : 'User reinstated'
    );
    state.notifications.push({
      id: state.notifications.length + 1,
      userId,
      title: suspended ? 'Account Suspended' : 'Account Reinstated',
      message: suspended
        ? 'Your GoodSale account has been suspended by an administrator.'
        : 'Your GoodSale account has been reinstated. You may trade again.',
      type: 'SYSTEM',
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    saveDBState(state);

    const client = createClient();
    if (client) {
      await client.from('profiles').update({
        trust_score: user.trustScore,
        is_suspended: suspended,
      }).eq('id', userId);
      await reloadFromSupabase();
    }
    return { success: true, user };
  },

  /**
   * Delete one of the signed-in user's own listings (admins may delete any).
   * Removes it from the local store immediately and persists to Supabase so it
   * does not reappear on the next realtime reload.
   */
  async deleteProduct(productId: number) {
    const state = getDBState();
    const current = state.currentUser;
    if (!current) return { error: 'Sign in to manage your listings.' };

    const product = state.products.find((p) => p.id === productId);
    if (!product) return { error: 'Product not found' };

    const isAdmin = current.role === UserRole.ADMIN || current.role === UserRole.SUPER_ADMIN;
    if (product.sellerId !== current.id && !isAdmin) {
      return { error: 'You can only delete your own listings.' };
    }

    state.products = state.products.filter((p) => p.id !== productId);
    state.auctions = state.auctions.filter((a) => a.productId !== productId);
    saveDBState(state);

    const client = createClient();
    if (client) {
      // Clear dependent rows that reference the product so the delete never
      // fails on a foreign-key conflict (bundles, auctions, featured slots).
      await Promise.allSettled([
        client.from('product_bundles').delete().eq('product_id', productId),
        client.from('auctions').delete().eq('product_id', productId),
        client.from('featured_listings').delete().eq('product_id', productId),
      ]);
      const { error } = await client.from('products').delete().eq('id', productId);
      if (error) {
        console.error('Failed to delete product:', error.message);
        await reloadFromSupabase();
        return {
          error:
            error.code === '23503'
              ? 'This listing has orders attached and cannot be deleted.'
              : error.message,
        };
      }
      await reloadFromSupabase();
    }
    return { success: true };
  },

  async adminDeleteProduct(productId: number) {
    const state = dbOperations.requireAdmin();
    const product = state.products.find((p) => p.id === productId);
    if (!product) return { error: 'Product not found' };
    state.products = state.products.filter((p) => p.id !== productId);
    state.auctions = state.auctions.filter((a) => a.productId !== productId);
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_DELETE_PRODUCT', 'PRODUCT', productId, product.title);
    saveDBState(state);

    const client = createClient();
    if (client) {
      await client.from('products').delete().eq('id', productId);
      await reloadFromSupabase();
    }
    return { success: true };
  },

  /**
   * Admin edit of any listing — price/stock plus the full detail set, photos
   * and the optional product video. Media edits and deletions are unrestricted
   * for admins (the seeded launch catalog has its own narrower guard in the
   * seed API). Pass `videoUrl: ''` to clear the video.
   */
  async adminUpdateProduct(
    productId: number,
    patch: Partial<{
      title: string;
      description: string;
      price: number;
      compareAtPrice: number;
      quantity: number;
      stockStatus: Product['stockStatus'];
      moderationStatus: Product['moderationStatus'];
      rejectionReason: string | undefined;
      category: string;
      brand: string;
      condition: ProductCondition;
      images: string[];
      videoUrl: string;
      warranty: string;
      returnPolicy: string;
      deliveryMethod: string;
      dimensionsCm: string;
      weightKg: number;
      isNegotiable: boolean;
      pickupAvailable: boolean;
    }>
  ) {
    const state = dbOperations.requireAdmin();
    const product = state.products.find((p) => p.id === productId);
    if (!product) return { error: 'Product not found' };
    const includesModeration = 'moderationStatus' in patch || 'rejectionReason' in patch;
    Object.assign(product, patch);
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_UPDATE_PRODUCT', 'PRODUCT', productId, JSON.stringify(patch));
    saveDBState(state);

    const client = createClient();
    if (client) {
      await client.from('products').update({
        title: product.title,
        description: product.description,
        price: product.price,
        compare_at_price: product.compareAtPrice ?? null,
        quantity: product.quantity,
        stock_status: product.stockStatus,
        // Only write moderation columns when the caller decided them, so admins
        // can still edit listings on databases without migration 017.
        ...(includesModeration
          ? { moderation_status: product.moderationStatus ?? 'APPROVED', rejection_reason: product.rejectionReason ?? null }
          : {}),
        category: product.category,
        brand: product.brand,
        condition: product.condition,
        images: product.images || [],
        video_url: product.videoUrl ? product.videoUrl : null,
        warranty: product.warranty ?? null,
        return_policy: product.returnPolicy ?? null,
        delivery_method: product.deliveryMethod,
        dimensions_cm: product.dimensionsCm ?? null,
        weight_kg: product.weightKg ?? null,
        is_negotiable: product.isNegotiable,
        pickup_available: product.pickupAvailable,
      }).eq('id', productId);
      await reloadFromSupabase();
    }
    return { success: true, product };
  },


  async adminUpdateOrderStatus(orderId: number, status: OrderStatus) {
    const state = dbOperations.requireAdmin();
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return { error: 'Order not found' };
    order.status = status;
    order.updatedAt = new Date().toISOString();
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_ORDER_STATUS', 'ORDER', orderId, status);
    saveDBState(state);

    try {
      if (status === OrderStatus.SHIPPED || status === OrderStatus.OUT_FOR_DELIVERY) {
        await fetch('/api/orders/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, status }),
        });
      } else {
        const client = createClient();
        if (client) await client.from('orders').update({ status }).eq('id', orderId);
      }
      await reloadFromSupabase();
    } catch (err) {
      console.error(err);
    }
    return { success: true };
  },

  async adminRejectDeliveryPartner(partnerId: number, reason?: string) {
    const reviewed = await postDeliveryApi('/api/admin/riders', {
      action: 'REVIEW',
      riderId: partnerId,
      status: 'REJECTED',
      reason,
    });
    if (!reviewed.error) return { success: true };
    const state = dbOperations.requireAdmin();
    const partner = state.deliveryPartners.find((p) => p.id === partnerId);
    if (!partner) return { error: 'Partner not found' };
    partner.status = 'REJECTED';
    partner.isAvailable = false;
    partner.rejectionReason = reason || '';
    partner.reviewedBy = state.currentUser!.id;
    partner.reviewedAt = new Date().toISOString();
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_REJECT_PARTNER', 'DELIVERY_PARTNER', partnerId, partner.fullName);
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: partner.userId,
      title: 'Delivery Partner Application Rejected',
      message: reason
        ? `Your GoodDispatch application was rejected. Reason: ${reason}`
        : 'Your GoodDispatch application was rejected. Contact support for details.',
      type: 'VERIFICATION',
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    saveDBState(state);
    const client = createClient();
    if (client) {
      try {
        await updateDeliveryPartnerReview(client, partnerId, {
          status: 'REJECTED',
          rejection_reason: reason || '',
          reviewed_by: state.currentUser!.id,
          reviewed_at: partner.reviewedAt!,
        });
        await client.from('delivery_partners').update({ is_available: false }).eq('id', partnerId);
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to record partner rejection:', err);
      }
    }
    return { success: true };
  },

  // -------------------------------------------------------------------------
  // Service areas — the states & cities GoodSale is live in. Admin-managed,
  // rendered everywhere the app asks for a state/city (sell form, addresses,
  // rider onboarding, delivery quoting, checkout).
  // -------------------------------------------------------------------------
  /** Every state GoodSale is configured in. */
  serviceStates(): string[] {
    return Array.from(new Set(getDBState().serviceAreas.map((a) => a.state))).sort((a, b) => a.localeCompare(b));
  },

  /** Cities, optionally narrowed to one state. */
  serviceCities(stateName?: string): string[] {
    const areas = getDBState().serviceAreas;
    const pool = stateName ? areas.filter((a) => a.state === stateName) : areas;
    return Array.from(new Set(pool.map((a) => a.city))).sort((a, b) => a.localeCompare(b));
  },

  /** Cities where sellers may list and buyers may order. */
  salesCities(stateName?: string): string[] {
    const areas = getDBState().serviceAreas.filter((a) => a.salesEnabled);
    const pool = stateName ? areas.filter((a) => a.state === stateName) : areas;
    return Array.from(new Set(pool.map((a) => a.city))).sort((a, b) => a.localeCompare(b));
  },

  /** Cities where GoodDispatch riders accept deliveries. */
  deliveryCities(stateName?: string): string[] {
    const areas = getDBState().serviceAreas.filter((a) => a.deliveryEnabled);
    const pool = stateName ? areas.filter((a) => a.state === stateName) : areas;
    return Array.from(new Set(pool.map((a) => a.city))).sort((a, b) => a.localeCompare(b));
  },

  /**
   * Can GoodSale sell/fulfil here? When no coverage has been configured yet we
   * allow everyone through, so an empty admin list never locks the app up.
   */
  isSalesArea(stateName?: string, city?: string): boolean {
    const areas = getDBState().serviceAreas;
    if (!areas.length) return true;
    if (!city) return areas.some((a) => a.salesEnabled && (!stateName || a.state === stateName));
    const match = areas.find(
      (a) => a.city.toLowerCase() === city.toLowerCase() && (!stateName || a.state.toLowerCase() === stateName.toLowerCase())
    );
    return match ? match.salesEnabled : false;
  },

  /** Can a rider accept deliveries here? */
  isDeliveryArea(stateName?: string, city?: string): boolean {
    const areas = getDBState().serviceAreas;
    if (!areas.length) return true;
    if (!city) return areas.some((a) => a.deliveryEnabled && (!stateName || a.state === stateName));
    const match = areas.find(
      (a) => a.city.toLowerCase() === city.toLowerCase() && (!stateName || a.state.toLowerCase() === stateName.toLowerCase())
    );
    return match ? match.deliveryEnabled : false;
  },

  async adminUpsertServiceArea(area: { state: string; city: string; salesEnabled: boolean; deliveryEnabled: boolean }) {
    const state = dbOperations.requireAdmin();
    const stateName = area.state.trim();
    const city = area.city.trim();
    if (!stateName || !city) return { error: 'State and city are both required.' };

    const existing = state.serviceAreas.find(
      (a) => a.state.toLowerCase() === stateName.toLowerCase() && a.city.toLowerCase() === city.toLowerCase()
    );

    if (existing) {
      existing.salesEnabled = area.salesEnabled;
      existing.deliveryEnabled = area.deliveryEnabled;
    } else {
      state.serviceAreas.push({
        id: Math.max(0, ...state.serviceAreas.map((a) => a.id)) + 1,
        state: stateName,
        city,
        salesEnabled: area.salesEnabled,
        deliveryEnabled: area.deliveryEnabled,
        createdAt: new Date().toISOString(),
      });
    }

    dbOperations.addAuditLog(
      state.currentUser!.id,
      existing ? 'ADMIN_UPDATE_SERVICE_AREA' : 'ADMIN_ADD_SERVICE_AREA',
      'SERVICE_AREA',
      existing?.id ?? 0,
      `${stateName} · ${city} (sales ${area.salesEnabled ? 'on' : 'off'}, delivery ${area.deliveryEnabled ? 'on' : 'off'})`
    );
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await upsertServiceArea(client, { state: stateName, city, salesEnabled: area.salesEnabled, deliveryEnabled: area.deliveryEnabled });
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to persist service area:', err);
        return { error: 'Saved locally but could not reach the server. Try again.' };
      }
    }
    return { success: true };
  },

  /**
   * Admin edits an existing coverage area — rename its state/city or change the
   * sales & delivery toggles in one go (used by the Edit action in Coverage).
   */
  async adminUpdateServiceArea(
    id: number,
    area: { state: string; city: string; salesEnabled: boolean; deliveryEnabled: boolean }
  ) {
    const state = dbOperations.requireAdmin();
    const existing = state.serviceAreas.find((a) => a.id === id);
    if (!existing) return { error: 'Area not found' };

    const stateName = area.state.trim();
    const city = area.city.trim();
    if (!stateName || !city) return { error: 'State and city are both required.' };

    const clash = state.serviceAreas.find(
      (a) =>
        a.id !== id &&
        a.state.toLowerCase() === stateName.toLowerCase() &&
        a.city.toLowerCase() === city.toLowerCase()
    );
    if (clash) return { error: `${city}, ${stateName} already exists.` };

    const previous = `${existing.state} · ${existing.city}`;
    existing.state = stateName;
    existing.city = city;
    existing.salesEnabled = area.salesEnabled;
    existing.deliveryEnabled = area.deliveryEnabled;

    dbOperations.addAuditLog(
      state.currentUser!.id,
      'ADMIN_UPDATE_SERVICE_AREA',
      'SERVICE_AREA',
      id,
      `${previous} → ${stateName} · ${city} (sales ${area.salesEnabled ? 'on' : 'off'}, delivery ${area.deliveryEnabled ? 'on' : 'off'})`
    );
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await updateServiceAreaFlags(client, id, {
          state: stateName,
          city,
          sales_enabled: area.salesEnabled,
          delivery_enabled: area.deliveryEnabled,
        });
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to update service area:', err);
        return { error: 'Saved locally but could not reach the server. Try again.' };
      }
    }
    return { success: true };
  },

  async adminToggleServiceArea(id: number, patch: { salesEnabled?: boolean; deliveryEnabled?: boolean }) {
    const state = dbOperations.requireAdmin();
    const area = state.serviceAreas.find((a) => a.id === id);
    if (!area) return { error: 'Area not found' };

    if (patch.salesEnabled != null) area.salesEnabled = patch.salesEnabled;
    if (patch.deliveryEnabled != null) area.deliveryEnabled = patch.deliveryEnabled;
    saveDBState(state);

    const client = createClient();
    if (client) {
      await updateServiceAreaFlags(client, id, { sales_enabled: area.salesEnabled, delivery_enabled: area.deliveryEnabled });
      await reloadFromSupabase();
    }
    return { success: true };
  },

  async adminDeleteServiceArea(id: number) {
    const state = dbOperations.requireAdmin();
    const area = state.serviceAreas.find((a) => a.id === id);
    if (!area) return { error: 'Area not found' };

    state.serviceAreas = state.serviceAreas.filter((a) => a.id !== id);
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_DELETE_SERVICE_AREA', 'SERVICE_AREA', id, `${area.state} · ${area.city}`);
    saveDBState(state);

    const client = createClient();
    if (client) {
      await deleteServiceAreaById(client, id);
      await reloadFromSupabase();
    }
    return { success: true };
  },

  // -------------------------------------------------------------------------
  // Shipping & delivery administration
  // -------------------------------------------------------------------------
  async recordShippingAudit(action: string, entityType: string, entityId: number, details: string) {
    const state = getDBState();
    const log = {
      id: Math.max(0, ...state.shippingAuditLogs.map((entry) => entry.id)) + 1,
      userId: state.currentUser?.id,
      userName: state.currentUser?.fullName || state.currentUser?.username || 'Administrator',
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    };
    state.shippingAuditLogs.unshift(log);
    saveDBState(state);
    const client = createClient();
    if (client) {
      try {
        await insertShippingAuditLog(client, {
          userId: log.userId,
          userName: log.userName,
          action,
          entityType,
          entityId,
          details,
        });
      } catch (err) {
        console.error('Failed to persist shipping audit log:', err);
      }
    }
    return log;
  },

  async adminUpdateShippingSettings(settings: ShippingSettings) {
    const state = dbOperations.requireAdmin();
    const next: ShippingSettings = { ...state.shippingSettings, ...settings };
    const numericFields: (keyof ShippingSettings)[] = [
      'localBaseFee', 'perKmFee', 'minFee', 'maxFee', 'interstateBaseFee',
      'interstatePerKmFee', 'weightSurchargePerKg', 'oversizeSurcharge',
      'remoteSurcharge', 'freeShippingThreshold', 'handlingFee',
      'platformShippingFee', 'economyFee', 'standardFee', 'expressFee',
      'manualQuoteAboveKm', 'defaultEtaMinDays', 'defaultEtaMaxDays',
    ];
    for (const key of numericFields) {
      const value = Number(next[key]);
      if (!Number.isFinite(value) || value < 0) return { error: `${String(key)} must be a positive number.` };
      (next as unknown as Record<string, number>)[String(key)] = value;
    }
    if (next.minFee > next.maxFee) return { error: 'Minimum delivery charge cannot exceed the maximum.' };
    if (next.defaultEtaMaxDays < next.defaultEtaMinDays) return { error: 'Maximum ETA cannot be shorter than the minimum ETA.' };

    state.shippingSettings = next;
    await dbOperations.recordShippingAudit('ADMIN_UPDATE_SHIPPING_SETTINGS', 'SHIPPING_SETTINGS', 1, `Local base ₦${next.localBaseFee}, interstate ₦${next.interstateBaseFee}, max ₦${next.maxFee}`);
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await upsertShippingSettings(client, next as unknown as Record<string, unknown>);
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to save shipping settings:', err);
        return { error: 'Saved locally but could not reach the server. Try again.' };
      }
    }
    return { success: true };
  },

  async adminUpsertShippingZone(zone: Omit<ShippingZone, 'id' | 'createdAt'> & { id?: number }) {
    const state = dbOperations.requireAdmin();
    const name = zone.name.trim();
    const zoneState = zone.state.trim();
    const city = (zone.city || '').trim();
    if (!name || !zoneState) return { error: 'Zone name and state are required.' };
    if (zone.surcharge < 0) return { error: 'Zone surcharge cannot be negative.' };
    const clash = state.shippingZones.find(
      (z) => z.id !== zone.id && z.name.toLowerCase() === name.toLowerCase() && z.state.toLowerCase() === zoneState.toLowerCase() && (z.city || '').toLowerCase() === city.toLowerCase()
    );
    if (clash) return { error: `${name} already exists for this route.` };

    const existing = zone.id ? state.shippingZones.find((z) => z.id === zone.id) : undefined;
    const row = {
      name,
      state: zoneState,
      city,
      kind: zone.kind,
      surcharge: Number(zone.surcharge) || 0,
      enabled: zone.enabled,
      priority: Number(zone.priority) || 0,
      notes: zone.notes || null,
    };
    let resolvedId = zone.id;

    const client = createClient();
    if (client) {
      try {
        if (existing) await updateShippingZone(client, existing.id, row);
        else resolvedId = await insertShippingZone(client, row);
      } catch (err) {
        console.error('Failed to save shipping zone:', err);
        return { error: 'Could not save the zone. Check the route and try again.' };
      }
    }

    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, row, { notes: row.notes || undefined });
    } else if (resolvedId) {
      state.shippingZones.push({
        id: resolvedId,
        name,
        state: zoneState,
        city,
        kind: zone.kind,
        surcharge: row.surcharge,
        enabled: zone.enabled,
        priority: row.priority,
        notes: zone.notes,
        createdAt: now,
      });
    }
    await dbOperations.recordShippingAudit(existing ? 'ADMIN_UPDATE_SHIPPING_ZONE' : 'ADMIN_CREATE_SHIPPING_ZONE', 'SHIPPING_ZONE', resolvedId || 0, `${name} · ${city ? `${city}, ` : ''}${zoneState} (₦${row.surcharge})`);
    saveDBState(state);
    if (client) await reloadFromSupabase();
    return { success: true, id: resolvedId };
  },

  async adminDeleteShippingZone(id: number) {
    const state = dbOperations.requireAdmin();
    const zone = state.shippingZones.find((z) => z.id === id);
    if (!zone) return { error: 'Zone not found.' };
    state.shippingZones = state.shippingZones.filter((z) => z.id !== id);
    const affectedRules = state.shippingRules.filter((rule) => rule.zoneId === id);
    state.shippingRules = state.shippingRules.map((rule) => rule.zoneId === id ? { ...rule, zoneId: undefined, scope: 'GLOBAL' as const, enabled: false } : rule);
    await dbOperations.recordShippingAudit('ADMIN_DELETE_SHIPPING_ZONE', 'SHIPPING_ZONE', id, `${zone.name} · ${zone.state}`);
    saveDBState(state);
    const client = createClient();
    if (client) {
      try {
        for (const rule of affectedRules) {
          await updateShippingRule(client, rule.id, { scope: 'GLOBAL', zone_id: null, enabled: false });
        }
        await deleteShippingZone(client, id);
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to delete shipping zone:', err);
        return { error: 'Could not delete the zone. Try again.' };
      }
    }
    return { success: true };
  },

  async adminUpsertShippingTier(tier: Omit<ShippingDistanceTier, 'id'> & { id?: number }) {
    const state = dbOperations.requireAdmin();
    const label = tier.label.trim();
    if (!label) return { error: 'Tier label is required.' };
    if (!Number.isFinite(tier.minKm) || tier.minKm < 0) return { error: 'Minimum distance must be zero or more.' };
    if (tier.maxKm != null && tier.maxKm <= tier.minKm) return { error: 'Maximum distance must be greater than the minimum.' };
    if (!Number.isFinite(tier.fee) || tier.fee < 0) return { error: 'Tier fee must be zero or more.' };
    if (tier.enabled) {
      const overlap = state.shippingTiers.find((existingTier) =>
        existingTier.id !== tier.id &&
        existingTier.enabled &&
        tier.minKm < (existingTier.maxKm ?? Number.POSITIVE_INFINITY) &&
        (tier.maxKm ?? Number.POSITIVE_INFINITY) > existingTier.minKm
      );
      if (overlap) return { error: `This range overlaps the "${overlap.label}" tier. Adjust the range or disable the other tier.` };
    }

    const existing = tier.id ? state.shippingTiers.find((t) => t.id === tier.id) : undefined;
    const row = {
      label,
      min_km: Number(tier.minKm),
      max_km: tier.maxKm == null ? null : Number(tier.maxKm),
      fee: Number(tier.fee),
      enabled: tier.enabled,
      priority: Number(tier.priority) || 0,
    };
    let resolvedId = tier.id;
    const client = createClient();
    if (client) {
      try {
        if (existing) await updateShippingTier(client, existing.id, row);
        else resolvedId = await insertShippingTier(client, row);
      } catch (err) {
        console.error('Failed to save shipping tier:', err);
        return { error: 'Could not save the distance tier. Try again.' };
      }
    }

    if (existing) {
      Object.assign(existing, { label, minKm: row.min_km, maxKm: row.max_km ?? undefined, fee: row.fee, enabled: tier.enabled, priority: row.priority });
    } else if (resolvedId) {
      state.shippingTiers.push({ id: resolvedId, label, minKm: row.min_km, maxKm: row.max_km ?? undefined, fee: row.fee, enabled: tier.enabled, priority: row.priority });
    }
    await dbOperations.recordShippingAudit(existing ? 'ADMIN_UPDATE_SHIPPING_TIER' : 'ADMIN_CREATE_SHIPPING_TIER', 'SHIPPING_TIER', resolvedId || 0, `${label} → ₦${row.fee}`);
    saveDBState(state);
    if (client) await reloadFromSupabase();
    return { success: true, id: resolvedId };
  },

  async adminDeleteShippingTier(id: number) {
    const state = dbOperations.requireAdmin();
    const tier = state.shippingTiers.find((t) => t.id === id);
    if (!tier) return { error: 'Distance tier not found.' };
    state.shippingTiers = state.shippingTiers.filter((t) => t.id !== id);
    await dbOperations.recordShippingAudit('ADMIN_DELETE_SHIPPING_TIER', 'SHIPPING_TIER', id, tier.label);
    saveDBState(state);
    const client = createClient();
    if (client) {
      try {
        await deleteShippingTier(client, id);
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to delete shipping tier:', err);
        return { error: 'Could not delete the distance tier. Try again.' };
      }
    }
    return { success: true };
  },

  async adminUpsertShippingRule(rule: Omit<ShippingRule, 'id' | 'createdAt'> & { id?: number }) {
    const state = dbOperations.requireAdmin();
    const name = rule.name.trim();
    if (!name) return { error: 'Rule name is required.' };
    if (rule.scope === 'ZONE' && !rule.zoneId) return { error: 'Select a delivery zone for a zone rule.' };
    if (rule.scope === 'STATE' && !rule.state?.trim()) return { error: 'A state is required for a state rule.' };
    if (rule.scope === 'CITY' && (!rule.city?.trim() || !rule.state?.trim())) return { error: 'State and city are required for a city rule.' };
    if (rule.minFee != null && rule.maxFee != null && rule.maxFee < rule.minFee) return { error: 'Rule minimum fee cannot exceed its maximum.' };
    for (const key of ['baseFee', 'perKmFee', 'minFee', 'maxFee', 'weightPerKg', 'oversizeSurcharge', 'remoteSurcharge', 'freeShippingThreshold', 'handlingFee', 'platformFee'] as const) {
      const value = rule[key];
      if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) return { error: `${key} must be zero or more.` };
    }

    const existing = rule.id ? state.shippingRules.find((r) => r.id === rule.id) : undefined;
    const row = {
      name,
      enabled: rule.enabled,
      priority: Number(rule.priority) || 0,
      scope: rule.scope,
      zone_id: rule.zoneId ?? null,
      state: rule.state?.trim() || '',
      city: rule.city?.trim() || '',
      origin_state: rule.originState?.trim() || '',
      origin_city: rule.originCity?.trim() || '',
      delivery_method: rule.deliveryMethod,
      service_type: rule.serviceType,
      base_fee: rule.baseFee ?? null,
      per_km_fee: rule.perKmFee ?? null,
      min_fee: rule.minFee ?? null,
      max_fee: rule.maxFee ?? null,
      weight_per_kg: rule.weightPerKg ?? null,
      oversize_surcharge: rule.oversizeSurcharge ?? null,
      remote_surcharge: rule.remoteSurcharge ?? null,
      free_shipping_threshold: rule.freeShippingThreshold ?? null,
      handling_fee: rule.handlingFee ?? null,
      platform_fee: rule.platformFee ?? null,
      seller_sponsored: rule.sellerSponsored,
      platform_sponsored: rule.platformSponsored,
      eta_min_days: rule.etaMinDays ?? null,
      eta_max_days: rule.etaMaxDays ?? null,
      manual_quote: rule.manualQuote,
      notes: rule.notes || null,
    };
    let resolvedId = rule.id;
    const client = createClient();
    if (client) {
      try {
        if (existing) await updateShippingRule(client, existing.id, row);
        else resolvedId = await insertShippingRule(client, row);
      } catch (err) {
        console.error('Failed to save shipping rule:', err);
        return { error: 'Could not save the pricing rule. Check for a duplicate name or invalid field.' };
      }
    }

    if (existing) {
      Object.assign(existing, rule, { name, id: existing.id });
    } else if (resolvedId) {
      state.shippingRules.push({ ...rule, id: resolvedId, name, createdAt: new Date().toISOString() });
    }
    await dbOperations.recordShippingAudit(existing ? 'ADMIN_UPDATE_SHIPPING_RULE' : 'ADMIN_CREATE_SHIPPING_RULE', 'SHIPPING_RULE', resolvedId || 0, `${name} · priority ${row.priority} · ${rule.scope}`);
    saveDBState(state);
    if (client) await reloadFromSupabase();
    return { success: true, id: resolvedId };
  },

  async adminToggleShippingRule(id: number, enabled: boolean) {
    const state = dbOperations.requireAdmin();
    const rule = state.shippingRules.find((r) => r.id === id);
    if (!rule) return { error: 'Rule not found.' };
    rule.enabled = enabled;
    await dbOperations.recordShippingAudit('ADMIN_TOGGLE_SHIPPING_RULE', 'SHIPPING_RULE', id, `${rule.name} ${enabled ? 'enabled' : 'disabled'}`);
    saveDBState(state);
    withClient(async (client) => {
      await updateShippingRule(client, id, { enabled });
      await reloadFromSupabase();
    });
    return { success: true };
  },

  async adminDeleteShippingRule(id: number) {
    const state = dbOperations.requireAdmin();
    const rule = state.shippingRules.find((r) => r.id === id);
    if (!rule) return { error: 'Rule not found.' };
    state.shippingRules = state.shippingRules.filter((r) => r.id !== id);
    await dbOperations.recordShippingAudit('ADMIN_DELETE_SHIPPING_RULE', 'SHIPPING_RULE', id, rule.name);
    saveDBState(state);
    const client = createClient();
    if (client) {
      try {
        await deleteShippingRule(client, id);
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to delete shipping rule:', err);
        return { error: 'Could not delete the rule. Try again.' };
      }
    }
    return { success: true };
  },

  async adminUpsertShippingCourier(courier: Omit<ShippingCourier, 'id' | 'createdAt'> & { id?: number }) {
    const state = dbOperations.requireAdmin();
    const name = courier.name.trim();
    const code = courier.code.trim().toUpperCase();
    if (!name || !code) return { error: 'Courier name and code are required.' };
    if (courier.baseFee < 0 || courier.perKmFee < 0) return { error: 'Courier fees cannot be negative.' };
    if (courier.expressMultiplier < 1) return { error: 'Express multiplier must be at least 1.' };
    if (state.shippingCouriers.some((c) => c.id !== courier.id && c.code.toUpperCase() === code)) return { error: 'Courier code already exists.' };

    const existing = courier.id ? state.shippingCouriers.find((c) => c.id === courier.id) : undefined;
    const row = {
      name,
      code,
      mode: courier.mode,
      enabled: courier.enabled,
      base_fee: Number(courier.baseFee) || 0,
      per_km_fee: Number(courier.perKmFee) || 0,
      express_multiplier: Number(courier.expressMultiplier) || 1,
      api_provider: courier.apiProvider || null,
      notes: courier.notes || null,
    };
    let resolvedId = courier.id;
    const client = createClient();
    if (client) {
      try {
        if (existing) await updateShippingCourier(client, existing.id, row);
        else resolvedId = await insertShippingCourier(client, row);
      } catch (err) {
        console.error('Failed to save courier:', err);
        return { error: 'Could not save the courier. Check the code and try again.' };
      }
    }
    if (existing) Object.assign(existing, courier, { name, code });
    else if (resolvedId) state.shippingCouriers.push({ ...courier, id: resolvedId, name, code, createdAt: new Date().toISOString() });
    await dbOperations.recordShippingAudit(existing ? 'ADMIN_UPDATE_COURIER' : 'ADMIN_CREATE_COURIER', 'SHIPPING_COURIER', resolvedId || 0, `${name} (${code})`);
    saveDBState(state);
    if (client) await reloadFromSupabase();
    return { success: true, id: resolvedId };
  },

  async adminDeleteShippingCourier(id: number) {
    const state = dbOperations.requireAdmin();
    const courier = state.shippingCouriers.find((c) => c.id === id);
    if (!courier) return { error: 'Courier not found.' };
    state.shippingCouriers = state.shippingCouriers.filter((c) => c.id !== id);
    await dbOperations.recordShippingAudit('ADMIN_DELETE_COURIER', 'SHIPPING_COURIER', id, courier.name);
    saveDBState(state);
    const client = createClient();
    if (client) {
      try {
        await deleteShippingCourier(client, id);
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to delete courier:', err);
        return { error: 'Could not delete the courier. Try again.' };
      }
    }
    return { success: true };
  },

  async adminUpsertManualShippingQuote(quote: Omit<ShippingManualQuote, 'id' | 'createdAt'> & { id?: number }) {
    const state = dbOperations.requireAdmin();
    if (!quote.sellerId) return { error: 'Select a seller.' };
    if (!quote.state?.trim()) return { error: 'Destination state is required.' };
    if (!Number.isFinite(quote.amount) || quote.amount < 0) return { error: 'Quote amount must be zero or more.' };
    if (quote.etaMaxDays < quote.etaMinDays) return { error: 'Maximum ETA cannot be shorter than the minimum ETA.' };
    if (!state.users.some((u) => u.id === quote.sellerId)) return { error: 'Seller not found.' };
    const existing = quote.id ? state.shippingManualQuotes.find((q) => q.id === quote.id) : undefined;
    const row = {
      seller_id: quote.sellerId,
      state: quote.state.trim(),
      city: quote.city?.trim() || '',
      amount: Number(quote.amount),
      eta_min_days: Number(quote.etaMinDays) || 0,
      eta_max_days: Number(quote.etaMaxDays) || 0,
      notes: quote.notes || null,
      active: quote.active,
      expires_at: quote.expiresAt || null,
    };
    let resolvedId = quote.id;
    const client = createClient();
    if (client) {
      try {
        if (existing) await updateManualQuote(client, existing.id, row);
        else resolvedId = await insertManualQuote(client, row);
      } catch (err) {
        console.error('Failed to save manual quote:', err);
        return { error: 'Could not save the manual quotation. Try again.' };
      }
    }
    if (existing) Object.assign(existing, quote);
    else if (resolvedId) state.shippingManualQuotes.push({ ...quote, id: resolvedId, createdAt: new Date().toISOString() });
    await dbOperations.recordShippingAudit(existing ? 'ADMIN_UPDATE_MANUAL_QUOTE' : 'ADMIN_CREATE_MANUAL_QUOTE', 'SHIPPING_MANUAL_QUOTE', resolvedId || 0, `Seller #${quote.sellerId} → ${quote.city || quote.state} ₦${quote.amount}`);
    saveDBState(state);
    if (client) await reloadFromSupabase();
    return { success: true, id: resolvedId };
  },

  async adminDeleteManualShippingQuote(id: number) {
    const state = dbOperations.requireAdmin();
    const quote = state.shippingManualQuotes.find((q) => q.id === id);
    if (!quote) return { error: 'Manual quotation not found.' };
    state.shippingManualQuotes = state.shippingManualQuotes.filter((q) => q.id !== id);
    await dbOperations.recordShippingAudit('ADMIN_DELETE_MANUAL_QUOTE', 'SHIPPING_MANUAL_QUOTE', id, `Seller #${quote.sellerId}`);
    saveDBState(state);
    const client = createClient();
    if (client) {
      try {
        await deleteManualQuote(client, id);
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to delete manual quote:', err);
        return { error: 'Could not delete the quotation. Try again.' };
      }
    }
    return { success: true };
  },

  /** Seller-owned pickup and delivery capability settings. */
  async updateSellerShippingSettings(input: {
    pickupAddress: string;
    pickupCity: string;
    pickupState: string;
    pickupLat?: number;
    pickupLng?: number;
    handlingDays: number;
    localEnabled: boolean;
    interstateEnabled: boolean;
    pickupEnabled: boolean;
    freeShippingThreshold?: number;
    defaultWeightKg: number;
  }) {
    const state = getDBState();
    const user = state.currentUser;
    if (!user) return { error: 'Sign in to update delivery settings.' };
    if (!input.pickupAddress.trim() || !input.pickupCity.trim() || !input.pickupState.trim()) {
      return { error: 'Pickup address, city and state are required.' };
    }
    if (!Number.isFinite(input.handlingDays) || input.handlingDays < 0 || input.handlingDays > 60) {
      return { error: 'Handling time must be between 0 and 60 days.' };
    }
    if (!Number.isFinite(input.defaultWeightKg) || input.defaultWeightKg <= 0) {
      return { error: 'Default package weight must be greater than zero.' };
    }
    if (input.freeShippingThreshold != null && input.freeShippingThreshold < 0) {
      return { error: 'Free-shipping threshold cannot be negative.' };
    }
    const latOk = input.pickupLat == null || (Number.isFinite(input.pickupLat) && Math.abs(input.pickupLat) <= 90);
    const lngOk = input.pickupLng == null || (Number.isFinite(input.pickupLng) && Math.abs(input.pickupLng) <= 180);
    if (!latOk || !lngOk) return { error: 'Pickup coordinates are invalid.' };

    const next = {
      sellerId: user.id,
      pickupAddress: input.pickupAddress.trim(),
      pickupCity: input.pickupCity.trim(),
      pickupState: input.pickupState.trim(),
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      handlingDays: Number(input.handlingDays),
      localEnabled: input.localEnabled,
      interstateEnabled: input.interstateEnabled,
      pickupEnabled: input.pickupEnabled,
      freeShippingThreshold: input.freeShippingThreshold,
      defaultWeightKg: Number(input.defaultWeightKg),
      updatedAt: new Date().toISOString(),
    };
    const index = state.sellerShippingSettings.findIndex((setting) => setting.sellerId === user.id);
    if (index >= 0) state.sellerShippingSettings[index] = next;
    else state.sellerShippingSettings.push(next);
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await upsertSellerShippingSettings(client, {
          seller_id: next.sellerId,
          pickup_address: next.pickupAddress,
          pickup_city: next.pickupCity,
          pickup_state: next.pickupState,
          pickup_lat: next.pickupLat ?? null,
          pickup_lng: next.pickupLng ?? null,
          handling_days: next.handlingDays,
          local_enabled: next.localEnabled,
          interstate_enabled: next.interstateEnabled,
          pickup_enabled: next.pickupEnabled,
          free_shipping_threshold: next.freeShippingThreshold ?? null,
          default_weight_kg: next.defaultWeightKg,
        });
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to save seller shipping settings:', err);
        return { error: 'Saved locally but could not reach the server. Try again.' };
      }
    }
    return { success: true };
  },

  // -------------------------------------------------------------------------
  // Reports — any signed-in user can flag a user, product, message or order.
  // -------------------------------------------------------------------------
  async createReport(input: {
    targetType: ReportTargetType;
    targetId: number;
    targetLabel: string;
    reason: string;
    details?: string;
    evidenceUrl?: string;
  }) {
    const state = getDBState();
    const me = state.currentUser;
    if (!me) return { error: 'Sign in to file a report.' };
    if (!input.reason.trim()) return { error: 'Pick a reason for the report.' };

    const details = input.details?.trim() || '';
    const local: Report = {
      id: Math.max(0, ...state.reports.map((r) => r.id)) + 1,
      reporterId: me.id,
      targetType: input.targetType,
      targetId: input.targetId,
      targetLabel: input.targetLabel,
      reason: input.reason,
      details,
      evidenceUrl: input.evidenceUrl || '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    state.reports.push(local);
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await insertReport(client, {
          reporterId: me.id,
          targetType: input.targetType,
          targetId: input.targetId,
          targetLabel: input.targetLabel,
          reason: input.reason,
          details,
          evidenceUrl: input.evidenceUrl,
        });
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to file report:', err);
        return { error: 'Could not send the report. Try again.' };
      }
    }
    return { success: true, report: local };
  },

  async adminUpdateReport(id: number, patch: { status?: ReportStatus; adminNotes?: string }) {
    const state = dbOperations.requireAdmin();
    const report = state.reports.find((r) => r.id === id);
    if (!report) return { error: 'Report not found' };

    if (patch.status) {
      report.status = patch.status;
      if (patch.status === 'RESOLVED' || patch.status === 'DISMISSED') {
        report.resolvedBy = state.currentUser!.id;
        report.resolvedAt = new Date().toISOString();
      }
    }
    if (patch.adminNotes != null) report.adminNotes = patch.adminNotes;

    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_REPORT_TRIAGE', 'REPORT', id, `${report.targetType} → ${report.status}`);
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await updateReport(client, id, {
          status: report.status,
          admin_notes: report.adminNotes ?? '',
          resolved_by: report.resolvedBy ?? null,
          resolved_at: report.resolvedAt ?? null,
        });
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to update report:', err);
      }
    }
    return { success: true };
  },

  async adminDeleteReport(id: number) {
    const state = dbOperations.requireAdmin();
    if (!state.reports.some((r) => r.id === id)) return { error: 'Report not found' };
    state.reports = state.reports.filter((r) => r.id !== id);
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_DELETE_REPORT', 'REPORT', id, 'Report removed');
    saveDBState(state);

    const client = createClient();
    if (client) {
      await deleteReportById(client, id);
      await reloadFromSupabase();
    }
    return { success: true };
  },

  // -------------------------------------------------------------------------
  // Chat — replies, reactions and calls
  // -------------------------------------------------------------------------
  /** Toggle the signed-in user's emoji reaction on a message. */
  async toggleReaction(messageId: number, emoji: string) {
    const state = getDBState();
    const me = state.currentUser;
    if (!me) return { error: 'Sign in to react.' };

    const mine = state.messageReactions.find((r) => r.messageId === messageId && r.userId === me.id && r.emoji === emoji);
    if (mine) {
      state.messageReactions = state.messageReactions.filter((r) => r.id !== mine.id);
      saveDBState(state);
      withClient((c) => toggleMessageReaction(c, { messageId, userId: me.id, emoji, add: false }));
    } else {
      state.messageReactions.push({
        id: Math.max(0, ...state.messageReactions.map((r) => r.id)) + 1,
        messageId,
        userId: me.id,
        emoji,
        createdAt: new Date().toISOString(),
      });
      saveDBState(state);
      withClient((c) => toggleMessageReaction(c, { messageId, userId: me.id, emoji, add: true }));
    }
    return { success: true };
  },

  /**
   * Open a call record so the attempt lands in both parties' call history even
   * if nobody picks up. Returns the persisted id used to update the outcome.
   */
  async startCall(roomId: number, kind: CallKind) {
    const state = getDBState();
    const me = state.currentUser;
    if (!me) return { error: 'Sign in to place a call.' };

    const room = state.chatRooms.find((r) => r.id === roomId);
    if (!room) return { error: 'Conversation not found.' };
    const calleeId = room.buyerId === me.id ? room.sellerId : room.buyerId;

    const now = new Date().toISOString();
    const local: Call = {
      id: Math.max(0, ...state.calls.map((c) => c.id)) + 1,
      roomId,
      callerId: me.id,
      calleeId,
      kind,
      status: 'RINGING',
      startedAt: now,
      durationSeconds: 0,
      createdAt: now,
    };
    state.calls.push(local);
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        const dbId = await insertCall(client, { roomId, callerId: me.id, calleeId, kind });
        await reloadFromSupabase();
        return { success: true, callId: dbId };
      } catch (err) {
        console.error('Failed to open call record:', err);
      }
    }
    return { success: true, callId: local.id };
  },

  /** Close out a call with its final status and talk duration. */
  async finishCall(callId: number, status: CallStatus, durationSeconds = 0) {
    const state = getDBState();
    const call = state.calls.find((c) => c.id === callId);
    if (!call) return { error: 'Call not found' };

    call.status = status;
    call.durationSeconds = Math.max(0, Math.round(durationSeconds));
    if (status === 'ONGOING' && !call.answeredAt) call.answeredAt = new Date().toISOString();
    if (status !== 'RINGING' && status !== 'ONGOING') {
      call.endedAt = new Date().toISOString();
    }
    saveDBState(state);

    const client = createClient();
    if (client) {
      await updateCall(client, callId, {
        status,
        answered_at: call.answeredAt ?? null,
        ended_at: call.endedAt ?? null,
        duration_seconds: call.durationSeconds,
      });
      await reloadFromSupabase();
    }
    return { success: true };
  },

  // -------------------------------------------------------------------------
  // Cover photos / storefront banners
  // -------------------------------------------------------------------------
  async updateCoverPhoto(url: string, scope: 'USER' | 'BUSINESS' = 'USER') {
    const state = getDBState();
    const me = state.currentUser;
    if (!me) return { error: 'Sign in to update your cover.' };

    if (scope === 'BUSINESS') {
      const biz = state.businesses.find((b) => b.ownerId === me.id);
      if (!biz) return { error: 'No business profile found.' };
      biz.bannerUrl = url;
    } else {
      const profile = state.profiles.find((p) => p.userId === me.id);
      if (!profile) return { error: 'No profile found.' };
      profile.coverUrl = url;
    }
    saveDBState(state);

    const client = createClient();
    if (client) {
      if (scope === 'BUSINESS') {
        await client.from('businesses').update({ banner_url: url }).eq('owner_id', me.id);
      } else {
        await client.from('profiles').update({ cover_url: url }).eq('id', me.id);
      }
      await reloadFromSupabase();
    }
    return { success: true };
  },

  // -------------------------------------------------------------------------
  // Verification applications (seller / business / identity) with the full
  // document set attached so admins review everything before deciding.
  // -------------------------------------------------------------------------
  async submitVerificationApplication(input: {
    kind: VerificationKind;
    fullName: string;
    documentType: DocumentType;
    documentNumber: string;
    documentImageUrl?: string;
    selfieImageUrl?: string;
    proofOfAddressUrl?: string;
    documents?: VerificationDocument[];
    businessName?: string;
    businessAddress?: string;
  }) {
    const state = getDBState();
    const me = state.currentUser;
    if (!me) return { error: 'Sign in to apply for verification.' };

    // One open application per kind at a time.
    const pending = state.verifications.find(
      (v) => v.userId === me.id && v.applicationKind === input.kind && v.status === VerificationStatus.PENDING
    );
    if (pending) return { error: 'You already have a review in progress for this check.' };

    const documents = input.documents ?? [];
    if (!input.fullName.trim() || !input.documentNumber.trim()) {
      return { error: 'Legal name and document number are required.' };
    }
    if (!input.documentImageUrl && !documents.length) {
      return { error: 'Upload at least one document for review.' };
    }

    const local: IdentityVerification = {
      id: Math.max(0, ...state.verifications.map((v) => v.id)) + 1,
      userId: me.id,
      fullName: input.fullName.trim(),
      documentType: input.documentType,
      documentNumber: input.documentNumber.trim(),
      documentImageUrl: input.documentImageUrl || '',
      selfieImageUrl: input.selfieImageUrl || '',
      proofOfAddressUrl: input.proofOfAddressUrl || '',
      status: VerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
      applicationKind: input.kind,
      documents,
      businessName: input.businessName || '',
      businessAddress: input.businessAddress || '',
    };
    state.verifications.push(local);
    saveDBState(state);

    const client = createClient();
    if (client) {
      try {
        await insertVerificationApplication(client, {
          userId: me.id,
          applicationKind: input.kind,
          fullName: local.fullName,
          documentType: input.documentType,
          documentNumber: local.documentNumber,
          documentImageUrl: local.documentImageUrl,
          selfieImageUrl: local.selfieImageUrl,
          proofOfAddressUrl: local.proofOfAddressUrl,
          documents,
          businessName: input.businessName,
          businessAddress: input.businessAddress,
        });
        await reloadFromSupabase();
      } catch (err) {
        console.error('Failed to submit verification application:', err);
        return { error: 'Could not submit right now. Check your uploads and try again.' };
      }
    }
    return { success: true };
  },
};


export function useDBState(): GoodSaleDBState {
  const [db, setDb] = useState<GoodSaleDBState>(() => getDBState());
  const ready = useRef(false);

  useEffect(() => {
    void bootstrapStore().then(() => {
      ready.current = true;
      setDb({ ...getDBState() });
    });
    const handleStateChange = () => setDb({ ...getDBState() });
    window.addEventListener(STORE_CHANGE_EVENT, handleStateChange);
    return () => window.removeEventListener(STORE_CHANGE_EVENT, handleStateChange);
  }, []);

  return db;
}
