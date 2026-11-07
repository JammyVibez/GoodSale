/**
 * Load marketplace state from Supabase and keep it live via Realtime.
 */
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { GoodSaleDBState, User } from '@/lib/types';
import {
  createEmptyState,
  DEFAULT_REVENUE_SETTINGS,
  DEFAULT_PAYMENT_SETTINGS,
  DEFAULT_SHIPPING_SETTINGS,
  DEFAULT_SHIPPING_TIERS,
  DEFAULT_DELIVERY_SETTINGS,
} from './empty-state';
import * as M from './mappers';

/**
 * Per-table row caps so a realtime reload can never pull an unbounded dataset.
 * Public catalog tables stay generous; high-volume/private streams are tighter.
 * Override the default with NEXT_PUBLIC_MARKET_FEED_LIMIT.
 */
const DEFAULT_ROW_LIMIT = Number(process.env.NEXT_PUBLIC_MARKET_FEED_LIMIT) || 1000;
const ROW_LIMITS: Record<string, number> = {
  messages: 500,
  message_reactions: 2000,
  calls: 400,
  notifications: 200,
  delivery_jobs: 500,
  deliveries: 600,
  delivery_events: 2000,
  delivery_audit_logs: 500,
  delivery_assignment_offers: 1000,
  delivery_failures: 500,
  delivery_returns: 500,
  courier_shipments: 500,
  rider_earnings: 500,
  rider_earning_audit_logs: 500,
  chat_rooms: 300,
  wallet_transactions: 300,
  good_points_transactions: 300,
  payment_logs: 200,
  audit_logs: 200,
  shipping_audit_logs: 300,
  shipping_quotes: 100,
};

async function selectAll(client: SupabaseClient, table: string) {
  const limit = ROW_LIMITS[table] ?? DEFAULT_ROW_LIMIT;
  const { data, error } = await client.from(table).select('*').limit(limit);
  if (error) {
    console.warn(`[GoodSale] Failed to load ${table}:`, error.message);
    return [];
  }
  return (data || []) as Record<string, unknown>[];
}

export async function loadMarketplaceState(
  client: SupabaseClient,
  authUserId?: string | null
): Promise<GoodSaleDBState> {
  const state = createEmptyState();

  const [
    profiles,
    businesses,
    products,
    auctions,
    bids,
    orders,
    escrows,
    disputes,
    chatRooms,
    messages,
    messageReactions,
    calls,
    reports,
    serviceAreas,
    reviews,
    reviewReplies,
    verifications,
    goodPoints,
    referrals,
    notifications,
    safeMeetLocations,
    safeMeetMeetups,
    followerRelations,
    productBundles,
    deliveryPartners,
    deliveryPartnerDirectory,
    deliveryJobs,
    deliveries,
    deliveryEvents,
    deliveryAuditRows,
    deliverySettingsRows,
    deliveryAssignmentOfferRows,
    deliveryLiveLocationRows,
    deliveryFailureRows,
    deliveryReturnRows,
    courierShipmentRows,
    riderEarnings,
    riderEarningAudits,
    revenueSettingsRows,
    sponsoredAds,
    featuredListings,
    announcements,
    wallets,
    walletTransactions,
    auditLogs,
    businessSubscriptions,
    verifiedPlusSubscriptions,
    transactions,
    invoices,
    refunds,
    withdrawalRequests,
    paymentSettingsRows,
    paymentLogs,
    shippingSettingsRows,
    shippingTiers,
    shippingZones,
    shippingRules,
    shippingCouriers,
    sellerShippingRows,
    shippingManualQuoteRows,
    shippingAuditRows,
  ] = await Promise.all([
    selectAll(client, 'profiles'),
    selectAll(client, 'businesses'),
    selectAll(client, 'products'),
    selectAll(client, 'auctions'),
    selectAll(client, 'bids'),
    selectAll(client, 'orders'),
    selectAll(client, 'escrows'),
    selectAll(client, 'disputes'),
    selectAll(client, 'chat_rooms'),
    selectAll(client, 'messages'),
    selectAll(client, 'message_reactions'),
    selectAll(client, 'calls'),
    selectAll(client, 'reports'),
    selectAll(client, 'service_areas'),
    selectAll(client, 'reviews'),
    selectAll(client, 'review_replies'),
    selectAll(client, 'identity_verifications'),
    selectAll(client, 'good_points_transactions'),
    selectAll(client, 'referrals'),
    selectAll(client, 'notifications'),
    selectAll(client, 'safe_meet_locations'),
    selectAll(client, 'safe_meet_meetups'),
    selectAll(client, 'follower_relations'),
    selectAll(client, 'product_bundles'),
    selectAll(client, 'delivery_partners'),
    selectAll(client, 'delivery_partners_directory'),
    selectAll(client, 'delivery_jobs'),
    selectAll(client, 'deliveries'),
    selectAll(client, 'delivery_events'),
    selectAll(client, 'delivery_audit_logs'),
    selectAll(client, 'delivery_settings'),
    selectAll(client, 'delivery_assignment_offers'),
    selectAll(client, 'delivery_live_locations'),
    selectAll(client, 'delivery_failures'),
    selectAll(client, 'delivery_returns'),
    selectAll(client, 'courier_shipments'),
    selectAll(client, 'rider_earnings'),
    selectAll(client, 'rider_earning_audit_logs'),
    selectAll(client, 'revenue_settings'),
    selectAll(client, 'sponsored_ads'),
    selectAll(client, 'featured_listings'),
    selectAll(client, 'announcements'),
    selectAll(client, 'wallets'),
    selectAll(client, 'wallet_transactions'),
    selectAll(client, 'audit_logs'),
    selectAll(client, 'business_subscriptions'),
    selectAll(client, 'verified_plus_subscriptions'),
    selectAll(client, 'payment_transactions'),
    selectAll(client, 'invoices'),
    selectAll(client, 'refunds'),
    selectAll(client, 'withdrawal_requests'),
    selectAll(client, 'payment_settings'),
    selectAll(client, 'payment_logs'),
    selectAll(client, 'shipping_settings'),
    selectAll(client, 'shipping_distance_tiers'),
    selectAll(client, 'shipping_zones'),
    selectAll(client, 'shipping_rules'),
    selectAll(client, 'shipping_couriers'),
    selectAll(client, 'seller_shipping_settings'),
    selectAll(client, 'shipping_manual_quotes'),
    selectAll(client, 'shipping_audit_logs'),
  ]);

  state.users = profiles.map(M.profileToUser);
  state.profiles = profiles.map(M.profileToProfile);
  state.businesses = businesses.map(M.mapBusiness);
  state.products = products.map(M.mapProduct);
  state.auctions = auctions.map(M.mapAuction);
  state.bids = bids.map(M.mapBid);
  state.orders = orders.map(M.mapOrder);
  state.escrows = escrows.map(M.mapEscrow);
  state.disputes = disputes.map(M.mapDispute);
  state.chatRooms = chatRooms.map(M.mapChatRoom);
  state.messages = messages.map(M.mapMessage);
  state.messageReactions = messageReactions.map(M.mapMessageReaction);
  state.calls = calls.map(M.mapCall);
  state.reports = reports.map(M.mapReport);
  state.serviceAreas = serviceAreas.map(M.mapServiceArea);
  state.reviews = M.buildReviews(reviews, reviewReplies);
  state.verifications = verifications.map(M.mapVerification);
  state.goodPoints = goodPoints.map(M.mapGoodPoints);
  state.referrals = referrals.map(M.mapReferral);
  state.notifications = notifications.map(M.mapNotification);
  state.safeMeetLocations = safeMeetLocations.map(M.mapSafeMeetLocation);
  state.safeMeetMeetups = safeMeetMeetups.map(M.mapSafeMeetMeetup);
  state.followerRelations = followerRelations.map(M.mapFollower);
  state.productBundles = productBundles.map(M.mapBundle);
  // The directory view is safe for every signed-in user; the private table only
  // returns the rider's own row (or every row for admins). Sensitive rows win.
  const partnerRows = new Map<number, Record<string, unknown>>();
  for (const row of deliveryPartnerDirectory) partnerRows.set(Number(row.id), row);
  for (const row of deliveryPartners) partnerRows.set(Number(row.id), row);
  state.deliveryPartners = Array.from(partnerRows.values()).map(M.mapDeliveryPartner);
  state.deliveryJobs = deliveryJobs.map(M.mapDeliveryJob);
  state.deliveries = deliveries.map(M.mapDelivery);
  state.deliveryEvents = deliveryEvents
    .map(M.mapDeliveryEvent)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  state.deliveryAuditLogs = deliveryAuditRows
    .map(M.mapDeliveryAuditLog)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.deliverySettings = deliverySettingsRows[0]
    ? M.mapDeliverySettings(deliverySettingsRows[0])
    : { ...DEFAULT_DELIVERY_SETTINGS };
  state.deliveryAssignmentOffers = deliveryAssignmentOfferRows
    .map(M.mapDeliveryAssignmentOffer)
    .sort((a, b) => b.offeredAt.localeCompare(a.offeredAt));
  state.deliveryLiveLocations = deliveryLiveLocationRows.map(M.mapDeliveryLiveLocation);
  state.deliveryFailures = deliveryFailureRows
    .map(M.mapDeliveryFailure)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.deliveryReturns = deliveryReturnRows
    .map(M.mapDeliveryReturn)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.courierShipments = courierShipmentRows
    .map(M.mapCourierShipment)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.riderEarnings = riderEarnings
    .map(M.mapRiderEarning)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.riderEarningAuditLogs = riderEarningAudits
    .map(M.mapRiderEarningAuditLog)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.sponsoredAds = sponsoredAds.map(M.mapSponsoredAd);
  state.featuredListings = featuredListings.map(M.mapFeaturedListing);
  state.announcements = announcements.map(M.mapAnnouncement);
  state.wallets = wallets.map(M.mapWallet);
  state.walletTransactions = walletTransactions.map(M.mapWalletTx);
  state.auditLogs = auditLogs.map(M.mapAuditLog);
  state.businessSubscriptions = businessSubscriptions.map(M.mapBusinessSub);
  state.verifiedPlusSubscriptions = verifiedPlusSubscriptions.map(M.mapVerifiedPlus);
  state.transactions = transactions.map(M.mapPaymentTx);
  state.invoices = invoices.map(M.mapInvoice);
  state.refunds = refunds.map(M.mapRefund);
  state.withdrawalRequests = withdrawalRequests.map(M.mapWithdrawal);
  state.paymentLogs = paymentLogs.map(M.mapPaymentLog);
  state.shippingTiers = shippingTiers.length
    ? shippingTiers.map(M.mapShippingTier).sort((a, b) => a.minKm - b.minKm)
    : DEFAULT_SHIPPING_TIERS.map((tier) => ({ ...tier }));
  state.shippingZones = shippingZones.map(M.mapShippingZone);
  state.shippingRules = shippingRules.map(M.mapShippingRule);
  state.shippingCouriers = shippingCouriers.map(M.mapShippingCourier);
  state.sellerShippingSettings = sellerShippingRows.map(M.mapSellerShippingSettings);
  state.shippingManualQuotes = shippingManualQuoteRows.map(M.mapShippingManualQuote);
  state.shippingAuditLogs = shippingAuditRows
    .map(M.mapShippingAuditLog)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (shippingSettingsRows[0]) {
    state.shippingSettings = M.mapShippingSettings(shippingSettingsRows[0]);
  } else {
    state.shippingSettings = { ...DEFAULT_SHIPPING_SETTINGS };
  }

  if (revenueSettingsRows[0]) {
    state.revenueSettings = M.mapRevenueSettings(revenueSettingsRows[0]);
  } else {
    state.revenueSettings = { ...DEFAULT_REVENUE_SETTINGS };
  }

  if (paymentSettingsRows[0]) {
    state.paymentSettings = M.mapPaymentSettings(paymentSettingsRows[0]);
  } else {
    state.paymentSettings = { ...DEFAULT_PAYMENT_SETTINGS };
  }

  if (authUserId) {
    const mine = profiles.find((p) => p.auth_id === authUserId);
    state.currentUser = mine ? M.profileToUser(mine) : null;
  }

  return state;
}

export async function findProfileByAuthId(
  client: SupabaseClient,
  authId: string
): Promise<User | null> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('auth_id', authId)
    .maybeSingle();
  if (error || !data) return null;
  return M.profileToUser(data as Record<string, unknown>);
}

export type RealtimeHandlers = {
  onChange: () => void;
};

/** Subscribe to live marketplace tables. Returns unsubscribe. */
export function subscribeMarketplaceRealtime(
  client: SupabaseClient,
  handlers: RealtimeHandlers
): () => void {
  const channel: RealtimeChannel = client
    .channel('goodsale-marketplace')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'service_areas' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_jobs' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_partners' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_events' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignment_offers' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_failures' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_shipments' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_earnings' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'escrows' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, handlers.onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'review_replies' }, handlers.onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

/** Persist a product insert/update to Supabase and return the DB id. */
export async function upsertProduct(client: SupabaseClient, product: Parameters<typeof M.productToRow>[0]) {
  const row = M.productToRow(product);
  // Let identity assign id on insert when id is temporary/negative
  const payload = { ...row };
  if (!product.id || product.id < 0) {
    delete payload.id;
  }
  const { data, error } = await client.from('products').upsert(payload).select('*').single();
  if (error) throw error;
  return M.mapProduct(data as Record<string, unknown>);
}

export async function insertOrderWithEscrow(
  client: SupabaseClient,
  order: Parameters<typeof M.orderToRow>[0],
  heldAmount: number
) {
  const row = M.orderToRow(order);
  if (!order.id || order.id < 0) delete row.id;
  const { data: orderData, error: orderError } = await client
    .from('orders')
    .insert(row)
    .select('*')
    .single();
  if (orderError) throw orderError;

  const mapped = M.mapOrder(orderData as Record<string, unknown>);
  const { error: escrowError } = await client.from('escrows').insert({
    order_id: mapped.id,
    held_amount: heldAmount,
    is_released: false,
    is_refunded: false,
  });
  if (escrowError) throw escrowError;
  return mapped;
}

export async function insertMessage(
  client: SupabaseClient,
  message: {
    roomId: number;
    senderId: number;
    messageText?: string;
    imageUrl?: string;
    videoUrl?: string;
    offerDetails?: unknown;
    productDetails?: unknown;
    receiptDetails?: unknown;
    replyToId?: number;
  }
) {
  const { data, error } = await client
    .from('messages')
    .insert({
      room_id: message.roomId,
      sender_id: message.senderId,
      message_text: message.messageText ?? null,
      image_url: message.imageUrl ?? null,
      video_url: message.videoUrl ?? null,
      offer_details: message.offerDetails ?? null,
      product_details: message.productDetails ?? null,
      receipt_details: message.receiptDetails ?? null,
      reply_to_id: message.replyToId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return M.mapMessage(data as Record<string, unknown>);
}

export async function upsertDeliveryJob(
  client: SupabaseClient,
  job: Record<string, unknown>
) {
  const { data, error } = await client.from('delivery_jobs').upsert(job).select('*').single();
  if (error) throw error;
  return M.mapDeliveryJob(data as Record<string, unknown>);
}

export async function updateDeliveryJobLocation(
  client: SupabaseClient,
  jobId: number,
  loc: { lat: number; lng: number; speed?: number; status?: string; trackingHistory?: unknown }
) {
  const payload: Record<string, unknown> = {
    current_lat: loc.lat,
    current_lng: loc.lng,
  };
  if (loc.speed != null) payload.current_speed = loc.speed;
  if (loc.status) payload.status = loc.status;
  if (loc.trackingHistory) payload.tracking_history = loc.trackingHistory;

  const { data, error } = await client
    .from('delivery_jobs')
    .update(payload)
    .eq('id', jobId)
    .select('*')
    .single();
  if (error) throw error;
  return M.mapDeliveryJob(data as Record<string, unknown>);
}

export async function upsertDeliveryPartner(
  client: SupabaseClient,
  partner: Record<string, unknown>
) {
  const { data, error } = await client.from('delivery_partners').upsert(partner).select('*').single();
  if (error) throw error;
  return M.mapDeliveryPartner(data as Record<string, unknown>);
}

export async function updatePartnerLocation(
  client: SupabaseClient,
  partnerId: number,
  lat: number,
  lng: number
) {
  const { data, error } = await client
    .from('delivery_partners')
    .update({
      last_lat: lat,
      last_lng: lng,
      last_location_at: new Date().toISOString(),
    })
    .eq('id', partnerId)
    .select('*')
    .single();
  if (error) throw error;
  return M.mapDeliveryPartner(data as Record<string, unknown>);
}
