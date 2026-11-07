import { describe, expect, it } from 'vitest';
import { mapDelivery, mapDeliveryPartner, mapRiderEarning, mapRiderEarningAuditLog } from '@/lib/data/mappers';

describe('Phase 2 rider mappers', () => {
  it('maps rider verification, service areas and commission', () => {
    const rider = mapDeliveryPartner({
      id: 7,
      user_id: 31,
      full_name: 'Test Rider',
      phone: '08000000000',
      email: 'rider@example.com',
      vehicle_type: 'MOTORCYCLE',
      status: 'SUSPENDED',
      is_available: false,
      service_states: ['Lagos State', 'Ogun State'],
      commission_percentage: '12.5',
      emergency_contact_name: 'Contact',
      emergency_contact_phone: '08000000001',
      emergency_contact_relation: 'Sister',
      suspension_reason: 'Review',
      suspended_at: '2026-02-01T10:00:00.000Z',
      documents: [],
    });

    expect(rider.status).toBe('SUSPENDED');
    expect(rider.serviceStates).toEqual(['Lagos State', 'Ogun State']);
    expect(rider.commissionPercentage).toBe(12.5);
    expect(rider.emergencyContactRelation).toBe('Sister');
    expect(rider.suspensionReason).toBe('Review');
    expect(rider.suspendedAt).toBe('2026-02-01T10:00:00.000Z');
  });

  it('maps assignment offers and rider workflow timestamps', () => {
    const delivery = mapDelivery({
      id: 10,
      order_id: 99,
      delivery_number: 'DLV-GS-2026-000099',
      buyer_id: 1,
      seller_id: 2,
      status: 'RIDER_ASSIGNED',
      assignment_status: 'OFFERED',
      assignment_expires_at: '2026-02-01T11:00:00.000Z',
      rider_accepted_at: null,
      arrived_pickup_at: null,
      attempt_count: 2,
      created_at: '2026-02-01T09:00:00.000Z',
      updated_at: '2026-02-01T10:00:00.000Z',
    });

    expect(delivery.assignmentStatus).toBe('OFFERED');
    expect(delivery.assignmentExpiresAt).toBe('2026-02-01T11:00:00.000Z');
    expect(delivery.attemptCount).toBe(2);
    expect(delivery.riderAcceptedAt).toBeUndefined();
  });

  it('maps the earnings ledger and its audit trail', () => {
    const earning = mapRiderEarning({
      id: 5,
      delivery_id: 10,
      order_id: 99,
      rider_id: 7,
      gross_amount: '1500',
      platform_commission: '150',
      adjustment_amount: '-50',
      net_amount: '1300',
      status: 'PAID',
      payout_reference: 'PAYOUT-1',
      notes: 'Manual payout',
      paid_at: '2026-02-02T10:00:00.000Z',
      created_at: '2026-02-01T10:00:00.000Z',
      updated_at: '2026-02-02T10:00:00.000Z',
    });
    const audit = mapRiderEarningAuditLog({
      id: 1,
      earning_id: 5,
      rider_id: 7,
      actor_id: 2,
      actor_name: 'Admin',
      action: 'STATUS_PAID',
      amount_before: '1300',
      amount_after: '1300',
      details: 'Paid manually',
      created_at: '2026-02-02T10:00:00.000Z',
    });

    expect(earning.status).toBe('PAID');
    expect(earning.grossAmount).toBe(1500);
    expect(earning.netAmount).toBe(1300);
    expect(earning.adjustmentAmount).toBe(-50);
    expect(earning.payoutReference).toBe('PAYOUT-1');
    expect(audit.action).toBe('STATUS_PAID');
    expect(audit.amountAfter).toBe(1300);
  });
});
