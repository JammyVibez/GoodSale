// lib/types.ts — GoodSale domain types (no mock data)
export enum UserRole {
  GUEST = 'GUEST',
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  VERIFIED_SELLER = 'VERIFIED_SELLER',
  BUSINESS = 'BUSINESS',
  VERIFIED_BUSINESS = 'VERIFIED_BUSINESS',
  RIDER = 'RIDER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum ProductCondition {
  NEW = 'NEW',
  LIKE_NEW = 'LIKE_NEW',
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID_ESCROW = 'PAID_ESCROW',
  SHIPPED = 'SHIPPED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED_SUCCESS = 'DELIVERED_SUCCESS',
  DISPUTED = 'DISPUTED',
  REFUND_REQUESTED = 'REFUND_REQUESTED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
  
  // Custom Merchant Payment statuses
  PENDING_BANK_TRANSFER = 'PENDING_BANK_TRANSFER',
  PARTIAL_DEPOSIT_PAID = 'PARTIAL_DEPOSIT_PAID',
  INVOICE_SENT = 'INVOICE_SENT',
  COD_PENDING = 'COD_PENDING',
}

export enum DocumentType {
  NIN = 'NIN',
  NATIONAL_ID = 'NATIONAL_ID',
  PASSPORT = 'PASSPORT',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  VOTERS_CARD = 'VOTERS_CARD',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** What a verification application is asking GoodSale to verify. */
export enum VerificationKind {
  /** A buyer completing personal identity verification. */
  IDENTITY = 'IDENTITY',
  /** A seller asking for the verified-seller badge. */
  SELLER = 'SELLER',
  /** A business asking for the verified-business badge. */
  BUSINESS = 'BUSINESS',
}

/** A single uploaded file an admin must review before approving. */
export interface VerificationDocument {
  label: string;
  url: string;
  kind?: 'IDENTITY' | 'SELFIE' | 'ADDRESS' | 'LICENSE' | 'VEHICLE' | 'CAC' | 'PROOF' | 'OTHER';
  /** Free-text detail an admin needs (document number, expiry, issuer…). */
  note?: string;
}

/** Where GoodSale is commercially active — admin-managed. */
export interface ServiceArea {
  id: number;
  state: string;
  city: string;
  /** Sellers may list & buyers may order in this city. */
  salesEnabled: boolean;
  /** GoodDispatch couriers / partners accept deliveries here. */
  deliveryEnabled: boolean;
  createdAt: string;
}

export type ReportTargetType = 'USER' | 'PRODUCT' | 'MESSAGE' | 'BUSINESS' | 'ORDER';
export type ReportStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

/** A user-submitted report an admin triages. */
export interface Report {
  id: number;
  reporterId?: number;
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  reason: string;
  details: string;
  evidenceUrl: string;
  status: ReportStatus;
  adminNotes?: string;
  resolvedBy?: number;
  resolvedAt?: string;
  createdAt: string;
}

export type CallKind = 'AUDIO' | 'VIDEO';
export type CallStatus = 'RINGING' | 'ONGOING' | 'COMPLETED' | 'MISSED' | 'DECLINED' | 'FAILED';

/** Audio / video call record shown in the chat's call history. */
export interface Call {
  id: number;
  roomId: number;
  callerId: number;
  calleeId: number;
  kind: CallKind;
  status: CallStatus;
  startedAt: string;
  answeredAt?: string;
  endedAt?: string;
  durationSeconds: number;
  createdAt: string;
}

/** An emoji reaction a participant left on a chat message. */
export interface MessageReaction {
  id: number;
  messageId: number;
  userId: number;
  emoji: string;
  createdAt: string;
}

// Interfaces corresponding to our database relational schema
export interface User {
  id: number;
  fullName: string;
  username: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
  referralCode: string;
  referredById?: number;
  trustScore: number; // 0 - 100
  sellerLevel: string; // BRONZE, SILVER, GOLD, PLATINUM, DIAMOND
  goodPoints: number;
  /** Soft-ban flag managed by admins */
  isSuspended?: boolean;
}

export interface Profile {
  userId: number;
  photoUrl: string;
  coverUrl: string;
  bio: string;
  address: string;
  area: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
  deliveryPreference: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  /** Guided onboarding: 0 = not started, 6 = finished. */
  onboardingStep: number;
  onboardingCompletedAt?: string;
  /** What the account wants to do on GoodSale (a single account can do both). */
  wantsBuying: boolean;
  wantsSelling: boolean;
  marketplaceNotifications: boolean;
  marketingOptIn: boolean;
  /** Seller store onboarding: 0 = not started, 5 = finished. */
  sellerOnboardingStep: number;
  storeOnboardingCompletedAt?: string;
  /**
   * Public verification state written only by GoodSale's review functions.
   * UNVERIFIED | DRAFT | PENDING | UNDER_REVIEW | VERIFIED | REJECTED |
   * INFO_REQUIRED | SUSPENDED | REVOKED | EXPIRED
   */
  verificationStatus?: string;
  /** INDIVIDUAL | BUSINESS — set when a reviewer approves the application. */
  verificationType?: string;
  verifiedAt?: string;
  verificationExpiresAt?: string;
}

export interface Business {
  id: number;
  ownerId: number;
  name: string;
  logoUrl: string;
  bannerUrl: string;
  description: string;
  openingHours: string;
  address: string;
  area: string;
  city: string;
  state: string;
  /** Self-declared seller type — verification is a separate GoodSale review. */
  sellerType: 'INDIVIDUAL' | 'BUSINESS';
  contactPhone: string;
  contactEmail: string;
  /** Store policies the seller wrote (returns, delivery, response times). */
  policies: string;
  isVerified: boolean;
  trustScore: number;
  followers: number;
  rating: number;
  reviewsCount: number;
}

export interface Product {
  id: number;
  sellerId: number;
  businessId?: number;
  title: string;
  description: string;
  category: string;
  brand: string;
  condition: ProductCondition;
  price: number;
  /** Optional reference price (original retail). Only then is a discount shown. */
  compareAtPrice?: number;
  /** Active moderated Flash Sale price; null outside the scheduled window. */
  flashSalePrice?: number;
  flashSaleStartsAt?: string;
  flashSaleEndsAt?: string;
  isNegotiable: boolean;
  quantity: number;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'SOLD' | 'UNAVAILABLE';
  /** Buyer-intent counters shown in seller analytics. */
  likes?: number;
  cartAdds?: number;
  /** Number of times the listing card was shown to shoppers. */
  impressions?: number;
  /** Admin moderation state for new or edited listings. */
  moderationStatus?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'APPEALED';
  rejectionReason?: string;
  images: string[];
  /** Optional short product video (mp4/webm or a storage URL). */
  videoUrl?: string;
  barcode?: string;
  qrCode?: string;
  deliveryMethod: string;
  pickupAvailable: boolean;
  warranty?: string;
  returnPolicy?: string;
  weightKg?: number;
  dimensionsCm?: string;
  isAuction: boolean;
  viewCount: number;
  createdAt: string;
  paymentMethods?: string[]; // e.g. ['escrow', 'cod', 'card', 'bank', 'invoice', 'partial']
  partialPercent?: number;
  partialRemainingDays?: number;
}

export interface Auction {
  id: number;
  productId: number;
  startingBid: number;
  reservePrice: number;
  buyNowPrice?: number;
  endsAt: string; // ISO date
  isActive: boolean;
}

export interface Bid {
  id: number;
  auctionId: number;
  userId: number;
  username: string;
  userAvatar: string;
  amount: number;
  createdAt: string;
}

export interface ShippingBreakdown {
  sellerId: number;
  sellerName: string;
  method: string;
  service: string;
  distanceKm?: number;
  baseFee: number;
  distanceFee: number;
  weightFee: number;
  sizeFee: number;
  remoteFee: number;
  handlingFee: number;
  platformFee: number;
  zoneFee: number;
  discount: number;
  total: number;
  ruleId?: number;
  ruleName?: string;
  zoneId?: number;
  zoneName?: string;
  courierName?: string;
  etaMinDays: number;
  etaMaxDays: number;
  freeShipping: boolean;
  manualQuote: boolean;
}

export interface Order {
  id: number;
  orderNumber: string; // GS-20261106-48291
  buyerId: number;
  sellerId: number;
  productId: number;
  productTitle: string;
  productImage: string;
  totalAmount: number;
  itemQuantity?: number;
  flashSaleId?: number;
  inventoryReserved?: boolean;
  inventoryCommitted?: boolean;
  flashSaleCounted?: boolean;
  expectedUnitPrice?: number;
  discountAmount: number;
  deliveryFee: number;
  taxAmount: number;
  paymentMethod: string;
  deliveryMethod: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPhone?: string;
  deliveryInstructions?: string;
  /** Groups seller sub-orders created by one checkout. */
  checkoutGroupId?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  pickupLat?: number;
  pickupLng?: number;
  deliveryPin: string; // 6 digits
  qrCodeToken: string;
  status: OrderStatus;
  goodPointsUsed: number;
  createdAt: string;
  updatedAt: string;
  selectedPartnerId?: number;
  serviceType?: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
  hasGoodSaleProtect?: boolean;
  protectFee?: number;
  /** Immutable shipping snapshot captured at order time. */
  shippingBreakdown?: ShippingBreakdown;
  shippingRuleId?: number;
  shippingZoneId?: number;
  shippingQuoteId?: string;
  estimatedDeliveryMinDays?: number;
  estimatedDeliveryMaxDays?: number;
  
  // Custom Merchant Payment System fields
  depositPercent?: number;
  depositRemainingDays?: number;
  depositAmountPaid?: number;
  balanceRemaining?: number;
  isBalanceSettled?: boolean;
  bankTransferReceipt?: string;
  invoiceTerms?: string;
}

export interface SavedAddress {
  id: number;
  label: string;
  contactName: string;
  phone: string;
  state: string;
  city: string;
  area: string;
  street: string;
  landmark: string;
  instructions: string;
  lat?: number;
  lng?: number;
  isDefault: boolean;
}

export interface Escrow {
  id: number;
  orderId: number;
  heldAmount: number;
  isReleased: boolean;
  isRefunded: boolean;
}

export interface Dispute {
  id: number;
  orderId: number;
  orderNumber: string;
  openedById: number;
  openedByName: string;
  reason: string;
  evidenceUrl?: string;
  adminNotes?: string;
  resolution: 'PENDING' | 'REFUND_BUYER' | 'RELEASE_SELLER';
  createdAt: string;
}

export interface ChatRoom {
  id: number;
  buyerId: number;
  sellerId: number;
  productId: number;
  productTitle: string;
  productPrice: number;
  productImage: string;
  sellerName: string;
  buyerName: string;
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageSenderId?: number;
  lastMessageKind?: 'TEXT' | 'PHOTO' | 'VIDEO' | 'VOICE' | 'RECEIPT' | 'PRODUCT' | 'OFFER';
  buyerLastReadAt?: string;
  sellerLastReadAt?: string;
  buyerMuted?: boolean;
  sellerMuted?: boolean;
  buyerArchivedAt?: string;
  sellerArchivedAt?: string;
}

export interface Message {
  id: number;
  roomId: number;
  senderId: number;
  /** Set when this message quotes an earlier message in the same thread. */
  replyToId?: number;
  messageText?: string;
  imageUrl?: string;
  videoUrl?: string;
  voiceNoteUrl?: string;
  receiptDetails?: {
    orderNumber: string;
    productTitle: string;
    amount: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
  };
  productDetails?: {
    id: number;
    title: string;
    price: number;
    image: string;
    condition: string;
  };
  offerDetails?: {
    amount: number;
    productId: number;
    status: 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'DECLINED';
    counterAmount?: number;
    proposedBy: number;
  };
  createdAt: string;
}

export interface ReviewReply {
  id: number;
  authorId: number;
  authorName: string;
  authorPhoto: string;
  authorRole: string; // 'BUYER' | 'SELLER' | 'ADMIN'
  comment: string;
  createdAt: string;
}

export interface Review {
  id: number;
  orderId?: number; // make optional since general product reviews might not have order context
  productId?: number; // optional product link
  reviewerId: number;
  reviewerName: string;
  reviewerPhoto: string;
  revieweeId?: number; // make optional if general comment
  rating: number; // 1-5, or 0 if it is just a product comment/question
  comment: string;
  imageUrl?: string;
  sellerReply?: string;
  isHelpfulVotes: number;
  replies?: ReviewReply[]; // nested replies from buyers, sellers, or other vendors
  createdAt: string;
}

export interface IdentityVerification {
  id: number;
  userId: number;
  /** IDENTITY (personal) or SELLER / BUSINESS (badge application). */
  applicationKind: VerificationKind;
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  documentImageUrl: string;
  selfieImageUrl: string;
  proofOfAddressUrl: string;
  /** Extra uploads beyond the three standard slots above. */
  documents: VerificationDocument[];
  businessName: string;
  businessAddress: string;
  status: VerificationStatus;
  adminNotes?: string;
  rejectionReason?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  createdAt: string;
  // Migration 024 — guided seller verification detail
  sellerType?: 'INDIVIDUAL' | 'BUSINESS';
  dateOfBirth?: string;
  contactPhone?: string;
  contactEmail?: string;
  residenceState?: string;
  residenceCity?: string;
  residenceAddress?: string;
  businessRegistrationNumber?: string;
  businessContactName?: string;
  storeName?: string;
  storeDescription?: string;
  storeCity?: string;
  storeState?: string;
  storePhone?: string;
  infoRequestNote?: string;
  statusReason?: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  decidedAt?: string;
  expiresAt?: string;
}

export interface GoodPointsTransaction {
  id: number;
  userId: number;
  points: number;
  reason: string;
  createdAt: string;
}

export type ReferralLifecycleStatus =
  | 'REGISTERED'
  | 'VERIFICATION_PENDING'
  | 'QUALIFIED'
  | 'REWARD_PENDING'
  | 'REWARDED'
  | 'DISQUALIFIED';

export interface Referral {
  id: number;
  referrerId: number;
  refereeId: number;
  refereeName: string;
  status: ReferralLifecycleStatus;
  pointsReward: number;
  rewardReleased?: boolean;
  campaignId?: number;
  code?: string;
  referrerReward: number;
  refereeReward: number;
  qualifiedAt?: string;
  rewardedAt?: string;
  disqualificationReason?: string;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: 'ORDER' | 'BID' | 'DISPUTE' | 'POINTS' | 'REFERRAL' | 'CHAT' | 'VERIFICATION' | 'SAFEMEET' | 'ESCROW' | 'SYSTEM' | 'DELIVERY' | 'STOCK' | 'PROMOTION' | 'WALLET';
  isRead: boolean;
  createdAt: string;
}

export interface SafeMeetLocation {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  photoUrl: string;
  openingHours: string;
  safetyRating: number;
  distanceKm: number;
  travelTimeMinutes: number;
  parkingAvailable: boolean;
  accessibility: string;
  isFavorite?: boolean;
}

export interface SafeMeetMeetup {
  id: number;
  orderId: number;
  locationId: number;
  scheduledAt: string; // ISO string
  status: 'PENDING_CONFIRMATION' | 'SCHEDULED' | 'BUYER_ARRIVED' | 'SELLER_ARRIVED' | 'COMPLETED' | 'CANCELLED';
  buyerConfirmedArrival: boolean;
  sellerConfirmedArrival: boolean;
  rating?: number;
  reportText?: string;
  createdAt: string;
}

export interface FollowerRelation {
  id: number;
  followerId: number; // user who is following
  followedUserId?: number; // seller being followed
  followedBusinessId?: number; // business being followed
  createdAt: string;
}

export interface ProductBundle {
  id: number;
  sellerId: number;
  title: string;
  description: string;
  productIds: number[];
  price: number;
  discountPercentage: number;
  quantity: number;
  createdAt: string;
}

// ==========================================
// GOODSALE PAYMENT & CHECKOUT SYSTEM INTERFACES
// ==========================================

export interface PaymentTransaction {
  id: number;
  transactionId: string;
  orderId?: number;
  orderNumber?: string;
  buyerId: number;
  sellerId: number;
  amount: number;
  paymentMethod: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  purpose: 'ORDER_PAYMENT' | 'ESCROW_RELEASE' | 'DEPOSIT_PAYMENT' | 'BALANCE_PAYMENT' | 'WITHDRAWAL';
  createdAt: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  orderId: number;
  buyerId: number;
  sellerId: number;
  businessId: number;
  amount: number;
  terms: string; // e.g. "Net 15", "Due on Receipt"
  dueDate: string;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface Refund {
  id: number;
  refundNumber: string;
  transactionId: string;
  orderId: number;
  amount: number;
  reason: string;
  status:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'REQUESTED'
    | 'UNDER_REVIEW'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED';
  providerReference?: string;
  adminNotes?: string;
  createdAt: string;
}

/* ── Trust, safety & support ─────────────────────────────────────── */

export type SupportTicketCategory =
  | 'PAYMENT'
  | 'DELIVERY'
  | 'ACCOUNT'
  | 'REFUND'
  | 'SELLER_DISPUTE'
  | 'OTHER';

export type SupportTicketStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'WAITING_USER'
  | 'RESOLVED'
  | 'CLOSED';

export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface SupportTicketMessage {
  id: number;
  authorId: number;
  authorName: string;
  authorRole: 'BUYER' | 'SELLER' | 'ADMIN';
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  /** Human reference shown to the customer, e.g. GS-TKT-482913. */
  reference: string;
  userId: number;
  userName: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  orderId?: number;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  adminNotes?: string;
  messages: SupportTicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductAppeal {
  id: number;
  reference: string;
  productId: number;
  sellerId: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

export type NotificationPreferenceKey =
  | 'orders'
  | 'payments'
  | 'messages'
  | 'deliveries'
  | 'stock'
  | 'promotions'
  | 'security';

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

export interface WithdrawalRequest {
  id: number;
  requestNumber: string;
  userId: number;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'APPROVED' | 'REJECTED';
  fee?: number;
  netAmount?: number;
  walletTransactionId?: number;
  providerReference?: string;
  providerTransferCode?: string;
  failedReason?: string;
  createdAt: string;
}

export interface PaymentSettings {
  enabledMethods: string[]; // e.g. ['escrow', 'cod', 'card', 'bank', 'invoice', 'partial']
  codMaxOrderValue: number; // e.g. 500000
  escrowFeePercentage: number; // e.g. 1.5
  deliveryCommissionPercentage: number; // e.g. 10
}

export interface PaymentLog {
  id: number;
  userId?: number;
  action: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

// ==========================================
// GOODDISPATCH™ DELIVERY NETWORK TYPES & ENUMS
// ==========================================

export enum DeliveryVehicleType {
  BICYCLE = 'BICYCLE',
  MOTORCYCLE = 'MOTORCYCLE',
  CAR = 'CAR',
  VAN = 'VAN',
  TRUCK = 'TRUCK',
  KEKE = 'KEKE',
  LOGISTICS = 'LOGISTICS',
  FLEET = 'FLEET',
}

export enum DeliveryJobStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  ARRIVED = 'ARRIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface DeliveryPartner {
  id: number;
  userId: number;
  fullName: string;
  phone: string;
  email: string;
  vehicleType: DeliveryVehicleType;
  brand: string;
  model: string;
  plateNumber: string;
  color: string;
  year: number;
  capacity: string;
  photoUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  isAvailable: boolean;
  trustScore: number;
  rating: number;
  completedDeliveries: number;
  acceptanceRate: number;
  activeDeliveriesCount: number;
  address: string;
  state: string;
  city: string;
  lastLat?: number;
  lastLng?: number;
  lastLocationAt?: string;
  locationPermission: 'UNKNOWN' | 'GRANTED' | 'DENIED';
  locationSharing: boolean;
  locationSharingUpdatedAt?: string;
  nin: string;
  selfieUrl: string;
  licenseUrl?: string;
  /** Every document the rider uploaded for review. */
  documents: VerificationDocument[];
  rejectionReason?: string;
  suspensionReason?: string;
  suspendedAt?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  commissionPercentage?: number;
  serviceStates: string[];
  lastSeenAt?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  createdAt: string;
}

export interface DeliveryJob {
  id: number;
  orderId: number;
  partnerId?: number;
  status: DeliveryJobStatus;
  serviceType: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
  deliveryFee: number;
  platformCommission: number;
  courierEarnings: number;
  estPickupTime: string;
  estDeliveryTime: string;
  currentLat?: number;
  currentLng?: number;
  currentSpeed?: number;
  pin: string;
  sosTriggered?: boolean;
  incidentReport?: string;
  trackingHistory: { status: string; time: string; note: string }[];
  createdAt: string;
}

// ==========================================
// DELIVERY & TRACKING (Phase 1)
// ==========================================

/**
 * Canonical delivery lifecycle. This is intentionally separate from
 * `OrderStatus`: an order can stay OUT_FOR_DELIVERY while its delivery is
 * already DELIVERED and awaiting the buyer's escrow release.
 */
export type DeliveryStatus =
  | 'AWAITING_SELLER_PREPARATION'
  | 'READY_FOR_PICKUP'
  | 'AWAITING_RIDER'
  | 'RIDER_ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'ARRIVED_AT_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERY_ATTEMPTED'
  | 'DELIVERED'
  | 'FAILED_DELIVERY'
  | 'RETURNED_TO_SELLER'
  | 'CANCELLED';

/** The immutable delivery-fee snapshot captured when the order was paid. */
export interface Delivery {
  id: number;
  orderId: number;
  deliveryNumber: string;
  /** GoodSale shipment tracking id, e.g. GSD-829174620. */
  trackingId: string;
  buyerId: number;
  sellerId: number;
  pickupAddress: string;
  pickupCity: string;
  pickupState: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPhone: string;
  deliveryLat?: number;
  deliveryLng?: number;
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  routeProvider: string;
  routeIsEstimate: boolean;
  routeComputedAt?: string;
  deliveryMethod: string;
  serviceType: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
  deliveryFee: number;
  feeSnapshot?: ShippingBreakdown;
  status: DeliveryStatus;
  riderId?: number;
  courierName: string;
  trackingNumber: string;
  estimatedDeliveryDate?: string;
  deliveryInstructions: string;
  failureReason: string;
  cancellationReason: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  cancelledAt?: string;
  confirmationExpiresAt?: string;
  confirmedAt?: string;
  confirmedBy?: number;
  assignmentStatus: DeliveryAssignmentStatus;
  assignmentOfferedAt?: string;
  assignmentExpiresAt?: string;
  assignmentMode: 'AUTO' | 'MANUAL';
  autoOfferRound: number;
  riderAcceptedAt?: string;
  arrivedPickupAt?: string;
  arrivedDestinationAt?: string;
  attemptCount: number;
  courierProvider: string;
  courierExternalId: string;
  courierStatus: string;
  courierLastSyncedAt?: string;
  courierLastError: string;
  courierSyncAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export type DeliveryAssignmentStatus = 'UNASSIGNED' | 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface DeliverySettings {
  autoAssignEnabled: boolean;
  offerTimeoutMinutes: number;
  maxActiveDeliveries: number;
  maxPickupDistanceKm: number;
  maxOffersPerDelivery: number;
  locationUpdateIntervalSeconds: number;
  trackingStaleMinutes: number;
}

export type DeliveryOfferStatus = 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';

export interface DeliveryAssignmentOffer {
  id: number;
  deliveryId: number;
  riderId: number;
  round: number;
  status: DeliveryOfferStatus;
  score?: number;
  distanceKm?: number;
  vehicleSuitable: boolean;
  offeredAt: string;
  expiresAt?: string;
  respondedAt?: string;
  reason: string;
}

export interface DeliveryLiveLocation {
  deliveryId: number;
  riderId: number;
  lat: number;
  lng: number;
  accuracyM?: number;
  speedKmh?: number;
  headingDegrees?: number;
  updatedAt: string;
}

export type DeliveryFailureReason =
  | 'BUYER_UNAVAILABLE'
  | 'SELLER_UNAVAILABLE'
  | 'INCORRECT_ADDRESS'
  | 'RIDER_CANCELLATION'
  | 'COURIER_DELAY'
  | 'DAMAGED_PACKAGE'
  | 'OTHER';

export type DeliveryFailureStatus =
  | 'OPEN'
  | 'REASSIGNED'
  | 'RESCHEDULED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'REFUND_REQUESTED'
  | 'RESOLVED';

export interface DeliveryFailure {
  id: number;
  deliveryId: number;
  reasonCode: DeliveryFailureReason;
  note: string;
  source: 'BUYER' | 'SELLER' | 'RIDER' | 'ADMIN' | 'COURIER' | 'SYSTEM';
  status: DeliveryFailureStatus;
  reportedBy?: number;
  resolvedBy?: number;
  resolutionNote: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export type DeliveryReturnStatus = 'INITIATED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface DeliveryReturn {
  id: number;
  deliveryId: number;
  failureId?: number;
  status: DeliveryReturnStatus;
  reason: string;
  notes: string;
  initiatedBy?: number;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CourierShipment {
  id: number;
  deliveryId: number;
  provider: string;
  externalShipmentId: string;
  trackingNumber: string;
  labelUrl: string;
  status: string;
  lastEventAt?: string;
  lastSyncedAt?: string;
  syncAttempts: number;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryTrackingView {
  deliveryId: number;
  deliveryNumber: string;
  status: DeliveryStatus;
  assignmentStatus: DeliveryAssignmentStatus;
  trackingActive: boolean;
  trackingStatus: 'LIVE' | 'ENDED' | 'PERMISSION_DENIED' | 'NOT_SHARING' | 'RIDER_OFFLINE' | 'RIDER_UNAVAILABLE' | 'NOT_ASSIGNED' | 'NO_LOCATION' | 'STALE' | 'UNAVAILABLE';
  reason: string;
  lastUpdated?: string;
  riderLocation?: { lat: number; lng: number; accuracyM?: number; speedKmh?: number; headingDegrees?: number };
  destination?: { lat: number; lng: number };
  pickup?: { lat: number; lng: number };
  routeDistanceKm?: number;
  routeDurationMinutes?: number;
  routeProvider: string;
  routeIsEstimate: boolean;
}

export interface ShipmentTrackingEvent {
  id: number;
  status: DeliveryStatus;
  note: string;
  actorRole: string;
  createdAt: string;
}

export interface ShipmentTrackingRider {
  id: number;
  name: string;
  photoUrl: string;
  phone: string;
  vehicleType: string;
  vehicle: string;
  plateNumber: string;
  rating: number;
  completedDeliveries: number;
  trustScore: number;
}

export interface ShipmentTrackingSibling {
  trackingId: string;
  status: DeliveryStatus;
  sellerName: string;
  productTitle: string;
  isCurrent: boolean;
}

export interface ShipmentTrackingResult {
  found: boolean;
  deliveryId: number;
  trackingId: string;
  deliveryNumber: string;
  orderNumber: string;
  checkoutGroupId: string;
  status: DeliveryStatus;
  deliveryMethod: string;
  serviceType: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
  courierName: string;
  courierTrackingNumber: string;
  estimatedDeliveryDate?: string;
  createdAt: string;
  deliveredAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  lastUpdated: string;
  authorized: boolean;
  accessLevel: 'PUBLIC' | 'PARTICIPANT' | 'ADMIN';
  viewerRole: '' | 'BUYER' | 'SELLER' | 'RIDER' | 'ADMIN' | 'PARTICIPANT';
  destination: {
    address: string;
    city: string;
    state: string;
    phone: string;
    instructions: string;
    lat?: number;
    lng?: number;
  };
  events: ShipmentTrackingEvent[];
  rider?: ShipmentTrackingRider | null;
  live?: DeliveryTrackingView | null;
  order?: {
    id: number;
    orderNumber: string;
    checkoutGroupId: string;
    productTitle: string;
    productImage: string;
    totalAmount: number;
    deliveryFee: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
    deliveredAt?: string;
    confirmedAt?: string;
  } | null;
  shipments: ShipmentTrackingSibling[];
  sellerName: string;
  deliveryPin?: string | null;
  canConfirmReceipt: boolean;
  canReportIssue: boolean;
}

export interface DeliveryAnalytics {
  totals: {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    active: number;
    delayed: number;
    avgDeliveryHours: number;
    deliveryCosts: number;
    completedDeliveryCosts: number;
    riderEarnings: number;
    successfulDeliveryPercentage: number | null;
  };
  courierPerformance: { courier: string; shipments: number; completed: number; failed: number }[];
  byState: { state: string; total: number; completed: number; failed: number; avgHours: number }[];
  byCity: { city: string; state: string; total: number; completed: number; failed: number; avgHours: number }[];
  routeDistanceEstimateCount: number;
}

/** A redacted open delivery request shown to an eligible rider. */
export interface AvailableDelivery {
  id: number;
  pickupCity: string;
  pickupState: string;
  deliveryCity: string;
  deliveryState: string;
  serviceType: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
  deliveryFee: number;
  riderNet: number;
  estimatedDeliveryDate?: string;
  status: DeliveryStatus;
  createdAt: string;
}

export type RiderEarningStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'VOID';

/** Per-delivery rider payout ledger entry. Money is never moved automatically. */
export interface RiderEarning {
  id: number;
  deliveryId: number;
  orderId: number;
  riderId: number;
  grossAmount: number;
  platformCommission: number;
  adjustmentAmount: number;
  netAmount: number;
  status: RiderEarningStatus;
  payoutReference: string;
  notes: string;
  approvedAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiderEarningAuditLog {
  id: number;
  earningId: number;
  riderId: number;
  actorId?: number;
  actorName: string;
  action: string;
  amountBefore: number;
  amountAfter: number;
  details: string;
  createdAt: string;
}

/** One timestamped entry in a delivery's tracking history. */
export interface DeliveryEvent {
  id: number;
  deliveryId: number;
  status: DeliveryStatus;
  note: string;
  actorId?: number;
  actorRole: string;
  createdAt: string;
}

/** Admin-only audit trail of delivery actions. */
export interface DeliveryAuditLog {
  id: number;
  deliveryId: number;
  actorId?: number;
  actorName: string;
  actorRole: string;
  action: string;
  previousStatus?: string;
  newStatus?: string;
  details: string;
  createdAt: string;
}

// ==========================================
// GOODSALE REVENUE SYSTEM TYPES
// ==========================================

// ==========================================
// SHIPPING ENGINE
// ==========================================

export type ShippingServiceType = 'ECONOMY' | 'STANDARD' | 'EXPRESS';
export type ShippingDeliveryMethod = 'GOODSALE_PARTNER' | 'THIRD_PARTY_COURIER' | 'PICKUP';
export type ShippingRuleScope = 'GLOBAL' | 'STATE' | 'CITY' | 'ZONE';
export type ShippingZoneKind = 'LOCAL' | 'INTERSTATE' | 'REMOTE';

export interface ShippingSettings {
  enabled: boolean;
  localBaseFee: number;
  perKmFee: number;
  minFee: number;
  maxFee: number;
  interstateBaseFee: number;
  interstatePerKmFee: number;
  weightSurchargePerKg: number;
  oversizeSurcharge: number;
  remoteSurcharge: number;
  freeShippingThreshold: number;
  handlingFee: number;
  platformShippingFee: number;
  economyFee: number;
  standardFee: number;
  expressFee: number;
  manualQuoteAboveKm: number;
  manualQuotesEnabled: boolean;
  sellerSponsoredShipping: boolean;
  platformSponsoredShipping: boolean;
  defaultEtaMinDays: number;
  defaultEtaMaxDays: number;
  updatedAt?: string;
}

export interface ShippingDistanceTier {
  id: number;
  label: string;
  minKm: number;
  maxKm?: number;
  fee: number;
  enabled: boolean;
  priority: number;
}

export interface ShippingZone {
  id: number;
  name: string;
  state: string;
  city?: string;
  kind: ShippingZoneKind;
  surcharge: number;
  enabled: boolean;
  priority: number;
  notes?: string;
  createdAt: string;
}

export interface ShippingRule {
  id: number;
  name: string;
  enabled: boolean;
  priority: number;
  scope: ShippingRuleScope;
  zoneId?: number;
  /** Destination state/city. */
  state?: string;
  city?: string;
  /** Optional origin (seller pickup) state/city for pair pricing. */
  originState?: string;
  originCity?: string;
  deliveryMethod: 'ANY' | ShippingDeliveryMethod;
  serviceType: 'ANY' | ShippingServiceType;
  baseFee?: number;
  perKmFee?: number;
  minFee?: number;
  maxFee?: number;
  weightPerKg?: number;
  oversizeSurcharge?: number;
  remoteSurcharge?: number;
  freeShippingThreshold?: number;
  handlingFee?: number;
  platformFee?: number;
  sellerSponsored: boolean;
  platformSponsored: boolean;
  etaMinDays?: number;
  etaMaxDays?: number;
  manualQuote: boolean;
  notes?: string;
  createdAt: string;
}

export interface ShippingCourier {
  id: number;
  name: string;
  code: string;
  mode: 'MANUAL' | 'AUTO';
  enabled: boolean;
  baseFee: number;
  perKmFee: number;
  expressMultiplier: number;
  apiProvider?: string;
  notes?: string;
  createdAt: string;
}

export interface SellerShippingSettings {
  sellerId: number;
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
  updatedAt: string;
}

export interface ShippingManualQuote {
  id: number;
  sellerId: number;
  state: string;
  city: string;
  amount: number;
  etaMinDays: number;
  etaMaxDays: number;
  notes?: string;
  active: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface ShippingAuditLog {
  id: number;
  userId?: number;
  userName: string;
  action: string;
  entityType: string;
  entityId: number;
  details: string;
  createdAt: string;
}

export interface ShippingOption {
  method: ShippingDeliveryMethod;
  service: ShippingServiceType;
  label: string;
  fee: number;
  etaMinDays: number;
  etaMaxDays: number;
  courierName?: string;
  ruleName?: string;
  freeShipping: boolean;
  manualQuote: boolean;
  breakdown: ShippingBreakdown;
}

export interface SellerShippingQuoteGroup {
  sellerId: number;
  sellerName: string;
  subtotal: number;
  items: { productId: number; quantity: number; title?: string }[];
  options: ShippingOption[];
  selected?: ShippingOption;
  requiresManualQuote: boolean;
  message?: string;
  unavailableReasons?: string[];
}

export interface ShippingQuoteResult {
  quoteId?: string;
  groups: SellerShippingQuoteGroup[];
  total: number;
  requiresManualQuote: boolean;
  message?: string;
  expiresAt?: string;
  serviceTotals?: Record<ShippingServiceType, number>;
}

export interface RevenueSettings {
  /** Admin toggle: when false, buyers pay no per-item platform fee. */
  platformFeeEnabled: boolean;
  escrowPercentageFee: number;
  escrowMinFee: number;
  escrowMaxFee: number;
  deliveryCommissionPercentage: number;
  featured3DaysPrice: number;
  featured7DaysPrice: number;
  featured14DaysPrice: number;
  featured30DaysPrice: number;
  subProPrice: number;
  subPremiumPrice: number;
  subEnterprisePrice: number;
  verifiedPlusPrice: number;
  /** Admin-configured membership period; defaults to a 30-day manual renewal. */
  premiumDurationDays: number;
  premiumReminderDays: number;
  premiumCreditExpiryDays: number;
  verifiedPlusMonthlyCredits: number;
  businessProMonthlyCredits: number;
  businessPremiumMonthlyCredits: number;
  businessEnterpriseMonthlyCredits: number;
  /** Ranking points are additive tie-breakers after relevance filters. */
  featuredRankingBoost: number;
  verifiedPlusRankingBoost: number;
  flashSaleFeaturePrice: number;
  auctionSuccessFeePercentage: number;
  adCpcPrice: number;
  goodSaleProtectFee: number;
}

/** Where in the app an admin wants an ad to appear. */
export type AdPlacement = 'HOME' | 'CATEGORY' | 'DETAIL' | 'CHAT' | 'DASHBOARD' | 'SEARCH';

export const AD_PLACEMENTS: AdPlacement[] = ['HOME', 'CATEGORY', 'DETAIL', 'CHAT', 'DASHBOARD', 'SEARCH'];

export interface SponsoredAd {
  id: number;
  sellerId: number;
  type: 'PRODUCT' | 'BUSINESS' | 'BANNER_HOME' | 'BANNER_CATEGORY';
  targetId: number;
  bannerUrl?: string;
  /** Image or video the admin uploaded from their device. */
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  /** Supporting line under the title. */
  ctaText?: string;
  /** App view to open when the ad is clicked (e.g. 'marketplace'). */
  clickView?: string;
  /** Where in the app this ad is shown. */
  placements?: AdPlacement[];
  title: string;
  status: 'PENDING_REVIEW' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'REJECTED';
  moderationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationReason?: string;
  budget: number;
  spent: number;
  clicks: number;
  impressions: number;
  targetState?: string;
  targetCity?: string;
  targetCategory?: string;
  dailyBudget?: number;
  cpcBid?: number;
  startsAt?: string;
  endsAt?: string;
  conversions?: number;
  conversionValue?: number;
  createdAt: string;
}

/** Admin-written popup shown to users when they join / enter the app. */
export interface Announcement {
  id: number;
  title: string;
  body: string;
  /** ANNOUNCEMENT | UPDATE | FEATURE — used for the icon/accent. */
  kind: 'ANNOUNCEMENT' | 'UPDATE' | 'FEATURE';
  /** ALL | BUYER | SELLER | BUSINESS | ADMIN */
  audience: 'ALL' | 'BUYER' | 'SELLER' | 'BUSINESS' | 'ADMIN';
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface FeaturedListing {
  id: number;
  productId: number;
  sellerId: number;
  durationDays: number;
  expiresAt: string;
  status: 'PENDING_REVIEW' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'REJECTED' | 'CANCELLED';
  featureType?: 'FEATURED' | 'FLASH_SALE';
  startsAt?: string;
  amountPaid?: number;
  salePrice?: number;
  quantityLimit?: number;
  quantitySold?: number;
  moderationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  moderationReason?: string;
  creditsApplied?: number;
  walletCharge?: number;
  createdAt: string;
}

export interface MembershipPlanBenefit {
  id: number;
  planCode: 'VERIFIED_PLUS' | 'BUSINESS_PRO' | 'BUSINESS_PREMIUM' | 'BUSINESS_ENTERPRISE';
  label: string;
  description: string;
  included: boolean;
  sortOrder: number;
  active: boolean;
}

export interface PremiumCreditLedgerEntry {
  id: number;
  type: 'ISSUED' | 'REDEEMED' | 'EXPIRED' | 'ADJUSTED' | 'REFUNDED';
  amount: number;
  reference: string;
  description: string;
  createdAt: string;
}

export interface Wallet {
  id: number;
  userId: number;
  balance: number;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
}

export interface WalletTransaction {
  id: number;
  walletId: number;
  reference?: string;
  amount: number;
  type:
    | 'CREDIT_SALE'
    | 'CREDIT_DELIVERY'
    | 'DEBIT_WITHDRAWAL'
    | 'DEBIT_FEES'
    | 'DEBIT_SUBCRIPTION'
    | 'DEBIT_AD'
    | 'DEBIT_PROTECT'
    | 'WALLET_FUNDING'
    | 'ORDER_PAYMENT'
    | 'SELLER_EARNINGS'
    | 'MARKETPLACE_COMMISSION'
    | 'REFUND'
    | 'WITHDRAWAL_REVERSAL'
    | 'ADJUSTMENT'
    | 'PROMOTIONAL_CREDIT'
    | 'PROMOTIONAL_DEBIT';
  description: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  orderId?: number;
  provider?: string;
  providerReference?: string;
  channel?: string;
  balanceAfter?: number;
  currency?: string;
  affectsBalance?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  details: string;
  createdAt: string;
}

export interface BusinessSubscription {
  id: number;
  userId: number;
  plan: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';
  expiresAt: string;
  status?: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED' | 'SUSPENDED';
  autoRenew?: boolean;
  cancelledAt?: string;
  createdAt: string;
}

export interface VerifiedPlusSubscription {
  id: number;
  userId: number;
  expiresAt: string;
  status?: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PAYMENT_FAILED' | 'SUSPENDED';
  autoRenew?: boolean;
  cancelledAt?: string;
  createdAt: string;
}


export interface GoodSaleDBState {
  users: User[];
  profiles: Profile[];
  businesses: Business[];
  products: Product[];
  auctions: Auction[];
  bids: Bid[];
  orders: Order[];
  escrows: Escrow[];
  disputes: Dispute[];
  chatRooms: ChatRoom[];
  messages: Message[];
  messageReactions: MessageReaction[];
  calls: Call[];
  reports: Report[];
  serviceAreas: ServiceArea[];
  reviews: Review[];
  verifications: IdentityVerification[];
  goodPoints: GoodPointsTransaction[];
  referrals: Referral[];
  notifications: Notification[];
  safeMeetLocations: SafeMeetLocation[];
  safeMeetMeetups: SafeMeetMeetup[];
  followerRelations: FollowerRelation[];
  productBundles: ProductBundle[];
  deliveryPartners: DeliveryPartner[];
  deliveryJobs: DeliveryJob[];
  deliveries: Delivery[];
  deliveryEvents: DeliveryEvent[];
  deliveryAuditLogs: DeliveryAuditLog[];
  deliverySettings: DeliverySettings;
  deliveryAssignmentOffers: DeliveryAssignmentOffer[];
  deliveryLiveLocations: DeliveryLiveLocation[];
  deliveryFailures: DeliveryFailure[];
  deliveryReturns: DeliveryReturn[];
  courierShipments: CourierShipment[];
  riderEarnings: RiderEarning[];
  riderEarningAuditLogs: RiderEarningAuditLog[];
  revenueSettings: RevenueSettings;
  shippingSettings: ShippingSettings;
  shippingZones: ShippingZone[];
  shippingTiers: ShippingDistanceTier[];
  shippingRules: ShippingRule[];
  shippingCouriers: ShippingCourier[];
  sellerShippingSettings: SellerShippingSettings[];
  shippingManualQuotes: ShippingManualQuote[];
  shippingAuditLogs: ShippingAuditLog[];
  sponsoredAds: SponsoredAd[];
  featuredListings: FeaturedListing[];
  announcements: Announcement[];
  wallets: Wallet[];
  walletTransactions: WalletTransaction[];
  auditLogs: AuditLog[];
  businessSubscriptions: BusinessSubscription[];
  verifiedPlusSubscriptions: VerifiedPlusSubscription[];
  currentUser: User | null;
  transactions: PaymentTransaction[];
  invoices: Invoice[];
  refunds: Refund[];
  withdrawalRequests: WithdrawalRequest[];
  paymentSettings: PaymentSettings;
  paymentLogs: PaymentLog[];
}

