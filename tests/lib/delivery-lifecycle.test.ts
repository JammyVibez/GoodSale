import { describe, expect, it } from 'vitest';
import {
  DELIVERY_MAIN_PATH,
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  canTransitionDelivery,
  deliveryEtaText,
  deliveryProgressIndex,
  deliveryStatusLabel,
  deliveryTimeline,
  isDeliveryDelayed,
  isDeliveryFailed,
  isDeliveryTerminal,
  nextDeliveryStatuses,
} from '@/lib/delivery';
import { mapDelivery } from '@/lib/data/mappers';
import type { Delivery, DeliveryEvent, DeliveryStatus } from '@/lib/types';

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 1,
    orderId: 100,
    deliveryNumber: 'DLV-GS-2026-000100',
    trackingId: 'GSD-000000001',
    buyerId: 10,
    sellerId: 20,
    pickupAddress: '12 Allen Ave',
    pickupCity: 'Ikeja',
    pickupState: 'Lagos State',
    deliveryAddress: '5 Admiralty Way',
    deliveryCity: 'Lekki',
    deliveryState: 'Lagos State',
    deliveryPhone: '08030000000',
    deliveryMethod: 'GOODSALE_PARTNER',
    serviceType: 'STANDARD',
    deliveryFee: 1500,
    routeProvider: '',
    routeIsEstimate: true,
    status: 'AWAITING_SELLER_PREPARATION',
    courierName: '',
    trackingNumber: '',
    deliveryInstructions: '',
    failureReason: '',
    cancellationReason: '',
    assignmentStatus: 'UNASSIGNED',
    assignmentMode: 'MANUAL',
    autoOfferRound: 0,
    attemptCount: 0,
    courierProvider: '',
    courierExternalId: '',
    courierStatus: '',
    courierLastError: '',
    courierSyncAttempts: 0,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('delivery lifecycle — vocabulary', () => {
  it('exposes all thirteen required statuses exactly once', () => {
    expect(DELIVERY_STATUSES).toHaveLength(13);
    expect(new Set(DELIVERY_STATUSES).size).toBe(13);
    for (const status of DELIVERY_STATUSES) {
      expect(DELIVERY_STATUS_LABELS[status]).toBeTruthy();
      expect(deliveryStatusLabel(status)).not.toMatch(/_/);
    }
  });

  it('draws the main progress path from seller preparation to delivered', () => {
    expect(DELIVERY_MAIN_PATH[0]).toBe('AWAITING_SELLER_PREPARATION');
    expect(DELIVERY_MAIN_PATH[DELIVERY_MAIN_PATH.length - 1]).toBe('DELIVERED');
    expect(deliveryProgressIndex('AWAITING_SELLER_PREPARATION')).toBe(0);
    expect(deliveryProgressIndex('OUT_FOR_DELIVERY')).toBe(7);
    expect(deliveryProgressIndex('DELIVERED')).toBe(8);
    expect(deliveryProgressIndex('DELIVERY_ATTEMPTED')).toBe(7);
    expect(deliveryProgressIndex('FAILED_DELIVERY')).toBe(-1);
  });
});

describe('delivery lifecycle — role permissions', () => {
  it('lets the seller only signal readiness and never mark delivered', () => {
    const current = delivery({ status: 'AWAITING_SELLER_PREPARATION' });
    expect(nextDeliveryStatuses(current, 'SELLER')).toEqual(['READY_FOR_PICKUP']);
    expect(nextDeliveryStatuses(delivery({ status: 'READY_FOR_PICKUP' }), 'SELLER')).toEqual([]);
    expect(nextDeliveryStatuses(delivery({ status: 'OUT_FOR_DELIVERY' }), 'SELLER')).toEqual([]);
    expect(nextDeliveryStatuses(current, 'SELLER')).not.toContain('DELIVERED');
  });

  it('gives riders only operational steps, never DELIVERED or cancellation', () => {
    const assigned = nextDeliveryStatuses(delivery({ status: 'RIDER_ASSIGNED' }), 'RIDER');
    expect(assigned).toContain('PICKED_UP');
    expect(assigned).not.toContain('DELIVERED');
    expect(assigned).not.toContain('CANCELLED');

    const out = nextDeliveryStatuses(delivery({ status: 'OUT_FOR_DELIVERY' }), 'RIDER');
    expect(out).toEqual(['DELIVERY_ATTEMPTED', 'FAILED_DELIVERY']);
    expect(out).not.toContain('DELIVERED');
  });

  it('requires the one-time code instead of letting admins force DELIVERED', () => {
    const transitions = nextDeliveryStatuses(delivery({ status: 'OUT_FOR_DELIVERY' }), 'ADMIN');
    expect(transitions).not.toContain('DELIVERED');
    expect(transitions).toContain('DELIVERY_ATTEMPTED');
    expect(canTransitionDelivery('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('gives buyers no direct lifecycle transitions', () => {
    expect(nextDeliveryStatuses(delivery({ status: 'AWAITING_SELLER_PREPARATION' }), 'BUYER')).toEqual([]);
    expect(nextDeliveryStatuses(delivery({ status: 'READY_FOR_PICKUP' }), 'BUYER')).toEqual([]);
  });

  it('treats delivered, returned and cancelled as terminal', () => {
    for (const status of ['DELIVERED', 'RETURNED_TO_SELLER', 'CANCELLED'] as DeliveryStatus[]) {
      expect(isDeliveryTerminal(status)).toBe(true);
      expect(nextDeliveryStatuses(delivery({ status }), 'ADMIN')).toEqual([]);
    }
    expect(isDeliveryTerminal('OUT_FOR_DELIVERY')).toBe(false);
  });
});

describe('delivery lifecycle — transition validation', () => {
  it('allows the normal forward flow', () => {
    const path: DeliveryStatus[] = [
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
    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionDelivery(path[index], path[index + 1])).toBe(true);
    }
  });

  it('rejects skipped or backwards transitions', () => {
    expect(canTransitionDelivery('AWAITING_SELLER_PREPARATION', 'DELIVERED')).toBe(false);
    expect(canTransitionDelivery('AWAITING_SELLER_PREPARATION', 'PICKED_UP')).toBe(false);
    expect(canTransitionDelivery('DELIVERED', 'IN_TRANSIT')).toBe(false);
    expect(canTransitionDelivery('CANCELLED', 'OUT_FOR_DELIVERY')).toBe(false);
    expect(canTransitionDelivery('READY_FOR_PICKUP', 'DELIVERED')).toBe(false);
  });

  it('supports failed and returned branches', () => {
    expect(canTransitionDelivery('OUT_FOR_DELIVERY', 'FAILED_DELIVERY')).toBe(true);
    expect(canTransitionDelivery('FAILED_DELIVERY', 'RETURNED_TO_SELLER')).toBe(true);
    expect(canTransitionDelivery('FAILED_DELIVERY', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(isDeliveryFailed(delivery({ status: 'FAILED_DELIVERY' }))).toBe(true);
    expect(isDeliveryFailed(delivery({ status: 'RETURNED_TO_SELLER' }))).toBe(true);
    expect(isDeliveryFailed(delivery({ status: 'OUT_FOR_DELIVERY' }))).toBe(false);
  });
});

describe('delivery lifecycle — tracking history and ETA', () => {
  const events: DeliveryEvent[] = [
    { id: 3, deliveryId: 1, status: 'IN_TRANSIT', note: 'On the way', actorRole: 'RIDER', createdAt: '2026-01-02T10:00:00.000Z' },
    { id: 1, deliveryId: 1, status: 'AWAITING_SELLER_PREPARATION', note: 'Created', actorRole: 'SYSTEM', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 4, deliveryId: 2, status: 'DELIVERED', note: 'Other order', actorRole: 'RIDER', createdAt: '2026-01-04T10:00:00.000Z' },
    { id: 2, deliveryId: 1, status: 'PICKED_UP', note: 'Collected', actorRole: 'RIDER', createdAt: '2026-01-02T08:00:00.000Z' },
  ];

  it('returns only this delivery’s events in chronological order', () => {
    expect(deliveryTimeline(events, 1).map((event) => event.id)).toEqual([1, 2, 3]);
  });

  it('reports the quoted ETA window without inventing one', () => {
    expect(deliveryEtaText({ feeSnapshot: { etaMinDays: 1, etaMaxDays: 3 } as Delivery['feeSnapshot'] })).toBe('1–3 days');
    expect(deliveryEtaText({ feeSnapshot: { etaMinDays: 2, etaMaxDays: 2 } as Delivery['feeSnapshot'] })).toBe('2 days');
    expect(deliveryEtaText({})).toBeNull();
    expect(deliveryEtaText({ feeSnapshot: { etaMinDays: 0, etaMaxDays: 0 } as Delivery['feeSnapshot'] })).toBeNull();
  });
});

describe('delivery lifecycle — delayed detection', () => {
  const now = new Date('2026-01-10T12:00:00.000Z');

  it('flags a delivery whose genuine ETA date has passed', () => {
    expect(isDeliveryDelayed(delivery({ estimatedDeliveryDate: '2026-01-08', updatedAt: '2026-01-09T10:00:00.000Z' }), now)).toBe(true);
  });

  it('does not flag a delivery still inside its ETA window', () => {
    expect(isDeliveryDelayed(delivery({ estimatedDeliveryDate: '2026-01-12', updatedAt: '2026-01-09T10:00:00.000Z' }), now)).toBe(false);
  });

  it('flags stalled deliveries with no update for over five days', () => {
    expect(isDeliveryDelayed(delivery({ updatedAt: '2026-01-01T10:00:00.000Z' }), now)).toBe(true);
  });

  it('never flags a terminal delivery as delayed', () => {
    expect(isDeliveryDelayed(delivery({ status: 'DELIVERED', estimatedDeliveryDate: '2026-01-01' }), now)).toBe(false);
    expect(isDeliveryDelayed(delivery({ status: 'CANCELLED', updatedAt: '2026-01-01T10:00:00.000Z' }), now)).toBe(false);
  });
});

describe('delivery mapping — immutable fee snapshot', () => {
  it('maps the delivery record and its server-captured fee snapshot', () => {
    const mapped = mapDelivery({
      id: 5,
      order_id: 100,
      delivery_number: 'DLV-GS-2026-000100',
      buyer_id: 10,
      seller_id: 20,
      private_pickup: 'should not leak',
      pickup_address: '12 Allen Ave',
      pickup_city: 'Ikeja',
      pickup_state: 'Lagos State',
      delivery_address: '5 Admiralty Way',
      delivery_city: 'Lekki',
      delivery_state: 'Lagos State',
      delivery_method: 'GOODSALE_PARTNER',
      service_type: 'EXPRESS',
      delivery_fee: 1500,
      fee_snapshot: {
        sellerId: 20,
        sellerName: 'Seller',
        method: 'GOODSALE_PARTNER',
        service: 'EXPRESS',
        baseFee: 0,
        distanceFee: 1500,
        weightFee: 0,
        sizeFee: 0,
        remoteFee: 0,
        handlingFee: 0,
        platformFee: 0,
        zoneFee: 0,
        discount: 0,
        total: 1500,
        etaMinDays: 1,
        etaMaxDays: 1,
        freeShipping: false,
        manualQuote: false,
      },
      status: 'OUT_FOR_DELIVERY',
      rider_id: 9,
      courier_name: 'GoodDispatch Rider',
      tracking_number: 'GD-123',
      estimated_delivery_date: '2026-01-12',
      delivery_instructions: 'Call on arrival',
      failure_reason: '',
      cancellation_reason: '',
      created_at: '2026-01-01T09:00:00.000Z',
      updated_at: '2026-01-02T10:00:00.000Z',
    });

    expect(mapped.status).toBe('OUT_FOR_DELIVERY');
    expect(mapped.deliveryFee).toBe(1500);
    expect(mapped.feeSnapshot?.total).toBe(1500);
    expect(mapped.estimatedDeliveryDate).toBe('2026-01-12');
    expect(mapped.riderId).toBe(9);
    expect(Object.keys(mapped)).not.toContain('private_pickup');
  });

  it('keeps an empty snapshot undefined instead of inventing pricing', () => {
    const mapped = mapDelivery({ id: 1, order_id: 1, status: 'AWAITING_SELLER_PREPARATION', fee_snapshot: {} });
    expect(mapped.feeSnapshot).toBeUndefined();
    expect(mapped.deliveryFee).toBe(0);
  });
});
