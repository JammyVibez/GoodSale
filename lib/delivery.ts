/**
 * Delivery lifecycle rules shared by the tracking UI and tests.
 *
 * These are convenience mirrors of the authoritative server-side rules in
 * `supabase/migrations/019_delivery_tracking.sql`. The backend is the only
 * place a transition is ever allowed — the UI uses this module to decide which
 * buttons to show and how to render the timeline.
 */
import type { Delivery, DeliveryEvent, DeliveryStatus } from './types';

/** Main happy-path sequence used to draw the progress timeline. */
export const DELIVERY_MAIN_PATH: DeliveryStatus[] = [
  'AWAITING_SELLER_PREPARATION',
  'READY_FOR_PICKUP',
  'AWAITING_RIDER',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/** Every status, in lifecycle order, including the failure branches. */
export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'AWAITING_SELLER_PREPARATION',
  'READY_FOR_PICKUP',
  'AWAITING_RIDER',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPTED',
  'DELIVERED',
  'FAILED_DELIVERY',
  'RETURNED_TO_SELLER',
  'CANCELLED',
];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  AWAITING_SELLER_PREPARATION: 'Awaiting Seller Preparation',
  READY_FOR_PICKUP: 'Ready for Pickup',
  AWAITING_RIDER: 'Awaiting Rider',
  RIDER_ASSIGNED: 'Rider Assigned',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  ARRIVED_AT_HUB: 'Arrived at Delivery Hub',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERY_ATTEMPTED: 'Delivery Attempted',
  DELIVERED: 'Delivered',
  FAILED_DELIVERY: 'Failed Delivery',
  RETURNED_TO_SELLER: 'Returned to Seller',
  CANCELLED: 'Cancelled',
};

export const DELIVERY_TERMINAL_STATUSES: DeliveryStatus[] = [
  'DELIVERED',
  'RETURNED_TO_SELLER',
  'CANCELLED',
];

/** Server-side transition map (kept in sync with `delivery_transition_allowed`). */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  AWAITING_SELLER_PREPARATION: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['AWAITING_RIDER', 'RIDER_ASSIGNED', 'CANCELLED'],
  AWAITING_RIDER: ['RIDER_ASSIGNED', 'CANCELLED'],
  RIDER_ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'FAILED_DELIVERY', 'RETURNED_TO_SELLER'],
  IN_TRANSIT: [
    'ARRIVED_AT_HUB',
    'OUT_FOR_DELIVERY',
    'DELIVERY_ATTEMPTED',
    'FAILED_DELIVERY',
    'RETURNED_TO_SELLER',
  ],
  ARRIVED_AT_HUB: ['OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'FAILED_DELIVERY', 'RETURNED_TO_SELLER'],
  OUT_FOR_DELIVERY: ['DELIVERY_ATTEMPTED', 'FAILED_DELIVERY', 'DELIVERED'],
  DELIVERY_ATTEMPTED: ['OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED_TO_SELLER'],
  FAILED_DELIVERY: ['OUT_FOR_DELIVERY', 'RETURNED_TO_SELLER', 'CANCELLED'],
  DELIVERED: [],
  RETURNED_TO_SELLER: [],
  CANCELLED: [],
};

export type DeliveryActorRole = 'BUYER' | 'SELLER' | 'RIDER' | 'ADMIN' | 'OPERATOR' | 'SYSTEM';

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === 'string' && DELIVERY_STATUSES.includes(value as DeliveryStatus);
}

export function deliveryStatusLabel(status: DeliveryStatus | string): string {
  return DELIVERY_STATUS_LABELS[status as DeliveryStatus] ?? String(status).replace(/_/g, ' ');
}

export function isDeliveryTerminal(status: DeliveryStatus): boolean {
  return DELIVERY_TERMINAL_STATUSES.includes(status);
}

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return (DELIVERY_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Which statuses this actor may set next. Riders only ever see their own
 * operational steps; sellers can only signal readiness; nobody can mark a
 * delivery DELIVERED by hand (the buyer's one-time code is required).
 */
export function nextDeliveryStatuses(
  delivery: Pick<Delivery, 'status'>,
  role: DeliveryActorRole
): DeliveryStatus[] {
  if (isDeliveryTerminal(delivery.status)) return [];
  const allowed = DELIVERY_TRANSITIONS[delivery.status] ?? [];

  if (role === 'ADMIN' || role === 'OPERATOR') {
    return allowed.filter((status) => status !== 'DELIVERED');
  }

  if (role === 'SELLER') {
    return delivery.status === 'AWAITING_SELLER_PREPARATION' ? ['READY_FOR_PICKUP'] : [];
  }

  if (role === 'RIDER') {
    const riderSteps: DeliveryStatus[] = [
      'PICKED_UP',
      'IN_TRANSIT',
      'ARRIVED_AT_HUB',
      'OUT_FOR_DELIVERY',
      'DELIVERY_ATTEMPTED',
      'FAILED_DELIVERY',
    ];
    return allowed.filter((status) => riderSteps.includes(status));
  }

  return [];
}

/**
 * Position on the main path, or -1 when the delivery left the happy path
 * (failed, returned or cancelled).
 */
export function deliveryProgressIndex(status: DeliveryStatus): number {
  const index = DELIVERY_MAIN_PATH.indexOf(status);
  if (index >= 0) return index;
  return status === 'DELIVERY_ATTEMPTED' ? DELIVERY_MAIN_PATH.indexOf('OUT_FOR_DELIVERY') : -1;
}

/**
 * A delivery is delayed when its genuine ETA date has passed without delivery,
 * or when it has sat without any update for more than five days.
 */
export function isDeliveryDelayed(
  delivery: Pick<Delivery, 'status' | 'estimatedDeliveryDate' | 'updatedAt' | 'createdAt'>,
  now: Date = new Date()
): boolean {
  if (isDeliveryTerminal(delivery.status)) return false;

  if (delivery.estimatedDeliveryDate) {
    const eta = new Date(
      delivery.estimatedDeliveryDate.length <= 10
        ? `${delivery.estimatedDeliveryDate}T23:59:59`
        : delivery.estimatedDeliveryDate
    );
    if (!Number.isNaN(eta.getTime()) && eta.getTime() < now.getTime()) return true;
  }

  const lastTouch = new Date(delivery.updatedAt || delivery.createdAt);
  if (Number.isNaN(lastTouch.getTime())) return false;
  return now.getTime() - lastTouch.getTime() > 5 * 24 * 60 * 60 * 1000;
}

export function isDeliveryFailed(delivery: Pick<Delivery, 'status'>): boolean {
  return delivery.status === 'FAILED_DELIVERY' || delivery.status === 'RETURNED_TO_SELLER';
}

/** Earliest → latest event history for a delivery. */
export function deliveryTimeline(
  events: DeliveryEvent[],
  deliveryId: number
): DeliveryEvent[] {
  return events
    .filter((event) => event.deliveryId === deliveryId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Standard ETA text sourced from the stored shipping snapshot. */
export function deliveryEtaText(
  delivery: Pick<Delivery, 'feeSnapshot'>
): string | null {
  const min = delivery.feeSnapshot?.etaMinDays;
  const max = delivery.feeSnapshot?.etaMaxDays;
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  if (min <= 0 && max <= 0) return null;
  return min === max ? `${min} day${min === 1 ? '' : 's'}` : `${min}–${max} days`;
}
