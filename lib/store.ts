// lib/store.ts
'use client';

import { useState, useEffect } from 'react';

// Standard Enums
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
}

export interface Profile {
  userId: number;
  photoUrl: string;
  coverUrl: string;
  bio: string;
  address: string;
  city: string;
  state: string;
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
  deliveryPin: string; // 6 digits
  qrCodeToken: string;
  status: OrderStatus;
  goodPointsUsed: number;
  createdAt: string;
  updatedAt: string;
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
  type: 'ORDER' | 'BID' | 'DISPUTE' | 'POINTS' | 'CHAT' | 'VERIFICATION' | 'SAFEMEET' | 'ESCROW';
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

// Initial Mock Datasets representing the Nigerian Local Context
const INITIAL_USERS: User[] = [];

const INITIAL_PROFILES: Profile[] = [];

const INITIAL_BUSINESSES: Business[] = [];

const INITIAL_PRODUCTS: Product[] = [];
const OLD_INITIAL_PRODUCTS: any[] = [
  {
    id: 101,
    sellerId: 3,
    businessId: 1,
    title: 'iPhone 15 Pro Max (Grade A++ UK Used)',
    description: 'Perfect UK-used titanium gray iPhone 15 Pro Max, 256GB storage. Zero scratches, 96% battery health. Comes with original Apple charging cord, high-quality protective case, and a 6-month GoodSale escrow-backed warranty.',
    category: 'Phones',
    brand: 'Apple',
    condition: ProductCondition.LIKE_NEW,
    price: 1350000,
    isNegotiable: true,
    quantity: 4,
    stockStatus: 'IN_STOCK',
    images: [
      'https://picsum.photos/seed/iphone15pro/600/600',
      'https://picsum.photos/seed/iphone15pro_2/600/600',
      'https://picsum.photos/seed/iphone15pro_3/600/600',
    ],
    barcode: '194253831814',
    deliveryMethod: 'GOODSALE_PARTNER',
    pickupAvailable: true,
    warranty: '6 Months GoodSale Escrow Warranty',
    returnPolicy: '7 Days Return on Defect',
    weightKg: 0.22,
    dimensionsCm: '15.9 x 7.6 x 0.8 cm',
    isAuction: false,
    viewCount: 421,
    createdAt: '2026-07-10T10:00:00Z',
  },
  {
    id: 102,
    sellerId: 3,
    businessId: 1,
    title: 'MacBook Pro 14" M3 (Verified Brand New)',
    description: 'Brand new, factory-sealed Apple MacBook Pro with the powerful M3 chip, 8-Core CPU, 10-Core GPU, 8GB Unified Memory, and 512GB SSD storage. Elegant Space Gray finish. Bid starts low. Live auction is active, ending soon!',
    category: 'Laptops',
    brand: 'Apple',
    condition: ProductCondition.NEW,
    price: 2500000,
    isNegotiable: false,
    quantity: 1,
    stockStatus: 'IN_STOCK',
    images: [
      'https://picsum.photos/seed/macbookm3/600/600',
      'https://picsum.photos/seed/macbookm3_2/600/600',
    ],
    barcode: '195949117604',
    deliveryMethod: 'GOODSALE_PARTNER',
    pickupAvailable: true,
    warranty: '1 Year Apple Global Warranty',
    returnPolicy: 'No Return unless wrong shipment',
    weightKg: 1.55,
    dimensionsCm: '31.2 x 22.1 x 1.5 cm',
    isAuction: true,
    viewCount: 782,
    createdAt: '2026-07-09T14:30:00Z',
  },
  {
    id: 103,
    sellerId: 2,
    businessId: 2,
    title: 'Premium Handwoven Aso Oke Agbada Set',
    description: 'A masterpiece of traditional craftsmanship. Fully tailored luxury 4-piece Agbada set handwoven from fine cotton and metallic thread. Includes the flowing outer Agbada, inner Kaftan, trousers, and a matching cap (Fila). Styled in a royal gold-threaded pattern.',
    category: 'Fashion',
    brand: 'Fatima Bespoke',
    condition: ProductCondition.NEW,
    price: 180000,
    isNegotiable: true,
    quantity: 2,
    stockStatus: 'IN_STOCK',
    images: [
      'https://picsum.photos/seed/agbada/600/600',
      'https://picsum.photos/seed/agbada_2/600/600',
    ],
    barcode: '493821039823',
    deliveryMethod: 'THIRD_PARTY_COURIER',
    pickupAvailable: false,
    warranty: 'Lifetime stitching quality assurance',
    returnPolicy: '3 Days return for tailoring modifications',
    weightKg: 1.8,
    dimensionsCm: 'Tailored Fit',
    isAuction: false,
    viewCount: 145,
    createdAt: '2026-07-10T08:15:00Z',
  },
  {
    id: 104,
    sellerId: 4,
    title: 'Nike Air Max 90 (Retro Premium)',
    description: 'Stunning streetwear icon shoes, retro premium edition. Size UK 9 (43 Euro). Worn only twice, clean sole with almost zero wear. Extremely comfortable cushions. Selling because it is half-size too small for me.',
    category: 'Fashion',
    brand: 'Nike',
    condition: ProductCondition.EXCELLENT,
    price: 95000,
    isNegotiable: true,
    quantity: 1,
    stockStatus: 'IN_STOCK',
    images: [
      'https://picsum.photos/seed/nikeair/600/600',
      'https://picsum.photos/seed/nikeair_2/600/600',
    ],
    barcode: '194274719234',
    deliveryMethod: 'GOODSALE_PARTNER',
    pickupAvailable: true,
    warranty: 'None',
    returnPolicy: 'No return, check fit on pickup',
    weightKg: 0.85,
    dimensionsCm: '33 x 21 x 12 cm',
    isAuction: false,
    viewCount: 88,
    createdAt: '2026-07-11T02:10:00Z',
  },
  {
    id: 105,
    sellerId: 1,
    title: 'Vintage Mercedes Benz W123 (Restored Collector Edition)',
    description: 'Iconic classic 1982 Mercedes-Benz 230E completely restored with genuine Mercedes classic parts. Original dashboard, working vintage dashboard dials, factory air conditioning blowing cold, automatic transmission, retro gold alloy wheels. Runs smoothly in Lagos traffic without overheating. True collector gold.',
    category: 'Vehicles',
    brand: 'Mercedes-Benz',
    condition: ProductCondition.GOOD,
    price: 8500000,
    isNegotiable: true,
    quantity: 1,
    stockStatus: 'IN_STOCK',
    images: [
      'https://picsum.photos/seed/vintagecar/600/600',
      'https://picsum.photos/seed/vintagecar_2/600/600',
    ],
    barcode: '882310239103',
    deliveryMethod: 'SELLER_DELIVERY',
    pickupAvailable: true,
    warranty: 'Engine block guaranteed for 30 days',
    returnPolicy: 'Sold as-is, view physical car before escrow payout',
    weightKg: 1420.0,
    dimensionsCm: '472 x 178 x 143 cm',
    isAuction: true,
    viewCount: 1512,
    createdAt: '2026-07-08T11:00:00Z',
  }
];

const INITIAL_AUCTIONS: Auction[] = [];
const OLD_INITIAL_AUCTIONS: any[] = [
  {
    id: 1,
    productId: 102, // MacBook
    startingBid: 1800000,
    reservePrice: 2200000,
    buyNowPrice: 2450000,
    endsAt: '2026-07-12T18:00:00Z',
    isActive: true,
  },
  {
    id: 2,
    productId: 105, // Mercedes Benz
    startingBid: 6500000,
    reservePrice: 8000000,
    buyNowPrice: 8500000,
    endsAt: '2026-07-14T12:00:00Z',
    isActive: true,
  },
];

const INITIAL_BIDS: Bid[] = [];
const OLD_INITIAL_BIDS: any[] = [
  {
    id: 1,
    auctionId: 1, // Macbook
    userId: 1,
    username: 'hamzadev',
    userAvatar: 'https://picsum.photos/seed/hamza/50',
    amount: 1950000,
    createdAt: '2026-07-11T12:30:00Z',
  },
  {
    id: 2,
    auctionId: 1,
    userId: 4,
    username: 'sandra_beauty',
    userAvatar: 'https://picsum.photos/seed/sandra/50',
    amount: 2100000,
    createdAt: '2026-07-11T13:45:00Z',
  },
];

const INITIAL_CHATS: ChatRoom[] = [];
const OLD_INITIAL_CHATS: any[] = [
  {
    id: 1,
    buyerId: 1,
    sellerId: 3,
    productId: 101, // iPhone
    productTitle: 'iPhone 15 Pro Max (Grade A++ UK Used)',
    productPrice: 1350000,
    productImage: 'https://picsum.photos/seed/iphone15pro/150',
    sellerName: 'Alaba Tech & Electronics Hub',
    buyerName: 'Hamza Ibrahim',
    lastMessage: 'Is this negotiable? I am ready to close at ₦1,300,000.',
    lastMessageTime: '10:45 AM',
  },
];

const INITIAL_MESSAGES: Message[] = [];
const OLD_INITIAL_MESSAGES: any[] = [
  {
    id: 1,
    roomId: 1,
    senderId: 3,
    messageText: 'Welcome to Alaba Tech Hub. Yes, this device is available and 100% genuine Grade-A.',
    createdAt: '2026-07-11T10:40:00Z',
  },
  {
    id: 2,
    roomId: 1,
    senderId: 1,
    messageText: 'Is this negotiable? I am ready to close at ₦1,300,000.',
    createdAt: '2026-07-11T10:45:00Z',
  },
];

const INITIAL_REVIEWS: Review[] = [];
const OLD_INITIAL_REVIEWS: any[] = [
  {
    id: 1,
    orderId: 9001,
    reviewerId: 1,
    reviewerName: 'Hamza Ibrahim',
    reviewerPhoto: 'https://picsum.photos/seed/hamza/50',
    revieweeId: 3,
    rating: 5,
    comment: 'Flawless escrow delivery! I received my UK-used MacBook exactly as described, checked the specs, and unlocked the delivery PIN. Super safe process!',
    isHelpfulVotes: 8,
    createdAt: '2026-07-05T14:00:00Z',
  },
  {
    id: 2,
    orderId: 9002,
    reviewerId: 4,
    reviewerName: 'Sandra Edet',
    reviewerPhoto: 'https://picsum.photos/seed/sandra/50',
    revieweeId: 2,
    rating: 5,
    comment: 'The traditional handwoven Aso-Oke Agbada fits my husband perfectly. Fatima tailored it beautifully. Royal Gold looks spectacular!',
    isHelpfulVotes: 4,
    createdAt: '2026-07-06T11:20:00Z',
  },
];

const INITIAL_VERIFICATIONS: IdentityVerification[] = [];
const OLD_INITIAL_VERIFICATIONS: any[] = [
  {
    id: 1,
    userId: 2,
    fullName: 'Fatima Abubakar',
    documentType: DocumentType.PASSPORT,
    documentNumber: 'A12048938',
    documentImageUrl: 'https://picsum.photos/seed/passport/400/250',
    selfieImageUrl: 'https://picsum.photos/seed/fatima_selfie/200/200',
    proofOfAddressUrl: 'https://picsum.photos/seed/utility_bill/400/500',
    status: VerificationStatus.APPROVED,
    adminNotes: 'Passport verified successfully. Gold Verified Seller status issued.',
    createdAt: '2026-07-01T09:00:00Z',
  },
  {
    id: 2,
    userId: 4,
    fullName: 'Sandra Edet',
    documentType: DocumentType.NIN,
    documentNumber: '49382103841',
    documentImageUrl: 'https://picsum.photos/seed/nin/400/250',
    selfieImageUrl: 'https://picsum.photos/seed/sandra_selfie/200/200',
    proofOfAddressUrl: 'https://picsum.photos/seed/sandra_bill/400/500',
    status: VerificationStatus.PENDING,
    createdAt: '2026-07-11T12:00:00Z',
  },
];

const INITIAL_ORDERS: Order[] = [];
const OLD_INITIAL_ORDERS: any[] = [
  {
    id: 2001,
    orderNumber: 'GS-2026-000001',
    buyerId: 1,
    sellerId: 3,
    productId: 101, // iPhone
    productTitle: 'iPhone 15 Pro Max (Grade A++ UK Used)',
    productImage: 'https://picsum.photos/seed/iphone15pro/150',
    totalAmount: 1362000, // including delivery and tax
    discountAmount: 0,
    deliveryFee: 10000,
    taxAmount: 2000,
    paymentMethod: 'CARD',
    deliveryMethod: 'GOODSALE_PARTNER',
    deliveryAddress: 'Block B2, Phase 1, Gbagada Estate',
    deliveryCity: 'Gbagada',
    deliveryState: 'Lagos',
    deliveryPin: '593842',
    qrCodeToken: 'QR-TOKEN-GS-0001',
    status: OrderStatus.PAID_ESCROW,
    goodPointsUsed: 0,
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-07-11T10:05:00Z',
  },
  {
    id: 2002,
    orderNumber: 'GS-2026-000002',
    buyerId: 1,
    sellerId: 2,
    productId: 103, // Agbada
    productTitle: 'Premium Handwoven Aso Oke Agbada Set',
    productImage: 'https://picsum.photos/seed/agbada/150',
    totalAmount: 195000,
    discountAmount: 0,
    deliveryFee: 12000,
    taxAmount: 3000,
    paymentMethod: 'BANK_TRANSFER',
    deliveryMethod: 'THIRD_PARTY_COURIER',
    deliveryAddress: 'Block B2, Phase 1, Gbagada Estate',
    deliveryCity: 'Gbagada',
    deliveryState: 'Lagos',
    deliveryPin: '821302',
    qrCodeToken: 'QR-TOKEN-GS-0002',
    status: OrderStatus.SHIPPED,
    goodPointsUsed: 0,
    createdAt: '2026-07-10T11:00:00Z',
    updatedAt: '2026-07-10T14:00:00Z',
  },
];

const INITIAL_ESCROWS: Escrow[] = [];
const OLD_INITIAL_ESCROWS: any[] = [
  {
    id: 1,
    orderId: 2001,
    heldAmount: 1350000,
    isReleased: false,
    isRefunded: false,
  },
  {
    id: 2,
    orderId: 2002,
    heldAmount: 180000,
    isReleased: false,
    isRefunded: false,
  },
];

const INITIAL_DISPUTES: Dispute[] = [];
const OLD_INITIAL_DISPUTES: any[] = [
  {
    id: 1,
    orderId: 2002,
    orderNumber: 'GS-2026-000002',
    openedById: 1,
    openedByName: 'Hamza Ibrahim',
    reason: 'Sizing mismatch on tailoring parameters. Flowing Agbada outer robe sleeves are tailored 4 inches shorter than typical specifications. Opened for tailoring corrections.',
    evidenceUrl: 'https://picsum.photos/seed/dispute_evidence/600/400',
    resolution: 'PENDING',
    createdAt: '2026-07-11T13:00:00Z',
  },
];

const INITIAL_NOTIFICATIONS: Notification[] = [];
const OLD_INITIAL_NOTIFICATIONS: any[] = [
  {
    id: 1,
    userId: 1,
    title: 'Escrow Payment Secured',
    message: 'Your payment for Order GS-2026-000001 (iPhone 15 Pro Max) has been locked in GoodSale Escrow. Your Delivery PIN is: 593842. Only reveal it to the seller upon receiving and inspecting your package!',
    type: 'ORDER',
    isRead: false,
    createdAt: '2026-07-11T10:05:00Z',
  },
  {
    id: 2,
    userId: 3,
    title: 'New Escrow Order Received',
    message: 'Buyer Hamza Ibrahim has paid ₦1,350,000 into Escrow. Please pack and ship "iPhone 15 Pro Max" via GoodSale Delivery Partner.',
    type: 'ORDER',
    isRead: false,
    createdAt: '2026-07-11T10:05:00Z',
  },
  {
    id: 3,
    userId: 1,
    title: 'Outbid Alert',
    message: 'You have been outbid on "MacBook Pro 14" M3". Current highest bid is ₦2,100,000 by sandra_beauty. Increase your bid to win!',
    type: 'BID',
    isRead: false,
    createdAt: '2026-07-11T13:45:00Z',
  },
];

const INITIAL_GOODPOINTS: GoodPointsTransaction[] = [];
const OLD_INITIAL_GOODPOINTS: any[] = [
  { id: 1, userId: 1, points: 100, reason: 'NIN Profile Verification Bonus', createdAt: '2026-07-01T09:00:00Z' },
  { id: 2, userId: 1, points: 50, reason: 'Referees (Fatima Abubakar) First Successful Sale', createdAt: '2026-07-05T14:05:00Z' },
  { id: 3, userId: 1, points: 200, reason: 'Earned on High-quality Product Review Submission', createdAt: '2026-07-05T14:00:00Z' },
];

const INITIAL_REFERRALS: Referral[] = [];
const OLD_INITIAL_REFERRALS: any[] = [
  {
    id: 1,
    referrerId: 1,
    refereeId: 2,
    refereeName: 'Fatima Abubakar',
    status: 'FIRST_ORDER_COMPLETED',
    pointsReward: 150,
    createdAt: '2026-07-01T09:00:00Z',
  },
];

const INITIAL_SAFEMEET_LOCATIONS: SafeMeetLocation[] = [
  {
    id: 1,
    name: 'Ikeja City Mall Public Safe Zone',
    address: 'Obafemi Awolowo Way, Ikeja, Lagos',
    lat: 6.5971,
    lng: 3.3551,
    photoUrl: 'https://picsum.photos/seed/ikejamall/400/250',
    openingHours: '09:00 AM - 09:00 PM',
    safetyRating: 4.9,
    distanceKm: 2.3,
    travelTimeMinutes: 12,
    parkingAvailable: true,
    accessibility: 'Wheelchair accessible, CCTV monitored, security guard on-site',
    isFavorite: true
  },
  {
    id: 2,
    name: 'GoodSale Hub - Wuse II Partner Center',
    address: 'Adetokunbo Ademola Crescent, Wuse II, Abuja',
    lat: 9.0772,
    lng: 7.4789,
    photoUrl: 'https://picsum.photos/seed/abuja_hub/400/250',
    openingHours: '08:00 AM - 06:00 PM',
    safetyRating: 5.0,
    distanceKm: 4.1,
    travelTimeMinutes: 15,
    parkingAvailable: true,
    accessibility: 'Private parking lot, biometric security, verified locker access'
  },
  {
    id: 3,
    name: 'Police Station Zone (Wuse Zone 3 Area)',
    address: 'Herbert Macaulay Way, Wuse Zone 3, Abuja',
    lat: 9.0664,
    lng: 7.4646,
    photoUrl: 'https://picsum.photos/seed/policestation/400/250',
    openingHours: '24 Hours',
    safetyRating: 4.8,
    distanceKm: 1.2,
    travelTimeMinutes: 5,
    parkingAvailable: true,
    accessibility: 'Active police presence, CCTV surveillance, public parking space',
    isFavorite: false
  },
  {
    id: 4,
    name: 'Mega Plaza SafeMeet Partner Cafe',
    address: 'Idowu Martins Street, Victoria Island, Lagos',
    lat: 6.4294,
    lng: 3.4215,
    photoUrl: 'https://picsum.photos/seed/megaplaza/400/250',
    openingHours: '07:30 AM - 10:00 PM',
    safetyRating: 4.7,
    distanceKm: 5.8,
    travelTimeMinutes: 20,
    parkingAvailable: true,
    accessibility: 'Free WiFi, indoor seating, premium security patrol'
  }
];

const INITIAL_SAFEMEET_MEETUPS: SafeMeetMeetup[] = [];

const INITIAL_FOLLOWERS: FollowerRelation[] = [];

const INITIAL_BUNDLES: ProductBundle[] = [];

// Unified DB State interface
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
  currentUser: User | null;
}

const STORE_KEY = 'goodsale_relational_database_v1';
const STORE_CHANGE_EVENT = 'goodsale_db_state_change';

// Global variable for server compatibility
let dbInstance: GoodSaleDBState | null = null;

export function getDBState(): GoodSaleDBState {
  if (typeof window === 'undefined') {
    return {
      users: INITIAL_USERS,
      profiles: INITIAL_PROFILES,
      businesses: INITIAL_BUSINESSES,
      products: INITIAL_PRODUCTS,
      auctions: INITIAL_AUCTIONS,
      bids: INITIAL_BIDS,
      orders: INITIAL_ORDERS,
      escrows: INITIAL_ESCROWS,
      disputes: INITIAL_DISPUTES,
      chatRooms: INITIAL_CHATS,
      messages: INITIAL_MESSAGES,
      reviews: INITIAL_REVIEWS,
      verifications: INITIAL_VERIFICATIONS,
      goodPoints: INITIAL_GOODPOINTS,
      referrals: INITIAL_REFERRALS,
      notifications: INITIAL_NOTIFICATIONS,
      safeMeetLocations: INITIAL_SAFEMEET_LOCATIONS,
      safeMeetMeetups: INITIAL_SAFEMEET_MEETUPS,
      followerRelations: INITIAL_FOLLOWERS,
      productBundles: INITIAL_BUNDLES,
      currentUser: INITIAL_USERS[0] || null, // Defaults to GUEST/null if empty
    };
  }

  if (dbInstance) return dbInstance;

  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      dbInstance = JSON.parse(raw);
      // Ensure new arrays are initialized in existing stores
      if (!dbInstance!.safeMeetLocations) dbInstance!.safeMeetLocations = INITIAL_SAFEMEET_LOCATIONS;
      if (!dbInstance!.safeMeetMeetups) dbInstance!.safeMeetMeetups = [];
      if (!dbInstance!.followerRelations) dbInstance!.followerRelations = INITIAL_FOLLOWERS;
      if (!dbInstance!.productBundles) dbInstance!.productBundles = INITIAL_BUNDLES;
      return dbInstance!;
    }
  } catch (e) {
    console.error('Failed to parse GoodSale local storage DB:', e);
  }

  // Fallback / Initial load
  const initial: GoodSaleDBState = {
    users: INITIAL_USERS,
    profiles: INITIAL_PROFILES,
    businesses: INITIAL_BUSINESSES,
    products: INITIAL_PRODUCTS,
    auctions: INITIAL_AUCTIONS,
    bids: INITIAL_BIDS,
    orders: INITIAL_ORDERS,
    escrows: INITIAL_ESCROWS,
    disputes: INITIAL_DISPUTES,
    chatRooms: INITIAL_CHATS,
    messages: INITIAL_MESSAGES,
    reviews: INITIAL_REVIEWS,
    verifications: INITIAL_VERIFICATIONS,
    goodPoints: INITIAL_GOODPOINTS,
    referrals: INITIAL_REFERRALS,
    notifications: INITIAL_NOTIFICATIONS,
    safeMeetLocations: INITIAL_SAFEMEET_LOCATIONS,
    safeMeetMeetups: INITIAL_SAFEMEET_MEETUPS,
    followerRelations: INITIAL_FOLLOWERS,
    productBundles: INITIAL_BUNDLES,
    currentUser: INITIAL_USERS[0] || null, // Starts as GUEST/null if empty
  };

  saveDBState(initial);
  return dbInstance!;
}

export function saveDBState(state: GoodSaleDBState) {
  dbInstance = state;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent(STORE_CHANGE_EVENT));

      // Sync to standard durable server database
      fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      }).catch(err => console.error('Failed to sync state to server database:', err));
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }
}

// Database helper operations supporting full relational workflow
export const dbOperations = {
  // Authentication Actions
  registerUser(fullName: string, username: string, email: string, phoneNumber: string, role: UserRole, referralCodeUsed?: string) {
    const state = getDBState();
    const newId = Math.max(...state.users.map((u) => u.id), 0) + 1;
    const refCode = `GS-${username.toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`;

    const newUser: User = {
      id: newId,
      fullName,
      username,
      email,
      phoneNumber,
      role: role || UserRole.BUYER,
      referralCode: refCode,
      trustScore: 100,
      sellerLevel: 'BRONZE',
      goodPoints: referralCodeUsed ? 100 : 50, // Welcome points
    };

    const newProfile: Profile = {
      userId: newId,
      photoUrl: `https://picsum.photos/seed/${username}/200`,
      coverUrl: `https://picsum.photos/seed/${username}_cover/800/300`,
      bio: `Proud GoodSale ${newUser.role.toLowerCase()}`,
      address: '',
      city: '',
      state: '',
      deliveryPreference: 'GOODSALE_PARTNER',
      pushEnabled: true,
      emailEnabled: true,
      smsEnabled: false,
    };

    state.users.push(newUser);
    state.profiles.push(newProfile);

    // Track referral if matched
    if (referralCodeUsed) {
      const referrer = state.users.find((u) => u.referralCode === referralCodeUsed);
      if (referrer) {
        newUser.referredById = referrer.id;
        const newReferral: Referral = {
          id: state.referrals.length + 1,
          referrerId: referrer.id,
          refereeId: newUser.id,
          refereeName: newUser.fullName,
          status: 'REGISTERED',
          pointsReward: 150,
          createdAt: new Date().toISOString(),
        };
        state.referrals.push(newReferral);

        // Notify referrer
        state.notifications.push({
          id: state.notifications.length + 1,
          userId: referrer.id,
          title: 'Referral Registered!',
          message: `${newUser.fullName} registered using your referral code. You will earn 150 GoodPoints as soon as they complete their first successful escrow order!`,
          type: 'POINTS',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
    }

    state.currentUser = newUser;
    saveDBState(state);
    return newUser;
  },

  loginUser(userId: number) {
    const state = getDBState();
    const user = state.users.find((u) => u.id === userId);
    if (user) {
      state.currentUser = user;
      // Daily Login Points check
      const lastLoginPoints = state.goodPoints.filter(p => p.userId === userId && p.reason.includes('Daily Login'));
      const todayString = new Date().toISOString().split('T')[0];
      const alreadyClaimed = lastLoginPoints.some(p => p.createdAt.startsWith(todayString));

      if (!alreadyClaimed) {
        user.goodPoints += 10;
        state.goodPoints.push({
          id: state.goodPoints.length + 1,
          userId: user.id,
          points: 10,
          reason: 'Daily Login Loyalty Reward',
          createdAt: new Date().toISOString(),
        });
        state.notifications.push({
          id: state.notifications.length + 1,
          userId: user.id,
          title: 'Loyalty Daily Points Claimed!',
          message: 'You received 10 GoodPoints for your daily login reward! Keep streak active to level up.',
          type: 'POINTS',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      saveDBState(state);
    }
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
  addProduct(
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
    auctionDurationHours: number = 24
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
  placeOrder(productId: number, deliveryAddress: string, deliveryCity: string, deliveryState: string, paymentMethod: string, deliveryMethod: string, usePoints: boolean = false) {
    const state = getDBState();
    if (!state.currentUser) return null;

    const product = state.products.find((p) => p.id === productId);
    if (!product) return null;

    const orderNumber = `GS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const deliveryPin = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit release pin

    const deliveryFee = deliveryMethod === 'GOODSALE_PARTNER' ? 10000 : deliveryMethod === 'THIRD_PARTY_COURIER' ? 12000 : product.pickupAvailable ? 0 : 5000;
    const taxAmount = Math.round(product.price * 0.015); // 1.5% commission/VAT

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

    const totalAmount = product.price + deliveryFee + taxAmount - pointsDiscount;

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
      paymentMethod,
      deliveryMethod,
      deliveryAddress,
      deliveryCity,
      deliveryState,
      deliveryPin,
      qrCodeToken: `QR-GS-${orderNumber}`,
      status: OrderStatus.PAID_ESCROW, // Escrow begins immediately paid
      goodPointsUsed: pointsUsed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add order
    state.orders.unshift(newOrder);

    // Add to Escrow Fund Ledger
    state.escrows.push({
      id: state.escrows.length + 1,
      orderId: newOrder.id,
      heldAmount: product.price,
      isReleased: false,
      isRefunded: false,
    });

    // Reduce product quantity
    product.quantity -= 1;
    if (product.quantity <= 0) {
      product.stockStatus = 'OUT_OF_STOCK';
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
  submitVerification(docType: DocumentType, docNum: string) {
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
      documentImageUrl: 'https://picsum.photos/seed/verification_doc/400/250',
      selfieImageUrl: state.profiles.find(p => p.userId === state.currentUser!.id)?.photoUrl || 'https://picsum.photos/seed/selfie/200/200',
      proofOfAddressUrl: 'https://picsum.photos/seed/utility/400/500',
      status: VerificationStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    state.verifications.push(newVer);
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
  sendMessage(roomId: number, text?: string, imgUrl?: string, videoUrl?: string, receiptDetails?: any, productDetails?: any) {
    const state = getDBState();
    if (!state.currentUser) return;

    const room = state.chatRooms.find((r) => r.id === roomId);
    if (!room) return;

    const newMsg: Message = {
      id: state.messages.length + 1,
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
    room.lastMessage = text || (imgUrl ? '📷 Sent an image' : videoUrl ? '🎥 Sent a video' : receiptDetails ? '🧾 Sent a receipt' : productDetails ? '📦 Shared a product preview' : 'Sent a attachment');
    room.lastMessageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    saveDBState(state);
  },

  getOrCreateChatRoom(productId: number) {
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
  const [db, setDb] = useState<GoodSaleDBState>(() => {
    return {
      users: INITIAL_USERS,
      profiles: INITIAL_PROFILES,
      businesses: INITIAL_BUSINESSES,
      products: INITIAL_PRODUCTS,
      auctions: INITIAL_AUCTIONS,
      bids: INITIAL_BIDS,
      orders: INITIAL_ORDERS,
      escrows: INITIAL_ESCROWS,
      disputes: INITIAL_DISPUTES,
      chatRooms: INITIAL_CHATS,
      messages: INITIAL_MESSAGES,
      reviews: INITIAL_REVIEWS,
      verifications: INITIAL_VERIFICATIONS,
      goodPoints: INITIAL_GOODPOINTS,
      referrals: INITIAL_REFERRALS,
      notifications: INITIAL_NOTIFICATIONS,
      safeMeetLocations: INITIAL_SAFEMEET_LOCATIONS,
      safeMeetMeetups: INITIAL_SAFEMEET_MEETUPS,
      followerRelations: INITIAL_FOLLOWERS,
      productBundles: INITIAL_BUNDLES,
      currentUser: INITIAL_USERS[0] || null,
    };
  });

  useEffect(() => {
    setDb(getDBState());

    // Pull from standard durable server database on load
    fetch('/api/db')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.state) {
          saveDBState(data.state);
        }
      })
      .catch(err => console.error('Failed to pull server database state:', err));

    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  return db;
}

