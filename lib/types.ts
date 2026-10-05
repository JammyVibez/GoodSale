// lib/types.ts — GoodSale domain types (no mock data)
export enum UserRole {
  GUEST = 'GUEST',
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  VERIFIED_SELLER = 'VERIFIED_SELLER',
  BUSINESS = 'BUSINESS',
  VERIFIED_BUSINESS = 'VERIFIED_BUSINESS',
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
  city: string;
  state: string;
  lat?: number;
  lng?: number;
  deliveryPreference: string;
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
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
  city: string;
  state: string;
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
  isNegotiable: boolean;
  quantity: number;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  images: string[];
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

export interface Order {
  id: number;
  orderNumber: string; // GS-2026-000001
  buyerId: number;
  sellerId: number;
  productId: number;
  productTitle: string;
  productImage: string;
  totalAmount: number;
  discountAmount: number;
  deliveryFee: number;
  taxAmount: number;
  paymentMethod: string;
  deliveryMethod: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
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
  
  // Custom Merchant Payment System fields
  depositPercent?: number;
  depositRemainingDays?: number;
  depositAmountPaid?: number;
  balanceRemaining?: number;
  isBalanceSettled?: boolean;
  bankTransferReceipt?: string;
  invoiceTerms?: string;
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
}

export interface Message {
  id: number;
  roomId: number;
  senderId: number;
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
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  documentImageUrl: string;
  selfieImageUrl: string;
  proofOfAddressUrl: string;
  status: VerificationStatus;
  adminNotes?: string;
  createdAt: string;
}

export interface GoodPointsTransaction {
  id: number;
  userId: number;
  points: number;
  reason: string;
  createdAt: string;
}

export interface Referral {
  id: number;
  referrerId: number;
  refereeId: number;
  refereeName: string;
  status: 'REGISTERED' | 'FIRST_ORDER_COMPLETED';
  pointsReward: number;
  rewardReleased?: boolean;
  createdAt: string;
}

export interface Notification {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: 'ORDER' | 'BID' | 'DISPUTE' | 'POINTS' | 'CHAT' | 'VERIFICATION' | 'SAFEMEET' | 'ESCROW' | 'SYSTEM' | 'DELIVERY';
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface WithdrawalRequest {
  id: number;
  requestNumber: string;
  userId: number;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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
  nin: string;
  selfieUrl: string;
  licenseUrl?: string;
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
// GOODSALE REVENUE SYSTEM TYPES
// ==========================================

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
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  budget: number;
  spent: number;
  clicks: number;
  impressions: number;
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
  status: 'ACTIVE' | 'EXPIRED';
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
  amount: number;
  type: 'CREDIT_SALE' | 'CREDIT_DELIVERY' | 'DEBIT_WITHDRAWAL' | 'DEBIT_FEES' | 'DEBIT_SUBCRIPTION' | 'DEBIT_AD' | 'DEBIT_PROTECT';
  description: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
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
  createdAt: string;
}

export interface VerifiedPlusSubscription {
  id: number;
  userId: number;
  expiresAt: string;
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
  revenueSettings: RevenueSettings;
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

