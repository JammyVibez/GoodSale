/**
 * Flash Sale moderation ordering. Business Premium and Enterprise sellers get
 * the advertised priority review, and anything awaiting review is listed
 * before campaigns that are already scheduled or running.
 */
export type SellerPlan = string | null | undefined;

export function sellerPlanRank(plan: SellerPlan): number {
  const code = String(plan || '').toUpperCase();
  return code === 'ENTERPRISE' ? 3 : code === 'PREMIUM' ? 2 : code === 'PRO' ? 1 : 0;
}

export type FlashSaleQueueRow = {
  seller_id: number | string;
  status?: string | null;
  created_at?: string | null;
};

export function buildFlashSaleQueue<T extends FlashSaleQueueRow>(
  rows: readonly T[],
  planBySeller: Map<number, string>
): { row: T; plan: string | null }[] {
  return [...rows]
    .map((row) => ({ row, plan: planBySeller.get(Number(row.seller_id)) || null }))
    .sort((a, b) => {
      const pending =
        Number(b.row.status === 'PENDING_REVIEW') - Number(a.row.status === 'PENDING_REVIEW');
      if (pending) return pending;
      const planDiff = sellerPlanRank(b.plan) - sellerPlanRank(a.plan);
      if (planDiff) return planDiff;
      return String(b.row.created_at || '').localeCompare(String(a.row.created_at || ''));
    });
}

/** Controls the "Priority" badge in the admin review queue. */
export function isPriorityCampaign(status: string | null | undefined, plan: SellerPlan): boolean {
  return sellerPlanRank(plan) >= 2 && String(status || '').toUpperCase() === 'PENDING_REVIEW';
}
