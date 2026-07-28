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
  Review,
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
  RevenueSettings,
  SponsoredAd,
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
} from '@/lib/types';

const n = (v: unknown, fallback = 0) => (v == null || v === '' ? fallback : Number(v));
const s = (v: unknown, fallback = '') => (v == null ? fallback : String(v));
const b = (v: unknown, fallback = false) => (v == null ? fallback : Boolean(v));
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
  };
}

export function profileToProfile(row: Record<string, unknown>): Profile {
  return {
    userId: n(row.id),
    photoUrl: s(row.photo_url),
    coverUrl: s(row.cover_url),
    bio: s(row.bio),
    address: s(row.address),
    city: s(row.city),
    state: s(row.state),
    deliveryPreference: s(row.delivery_preference, 'GOODSALE_PARTNER'),
    pushEnabled: b(row.push_enabled, true),
    emailEnabled: b(row.email_enabled, true),
    smsEnabled: b(row.sms_enabled, false),
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
    city: s(row.city),
    state: s(row.state),
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
    isNegotiable: b(row.is_negotiable),
    quantity: n(row.quantity, 1),
    stockStatus: (s(row.stock_status, 'IN_STOCK') as Product['stockStatus']) || 'IN_STOCK',
    images: arr<string>(row.images),
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
    is_negotiable: p.isNegotiable,
    quantity: p.quantity,
    stock_status: p.stockStatus,
    images: p.images || [],
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
  };
}

export function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: n(row.id),
    roomId: n(row.room_id),
    senderId: n(row.sender_id),
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

export function mapReview(row: Record<string, unknown>): Review {
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
    replies: [],
  };
}

export function mapVerification(row: Record<string, unknown>): IdentityVerification {
  return {
    id: n(row.id),
    userId: n(row.user_id),
    fullName: s(row.full_name),
    documentType: (s(row.document_type, 'NIN') as DocumentType) || DocumentType.NIN,
    documentNumber: s(row.document_number),
    documentImageUrl: s(row.document_image_url),
    selfieImageUrl: s(row.selfie_image_url),
    proofOfAddressUrl: s(row.proof_of_address_url),
    status: (s(row.status, 'PENDING') as VerificationStatus) || VerificationStatus.PENDING,
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
    nin: s(row.nin),
    selfieUrl: s(row.selfie_url),
    licenseUrl: row.license_url != null ? s(row.license_url) : undefined,
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

export function mapRevenueSettings(row: Record<string, unknown>): RevenueSettings {
  return {
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
    title: s(row.title),
    status: s(row.status, 'ACTIVE') as SponsoredAd['status'],
    budget: n(row.budget),
    spent: n(row.spent),
    clicks: n(row.clicks),
    impressions: n(row.impressions),
    createdAt: s(row.created_at, new Date().toISOString()),
  };
}

export function mapFeaturedListing(row: Record<string, unknown>): FeaturedListing {
  return {
    id: n(row.id),
    productId: n(row.product_id),
    sellerId: n(row.seller_id),
    durationDays: n(row.duration_days),
    expiresAt: s(row.expires_at),
    status: s(row.status, 'ACTIVE') as FeaturedListing['status'],
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
    amount: n(row.amount),
    type: s(row.type, 'CREDIT_SALE') as WalletTransaction['type'],
    description: s(row.description),
    status: s(row.status, 'COMPLETED') as WalletTransaction['status'],
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
