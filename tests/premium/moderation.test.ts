import { describe, expect, it } from 'vitest';
import {
  buildFlashSaleQueue,
  isPriorityCampaign,
  sellerPlanRank,
} from '../../lib/premium/moderation';

const row = (id: number, sellerId: number, status: string, createdAt: string) => ({
  id,
  seller_id: sellerId,
  status,
  created_at: createdAt,
});

describe('flash sale review queue', () => {
  it('ranks Business plans above free sellers', () => {
    expect(sellerPlanRank('ENTERPRISE')).toBe(3);
    expect(sellerPlanRank('PREMIUM')).toBe(2);
    expect(sellerPlanRank('PRO')).toBe(1);
    expect(sellerPlanRank(null)).toBe(0);
  });

  it('lists pending campaigns before scheduled ones', () => {
    const queue = buildFlashSaleQueue(
      [row(1, 10, 'ACTIVE', '2026-01-01T00:00:00Z'), row(2, 11, 'PENDING_REVIEW', '2026-01-01T00:00:00Z')],
      new Map([[10, 'ENTERPRISE']])
    );
    expect(queue[0].row.id).toBe(2);
  });

  it('prioritises Premium and Enterprise sellers awaiting review', () => {
    const queue = buildFlashSaleQueue(
      [
        row(1, 10, 'PENDING_REVIEW', '2026-01-03T00:00:00Z'),
        row(2, 11, 'PENDING_REVIEW', '2026-01-01T00:00:00Z'),
        row(3, 12, 'PENDING_REVIEW', '2026-01-02T00:00:00Z'),
      ],
      new Map([
        [10, 'FREE'],
        [11, 'ENTERPRISE'],
        [12, 'PRO'],
      ])
    );
    expect(queue.map((entry) => entry.row.id)).toEqual([2, 3, 1]);
    expect(isPriorityCampaign('PENDING_REVIEW', 'ENTERPRISE')).toBe(true);
    expect(isPriorityCampaign('PENDING_REVIEW', 'PRO')).toBe(false);
    expect(isPriorityCampaign('ACTIVE', 'PREMIUM')).toBe(false);
  });
});
