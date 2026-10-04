// lib/store.ts
'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
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
} from '@/lib/data/sync';
import {
  withClient,
  insertBid,
  insertReview,
  upsertSafeMeetMeetup,
  updateSafeMeetMeetup,
  insertSponsoredAd,
  insertBundle,
  upsertRevenueSettings,
  upsertPaymentSettings,
  insertNotification,
  insertFeaturedListing,
} from '@/lib/data/persist';
import { resolveCityCoords, bestCoords } from '@/lib/geo';
import { isDemoMode, isOwnerAdminEmail } from '@/lib/demo';
import type { GoodSaleDBState, User, Product, Order, Message } from '@/lib/types';
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
    await reloadFromSupabase();
    const client = createClient();
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

    if (profile && referralCodeUsed) {
      const state = getDBState();
      const referrer = state.users.find((u) => u.referralCode === referralCodeUsed);
      if (referrer) {
        await client.from('profiles').update({ referred_by_id: referrer.id }).eq('id', profile.id);
        await client.from('referrals').insert({
          referrer_id: referrer.id,
          referee_id: profile.id,
          referee_name: fullName,
          status: 'REGISTERED',
          points_reward: 150,
        });
      }
    }

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
   * Trust tiers are granted by GoodSale review — never self-assigned. The
   * database enforces this too (a trigger blocks client role writes), so this
   * helper only mirrors an already-authorized admin action into local state.
   * Non-admins get an explicit error instead of a silently faked upgrade.
   */
  updateCurrentUserRole(role: UserRole) {
    const state = getDBState();
    const current = state.currentUser;
    if (!current) return { error: 'Not signed in' } as const;

    const isAdmin = current.role === UserRole.ADMIN || current.role === UserRole.SUPER_ADMIN;
    if (!isAdmin) {
      console.warn('Role changes require GoodSale verification and are not self-service.');
      return { error: 'Role changes require verification by GoodSale.' } as const;
    }

    current.role = role;
    const dbUser = state.users.find((u) => u.id === current.id);
    if (dbUser) dbUser.role = role;
    saveDBState(state);
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
    deliveryCoords?: { lat: number; lng: number }
  ) {
    const state = getDBState();
    if (!state.currentUser) return null;

    const product = state.products.find((p) => p.id === productId);
    if (!product) return null;

    const orderNumber = `GS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit release pin

    let deliveryFee = 5000;
    if (deliveryMethod === 'GOODSALE_PARTNER') {
      if (serviceType === 'EXPRESS') deliveryFee = 10000;
      else if (serviceType === 'ECONOMY') deliveryFee = 3500;
      else deliveryFee = 6000; // Standard
    } else if (deliveryMethod === 'THIRD_PARTY_COURIER') {
      deliveryFee = 12000;
    } else if (product.pickupAvailable && deliveryMethod === 'PICKUP') {
      deliveryFee = 0;
    }

    const taxAmount = Math.round(product.price * 0.015); // 1.5% commission/VAT
    const protectFee = hasGoodSaleProtect ? (state.revenueSettings?.goodSaleProtectFee || 1500) : 0;

    let pointsDiscount = 0;
    let pointsUsed = 0;
    if (usePoints && state.currentUser.goodPoints > 50) {
      // 1 GoodPoint = 10 Naira
      pointsUsed = Math.min(state.currentUser.goodPoints, Math.floor(product.price / 10));
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

    const totalAmount = product.price + deliveryFee + taxAmount + protectFee - pointsDiscount;

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
      invoiceTerms
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

    // Reduce product quantity
    product.quantity -= 1;
    if (product.quantity <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
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
        if (oi >= 0) state.orders[oi] = { ...newOrder, id: saved.id };
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
        return { ...newOrder, id: saved.id };
      } catch (err) {
        console.error('Failed to persist order:', err);
      }
    }
    return newOrder;
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


  async openDispute(orderId: number, reason: string) {
    try {
      const res = await fetch('/api/disputes/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, reason }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        // Local fallback for offline/demo without RPC
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

  verifyUserImmediately(userId: number, role: UserRole) {
    if (!isDemoMode()) {
      console.warn('Instant verification is disabled outside demo mode. Await admin review.');
      return;
    }
    const state = getDBState();
    const user = state.users.find(u => u.id === userId);
    if (user) {
      user.role = role;
      if (state.currentUser && state.currentUser.id === userId) {
        state.currentUser.role = role;
      }
      user.trustScore = 100;
      user.goodPoints += 200;

      // Update business if exists
      const biz = state.businesses.find(b => b.ownerId === userId);
      if (biz) biz.isVerified = true;

      // Add points transaction
      state.goodPoints.push({
        id: state.goodPoints.length + 1,
        userId: user.id,
        points: 200,
        reason: 'Identity verification approved reward',
        createdAt: new Date().toISOString(),
      });

      // Send verification notification
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: user.id,
        title: 'Identity Verification Approved!',
        message: 'Congratulations! Your identity has been verified. You received a gold trust badge, search ranking boost, and 200 GoodPoints!',
        type: 'VERIFICATION',
        isRead: false,
        createdAt: new Date().toISOString()
      });
    }
    saveDBState(state);
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
      await client.from('identity_verifications').update({
        status,
        admin_notes: notes,
      }).eq('id', verId);
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
  async sendMessage(roomId: number, text?: string, imgUrl?: string, videoUrl?: string, receiptDetails?: any, productDetails?: any) {
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

    const reviewId = state.reviews.length + 1;
    const newRev: Review = {
      id: reviewId,
      orderId,
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
      await insertReview(client, {
        orderId,
        reviewerId: state.currentUser!.id,
        revieweeId: order.sellerId,
        rating,
        comment,
      });
      await reloadFromSupabase();
    });
  },

  submitProductComment(productId: number, rating: number, comment: string) {
    const state = getDBState();
    if (!state.currentUser) return;

    const product = state.products.find(p => p.id === productId);
    const reviewId = state.reviews.length + 1;
    
    const newRev: Review = {
      id: reviewId,
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
      await insertReview(client, {
        productId,
        reviewerId: state.currentUser!.id,
        revieweeId: product?.sellerId,
        rating,
        comment,
      });
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
    const orderNumber = `GS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString();
    const deliveryFee = 5000; // standard delivery
    const taxAmount = Math.round(winningBid.amount * 0.015);
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
        const orderNumber = `GS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString();
        const deliveryFee = 5000; // standard delivery
        const taxAmount = Math.round(activeAmount * 0.015);
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
      nin: partnerData.nin,
      selfieUrl: partnerData.selfieUrl || '',
      licenseUrl: partnerData.licenseUrl,
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
      }).then(() => reloadFromSupabase()).catch((err) => console.error('Failed to persist partner:', err));
    }

    return partner;
  },

  approveDeliveryPartner(partnerId: number) {
    const state = getDBState();
    const partner = state.deliveryPartners.find(p => p.id === partnerId);
    if (!partner) return null;

    partner.status = 'APPROVED';
    partner.isAvailable = true;

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

  createDeliveryJob(orderId: number, serviceType: 'ECONOMY' | 'STANDARD' | 'EXPRESS', deliveryFee: number) {
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
    return newJob;
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

  updateDeliveryJobStatus(jobId: number, status: DeliveryJobStatus, currentLoc?: { lat: number; lng: number; speed: number }) {
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === jobId);
    if (!job) return null;

    job.status = status;
    if (currentLoc) {
      job.currentLat = currentLoc.lat;
      job.currentLng = currentLoc.lng;
      job.currentSpeed = currentLoc.speed;
    }

    let note = '';
    if (status === DeliveryJobStatus.PICKED_UP) {
      note = 'Package picked up from seller location.';
    } else if (status === DeliveryJobStatus.IN_TRANSIT) {
      note = currentLoc
        ? `Package in transit. Live GPS ${currentLoc.lat.toFixed(5)}, ${currentLoc.lng.toFixed(5)} @ ${Math.round(currentLoc.speed)} km/h.`
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

    saveDBState(state);
    withClient(async (client) => {
      await insertSponsoredAd(client, {
        sellerId: ad.sellerId,
        type: ad.type,
        targetId: ad.targetId,
        title: ad.title,
        budget: ad.budget,
        bannerUrl: ad.bannerUrl,
      });
      await reloadFromSupabase();
    });
    return ad;
  },

  depositToWallet(userId: number, amount: number) {
    const state = getDBState();
    let wallet = state.wallets.find(w => w.userId === userId);
    if (!wallet) {
      wallet = { id: state.wallets.length + 1, userId, balance: 0 };
      state.wallets.push(wallet);
    }
    wallet.balance += amount;

    state.walletTransactions.push({
      id: state.walletTransactions.length + 1,
      walletId: wallet.id,
      amount,
      type: 'CREDIT_SALE',
      description: `Funded wallet via online payment gateway`,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    return wallet;
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

  async adminUpdateProduct(
    productId: number,
    patch: Partial<{ title: string; price: number; quantity: number; stockStatus: Product['stockStatus']; category: string }>
  ) {
    const state = dbOperations.requireAdmin();
    const product = state.products.find((p) => p.id === productId);
    if (!product) return { error: 'Product not found' };
    Object.assign(product, patch);
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_UPDATE_PRODUCT', 'PRODUCT', productId, JSON.stringify(patch));
    saveDBState(state);

    const client = createClient();
    if (client) {
      await client.from('products').update({
        title: product.title,
        price: product.price,
        quantity: product.quantity,
        stock_status: product.stockStatus,
        category: product.category,
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

  async adminRejectDeliveryPartner(partnerId: number) {
    const state = dbOperations.requireAdmin();
    const partner = state.deliveryPartners.find((p) => p.id === partnerId);
    if (!partner) return { error: 'Partner not found' };
    partner.status = 'REJECTED';
    partner.isAvailable = false;
    dbOperations.addAuditLog(state.currentUser!.id, 'ADMIN_REJECT_PARTNER', 'DELIVERY_PARTNER', partnerId, partner.fullName);
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: partner.userId,
      title: 'Delivery Partner Application Rejected',
      message: 'Your GoodDispatch application was rejected. Contact support for details.',
      type: 'VERIFICATION',
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    saveDBState(state);
    const client = createClient();
    if (client) {
      await client.from('delivery_partners').update({ status: 'REJECTED', is_available: false }).eq('id', partnerId);
      await reloadFromSupabase();
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
