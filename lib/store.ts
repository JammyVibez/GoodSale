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
} from '@/lib/data/sync';
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
            void reloadFromSupabase();
          }, 300);
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

    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName,
          username,
          phone_number: phoneNumber,
          role: role || UserRole.BUYER,
          referral_code_used: referralCodeUsed || null,
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Registration failed');

    let profile: User | null = null;
    for (let i = 0; i < 8; i++) {
      profile = await findProfileByAuthId(client, data.user.id);
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

  updateCurrentUserRole(role: UserRole) {
    const state = getDBState();
    if (state.currentUser) {
      state.currentUser.role = role;
      const dbUser = state.users.find((u) => u.id === state.currentUser!.id);
      if (dbUser) dbUser.role = role;

      // Ensure Business exists if switching to BUSINESS
      if ((role === UserRole.BUSINESS || role === UserRole.VERIFIED_BUSINESS) && !state.businesses.some(b => b.ownerId === state.currentUser!.id)) {
        const newBizId = Math.max(...state.businesses.map(b => b.id), 0) + 1;
        state.businesses.push({
          id: newBizId,
          ownerId: state.currentUser.id,
          name: `${state.currentUser.fullName}'s Store`,
          logoUrl: `https://picsum.photos/seed/bizlogo_${newBizId}/150`,
          bannerUrl: `https://picsum.photos/seed/bizbanner_${newBizId}/1000/400`,
          description: `Welcome to our virtual store! Tailored services, high-quality stock items, and escrow secured delivery across Nigeria.`,
          openingHours: '09:00 AM - 06:00 PM',
          address: 'No 4 Ikeja Retail Way',
          city: 'Ikeja',
          state: 'Lagos',
          isVerified: role === UserRole.VERIFIED_BUSINESS,
          trustScore: 100,
          followers: 42,
          rating: 5.0,
          reviewsCount: 1,
        });
      }

      saveDBState(state);
    }
  },

  updateProfile(bio: string, address: string, city: string, stateName: string, deliveryPref: string) {
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
      images: images && images.length > 0 ? images : ['https://picsum.photos/seed/product_default/600/600'],
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
      userAvatar: state.profiles.find((p) => p.userId === state.currentUser!.id)?.photoUrl || 'https://picsum.photos/seed/user/50',
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
    invoiceTerms?: string
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
    let initialStatus = OrderStatus.PAID_ESCROW;
    const pmLower = paymentMethod.toLowerCase();
    if (pmLower === 'bank') {
      initialStatus = OrderStatus.PENDING_BANK_TRANSFER;
    } else if (pmLower === 'cod') {
      initialStatus = OrderStatus.COD_PENDING;
    } else if (pmLower === 'invoice') {
      initialStatus = OrderStatus.INVOICE_SENT;
    } else if (pmLower === 'partial') {
      initialStatus = OrderStatus.PARTIAL_DEPOSIT_PAID;
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

    // Add order
    state.orders.unshift(newOrder);

    // Add to Escrow Fund Ledger (if escrow/card/partial/bank, funds held)
    const heldEscrowAmount = pmLower === 'partial' 
      ? (depositAmountPaid || totalAmount)
      : (pmLower === 'bank' || pmLower === 'invoice' || pmLower === 'cod') ? 0 : totalAmount;

    state.escrows.push({
      id: state.escrows.length + 1,
      orderId: newOrder.id,
      heldAmount: heldEscrowAmount,
      isReleased: false,
      isRefunded: false,
    });

    // Create Payment transaction log
    const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
    const txStatus = (pmLower === 'bank' ? 'PENDING' : (pmLower === 'invoice' || pmLower === 'cod') ? 'PENDING' : 'SUCCESS') as 'PENDING' | 'REFUNDED' | 'SUCCESS' | 'FAILED';
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
            note: `Assigned automatically: Courier ${partner.fullName} matches buyer marketplace selection.`
          });
          newOrder.status = OrderStatus.OUT_FOR_DELIVERY;
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
        status: 'COMPLETED',
        createdAt: new Date().toISOString()
      });
    }

    // Notify Buyer
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: state.currentUser.id,
      title: 'Escrow Secured Successfully!',
      message: `Your payment of ₦${totalAmount.toLocaleString()} is locked securely in GoodSale Escrow. Your Delivery verification PIN is: ${deliveryPin}. Verify and reveal this ONLY to the courier/seller once you have inspected the physical product!`,
      type: 'ORDER',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    // Notify Seller
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: product.sellerId,
      title: 'New Escrow Order Recieved!',
      message: `A buyer paid ₦${product.price.toLocaleString()} into GoodSale escrow for your listing "${product.title}". Please prepare for delivery.`,
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
            status: 'PENDING',
            service_type: serviceType,
            delivery_fee: deliveryFee,
            platform_commission: Math.round(deliveryFee * ((state.revenueSettings?.deliveryCommissionPercentage || 10) / 100)),
            courier_earnings: deliveryFee - Math.round(deliveryFee * ((state.revenueSettings?.deliveryCommissionPercentage || 10) / 100)),
            pin: deliveryPin,
            tracking_history: [{ status: 'PENDING', time: new Date().toISOString(), note: 'Awaiting courier' }],
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
  shipOrder(orderId: number) {
    const state = getDBState();
    const order = state.orders.find((o) => o.id === orderId);
    if (order && order.status === OrderStatus.PAID_ESCROW) {
      order.status = OrderStatus.SHIPPED;
      order.updatedAt = new Date().toISOString();

      // Notify Buyer
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
  },

  outForDelivery(orderId: number) {
    const state = getDBState();
    const order = state.orders.find((o) => o.id === orderId);
    if (order && order.status === OrderStatus.SHIPPED) {
      order.status = OrderStatus.OUT_FOR_DELIVERY;
      order.updatedAt = new Date().toISOString();

      // Notify Buyer
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: 'Arriving Today!',
        message: `Your package for Order ${order.orderNumber} is out for delivery. Have your Delivery PIN (${order.deliveryPin}) ready for verification.`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      saveDBState(state);
    }
  },

  completeDelivery(orderId: number, enteredPin: string) {
    const state = getDBState();
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return { error: 'Order not found' };

    if (order.deliveryPin !== enteredPin) {
      return { error: 'Incorrect Delivery PIN! Escrow funds cannot be released.' };
    }

    order.status = OrderStatus.DELIVERED_SUCCESS;
    order.updatedAt = new Date().toISOString();

    const escrow = state.escrows.find((e) => e.orderId === orderId);
    if (escrow) {
      escrow.isReleased = true;
    }

    // Award Loyalty GoodPoints for successful transactions
    const buyer = state.users.find((u) => u.id === order.buyerId);
    if (buyer) {
      const earned = Math.round(order.totalAmount / 10000); // 1 point per ₦10k
      buyer.goodPoints += earned;
      state.goodPoints.push({
        id: state.goodPoints.length + 1,
        userId: buyer.id,
        points: earned,
        reason: `Earned on successful Escrow Transaction: ${order.orderNumber}`,
        createdAt: new Date().toISOString(),
      });
    }

    const seller = state.users.find((u) => u.id === order.sellerId);
    if (seller) {
      const earnedSeller = 50; // flat 50 points per successful sale
      seller.goodPoints += earnedSeller;
      seller.trustScore = Math.min(seller.trustScore + 1, 100); // trust increases on success
      state.goodPoints.push({
        id: state.goodPoints.length + 1,
        userId: seller.id,
        points: earnedSeller,
        reason: `Earned on successful shop sale: ${order.orderNumber}`,
        createdAt: new Date().toISOString(),
      });

      // Update Seller Level based on points
      if (seller.goodPoints > 2000) seller.sellerLevel = 'DIAMOND';
      else if (seller.goodPoints > 1000) seller.sellerLevel = 'PLATINUM';
      else if (seller.goodPoints > 500) seller.sellerLevel = 'GOLD';
      else if (seller.goodPoints > 200) seller.sellerLevel = 'SILVER';

      // Check if referee completed first order
      const referralRecord = state.referrals.find((r) => r.refereeId === order.buyerId && r.status === 'REGISTERED');
      if (referralRecord) {
        referralRecord.status = 'FIRST_ORDER_COMPLETED';
        referralRecord.rewardReleased = true;
        const referrer = state.users.find((u) => u.id === referralRecord.referrerId);
        if (referrer) {
          referrer.goodPoints += referralRecord.pointsReward;
          state.goodPoints.push({
            id: state.goodPoints.length + 1,
            userId: referrer.id,
            points: referralRecord.pointsReward,
            reason: `Referral Completed (First Purchase): ${buyer?.fullName || 'User'}`,
            createdAt: new Date().toISOString(),
          });
          state.notifications.push({
            id: state.notifications.length + 1,
            userId: referrer.id,
            title: 'Referral GoodPoints Released!',
            message: `Congratulations! Your referred friend completed their first purchase. 150 GoodPoints have been credited!`,
            type: 'POINTS',
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    saveDBState(state);
    return { success: true };
  },

  // Dispute escalation
  openDispute(orderId: number, reason: string) {
    const state = getDBState();
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return;

    order.status = OrderStatus.DISPUTED;
    order.updatedAt = new Date().toISOString();

    const newDispute: Dispute = {
      id: state.disputes.length + 1,
      orderId,
      orderNumber: order.orderNumber,
      openedById: order.buyerId,
      openedByName: state.users.find((u) => u.id === order.buyerId)?.fullName || 'Buyer',
      reason,
      resolution: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    state.disputes.push(newDispute);

    // Notify seller
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: order.sellerId,
      title: 'Escrow Dispute Opened!',
      message: `Buyer has opened a official escrow dispute for Order ${order.orderNumber}. Escrow payouts are frozen until admin investigation resolves.`,
      type: 'DISPUTE',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
  },

  resolveDispute(disputeId: number, resolution: 'REFUND_BUYER' | 'RELEASE_SELLER', adminNotes: string) {
    const state = getDBState();
    const dispute = state.disputes.find((d) => d.id === disputeId);
    if (!dispute) return;

    const order = state.orders.find((o) => o.id === dispute.orderId);
    if (!order) return;

    dispute.resolution = resolution;
    dispute.adminNotes = adminNotes;

    const escrow = state.escrows.find((e) => e.orderId === dispute.orderId);

    if (resolution === 'REFUND_BUYER') {
      order.status = OrderStatus.REFUNDED;
      if (escrow) escrow.isRefunded = true;

      // Penalize seller trust score
      const seller = state.users.find(u => u.id === order.sellerId);
      if (seller) seller.trustScore = Math.max(seller.trustScore - 15, 10);

      // Notify Buyer
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: 'Dispute Resolved: Refunded',
        message: `Admin has ruled in your favor for Order ${order.orderNumber}. ₦${order.totalAmount.toLocaleString()} has been refunded.`,
        type: 'DISPUTE',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      // Notify Seller
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.sellerId,
        title: 'Dispute Resolved against you',
        message: `Admin has refunded Order ${order.orderNumber} back to the buyer. Your seller trust score has declined.`,
        type: 'DISPUTE',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    } else {
      order.status = OrderStatus.DELIVERED_SUCCESS;
      if (escrow) escrow.isReleased = true;

      // Notify Buyer
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: 'Dispute Ruled: Escrow Released',
        message: `Admin has completed review on Order ${order.orderNumber} and released funds to the seller. Case closed.`,
        type: 'DISPUTE',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
      // Notify Seller
      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.sellerId,
        title: 'Dispute Resolved: Funds Released!',
        message: `Admin has ruled in your favor for Order ${order.orderNumber}. Frozen escrow funds of ₦${order.totalAmount.toLocaleString()} are released to your balance!`,
        type: 'DISPUTE',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    saveDBState(state);
  },

  // Submit User Verification (BVN/NIN simulation)
  submitVerification(docType: DocumentType, docNum: string, docImageUrl?: string) {
    const state = getDBState();
    if (!state.currentUser) return;

    // Remove any existing PENDING
    state.verifications = state.verifications.filter(v => v.userId !== state.currentUser!.id);

    const newVer: IdentityVerification = {
      id: state.verifications.length + 1,
      userId: state.currentUser.id,
      fullName: state.currentUser.fullName,
      documentType: docType,
      documentNumber: docNum,
      documentImageUrl: docImageUrl || 'https://picsum.photos/seed/verification_doc/400/250',
      selfieImageUrl: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || 'https://picsum.photos/seed/selfie/200/200',
      proofOfAddressUrl: 'https://picsum.photos/seed/utility/400/500',
      status: VerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    state.verifications.push(newVer);
    saveDBState(state);
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
  handleVerificationApproval(verId: number, status: VerificationStatus, notes: string) {
    const state = getDBState();
    const ver = state.verifications.find((v) => v.id === verId);
    if (!ver) return;

    ver.status = status;
    ver.adminNotes = notes;

    const user = state.users.find((u) => u.id === ver.userId);
    if (user && status === VerificationStatus.APPROVED) {
      if (user.role === UserRole.BUYER) {
        user.role = UserRole.VERIFIED_SELLER;
      } else if (user.role === UserRole.BUSINESS) {
        user.role = UserRole.VERIFIED_BUSINESS;
      }

      // If business exists, mark as verified
      const biz = state.businesses.find(b => b.ownerId === user.id);
      if (biz) biz.isVerified = true;

      user.trustScore = 100;
      user.goodPoints += 200; // bonus for verification

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
        message: 'Congratulations! Your identity has been verified. You received a gold trust badge, search ranking boost, and 200 GoodPoints!',
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
      reviewerPhoto: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || 'https://picsum.photos/seed/avatar/50',
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
      reviewerPhoto: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || 'https://picsum.photos/seed/avatar/50',
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
      authorPhoto: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || 'https://picsum.photos/seed/avatar/50',
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
  },

  toggleNotificationRead(notificationId: number) {
    const state = getDBState();
    const notif = state.notifications.find(n => n.id === notificationId);
    if (notif) {
      notif.isRead = !notif.isRead;
    }
    saveDBState(state);
  },

  deleteNotification(notificationId: number) {
    const state = getDBState();
    state.notifications = state.notifications.filter(n => n.id !== notificationId);
    saveDBState(state);
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
          createdAt: new Date().toISOString()
        });
      }
      saveDBState(state);
    }
  },

  unfollowSeller(followerId: number, followedUserId?: number, followedBusinessId?: number) {
    const state = getDBState();
    state.followerRelations = state.followerRelations.filter(f => 
      !(f.followerId === followerId && 
        (followedUserId ? f.followedUserId === followedUserId : f.followedBusinessId === followedBusinessId))
    );
    saveDBState(state);
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
      title: '🏆 You Won the Auction!',
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
    const state = getDBState();
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return null;

    order.status = OrderStatus.PAID_ESCROW;
    order.updatedAt = new Date().toISOString();

    // Add to Escrow Fund Ledger
    let escrow = state.escrows.find(e => e.orderId === orderId);
    if (!escrow) {
      state.escrows.push({
        id: state.escrows.length + 1,
        orderId: order.id,
        heldAmount: order.totalAmount - order.deliveryFee - order.taxAmount,
        isReleased: false,
        isRefunded: false,
      });
    }

    // Add notification for Buyer
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: order.buyerId,
      title: 'Escrow Secured Successfully!',
      message: `Your payment of ₦${order.totalAmount.toLocaleString()} is locked securely in GoodSale Escrow. Your Delivery verification PIN is: ${order.deliveryPin}. Verify and reveal this ONLY to the courier/seller once you have inspected the physical product!`,
      type: 'ORDER',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    // Add notification for Seller
    state.notifications.push({
      id: state.notifications.length + 1,
      userId: order.sellerId,
      title: 'Escrow Payment Received!',
      message: `The buyer completed the payment of ₦${order.totalAmount.toLocaleString()} for order ${order.orderNumber}. Please prepare for delivery!`,
      type: 'ORDER',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    return order;
  },

  sendNegotiationOffer(roomId: number, productId: number, amount: number) {
    const state = getDBState();
    if (!state.currentUser) return null;

    const newMsg: Message = {
      id: state.messages.length + 1,
      roomId,
      senderId: state.currentUser.id,
      messageText: `🤝 PROPOSED NEGOTIATION OFFER: ₦${amount.toLocaleString()}. I would like to purchase via GoodSale Escrow!`,
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
      room.lastMessage = `🤝 Propose: ₦${amount.toLocaleString()}`;
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
          title: '🤝 Negotiated Deal Accepted!',
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
          messageText: `🎉 NEGOTIATED OFFER ACCEPTED! Secure Escrow contract ${orderNumber} generated successfully for ₦${activeAmount.toLocaleString()}. Funds are safe inside the GoodSale Escrow vault.`,
          createdAt: new Date().toISOString(),
        });
      }
    } else if (status === 'COUNTERED') {
      state.messages.push({
        id: state.messages.length + 1,
        roomId: message.roomId,
        senderId: updaterId || message.senderId,
        messageText: `🤝 COUNTER OFFER SUBMITTED: ₦${counterAmount?.toLocaleString()}. Do you accept?`,
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
        messageText: `❌ Offer was declined by trading partner.`,
        createdAt: new Date().toISOString(),
      });
    }

    saveDBState(state);
    return message;
  },

  registerDeliveryPartner(partnerData: any) {
    const state = getDBState();
    const newId = Math.max(...state.deliveryPartners.map(p => p.id), 0) + 1;
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
      photoUrl: partnerData.photoUrl || 'https://picsum.photos/seed/delivery_avatar/200',
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
      nin: partnerData.nin,
      selfieUrl: partnerData.selfieUrl || 'https://picsum.photos/seed/selfie/200',
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
      title: '🚚 Delivery Partner Approved!',
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

  togglePartnerAvailability(userId: number, isAvailable: boolean) {
    const state = getDBState();
    const partner = state.deliveryPartners.find(p => p.userId === userId);
    if (!partner) return null;

    partner.isAvailable = isAvailable;
    saveDBState(state);
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
        title: '🚚 Dispatch Rider Assigned!',
        message: `${partner.fullName} (${partner.vehicleType}) has been assigned to your order ${order.orderNumber}. ETA: ${job.estDeliveryTime}.`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    saveDBState(state);
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
      note = 'Package is currently in transit to destination.';
    }

    job.trackingHistory.push({
      status,
      time: new Date().toISOString(),
      note
    });

    saveDBState(state);
    return job;
  },

  completeDeliveryJobWithPin(jobId: number, pin: string) {
    const state = getDBState();
    const job = state.deliveryJobs.find(j => j.id === jobId);
    if (!job) return { success: false, message: 'Job not found' };

    if (job.pin !== pin) {
      return { success: false, message: 'Invalid delivery pin code. Please verify with buyer.' };
    }

    job.status = DeliveryJobStatus.COMPLETED;
    job.trackingHistory.push({
      status: 'COMPLETED',
      time: new Date().toISOString(),
      note: 'Delivery successfully completed and verified by PIN verification.'
    });

    const partner = state.deliveryPartners.find(p => p.id === job.partnerId);
    if (partner) {
      partner.activeDeliveriesCount = Math.max(0, partner.activeDeliveriesCount - 1);
      partner.completedDeliveries += 1;
      
      let wallet = state.wallets.find(w => w.userId === partner.userId);
      if (!wallet) {
        wallet = { id: state.wallets.length + 1, userId: partner.userId, balance: 0 };
        state.wallets.push(wallet);
      }
      wallet.balance += job.courierEarnings;

      state.walletTransactions.push({
        id: state.walletTransactions.length + 1,
        walletId: wallet.id,
        amount: job.courierEarnings,
        type: 'CREDIT_DELIVERY',
        description: `Earnings for delivery job #${job.id} (Order #${job.orderId})`,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
      });
    }

    const order = state.orders.find(o => o.id === job.orderId);
    if (order) {
      order.status = OrderStatus.DELIVERED_SUCCESS;
      order.updatedAt = new Date().toISOString();

      const escrow = state.escrows.find(e => e.orderId === order.id);
      if (escrow && !escrow.isReleased) {
        escrow.isReleased = true;

        const settings = state.revenueSettings;
        const product = state.products.find(p => p.id === order.productId);
        const isAuctionItem = product ? product.isAuction : false;

        const rawFee = order.totalAmount * (settings.escrowPercentageFee / 100);
        const escrowFee = Math.max(settings.escrowMinFee, Math.min(settings.escrowMaxFee, rawFee));
        
        let auctionSuccessFee = 0;
        if (isAuctionItem) {
          auctionSuccessFee = Math.round(order.totalAmount * (settings.auctionSuccessFeePercentage / 100));
        }

        const sellerPayout = order.totalAmount - order.deliveryFee - escrowFee - auctionSuccessFee;

        let sellerWallet = state.wallets.find(w => w.userId === order.sellerId);
        if (!sellerWallet) {
          sellerWallet = { id: state.wallets.length + 1, userId: order.sellerId, balance: 0 };
          state.wallets.push(sellerWallet);
        }
        sellerWallet.balance += sellerPayout;

        const feeBreakdown = isAuctionItem 
          ? `Escrow fee: ₦${escrowFee.toLocaleString()} & Auction Success fee: ₦${auctionSuccessFee.toLocaleString()} deducted`
          : `Escrow fee: ₦${escrowFee.toLocaleString()} deducted`;

        state.walletTransactions.push({
          id: state.walletTransactions.length + 1,
          walletId: sellerWallet.id,
          amount: sellerPayout,
          type: 'CREDIT_SALE',
          description: `Payout for order ${order.orderNumber} (${feeBreakdown})`,
          status: 'COMPLETED',
          createdAt: new Date().toISOString(),
        });

        state.notifications.push({
          id: state.notifications.length + 1,
          userId: order.sellerId,
          title: '💰 Escrow Released - Payout Credited!',
          message: `Delivery complete! ₦${sellerPayout.toLocaleString()} has been credited to your GoodSale Wallet after deducting escrow service fee.`,
          type: 'ESCROW',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      state.notifications.push({
        id: state.notifications.length + 1,
        userId: order.buyerId,
        title: '🎉 Delivery Complete!',
        message: `Your package for order ${order.orderNumber} has been successfully verified, delivered, and escrow funds released. Thank you for using GoodSale!`,
        type: 'ORDER',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }

    saveDBState(state);
    return { success: true, job };
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
      title: '🌟 Subscription Activated!',
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
      title: '⚡ Verified+ Status Activated!',
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
      title: '✨ Listing Featured successfully!',
      message: `Your product "${product.title}" has been promoted to Featured status for ${durationDays} days and will rank higher in search results!`,
      type: 'POINTS',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
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
      title: '⚡ Flash Sale Listing Confirmed!',
      message: `Your product "${product.title}" is now officially scheduled to be featured in the next high-traffic Flash Sale block.`,
      type: 'POINTS',
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
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

  withdrawFromWallet(userId: number, amount: number, bankDetails: { name: string, number: string, bank: string }) {
    const state = getDBState();
    const wallet = state.wallets.find(w => w.userId === userId);
    if (!wallet || wallet.balance < amount) {
      return { success: false, message: 'Insufficient balance for withdrawal' };
    }

    wallet.balance -= amount;
    wallet.bankName = bankDetails.bank;
    wallet.bankAccountName = bankDetails.name;
    wallet.bankAccountNumber = bankDetails.number;

    state.walletTransactions.push({
      id: state.walletTransactions.length + 1,
      walletId: wallet.id,
      amount: -amount,
      type: 'DEBIT_WITHDRAWAL',
      description: `Withdrawal request to ${bankDetails.bank} (${bankDetails.number})`,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    saveDBState(state);
    return { success: true, wallet };
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
    return bundle;
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
