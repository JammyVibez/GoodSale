/**
 * GoodSale Seller Trust Score — transparent, reproducible, no hidden inputs.
 *
 * Five weighted factors, all derived from records the marketplace already keeps:
 *   1. Verification     20 — identity/business checks passed
 *   2. Fulfilment       25 — delivered orders vs. everything that ended badly
 *   3. Ratings          25 — average of escrow-backed reviews
 *   4. Engagement       15 — share of buyer conversations the seller answered
 *   5. Reliability      15 — 1 − cancellation/dispute rate
 *
 * Scores are computed from live data (never stored as a mutable vanity number),
 * so buyers and admins can see exactly why a seller ranks where they do.
 */
import type { GoodSaleDBState } from './types';
import { OrderStatus, VerificationStatus, UserRole } from './types';

export interface TrustFactor {
  key: 'verification' | 'fulfilment' | 'ratings' | 'engagement' | 'reliability';
  label: string;
  weight: number;
  /** 0–1 ratio used to earn the weight. */
  ratio: number;
  points: number;
  detail: string;
}

export interface TrustScore {
  score: number;
  band: 'NEW' | 'BUILDING' | 'TRUSTED' | 'EXCELLENT';
  bandLabel: string;
  completedOrders: number;
  cancelledOrders: number;
  disputes: number;
  averageRating: number;
  reviewCount: number;
  responseRate: number;
  factors: TrustFactor[];
}

const round = (value: number) => Math.round(value * 10) / 10;

export function computeSellerTrust(state: GoodSaleDBState, sellerId: number): TrustScore {
  const seller = state.users.find((u) => u.id === sellerId);
  const sellerOrders = state.orders.filter((o) => o.sellerId === sellerId);
  const completed = sellerOrders.filter((o) => o.status === OrderStatus.DELIVERED_SUCCESS);
  const cancelled = sellerOrders.filter((o) => o.status === OrderStatus.CANCELLED);
  const disputes = sellerOrders.filter((o) => o.status === OrderStatus.DISPUTED);
  const refunded = sellerOrders.filter((o) => o.status === OrderStatus.REFUNDED);

  const reviews = state.reviews.filter((r) => r.revieweeId === sellerId && r.rating > 0);
  const averageRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  // Fulfilment: delivered vs. every order that reached a terminal bad state.
  const badEndings = cancelled.length + disputes.length + refunded.length;
  const fulfilmentRatio = completed.length + badEndings === 0
    ? 0
    : completed.length / (completed.length + badEndings);

  // Engagement: conversations about this seller's listings that they answered.
  const rooms = state.chatRooms.filter((room) =>
    state.products.some((p) => p.id === room.productId && p.sellerId === sellerId)
  );
  const buyerInitiated = rooms.filter((room) =>
    state.messages.some((m) => m.roomId === room.id && m.senderId !== sellerId)
  );
  const answered = buyerInitiated.filter((room) =>
    state.messages.some((m) => m.roomId === room.id && m.senderId === sellerId)
  );
  const responseRate = buyerInitiated.length ? answered.length / buyerInitiated.length : 0;

  const isVerified = !!seller && (
    seller.role === UserRole.VERIFIED_SELLER || seller.role === UserRole.VERIFIED_BUSINESS
  );
  const pendingApplication = state.verifications.some(
    (v) => v.userId === sellerId && v.status === VerificationStatus.PENDING
  );
  const verificationRatio = isVerified ? 1 : pendingApplication ? 0.5 : 0;

  const reliabilityRatio = sellerOrders.length
    ? Math.max(0, 1 - (cancelled.length + disputes.length) / sellerOrders.length)
    : 0;

  const factors: TrustFactor[] = [
    {
      key: 'verification',
      label: 'Verification',
      weight: 20,
      ratio: verificationRatio,
      points: round(verificationRatio * 20),
      detail: isVerified ? 'Identity and store documents verified' : pendingApplication ? 'Verification under review' : 'Not verified yet',
    },
    {
      key: 'fulfilment',
      label: 'Fulfilment',
      weight: 25,
      ratio: fulfilmentRatio,
      points: round(fulfilmentRatio * 25),
      detail: completed.length
        ? `${completed.length} delivered · ${badEndings} cancelled or disputed`
        : 'No completed orders yet',
    },
    {
      key: 'ratings',
      label: 'Ratings',
      weight: 25,
      ratio: averageRating ? averageRating / 5 : 0,
      points: round((averageRating ? averageRating / 5 : 0) * 25),
      detail: reviews.length ? `${averageRating.toFixed(1)} from ${reviews.length} reviews` : 'No reviews yet',
    },
    {
      key: 'engagement',
      label: 'Engagement',
      weight: 15,
      ratio: responseRate,
      points: round(responseRate * 15),
      detail: buyerInitiated.length
        ? `Replied in ${answered.length} of ${buyerInitiated.length} conversations`
        : 'No buyer conversations yet',
    },
    {
      key: 'reliability',
      label: 'Reliability',
      weight: 15,
      ratio: reliabilityRatio,
      points: round(reliabilityRatio * 15),
      detail: sellerOrders.length
        ? `${cancelled.length} cancellations · ${disputes.length} disputes`
        : 'No order history yet',
    },
  ];

  const score = Math.min(100, Math.round(factors.reduce((sum, f) => sum + f.points, 0)));
  const band: TrustScore['band'] =
    score >= 80 ? 'EXCELLENT' : score >= 60 ? 'TRUSTED' : score >= 35 ? 'BUILDING' : 'NEW';
  const bandLabel =
    band === 'EXCELLENT' ? 'Excellent' : band === 'TRUSTED' ? 'Trusted' : band === 'BUILDING' ? 'Building' : 'New seller';

  return {
    score,
    band,
    bandLabel,
    completedOrders: completed.length,
    cancelledOrders: cancelled.length,
    disputes: disputes.length,
    averageRating: Number(averageRating.toFixed(1)),
    reviewCount: reviews.length,
    responseRate: Math.round(responseRate * 100),
    factors,
  };
}

/** Risk signals used by the admin safety queue. */
export function computeAccountRisk(state: GoodSaleDBState, userId: number) {
  const reportsAgainst = state.reports.filter(
    (r) => r.status !== 'RESOLVED' && (
      (r.targetType === 'USER' && r.targetId === userId) ||
      (r.targetType === 'PRODUCT' && state.products.some((p) => p.id === r.targetId && p.sellerId === userId))
    )
  );
  const orders = state.orders.filter((o) => o.sellerId === userId);
  const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED).length;
  const disputes = orders.filter((o) => o.status === OrderStatus.DISPUTED).length;
  const reviews = state.reviews.filter((r) => r.revieweeId === userId && r.rating > 0);
  const lowRatings = reviews.filter((r) => r.rating <= 2).length;

  const signals: string[] = [];
  let points = 0;
  if (reportsAgainst.length >= 2) { points += 2; signals.push(`${reportsAgainst.length} open reports`); }
  else if (reportsAgainst.length === 1) { points += 1; signals.push('1 open report'); }
  if (disputes >= 2) { points += 2; signals.push(`${disputes} disputes`); }
  else if (disputes === 1) { points += 1; signals.push('1 dispute'); }
  if (orders.length >= 5 && cancelled / orders.length >= 0.3) {
    points += 2;
    signals.push(`${cancelled} of ${orders.length} orders cancelled`);
  }
  if (reviews.length >= 4 && lowRatings / reviews.length >= 0.4) {
    points += 2;
    signals.push(`${lowRatings} low ratings`);
  }
  if (state.users.find((u) => u.id === userId)?.isSuspended) {
    points += 3;
    signals.push('Account suspended');
  }

  const level = points >= 5 ? 'HIGH' : points >= 3 ? 'MEDIUM' : points >= 1 ? 'LOW' : 'NONE';
  return { level, points, signals, openReports: reportsAgainst.length, disputes, cancelledOrders: cancelled };
}
