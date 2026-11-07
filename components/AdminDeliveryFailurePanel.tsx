'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, PackageCheck, RotateCcw, Wrench } from 'lucide-react';
import type { DeliveryFailure } from '@/lib/types';
import { dbOperations, useDBState } from '@/lib/store';
import { toast } from '@/lib/feedback';

const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500';

const REASONS: Record<string, string> = {
  BUYER_UNAVAILABLE: 'Buyer unavailable',
  SELLER_UNAVAILABLE: 'Seller unavailable',
  INCORRECT_ADDRESS: 'Incorrect address',
  RIDER_CANCELLATION: 'Rider cancellation',
  COURIER_DELAY: 'Courier delay',
  DAMAGED_PACKAGE: 'Damaged package',
  OTHER: 'Other',
};

export default function AdminDeliveryFailurePanel() {
  const db = useDBState();
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [reschedule, setReschedule] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const failures = useMemo(
    () => db.deliveryFailures.filter((row) => row.status === 'OPEN' || row.status === 'REFUND_REQUESTED'),
    [db.deliveryFailures]
  );
  const returns = useMemo(
    () => db.deliveryReturns.filter((row) => row.status !== 'CANCELLED'),
    [db.deliveryReturns]
  );

  const deliveryFor = (failure: DeliveryFailure) => db.deliveries.find((d) => d.id === failure.deliveryId);

  const resolve = async (failure: DeliveryFailure) => {
    const resolution = choices[failure.id] || 'REASSIGN';
    const note = notes[failure.id]?.trim() || '';
    if (['RETURN', 'CANCEL', 'RESCHEDULE'].includes(resolution) && !note) {
      toast.error('Add a note explaining this decision.');
      return;
    }
    if (resolution === 'RESCHEDULE' && !reschedule[failure.id]) {
      toast.error('Choose a new delivery date for a reschedule.');
      return;
    }
    setBusy(failure.id);
    const result = await dbOperations.resolveDeliveryFailure(
      failure.id,
      resolution as 'REASSIGN' | 'RESCHEDULE' | 'RETURN' | 'CANCEL' | 'REFUND_REQUESTED' | 'RESOLVE',
      note,
      reschedule[failure.id] || undefined
    );
    setBusy(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Delivery failure resolved.');
    setNotes((current) => ({ ...current, [failure.id]: '' }));
  };

  const updateReturn = async (returnId: number, status: 'INITIATED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED') => {
    setBusy(returnId);
    const result = await dbOperations.updateDeliveryReturn(returnId, status);
    setBusy(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Return updated.');
  };

  if (failures.length === 0 && returns.length === 0) {
    return (
      <div className="rounded-2xl border border-ink-200 bg-white p-4 text-xs text-ink-500 dark:border-ink-800 dark:bg-ink-900">
        <span className="flex items-center gap-1.5 font-bold text-ink-700 dark:text-ink-200">
          <PackageCheck className="h-4 w-4 text-jade-500" /> No open delivery failures
        </span>
        <p className="mt-1 text-[11px] text-ink-400">Failed deliveries and returns will appear here for review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {failures.length > 0 && (
        <div className="rounded-2xl border border-gold-500/30 bg-gold-50/40 p-4 dark:border-gold-500/20 dark:bg-gold-500/5">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-ink-900 dark:text-white">
            <AlertTriangle className="h-4 w-4 text-gold-600 dark:text-gold-400" /> Delivery failures to review
          </h3>
          <p className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
            Reassign, reschedule, return, cancel, or request a refund review under the existing order policy. Refunds are never moved here automatically.
          </p>
          <div className="mt-3 space-y-3">
            {failures.map((failure) => {
              const delivery = deliveryFor(failure);
              return (
                <div key={failure.id} className="rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-700 dark:bg-ink-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-ink-800 dark:text-ink-100">
                        {delivery?.deliveryNumber || `Delivery #${failure.deliveryId}`} · {REASONS[failure.reasonCode] || failure.reasonCode}
                      </p>
                      <p className="text-[10px] text-ink-400">
                        Reported by {failure.source} · {new Date(failure.createdAt).toLocaleString()}
                        {failure.status === 'REFUND_REQUESTED' ? ' · refund review requested' : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-ink-500/10 px-2 py-0.5 text-[10px] font-bold text-ink-500 dark:text-ink-300">
                      {failure.status}
                    </span>
                  </div>
                  {failure.note && <p className="mt-1 text-[11px] text-ink-600 dark:text-ink-300">{failure.note}</p>}
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <select
                      className={inp}
                      value={choices[failure.id] || 'REASSIGN'}
                      onChange={(event) => setChoices((current) => ({ ...current, [failure.id]: event.target.value }))}
                    >
                      <option value="REASSIGN">Reassign delivery</option>
                      <option value="RESCHEDULE">Reschedule</option>
                      <option value="RETURN">Return package</option>
                      <option value="CANCEL">Cancel delivery</option>
                      <option value="REFUND_REQUESTED">Request refund review</option>
                      <option value="RESOLVE">Mark resolved</option>
                    </select>
                    <input
                      className={inp}
                      placeholder="Decision note"
                      value={notes[failure.id] || ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [failure.id]: event.target.value }))}
                    />
                    <input
                      type="date"
                      className={inp}
                      value={reschedule[failure.id] || ''}
                      onChange={(event) => setReschedule((current) => ({ ...current, [failure.id]: event.target.value }))}
                    />
                  </div>
                  <button
                    onClick={() => void resolve(failure)}
                    disabled={busy === failure.id}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-jade-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    <Wrench className="h-3.5 w-3.5" /> {busy === failure.id ? 'Applying…' : 'Apply resolution'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {returns.length > 0 && (
        <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-ink-900 dark:text-white">
            <RotateCcw className="h-4 w-4 text-jade-500" /> Returns to seller
          </h3>
          <div className="mt-3 space-y-2">
            {returns.map((row) => {
              const delivery = db.deliveries.find((d) => d.id === row.deliveryId);
              return (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-200 p-2.5 text-[11px] dark:border-ink-700">
                  <div>
                    <p className="font-bold text-ink-700 dark:text-ink-200">
                      {delivery?.deliveryNumber || `Delivery #${row.deliveryId}`} · {row.status}
                    </p>
                    <p className="text-[10px] text-ink-400">{row.reason || 'Return to seller'}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {(['INITIATED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const).map((status) => (
                      <button
                        key={status}
                        disabled={busy === row.id || row.status === status}
                        onClick={() => void updateReturn(row.id, status)}
                        className="rounded-lg border border-ink-200 px-2 py-1 text-[10px] font-bold text-ink-600 disabled:opacity-40 dark:border-ink-700 dark:text-ink-300"
                      >
                        {status.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
