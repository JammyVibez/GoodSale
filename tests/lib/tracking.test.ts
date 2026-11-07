import { describe, expect, it } from 'vitest';
import { makeCheckoutGroupId, makeOrderNumber, makeShipmentTrackingId } from '@/lib/ids';
import { mapTrackingResult } from '@/lib/tracking';

describe('GoodSale identifiers', () => {
  it('uses the date-based order format', () => {
    const value = makeOrderNumber(new Date(2026, 10, 6));
    expect(value).toMatch(/^GS-20261106-\d{5}$/);
  });

  it('uses the GSD shipment format', () => {
    expect(makeShipmentTrackingId()).toMatch(/^GSD-\d{9}$/);
  });

  it('uses a separate checkout group format', () => {
    expect(makeCheckoutGroupId(new Date(2026, 10, 6))).toMatch(/^GSG-20261106-\d{5}$/);
  });
});

describe('mapTrackingResult', () => {
  it('maps public tracking without inventing private fields', () => {
    const result = mapTrackingResult({
      found: true,
      delivery_id: 42,
      tracking_id: 'GSD-829174620',
      order_number: 'GS-20261106-48291',
      status: 'IN_TRANSIT',
      authorized: false,
      access_level: 'PUBLIC',
      destination: { city: 'Lekki', state: 'Lagos State', address: '', phone: '' },
      events: [
        { id: 1, status: 'AWAITING_SELLER_PREPARATION', note: '', actor_role: '', created_at: '2026-11-06T10:00:00Z' },
      ],
      rider: null,
      live: null,
      order: null,
      shipments: [],
      can_confirm_receipt: false,
      can_report_issue: false,
      last_updated: '2026-11-06T10:00:00Z',
    });

    expect(result.deliveryId).toBe(42);
    expect(result.trackingId).toBe('GSD-829174620');
    expect(result.orderNumber).toBe('GS-20261106-48291');
    expect(result.authorized).toBe(false);
    expect(result.destination.city).toBe('Lekki');
    expect(result.rider).toBeNull();
    expect(result.live).toBeNull();
    expect(result.order).toBeNull();
    expect(result.events).toHaveLength(1);
  });

  it('maps participant rider and live data when supplied', () => {
    const result = mapTrackingResult({
      found: true,
      tracking_id: 'GSD-829174620',
      order_number: 'GS-20261106-48291',
      status: 'OUT_FOR_DELIVERY',
      authorized: true,
      access_level: 'PARTICIPANT',
      viewer_role: 'BUYER',
      destination: { city: 'Lekki', state: 'Lagos State', address: '5 Admiralty Way' },
      events: [],
      rider: { id: 9, name: 'Rider', phone: '08030000000', rating: 4.9, vehicle_type: 'MOTORCYCLE' },
      live: {
        delivery_id: 42,
        status: 'OUT_FOR_DELIVERY',
        tracking_active: true,
        tracking_status: 'LIVE',
        rider_location: { lat: 6.45, lng: 3.39 },
        destination: { lat: 6.46, lng: 3.4 },
      },
      order: { id: 7, order_number: 'GS-20261106-48291', total_amount: 26500 },
      shipments: [{ tracking_id: 'GSD-829174621', status: 'IN_TRANSIT', is_current: false }],
      can_confirm_receipt: false,
      can_report_issue: true,
    });

    expect(result.rider?.name).toBe('Rider');
    expect(result.live?.trackingActive).toBe(true);
    expect(result.live?.riderLocation).toEqual({ lat: 6.45, lng: 3.39, accuracyM: undefined, speedKmh: undefined, headingDegrees: undefined });
    expect(result.order?.totalAmount).toBe(26500);
    expect(result.shipments[0].trackingId).toBe('GSD-829174621');
    expect(result.canReportIssue).toBe(true);
  });
});
