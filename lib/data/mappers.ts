/**
 * Snake_case DB rows ↔ camelCase GoodSale domain types.
 */
import {
  User,
  UserRole,
  Profile,
  Business,
  Product,
  ProductCondition,
  Auction,
  Bid,
  Order,
  OrderStatus,
  Escrow,
  Dispute,
  ChatRoom,
  Message,
  MessageReaction,
  Call,
  Report,
  ServiceArea,
  VerificationKind,
  VerificationDocument,
  Review,
  ReviewReply,
  IdentityVerification,
  VerificationStatus,
  DocumentType,
  GoodPointsTransaction,
  Referral,
  Notification,
  SafeMeetLocation,
  SafeMeetMeetup,
  FollowerRelation,
  ProductBundle,
  DeliveryPartner,
  DeliveryVehicleType,
  DeliveryJob,
  DeliveryJobStatus,
  Delivery,
  DeliveryEvent,
  DeliveryAuditLog,
  DeliveryStatus,
  DeliverySettings,
  DeliveryAssignmentOffer,
  DeliveryLiveLocation,
  DeliveryFailure,
  DeliveryFailureReason,
  DeliveryFailureStatus,
  DeliveryReturn,
  DeliveryReturnStatus,
  CourierShipment,
  RiderEarning,
  RiderEarningStatus,
  RiderEarningAuditLog,
  RevenueSettings,
  SponsoredAd,
  Announcement,
  FeaturedListing,
  Wallet,
  WalletTransaction,
  AuditLog,
  BusinessSubscription,
  VerifiedPlusSubscription,
  PaymentTransaction,
  Invoice,
  Refund,
  WithdrawalRequest,
  PaymentSettings,
  PaymentLog,
  ShippingSettings,
  ShippingDistanceTier,
  ShippingZone,
  ShippingRule,
  ShippingCourier,
  SellerShippingSettings,
  ShippingManualQuote,
  ShippingAuditLog,
  ShippingBreakdown,
} from '@/lib/types';

const n = (v: unknown, fallback = 0) => (v == null || v === '' ? fallback : Number(v));
const s = (v: unknown, fallback = '') => (v == null ? fallback : String(v));
const b = (v: unknown, fallback = false) => (v == null ? fallback : Boolean(v));
const optN = (v: unknown): number | undefined => (v == null || v === '' ? undefined : Number(v));
const optS = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v));
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function profileToUser(row: Record<string, unknown>): User {
  return {
    id: n(row.id),
    fullName: s(row.full_name),
    username: s(row.username),
    email: s(row.email),
    phoneNumber: s(row.phone_number),
    role: (s(row.role, 'BUYER') as UserRole) || UserRole.BUYER,
    referralCode: s(row.referral_code),
    referredById: row.referred_by_id != null ? n(row.referred_by_id) : undefined,
    trustScore: n(row.trust_score, 50),
    sellerLevel: s(row.seller_level, 'BRONZE'),
    goodPoints: n(row.good_points),
    isSuspended: b(row.is_suspended, false),
  };
}

export function profileToProfile(row: Record<string, unknown>): Profile {
  return {
    userId: n(row.id),
    photoUrl: s(row.photo_url),
    coverUrl: s(row.cover_url),
    bio: s(row.bio),
    address: s(row.address),
    area: s(row.area),
    city: s(row.city),
    state: s(row.state),
    lat: row.lat != null ? n(row.lat) : undefined,
    lng: row.lng != null ? n(row.lng) : undefined,
    deliveryPreference: s(row.delivery_preference, 'GOODSALE_PARTNER'),
    pushEnabled: b(row.push_enabled, true),
    emailEnabled: b(row.email_enabled, true),
    smsEnabled: b(row.sms_enabled, false),
    // Onboarding columns arrive with migration 023; a project that has not run
    // it yet still maps to a usable, un-onboarded profile instead of throwing.
    onboardingStep: n(row.onboarding_step),
    onboardingCompletedAt: optS(row.onboarding_completed_at),
    wantsBuying: b(row.wants_buying, true),
    wantsSelling: b(row.wants_selling, false),
    marketplaceNotifications: b(row.marketplace_notifications, true),
    marketingOptIn: b(row.marketing_opt_in, false),
    sellerOnboardingStep: n(row.seller_onboarding_step),
    storeOnboardingCompletedAt: optS(row.store_onboarding_completed_at),
    verificationStatus: s(row.verification_status, 'UNVERIFIED'),
    verificationType: s(row.verification_type),
    verifiedAt: optS(row.verified_at),
    verificationExpiresAt: optS(row.verification_expires_at),
  };
}

export function mapBusiness(row: Record<string, unknown>): Business {
  return {
    id: n(row.id),
    ownerId: n(row.owner_id),
    name: s(row.name),
    logoUrl: s(row.logo_url),
    bannerUrl: s(row.banner_url),
    description: s(row.description),
    openingHours: s(row.opening_hours),
    address: s(row.address),
    area: s(row.area),
    city: s(row.city),
    state: s(row.state),
    sellerType: s(row.seller_type, 'INDIVIDUAL') === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL',
    contactPhone: s(row.contact_phone),
    contactEmail: s(row.contact_email),
    policies: s(row.policies),
    isVerified: b(row.is_verified),
    trustScore: n(row.trust_score, 50),
    followers: n(row.followers),
    rating: n(row.rating),
    reviewsCount: n(row.reviews_count),
  };
}

export function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: n(row.id),
    sellerId: n(row.seller_id),
    businessId: row.business_id != null ? n(row.business_id) : undefined,
    title: s(row.title),
    description: s(row.description),
    category: s(row.category),
    brand: s(row.brand),
    condition: (s(row.condition, 'GOOD') as ProductCondition) || ProductCondition.GOOD,
    price: n(row.price),
    compareAtPrice: row.compare_at_price != null ? n(row.compare_at_price) : undefined,
    isNegotiable: b(row.is_negotiable),
    quantity: n(row.quantity, 1),
    stockStatus: (s(row.stock_status, 'IN_STOCK') as Product['stockStatus']) || 'IN_STOCK',
    images: arr<string>(row.images),
    videoUrl: row.video_url != null ? s(row.video_url) : undefined,
    barcode: row.barcode != null ? s(row.barcode) : undefined,
    qrCode: row.qr_code != null ? s(row.qr_code) : undefined,
    deliveryMethod: s(row.delivery_method),
    pickupAvailable: b(row.pickup_available),
    warranty: row.warranty != null ? s(row.warranty) : undefined,
    returnPolicy: row.return_policy != null ? s(row.return_policy) : undefined,
    weightKg: row.weight_kg != null ? n(row.weight_kg) : undefined,
    dimensionsCm: row.dimensions_cm != null ? s(row.dimensions_cm) : undefined,
    isAuction: b(row.is_auction),
    viewCount: n(row.view_count),
    // Trust/analytics counters added in migration 017; tolerated when absent.
    impressions: row.impressions != null ? n(row.impressions) : 0,
    likes: row.likes != null ? n(row.likes) : 0,
    cartAdds: row.cart_adds != null ? n(row.cart_adds) : 0,
    moderationStatus: row.moderation_status != null
      ? (s(row.moderation_status) as Product['moderationStatus'])
      : 'APPROVED',
    rejectionReason: row.rejection_reason != null ? s(row.rejection_reason) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
    paymentMethods: arr<string>(row.payment_methods),
    partialPercent: row.partial_percent != null ? n(row.partial_percent) : undefined,
    partialRemainingDays: row.partial_remaining_days != null ? n(row.partial_remaining_days) : undefined,
  };
}

export function productToRow(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    seller_id: p.sellerId,
    business_id: p.businessId ?? null,
    title: p.title,
    description: p.description,
    category: p.category,
    brand: p.brand,
    condition: p.condition,
    price: p.price,
    compare_at_price: p.compareAtPrice ?? null,
    is_negotiable: p.isNegotiable,
    quantity: p.quantity,
    stock_status: p.stockStatus,
    images: p.images || [],
    video_url: p.videoUrl ?? null,
    barcode: p.barcode ?? null,
    qr_code: p.qrCode ?? null,
    delivery_method: p.deliveryMethod,
    pickup_available: p.pickupAvailable,
    warranty: p.warranty ?? null,
    return_policy: p.returnPolicy ?? null,
    weight_kg: p.weightKg ?? null,
    dimensions_cm: p.dimensionsCm ?? null,
    is_auction: p.isAuction,
    view_count: p.viewCount,
    payment_methods: p.paymentMethods || [],
    partial_percent: p.partialPercent ?? null,
    partial_remaining_days: p.partialRemainingDays ?? null,
    created_at: p.createdAt,
  };
}

export function mapAuction(row: Record<string, unknown>): Auction {
  return {
    id: n(row.id),
    productId: n(row.product_id),
    startingBid: n(row.starting_bid),
    reservePrice: n(row.reserve_price),
    buyNowPrice: row.buy_now_price != null ? n(row.buy_now_price) : undefined,
    endsAt: s(row.ends_at),
    isActive: b(row.is_active, true),
  };
}

export function mapBid(row: Record<string, unknown>): Bid {
  return {
    id: n(row.id),
    auctionId: n(row.auction_id),
    userId: n(row.user_id),
    username: s(row.username),
    userAvatar: s(row.user_avatar),
    amount: n(row.amount),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: n(row.id),
    orderNumber: s(row.order_number),
    buyerId: n(row.buyer_id),
    sellerId: n(row.seller_id),
    productId: n(row.product_id),
    productTitle: s(row.product_title),
    productImage: s(row.product_image),
    totalAmount: n(row.total_amount),
    discountAmount: n(row.discount_amount),
    deliveryFee: n(row.delivery_fee),
    taxAmount: n(row.tax_amount),
    paymentMethod: s(row.payment_method),
    deliveryMethod: s(row.delivery_method),
    deliveryAddress: s(row.delivery_address),
    deliveryCity: s(row.delivery_city),
    deliveryState: s(row.delivery_state),
    deliveryPhone: s(row.delivery_phone),
    deliveryInstructions: s(row.delivery_instructions),
    checkoutGroupId: s(row.checkout_group_id),
    deliveryLat: row.delivery_lat != null ? n(row.delivery_lat) : undefined,
    deliveryLng: row.delivery_lng != null ? n(row.delivery_lng) : undefined,
    pickupLat: row.pickup_lat != null ? n(row.pickup_lat) : undefined,
    pickupLng: row.pickup_lng != null ? n(row.pickup_lng) : undefined,
    deliveryPin: s(row.delivery_pin),
    qrCodeToken: s(row.qr_code_token),
    status: (s(row.status, 'PENDING') as OrderStatus) || OrderStatus.PENDING,
    goodPointsUsed: n(row.good_points_used),
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
    selectedPartnerId: row.selected_partner_id != null ? n(row.selected_partner_id) : undefined,
    serviceType: (row.service_type != null
      ? (s(row.service_type) as Order['serviceType'])
      : undefined),
    hasGoodSaleProtect: b(row.has_good_sale_protect),
    protectFee: n(row.protect_fee),
    depositPercent: row.deposit_percent != null ? n(row.deposit_percent) : undefined,
    depositRemainingDays: row.deposit_remaining_days != null ? n(row.deposit_remaining_days) : undefined,
    depositAmountPaid: row.deposit_amount_paid != null ? n(row.deposit_amount_paid) : undefined,
    balanceRemaining: row.balance_remaining != null ? n(row.balance_remaining) : undefined,
    isBalanceSettled: b(row.is_balance_settled),
    bankTransferReceipt: row.bank_transfer_receipt != null ? s(row.bank_transfer_receipt) : undefined,
    invoiceTerms: row.invoice_terms != null ? s(row.invoice_terms) : undefined,
    shippingBreakdown: row.shipping_snapshot &&
      typeof row.shipping_snapshot === 'object' &&
      Object.keys(row.shipping_snapshot as Record<string, unknown>).length > 0
      ? (row.shipping_snapshot as ShippingBreakdown)
      : undefined,
    shippingRuleId: row.shipping_rule_id != null ? n(row.shipping_rule_id) : undefined,
    shippingZoneId: row.shipping_zone_id != null ? n(row.shipping_zone_id) : undefined,
    shippingQuoteId: row.shipping_quote_id != null ? s(row.shipping_quote_id) : undefined,
    estimatedDeliveryMinDays: row.estimated_delivery_min_days != null ? n(row.estimated_delivery_min_days) : undefined,
    estimatedDeliveryMaxDays: row.estimated_delivery_max_days != null ? n(row.estimated_delivery_max_days) : undefined,
  };
}

export function orderToRow(o: Order): Record<string, unknown> {
  return {
    id: o.id,
    order_number: o.orderNumber,
    buyer_id: o.buyerId,
    seller_id: o.sellerId,
    product_id: o.productId,
    product_title: o.productTitle,
    product_image: o.productImage,
    total_amount: o.totalAmount,
    discount_amount: o.discountAmount,
    delivery_fee: o.deliveryFee,
    tax_amount: o.taxAmount,
    payment_method: o.paymentMethod,
    delivery_method: o.deliveryMethod,
    delivery_address: o.deliveryAddress,
    delivery_city: o.deliveryCity,
    delivery_state: o.deliveryState,
    delivery_phone: o.deliveryPhone ?? '',
    delivery_instructions: o.deliveryInstructions ?? '',
    checkout_group_id: o.checkoutGroupId ?? '',
    delivery_lat: o.deliveryLat ?? null,
    delivery_lng: o.deliveryLng ?? null,
    pickup_lat: o.pickupLat ?? null,
    pickup_lng: o.pickupLng ?? null,
    delivery_pin: o.deliveryPin,
    qr_code_token: o.qrCodeToken,
    status: o.status,
    good_points_used: o.goodPointsUsed,
    selected_partner_id: o.selectedPartnerId ?? null,
    service_type: o.serviceType ?? null,
    has_good_sale_protect: o.hasGoodSaleProtect ?? false,
    protect_fee: o.protectFee ?? 0,
    deposit_percent: o.depositPercent ?? null,
    deposit_remaining_days: o.depositRemainingDays ?? null,
    deposit_amount_paid: o.depositAmountPaid ?? null,
    balance_remaining: o.balanceRemaining ?? null,
    is_balance_settled: o.isBalanceSettled ?? false,
    bank_transfer_receipt: o.bankTransferReceipt ?? null,
    invoice_terms: o.invoiceTerms ?? null,
    shipping_rule_id: o.shippingRuleId ?? null,
    shipping_zone_id: o.shippingZoneId ?? null,
    shipping_quote_id: o.shippingQuoteId ?? null,
    shipping_snapshot: o.shippingBreakdown ?? {},
    estimated_delivery_min_days: o.estimatedDeliveryMinDays ?? null,
    estimated_delivery_max_days: o.estimatedDeliveryMaxDays ?? null,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

export function mapEscrow(row: Record<string, unknown>): Escrow {
  return {
    id: n(row.id),
    orderId: n(row.order_id),
    heldAmount: n(row.held_amount),
    isReleased: b(row.is_released),
    isRefunded: b(row.is_refunded),
  };
}

export function mapDispute(row: Record<string, unknown>): Dispute {
  return {
    id: n(row.id),
    orderId: n(row.order_id),
    orderNumber: s(row.order_number),
    openedById: n(row.opened_by_id),
    openedByName: s(row.opened_by_name),
    reason: s(row.reason),
    evidenceUrl: row.evidence_url != null ? s(row.evidence_url) : undefined,
    adminNotes: row.admin_notes != null ? s(row.admin_notes) : undefined,
    resolution: s(row.resolution, 'PENDING') as Dispute['resolution'],
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapChatRoom(row: Record<string, unknown>): ChatRoom {
  return {
    id: n(row.id),
    buyerId: n(row.buyer_id),
    sellerId: n(row.seller_id),
    productId: n(row.product_id),
    productTitle: s(row.product_title),
    productPrice: n(row.product_price),
    productImage: s(row.product_image),
    buyerName: s(row.buyer_name),
    sellerName: s(row.seller_name),
    lastMessage: row.last_message != null ? s(row.last_message) : undefined,
    lastMessageTime: row.last_message_time != null ? s(row.last_message_time) : undefined,
    lastMessageSenderId: row.last_message_sender_id != null ? n(row.last_message_sender_id) : undefined,
    lastMessageKind: row.last_message_kind != null
      ? (s(row.last_message_kind) as ChatRoom['lastMessageKind'])
      : undefined,
    buyerLastReadAt: row.buyer_last_read_at != null ? s(row.buyer_last_read_at) : undefined,
    sellerLastReadAt: row.seller_last_read_at != null ? s(row.seller_last_read_at) : undefined,
    buyerMuted: b(row.buyer_muted, false),
    sellerMuted: b(row.seller_muted, false),
    buyerArchivedAt: row.buyer_archived_at != null ? s(row.buyer_archived_at) : undefined,
    sellerArchivedAt: row.seller_archived_at != null ? s(row.seller_archived_at) : undefined,
  };
}

export function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: n(row.id),
    roomId: n(row.room_id),
    senderId: n(row.sender_id),
    replyToId: row.reply_to_id != null ? n(row.reply_to_id) : undefined,
    messageText: row.message_text != null ? s(row.message_text) : undefined,
    imageUrl: row.image_url != null ? s(row.image_url) : undefined,
    videoUrl: row.video_url != null ? s(row.video_url) : undefined,
    voiceNoteUrl: row.voice_note_url != null ? s(row.voice_note_url) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
    receiptDetails: row.receipt_details as Message['receiptDetails'],
    productDetails: row.product_details as Message['productDetails'],
    offerDetails: row.offer_details as Message['offerDetails'],
  };
}

export function mapReview(row: Record<string, unknown>, replies: ReviewReply[] = []): Review {
  return {
    id: n(row.id),
    productId: row.product_id != null ? n(row.product_id) : undefined,
    orderId: row.order_id != null ? n(row.order_id) : undefined,
    reviewerId: n(row.reviewer_id),
    reviewerName: s(row.reviewer_name),
    reviewerPhoto: s(row.reviewer_photo),
    revieweeId: row.reviewee_id != null ? n(row.reviewee_id) : undefined,
    rating: n(row.rating),
    comment: s(row.comment),
    imageUrl: row.image_url != null ? s(row.image_url) : undefined,
    sellerReply: row.seller_reply != null ? s(row.seller_reply) : undefined,
    isHelpfulVotes: n(row.is_helpful_votes),
    createdAt: s(row.created_at, new Date().toISOString()),
    replies,
  };
}

export function mapReviewReply(row: Record<string, unknown>): ReviewReply {
  return {
    id: n(row.id),
    authorId: row.author_id != null ? n(row.author_id) : 0,
    authorName: s(row.author_name),
    authorPhoto: s(row.author_photo),
    authorRole: s(row.author_role, 'BUYER'),
    comment: s(row.comment),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

/**
 * Reviews + their nested replies assembled in one pass, so a product page shows
 * the full conversation in a single load (replies used to be dropped on reload).
 */
export function buildReviews(
  reviewRows: Record<string, unknown>[],
  replyRows: Record<string, unknown>[]
): Review[] {
  const byReview = new Map<number, ReviewReply[]>();
  for (const row of replyRows) {
    if (row.review_id == null) continue;
    const reviewId = n(row.review_id);
    const list = byReview.get(reviewId) || [];
    list.push(mapReviewReply(row));
    byReview.set(reviewId, list);
  }
  for (const list of byReview.values()) {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return reviewRows.map((row) => mapReview(row, byReview.get(n(row.id)) || []));
}

export function mapVerification(row: Record<string, unknown>): IdentityVerification {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    applicationKind: (s(row.application_kind, 'IDENTITY') as VerificationKind) || VerificationKind.IDENTITY,
    fullName: s(row.full_name),
    documentType: (s(row.document_type, 'NIN') as DocumentType) || DocumentType.NIN,
    documentNumber: s(row.document_number),
    documentImageUrl: s(row.document_image_url),
    selfieImageUrl: s(row.selfie_image_url),
    proofOfAddressUrl: s(row.proof_of_address_url),
    documents: arr<VerificationDocument>(row.documents),
    businessName: s(row.business_name),
    businessAddress: s(row.business_address),
    status: (s(row.status, 'PENDING') as VerificationStatus) || VerificationStatus.PENDING,
    adminNotes: row.admin_notes != null ? s(row.admin_notes) : undefined,
    rejectionReason: row.rejection_reason != null ? s(row.rejection_reason) : undefined,
    reviewedBy: row.reviewed_by != null ? n(row.reviewed_by) : undefined,
    reviewedAt: row.reviewed_at != null ? s(row.reviewed_at) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
    sellerType: s(row.seller_type, 'INDIVIDUAL') === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL',
    dateOfBirth: optS(row.date_of_birth),
    contactPhone: s(row.contact_phone),
    contactEmail: s(row.contact_email),
    residenceState: s(row.residence_state),
    residenceCity: s(row.residence_city),
    residenceAddress: s(row.residence_address),
    businessRegistrationNumber: s(row.business_registration_number),
    businessContactName: s(row.business_contact_name),
    storeName: s(row.store_name),
    storeDescription: s(row.store_description),
    storeCity: s(row.store_city),
    storeState: s(row.store_state),
    storePhone: s(row.store_phone),
    infoRequestNote: s(row.info_request_note),
    statusReason: s(row.status_reason),
    submittedAt: optS(row.submitted_at),
    reviewStartedAt: optS(row.review_started_at),
    decidedAt: optS(row.decided_at),
    expiresAt: optS(row.expires_at),
  };
}

export function mapMessageReaction(row: Record<string, unknown>): MessageReaction {
  return {
    id: n(row.id),
    messageId: n(row.message_id),
    userId: n(row.user_id),
    emoji: s(row.emoji, '👍'),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapCall(row: Record<string, unknown>): Call {
  return {
    id: n(row.id),
    roomId: n(row.room_id),
    callerId: n(row.caller_id),
    calleeId: n(row.callee_id),
    kind: s(row.kind, 'AUDIO') === 'VIDEO' ? 'VIDEO' : 'AUDIO',
    status: (s(row.status, 'RINGING') as Call['status']) || 'RINGING',
    startedAt: s(row.started_at, new Date().toISOString()),
    answeredAt: row.answered_at != null ? s(row.answered_at) : undefined,
    endedAt: row.ended_at != null ? s(row.ended_at) : undefined,
    durationSeconds: n(row.duration_seconds),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapReport(row: Record<string, unknown>): Report {
  return {
    id: n(row.id),
    reporterId: row.reporter_id != null ? n(row.reporter_id) : undefined,
    targetType: (s(row.target_type, 'USER') as Report['targetType']) || 'USER',
    targetId: n(row.target_id),
    targetLabel: s(row.target_label),
    reason: s(row.reason),
    details: s(row.details),
    evidenceUrl: s(row.evidence_url),
    status: (s(row.status, 'OPEN') as Report['status']) || 'OPEN',
    adminNotes: row.admin_notes != null ? s(row.admin_notes) : undefined,
    resolvedBy: row.resolved_by != null ? n(row.resolved_by) : undefined,
    resolvedAt: row.resolved_at != null ? s(row.resolved_at) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapServiceArea(row: Record<string, unknown>): ServiceArea {
  return {
    id: n(row.id),
    state: s(row.state),
    city: s(row.city),
    salesEnabled: b(row.sales_enabled, true),
    deliveryEnabled: b(row.delivery_enabled, true),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapShippingSettings(row: Record<string, unknown>): ShippingSettings {
  return {
    enabled: b(row.enabled, true),
    localBaseFee: n(row.local_base_fee, 1000),
    perKmFee: n(row.per_km_fee, 0),
    minFee: n(row.min_fee, 500),
    maxFee: n(row.max_fee, 50000),
    interstateBaseFee: n(row.interstate_base_fee, 3500),
    interstatePerKmFee: n(row.interstate_per_km_fee, 100),
    weightSurchargePerKg: n(row.weight_surcharge_per_kg, 0),
    oversizeSurcharge: n(row.oversize_surcharge, 0),
    remoteSurcharge: n(row.remote_surcharge, 1500),
    freeShippingThreshold: n(row.free_shipping_threshold, 0),
    handlingFee: n(row.handling_fee, 0),
    platformShippingFee: n(row.platform_shipping_fee, 0),
    economyFee: n(row.economy_fee, 0),
    standardFee: n(row.standard_fee, 0),
    expressFee: n(row.express_fee, 2500),
    manualQuoteAboveKm: n(row.manual_quote_above_km, 15),
    manualQuotesEnabled: b(row.manual_quotes_enabled, true),
    sellerSponsoredShipping: b(row.seller_sponsored_shipping, true),
    platformSponsoredShipping: b(row.platform_sponsored_shipping, false),
    defaultEtaMinDays: n(row.default_eta_min_days, 1),
    defaultEtaMaxDays: n(row.default_eta_max_days, 7),
    updatedAt: row.updated_at != null ? s(row.updated_at) : undefined,
  };
}

export function mapShippingTier(row: Record<string, unknown>): ShippingDistanceTier {
  return {
    id: n(row.id),
    label: s(row.label),
    minKm: n(row.min_km, 0),
    maxKm: optN(row.max_km),
    fee: n(row.fee, 0),
    enabled: b(row.enabled, true),
    priority: n(row.priority, 0),
  };
}

export function mapShippingZone(row: Record<string, unknown>): ShippingZone {
  return {
    id: n(row.id),
    name: s(row.name),
    state: s(row.state),
    city: s(row.city),
    kind: (s(row.kind, 'LOCAL') as ShippingZone['kind']) || 'LOCAL',
    surcharge: n(row.surcharge, 0),
    enabled: b(row.enabled, true),
    priority: n(row.priority, 0),
    notes: row.notes != null ? s(row.notes) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapShippingRule(row: Record<string, unknown>): ShippingRule {
  return {
    id: n(row.id),
    name: s(row.name),
    enabled: b(row.enabled, true),
    priority: n(row.priority, 0),
    scope: (s(row.scope, 'GLOBAL') as ShippingRule['scope']) || 'GLOBAL',
    zoneId: optN(row.zone_id),
    state: s(row.state),
    city: s(row.city),
    originState: row.origin_state != null ? s(row.origin_state) : undefined,
    originCity: row.origin_city != null ? s(row.origin_city) : undefined,
    deliveryMethod: (s(row.delivery_method, 'ANY') as ShippingRule['deliveryMethod']) || 'ANY',
    serviceType: (s(row.service_type, 'ANY') as ShippingRule['serviceType']) || 'ANY',
    baseFee: optN(row.base_fee),
    perKmFee: optN(row.per_km_fee),
    minFee: optN(row.min_fee),
    maxFee: optN(row.max_fee),
    weightPerKg: optN(row.weight_per_kg),
    oversizeSurcharge: optN(row.oversize_surcharge),
    remoteSurcharge: optN(row.remote_surcharge),
    freeShippingThreshold: optN(row.free_shipping_threshold),
    handlingFee: optN(row.handling_fee),
    platformFee: optN(row.platform_fee),
    sellerSponsored: b(row.seller_sponsored, false),
    platformSponsored: b(row.platform_sponsored, false),
    etaMinDays: optN(row.eta_min_days),
    etaMaxDays: optN(row.eta_max_days),
    manualQuote: b(row.manual_quote, false),
    notes: row.notes != null ? s(row.notes) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapShippingCourier(row: Record<string, unknown>): ShippingCourier {
  return {
    id: n(row.id),
    name: s(row.name),
    code: s(row.code),
    mode: s(row.mode, 'MANUAL') === 'AUTO' ? 'AUTO' : 'MANUAL',
    enabled: b(row.enabled, true),
    baseFee: n(row.base_fee, 0),
    perKmFee: n(row.per_km_fee, 0),
    expressMultiplier: n(row.express_multiplier, 1),
    apiProvider: row.api_provider != null ? s(row.api_provider) : undefined,
    notes: row.notes != null ? s(row.notes) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapSellerShippingSettings(row: Record<string, unknown>): SellerShippingSettings {
  return {
    sellerId: n(row.seller_id),
    pickupAddress: s(row.pickup_address),
    pickupCity: s(row.pickup_city),
    pickupState: s(row.pickup_state),
    pickupLat: optN(row.pickup_lat),
    pickupLng: optN(row.pickup_lng),
    handlingDays: n(row.handling_days, 1),
    localEnabled: b(row.local_enabled, true),
    interstateEnabled: b(row.interstate_enabled, true),
    pickupEnabled: b(row.pickup_enabled, true),
    freeShippingThreshold: optN(row.free_shipping_threshold),
    defaultWeightKg: n(row.default_weight_kg, 1),
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

export function mapShippingManualQuote(row: Record<string, unknown>): ShippingManualQuote {
  return {
    id: n(row.id),
    sellerId: n(row.seller_id),
    state: s(row.state),
    city: s(row.city),
    amount: n(row.amount, 0),
    etaMinDays: n(row.eta_min_days, 1),
    etaMaxDays: n(row.eta_max_days, 7),
    notes: row.notes != null ? s(row.notes) : undefined,
    active: b(row.active, true),
    expiresAt: row.expires_at != null ? s(row.expires_at) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapShippingAuditLog(row: Record<string, unknown>): ShippingAuditLog {
  return {
    id: n(row.id),
    userId: row.user_id != null ? n(row.user_id) : undefined,
    userName: s(row.user_name),
    action: s(row.action),
    entityType: s(row.entity_type),
    entityId: n(row.entity_id),
    details: s(row.details),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapGoodPoints(row: Record<string, unknown>): GoodPointsTransaction {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    points: n(row.points),
    reason: s(row.reason),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapReferral(row: Record<string, unknown>): Referral {
  return {
    id: n(row.id),
    referrerId: n(row.referrer_id),
    refereeId: n(row.referee_id),
    refereeName: s(row.referee_name),
    status: s(row.status, 'REGISTERED') as Referral['status'],
    pointsReward: n(row.points_reward),
    rewardReleased: b(row.reward_released),
    campaignId: row.campaign_id != null ? n(row.campaign_id) : undefined,
    code: row.code ? s(row.code) : undefined,
    referrerReward: n(row.referrer_reward),
    refereeReward: n(row.referee_reward),
    qualifiedAt: row.qualified_at ? s(row.qualified_at) : undefined,
    rewardedAt: row.rewarded_at ? s(row.rewarded_at) : undefined,
    disqualificationReason: row.disqualification_reason
      ? s(row.disqualification_reason)
      : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    title: s(row.title),
    message: s(row.message),
    type: s(row.type, 'SYSTEM') as Notification['type'],
    isRead: b(row.is_read),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}


export function mapSafeMeetLocation(row: Record<string, unknown>): SafeMeetLocation {
  return {
    id: n(row.id),
    name: s(row.name),
    address: s(row.address),
    lat: n(row.lat),
    lng: n(row.lng),
    photoUrl: s(row.photo_url),
    openingHours: s(row.opening_hours),
    safetyRating: n(row.safety_rating),
    distanceKm: n(row.distance_km),
    travelTimeMinutes: n(row.travel_time_minutes),
    parkingAvailable: b(row.parking_available),
    accessibility: s(row.accessibility),
    isFavorite: b(row.is_favorite),
  };
}

export function mapSafeMeetMeetup(row: Record<string, unknown>): SafeMeetMeetup {
  return {
    id: n(row.id),
    locationId: n(row.location_id),
    orderId: n(row.order_id),
    scheduledAt: s(row.scheduled_at),
    status: s(row.status, 'PENDING_CONFIRMATION') as SafeMeetMeetup['status'],
    buyerConfirmedArrival: b(row.buyer_confirmed_arrival),
    sellerConfirmedArrival: b(row.seller_confirmed_arrival),
    rating: row.rating != null ? n(row.rating) : undefined,
    reportText: row.report_text != null ? s(row.report_text) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapFollower(row: Record<string, unknown>): FollowerRelation {
  return {
    id: n(row.id),
    followerId: n(row.follower_id),
    followedUserId: row.followed_user_id != null ? n(row.followed_user_id) : undefined,
    followedBusinessId: row.followed_business_id != null ? n(row.followed_business_id) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapBundle(row: Record<string, unknown>): ProductBundle {
  return {
    id: n(row.id),
    sellerId: n(row.seller_id),
    title: s(row.title),
    description: s(row.description),
    productIds: arr<number>(row.product_ids).map(Number),
    price: n(row.price),
    discountPercentage: n(row.discount_percentage),
    quantity: n(row.quantity, 1),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapDeliveryPartner(row: Record<string, unknown>): DeliveryPartner {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    fullName: s(row.full_name),
    phone: s(row.phone),
    email: s(row.email),
    vehicleType: (s(row.vehicle_type, 'MOTORCYCLE') as DeliveryVehicleType) || DeliveryVehicleType.MOTORCYCLE,
    brand: s(row.brand),
    model: s(row.model),
    plateNumber: s(row.plate_number),
    color: s(row.color),
    year: n(row.year),
    capacity: s(row.capacity),
    photoUrl: s(row.photo_url),
    status: s(row.status, 'PENDING') as DeliveryPartner['status'],
    isAvailable: b(row.is_available),
    trustScore: n(row.trust_score, 50),
    rating: n(row.rating),
    completedDeliveries: n(row.completed_deliveries),
    acceptanceRate: n(row.acceptance_rate),
    activeDeliveriesCount: n(row.active_deliveries_count),
    address: s(row.address),
    state: s(row.state),
    city: s(row.city),
    lastLat: row.last_lat != null ? n(row.last_lat) : undefined,
    lastLng: row.last_lng != null ? n(row.last_lng) : undefined,
    lastLocationAt: row.last_location_at != null ? s(row.last_location_at) : undefined,
    nin: s(row.nin),
    selfieUrl: s(row.selfie_url),
    licenseUrl: row.license_url != null ? s(row.license_url) : undefined,
    documents: arr<VerificationDocument>(row.documents),
    rejectionReason: row.rejection_reason != null ? s(row.rejection_reason) : undefined,
    suspensionReason: row.suspension_reason != null ? s(row.suspension_reason) : undefined,
    suspendedAt: row.suspended_at != null ? s(row.suspended_at) : undefined,
    emergencyContactName: row.emergency_contact_name != null ? s(row.emergency_contact_name) : undefined,
    emergencyContactPhone: row.emergency_contact_phone != null ? s(row.emergency_contact_phone) : undefined,
    emergencyContactRelation:
      row.emergency_contact_relation != null ? s(row.emergency_contact_relation) : undefined,
    commissionPercentage:
      row.commission_percentage != null ? n(row.commission_percentage) : undefined,
    serviceStates: Array.isArray(row.service_states) ? (row.service_states as string[]) : [],
    lastSeenAt: row.last_seen_at != null ? s(row.last_seen_at) : undefined,
    locationPermission:
      (s(row.location_permission, 'UNKNOWN') as DeliveryPartner['locationPermission']) || 'UNKNOWN',
    locationSharing: b(row.location_sharing),
    locationSharingUpdatedAt:
      row.location_sharing_updated_at != null ? s(row.location_sharing_updated_at) : undefined,
    reviewedBy: row.reviewed_by != null ? n(row.reviewed_by) : undefined,
    reviewedAt: row.reviewed_at != null ? s(row.reviewed_at) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapDeliveryJob(row: Record<string, unknown>): DeliveryJob {
  return {
    id: n(row.id),
    orderId: n(row.order_id),
    partnerId: row.partner_id != null ? n(row.partner_id) : undefined,
    status: (s(row.status, 'PENDING') as DeliveryJobStatus) || DeliveryJobStatus.PENDING,
    serviceType: (['ECONOMY', 'STANDARD', 'EXPRESS'].includes(s(row.service_type, 'STANDARD'))
      ? s(row.service_type, 'STANDARD')
      : 'STANDARD') as DeliveryJob['serviceType'],
    deliveryFee: n(row.delivery_fee),
    platformCommission: n(row.platform_commission),
    courierEarnings: n(row.courier_earnings),
    estPickupTime: s(row.est_pickup_time),
    estDeliveryTime: s(row.est_delivery_time),
    currentLat: row.current_lat != null ? n(row.current_lat) : undefined,
    currentLng: row.current_lng != null ? n(row.current_lng) : undefined,
    currentSpeed: row.current_speed != null ? n(row.current_speed) : undefined,
    pin: s(row.pin),
    sosTriggered: b(row.sos_triggered),
    incidentReport: row.incident_report != null ? s(row.incident_report) : undefined,
    trackingHistory: arr(row.tracking_history),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapDelivery(row: Record<string, unknown>): Delivery {
  const snapshot = row.fee_snapshot;
  return {
    id: n(row.id),
    orderId: n(row.order_id),
    deliveryNumber: s(row.delivery_number),
    trackingId: s(row.tracking_id),
    buyerId: n(row.buyer_id),
    sellerId: n(row.seller_id),
    pickupAddress: s(row.pickup_address),
    pickupCity: s(row.pickup_city),
    pickupState: s(row.pickup_state),
    pickupLat: row.pickup_lat != null ? n(row.pickup_lat) : undefined,
    pickupLng: row.pickup_lng != null ? n(row.pickup_lng) : undefined,
    deliveryAddress: s(row.delivery_address),
    deliveryCity: s(row.delivery_city),
    deliveryState: s(row.delivery_state),
    deliveryPhone: s(row.delivery_phone),
    deliveryLat: row.delivery_lat != null ? n(row.delivery_lat) : undefined,
    deliveryLng: row.delivery_lng != null ? n(row.delivery_lng) : undefined,
    routeDistanceKm: row.route_distance_km != null ? n(row.route_distance_km) : undefined,
    routeDurationMinutes:
      row.route_duration_minutes != null ? n(row.route_duration_minutes) : undefined,
    routeProvider: s(row.route_provider),
    routeIsEstimate: b(row.route_is_estimate, true),
    routeComputedAt: row.route_computed_at != null ? s(row.route_computed_at) : undefined,
    deliveryMethod: s(row.delivery_method, 'GOODSALE_PARTNER'),
    serviceType: (['ECONOMY', 'STANDARD', 'EXPRESS'].includes(s(row.service_type, 'STANDARD'))
      ? s(row.service_type, 'STANDARD')
      : 'STANDARD') as Delivery['serviceType'],
    deliveryFee: n(row.delivery_fee),
    feeSnapshot:
      snapshot && typeof snapshot === 'object' && Object.keys(snapshot as Record<string, unknown>).length > 0
        ? (snapshot as Delivery['feeSnapshot'])
        : undefined,
    status: s(row.status, 'AWAITING_SELLER_PREPARATION') as DeliveryStatus,
    riderId: row.rider_id != null ? n(row.rider_id) : undefined,
    courierName: s(row.courier_name),
    trackingNumber: s(row.tracking_number),
    estimatedDeliveryDate: row.estimated_delivery_date != null ? s(row.estimated_delivery_date) : undefined,
    deliveryInstructions: s(row.delivery_instructions),
    failureReason: s(row.failure_reason),
    cancellationReason: s(row.cancellation_reason),
    pickedUpAt: row.picked_up_at != null ? s(row.picked_up_at) : undefined,
    deliveredAt: row.delivered_at != null ? s(row.delivered_at) : undefined,
    returnedAt: row.returned_at != null ? s(row.returned_at) : undefined,
    cancelledAt: row.cancelled_at != null ? s(row.cancelled_at) : undefined,
    confirmationExpiresAt:
      row.confirmation_expires_at != null ? s(row.confirmation_expires_at) : undefined,
    confirmedAt: row.confirmed_at != null ? s(row.confirmed_at) : undefined,
    confirmedBy: row.confirmed_by != null ? n(row.confirmed_by) : undefined,
    assignmentStatus: (s(row.assignment_status, 'UNASSIGNED') as Delivery['assignmentStatus']) || 'UNASSIGNED',
    assignmentOfferedAt:
      row.assignment_offered_at != null ? s(row.assignment_offered_at) : undefined,
    assignmentExpiresAt:
      row.assignment_expires_at != null ? s(row.assignment_expires_at) : undefined,
    assignmentMode: s(row.assignment_mode, 'MANUAL') === 'AUTO' ? 'AUTO' : 'MANUAL',
    autoOfferRound: n(row.auto_offer_round),
    riderAcceptedAt: row.rider_accepted_at != null ? s(row.rider_accepted_at) : undefined,
    arrivedPickupAt: row.arrived_pickup_at != null ? s(row.arrived_pickup_at) : undefined,
    arrivedDestinationAt:
      row.arrived_destination_at != null ? s(row.arrived_destination_at) : undefined,
    attemptCount: n(row.attempt_count),
    courierProvider: s(row.courier_provider),
    courierExternalId: s(row.courier_external_id),
    courierStatus: s(row.courier_status),
    courierLastSyncedAt:
      row.courier_last_synced_at != null ? s(row.courier_last_synced_at) : undefined,
    courierLastError: s(row.courier_last_error),
    courierSyncAttempts: n(row.courier_sync_attempts),
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

export function mapDeliverySettings(row: Record<string, unknown> | undefined): DeliverySettings {
  return {
    autoAssignEnabled: b(row?.auto_assign_enabled, false),
    offerTimeoutMinutes: n(row?.offer_timeout_minutes, 30),
    maxActiveDeliveries: n(row?.max_active_deliveries, 3),
    maxPickupDistanceKm: n(row?.max_pickup_distance_km, 25),
    maxOffersPerDelivery: n(row?.max_offers_per_delivery, 5),
    locationUpdateIntervalSeconds: n(row?.location_update_interval_seconds, 15),
    trackingStaleMinutes: n(row?.tracking_stale_minutes, 10),
  };
}

export function mapDeliveryAssignmentOffer(row: Record<string, unknown>): DeliveryAssignmentOffer {
  return {
    id: n(row.id),
    deliveryId: n(row.delivery_id),
    riderId: n(row.rider_id),
    round: n(row.round, 1),
    status: (s(row.status, 'OFFERED') as DeliveryAssignmentOffer['status']) || 'OFFERED',
    score: row.score != null ? n(row.score) : undefined,
    distanceKm: row.distance_km != null ? n(row.distance_km) : undefined,
    vehicleSuitable: b(row.vehicle_suitable, true),
    offeredAt: s(row.offered_at, new Date().toISOString()),
    expiresAt: row.expires_at != null ? s(row.expires_at) : undefined,
    respondedAt: row.responded_at != null ? s(row.responded_at) : undefined,
    reason: s(row.reason),
  };
}

export function mapDeliveryLiveLocation(row: Record<string, unknown>): DeliveryLiveLocation {
  return {
    deliveryId: n(row.delivery_id),
    riderId: n(row.rider_id),
    lat: n(row.lat),
    lng: n(row.lng),
    accuracyM: row.accuracy_m != null ? n(row.accuracy_m) : undefined,
    speedKmh: row.speed_kmh != null ? n(row.speed_kmh) : undefined,
    headingDegrees: row.heading_degrees != null ? n(row.heading_degrees) : undefined,
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

export function mapDeliveryFailure(row: Record<string, unknown>): DeliveryFailure {
  return {
    id: n(row.id),
    deliveryId: n(row.delivery_id),
    reasonCode: (s(row.reason_code, 'OTHER') as DeliveryFailureReason) || 'OTHER',
    note: s(row.note),
    source: (s(row.source, 'SYSTEM') as DeliveryFailure['source']) || 'SYSTEM',
    status: (s(row.status, 'OPEN') as DeliveryFailureStatus) || 'OPEN',
    reportedBy: row.reported_by != null ? n(row.reported_by) : undefined,
    resolvedBy: row.resolved_by != null ? n(row.resolved_by) : undefined,
    resolutionNote: s(row.resolution_note),
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
    resolvedAt: row.resolved_at != null ? s(row.resolved_at) : undefined,
  };
}

export function mapDeliveryReturn(row: Record<string, unknown>): DeliveryReturn {
  return {
    id: n(row.id),
    deliveryId: n(row.delivery_id),
    failureId: row.failure_id != null ? n(row.failure_id) : undefined,
    status: (s(row.status, 'INITIATED') as DeliveryReturnStatus) || 'INITIATED',
    reason: s(row.reason),
    notes: s(row.notes),
    initiatedBy: row.initiated_by != null ? n(row.initiated_by) : undefined,
    receivedAt: row.received_at != null ? s(row.received_at) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

export function mapCourierShipment(row: Record<string, unknown>): CourierShipment {
  return {
    id: n(row.id),
    deliveryId: n(row.delivery_id),
    provider: s(row.provider, 'manual'),
    externalShipmentId: s(row.external_shipment_id),
    trackingNumber: s(row.tracking_number),
    labelUrl: s(row.label_url),
    status: s(row.status, 'CREATED'),
    lastEventAt: row.last_event_at != null ? s(row.last_event_at) : undefined,
    lastSyncedAt: row.last_synced_at != null ? s(row.last_synced_at) : undefined,
    syncAttempts: n(row.sync_attempts),
    lastError: s(row.last_error),
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

export function mapRiderEarning(row: Record<string, unknown>): RiderEarning {
  return {
    id: n(row.id),
    deliveryId: n(row.delivery_id),
    orderId: n(row.order_id),
    riderId: n(row.rider_id),
    grossAmount: n(row.gross_amount),
    platformCommission: n(row.platform_commission),
    adjustmentAmount: n(row.adjustment_amount),
    netAmount: n(row.net_amount),
    status: (s(row.status, 'PENDING') as RiderEarningStatus) || 'PENDING',
    payoutReference: s(row.payout_reference),
    notes: s(row.notes),
    approvedAt: row.approved_at != null ? s(row.approved_at) : undefined,
    paidAt: row.paid_at != null ? s(row.paid_at) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

export function mapRiderEarningAuditLog(row: Record<string, unknown>): RiderEarningAuditLog {
  return {
    id: n(row.id),
    earningId: n(row.earning_id),
    riderId: n(row.rider_id),
    actorId: row.actor_id != null ? n(row.actor_id) : undefined,
    actorName: s(row.actor_name),
    action: s(row.action),
    amountBefore: n(row.amount_before),
    amountAfter: n(row.amount_after),
    details: s(row.details),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapDeliveryEvent(row: Record<string, unknown>): DeliveryEvent {
  return {
    id: n(row.id),
    deliveryId: n(row.delivery_id),
    status: s(row.status, 'AWAITING_SELLER_PREPARATION') as DeliveryStatus,
    note: s(row.note),
    actorId: row.actor_id != null ? n(row.actor_id) : undefined,
    actorRole: s(row.actor_role, 'SYSTEM'),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapDeliveryAuditLog(row: Record<string, unknown>): DeliveryAuditLog {
  return {
    id: n(row.id),
    deliveryId: n(row.delivery_id),
    actorId: row.actor_id != null ? n(row.actor_id) : undefined,
    actorName: s(row.actor_name),
    actorRole: s(row.actor_role),
    action: s(row.action),
    previousStatus: row.previous_status != null ? s(row.previous_status) : undefined,
    newStatus: row.new_status != null ? s(row.new_status) : undefined,
    details: s(row.details),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapRevenueSettings(row: Record<string, unknown>): RevenueSettings {
  return {
    platformFeeEnabled: Boolean(row.platform_fee_enabled ?? false),
    escrowPercentageFee: n(row.escrow_percentage_fee, 1.5),
    escrowMinFee: n(row.escrow_min_fee, 100),
    escrowMaxFee: n(row.escrow_max_fee, 15000),
    deliveryCommissionPercentage: n(row.delivery_commission_percentage, 10),
    featured3DaysPrice: n(row.featured_3_days_price, 2500),
    featured7DaysPrice: n(row.featured_7_days_price, 5000),
    featured14DaysPrice: n(row.featured_14_days_price, 9000),
    featured30DaysPrice: n(row.featured_30_days_price, 18000),
    subProPrice: n(row.sub_pro_price, 15000),
    subPremiumPrice: n(row.sub_premium_price, 35000),
    subEnterprisePrice: n(row.sub_enterprise_price, 85000),
    verifiedPlusPrice: n(row.verified_plus_price, 10000),
    premiumDurationDays: n(row.premium_duration_days, 30),
    featuredRankingBoost: n(row.featured_ranking_boost, 30),
    verifiedPlusRankingBoost: n(row.verified_plus_ranking_boost, 8),
    flashSaleFeaturePrice: n(row.flash_sale_feature_price, 7500),
    auctionSuccessFeePercentage: n(row.auction_success_fee_percentage, 2.5),
    adCpcPrice: n(row.ad_cpc_price, 150),
    goodSaleProtectFee: n(row.good_sale_protect_fee, 1500),
  };
}

export function mapSponsoredAd(row: Record<string, unknown>): SponsoredAd {
  return {
    id: n(row.id),
    sellerId: n(row.seller_id),
    type: s(row.type, 'PRODUCT') as SponsoredAd['type'],
    targetId: n(row.target_id),
    bannerUrl: row.banner_url != null ? s(row.banner_url) : undefined,
    mediaUrl: row.media_url != null ? s(row.media_url) : undefined,
    mediaType: s(row.media_type, 'image') === 'video' ? 'video' : 'image',
    ctaText: row.cta_text != null ? s(row.cta_text) : '',
    clickView: row.click_view != null ? s(row.click_view) : '',
    placements: Array.isArray(row.placements)
      ? (row.placements as unknown as SponsoredAd['placements'])
      : ['HOME'],
    title: s(row.title),
    status: s(row.status, 'ACTIVE') as SponsoredAd['status'],
    moderationStatus: row.moderation_status != null
      ? (s(row.moderation_status) as SponsoredAd['moderationStatus'])
      : undefined,
    moderationReason: row.moderation_reason != null ? s(row.moderation_reason) : undefined,
    budget: n(row.budget),
    spent: n(row.spent),
    clicks: n(row.clicks),
    impressions: n(row.impressions),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapAnnouncement(row: Record<string, unknown>): Announcement {
  return {
    id: n(row.id),
    title: s(row.title),
    body: s(row.body),
    kind: s(row.kind, 'ANNOUNCEMENT') as Announcement['kind'],
    audience: s(row.audience, 'ALL') as Announcement['audience'],
    imageUrl: row.image_url != null ? s(row.image_url) : undefined,
    isActive: Boolean(row.is_active ?? true),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapFeaturedListing(row: Record<string, unknown>): FeaturedListing {
  return {
    id: n(row.id),
    productId: n(row.product_id),
    sellerId: n(row.seller_id),
    durationDays: n(row.duration_days),
    expiresAt: s(row.expires_at ?? row.ends_at),
    status: s(row.status, 'ACTIVE') as FeaturedListing['status'],
    featureType: (s(row.feature_type, 'FEATURED') as FeaturedListing['featureType']),
    startsAt: row.starts_at != null ? s(row.starts_at) : undefined,
    amountPaid: row.amount_paid != null ? n(row.amount_paid) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapWallet(row: Record<string, unknown>): Wallet {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    balance: n(row.balance),
    bankName: row.bank_name != null ? s(row.bank_name) : undefined,
    bankAccountName: row.bank_account_name != null ? s(row.bank_account_name) : undefined,
    bankAccountNumber: row.bank_account_number != null ? s(row.bank_account_number) : undefined,
  };
}

export function mapWalletTx(row: Record<string, unknown>): WalletTransaction {
  return {
    id: n(row.id),
    walletId: n(row.wallet_id),
    reference: row.reference != null ? s(row.reference) : undefined,
    amount: n(row.amount),
    type: s(row.type, 'CREDIT_SALE') as WalletTransaction['type'],
    description: s(row.description),
    status: s(row.status, 'COMPLETED') as WalletTransaction['status'],
    orderId: row.order_id != null ? n(row.order_id) : undefined,
    provider: row.provider != null ? s(row.provider) : undefined,
    providerReference: row.provider_reference != null ? s(row.provider_reference) : undefined,
    channel: row.channel != null ? s(row.channel) : undefined,
    balanceAfter: row.balance_after != null ? n(row.balance_after) : undefined,
    currency: s(row.currency, 'NGN'),
    affectsBalance: row.affects_balance == null ? true : b(row.affects_balance),
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapAuditLog(row: Record<string, unknown>): AuditLog {
  return {
    id: n(row.id),
    userId: n(row.user_id ?? row.actor_id),
    action: s(row.action),
    entityType: s(row.entity_type),
    entityId: n(row.entity_id),
    details: s(row.details),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapBusinessSub(row: Record<string, unknown>): BusinessSubscription {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    plan: s(row.plan, 'PRO') as BusinessSubscription['plan'],
    expiresAt: s(row.expires_at ?? row.ends_at),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapVerifiedPlus(row: Record<string, unknown>): VerifiedPlusSubscription {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    expiresAt: s(row.expires_at ?? row.ends_at),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapPaymentTx(row: Record<string, unknown>): PaymentTransaction {
  return {
    id: n(row.id),
    transactionId: s(row.transaction_id ?? row.reference),
    orderId: row.order_id != null ? n(row.order_id) : undefined,
    orderNumber: row.order_number != null ? s(row.order_number) : undefined,
    buyerId: n(row.buyer_id ?? row.user_id),
    sellerId: n(row.seller_id),
    amount: n(row.amount),
    paymentMethod: s(row.payment_method ?? row.method),
    status: s(row.status, 'PENDING') as PaymentTransaction['status'],
    purpose: s(row.purpose, 'ORDER_PAYMENT') as PaymentTransaction['purpose'],
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: n(row.id),
    invoiceNumber: s(row.invoice_number),
    orderId: n(row.order_id),
    buyerId: n(row.buyer_id),
    sellerId: n(row.seller_id),
    businessId: n(row.business_id),
    amount: n(row.amount),
    terms: s(row.terms),
    dueDate: s(row.due_date),
    status: s(row.status, 'SENT') as Invoice['status'],
    createdAt: s(row.created_at, new Date().toISOString()),
    updatedAt: s(row.updated_at, new Date().toISOString()),
  };
}

export function mapRefund(row: Record<string, unknown>): Refund {
  return {
    id: n(row.id),
    refundNumber: s(row.refund_number),
    transactionId: s(row.transaction_id),
    orderId: n(row.order_id),
    amount: n(row.amount),
    reason: s(row.reason),
    status: s(row.status, 'PENDING') as Refund['status'],
    providerReference: row.provider_reference != null ? s(row.provider_reference) : undefined,
    adminNotes: row.admin_notes != null ? s(row.admin_notes) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapWithdrawal(row: Record<string, unknown>): WithdrawalRequest {
  return {
    id: n(row.id),
    requestNumber: s(row.request_number),
    userId: n(row.user_id),
    amount: n(row.amount),
    bankName: s(row.bank_name),
    accountNumber: s(row.account_number),
    accountName: s(row.account_name),
    status: s(row.status, 'PENDING') as WithdrawalRequest['status'],
    fee: n(row.fee, 0),
    netAmount: row.net_amount != null ? n(row.net_amount) : undefined,
    walletTransactionId:
      row.wallet_transaction_id != null ? n(row.wallet_transaction_id) : undefined,
    providerReference: row.paystack_reference != null ? s(row.paystack_reference) : undefined,
    providerTransferCode:
      row.paystack_transfer_code != null ? s(row.paystack_transfer_code) : undefined,
    failedReason: row.failed_reason != null ? s(row.failed_reason) : undefined,
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapPaymentSettings(row: Record<string, unknown>): PaymentSettings {
  return {
    enabledMethods: arr<string>(row.enabled_methods).length
      ? arr<string>(row.enabled_methods)
      : ['escrow', 'cod', 'card', 'bank', 'invoice', 'partial'],
    codMaxOrderValue: n(row.cod_max_order_value, 500000),
    escrowFeePercentage: n(row.escrow_fee_percentage, 1.5),
    deliveryCommissionPercentage: n(row.delivery_commission_percentage, 10),
  };
}

export function mapPaymentLog(row: Record<string, unknown>): PaymentLog {
  return {
    id: n(row.id),
    userId: row.user_id != null ? n(row.user_id) : undefined,
    action: s(row.action),
    details: s(row.details ?? row.metadata),
    ipAddress: s(row.ip_address),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}
