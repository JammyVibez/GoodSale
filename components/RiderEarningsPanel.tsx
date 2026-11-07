'use client';

import React, { useMemo } from 'react';
import { Banknote, CheckCircle2, Clock, Wallet } from 'lucide-react';
import type { Delivery, DeliveryPartner, RiderEarningStatus } from '@/lib/types';
import { useDBState } from '@/lib/store';

const STATUS_STYLE: Record<RiderEarningStatus, string> = {
  PENDING: 'bg-gold-100 text-gold-800 dark:bg-gold-400/15 dark:text-gold-300',
  APPROVED: 'bg-jade-100 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300',
  PAID: 'bg-ink-900 text-white dark:bg-white dark:text-ink-900',
  VOID: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
};

function money(value: number) {
  return `₦${Math.round(value).toLocaleString()}`;
}

export default function RiderEarningsPanel({ rider }: { rider: DeliveryPartner }) {
  const db = useDBState();
  const earnings = useMemo(
    () => db.riderEarnings.filter((earning) => earning.riderId === rider.id),
    [db.riderEarnings, rider.id]
  );
  const deliveries = useMemo(
    () => new Map(db.deliveries.map((delivery) => [delivery.id, delivery])),
    [db.deliveries]
  );

  const totals = useMemo(() => {
    return earnings.reduce(
      (acc, earning) => {
        acc.gross += earning.grossAmount;
        acc.commission += earning.platformCommission;
        acc.net += earning.netAmount;
        if (earning.status === 'PENDING') acc.pending += earning.netAmount;
        if (earning.status === 'APPROVED') acc.approved += earning.netAmount;
        if (earning.status === 'PAID') acc.paid += earning.netAmount;
        return acc;
      },
      { gross: 0, commission: 0, net: 0, pending: 0, approved: 0, paid: 0 }
    );
  }, [earnings]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Earnings</h3>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Each completed delivery creates a ledger entry. “Paid” only appears after an admin records a real payout reference.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Pending', value: totals.pending, icon: Clock, tone: 'text-gold-600 dark:text-gold-300' },
          { label: 'Approved', value: totals.approved, icon: CheckCircle2, tone: 'text-jade-600 dark:text-jade-400' },
          { label: 'Paid', value: totals.paid, icon: Wallet, tone: 'text-ink-700 dark:text-ink-200' },
          { label: 'Lifetime net', value: totals.net, icon: Banknote, tone: 'text-jade-600 dark:text-jade-400' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-ink-150 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <Icon className={`h-4 w-4 ${tone}`} />
            <span className="mt-2 block text-[10px] font-mono uppercase tracking-wider text-ink-400">{label}</span>
            <span className={`mt-0.5 block font-mono text-lg font-bold ${tone}`}>{money(value)}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-ink-150 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Earnings history</h4>
          <span className="text-[11px] text-ink-400">{earnings.length} deliveries</span>
        </div>
        {earnings.length === 0 ? (
          <div className="p-8 text-center">
            <Wallet className="mx-auto h-7 w-7 text-ink-300 dark:text-ink-600" />
            <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
              No earnings yet. Complete a delivery to create your first pending earning.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {earnings.map((earning) => {
              const delivery: Delivery | undefined = deliveries.get(earning.deliveryId);
              return (
                <li key={earning.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-ink-900 dark:text-white">
                        {delivery?.deliveryNumber ?? `Delivery #${earning.deliveryId}`}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[earning.status]}`}>
                        {earning.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {new Date(earning.createdAt).toLocaleDateString()} · Fee {money(earning.grossAmount)} · Commission{' '}
                      {money(earning.platformCommission)}
                      {earning.adjustmentAmount !== 0 ? ` · Adjustment ${money(earning.adjustmentAmount)}` : ''}
                    </p>
                    {earning.payoutReference && (
                      <p className="mt-0.5 font-mono text-[10px] text-ink-500 dark:text-ink-400">
                        Payout ref: {earning.payoutReference}
                      </p>
                    )}
                    {earning.notes && <p className="mt-0.5 text-[10px] text-ink-400">{earning.notes}</p>}
                  </div>
                  <span className="font-mono text-sm font-bold text-jade-600 dark:text-jade-400">
                    {money(earning.netAmount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="rounded-xl border border-ink-150 bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-950/50 dark:text-ink-400">
        GoodSale does not move money automatically. Pending earnings become approved when an admin reviews them, and paid only
        when an actual payout is completed and a reference is recorded.
      </p>
    </div>
  );
}
