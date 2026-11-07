'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Clock, MapPin, MessageSquare, Navigation,
  PackageCheck, Phone, ShieldCheck, Truck, X,
} from 'lucide-react';
import type { Delivery, DeliveryPartner } from '@/lib/types';
import { deliveryStatusLabel, isDeliveryTerminal } from '@/lib/delivery';
import { dbOperations, useDBState } from '@/lib/store';
import { toast } from '@/lib/feedback';
import DeliveryTimeline, { DeliveryStatusBadge } from './DeliveryTimeline';
import RiderLiveLocationControl from './RiderLiveLocationControl';

const FAILURE_REASONS = [
  { code: 'BUYER_UNAVAILABLE', label: 'Buyer unavailable' },
  { code: 'SELLER_UNAVAILABLE', label: 'Seller unavailable / package not ready' },
  { code: 'INCORRECT_ADDRESS', label: 'Incorrect address' },
  { code: 'RIDER_CANCELLATION', label: 'Rider cannot complete' },
  { code: 'COURIER_DELAY', label: 'Courier delay' },
  { code: 'DAMAGED_PACKAGE', label: 'Damaged package' },
  { code: 'OTHER', label: 'Other issue' },
];

function formatWhen(value?: string) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function countdown(expiresAt?: string) {
  if (!expiresAt) return '';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.ceil(ms / 60_000);
  return `${mins} min left to respond`;
}

export default function RiderDeliveryCard({
  delivery,
  rider,
  compact = false,
  onChanged,
}: {
  delivery: Delivery;
  rider?: DeliveryPartner;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const db = useDBState();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [failureReason, setFailureReason] = useState(FAILURE_REASONS[0].code);
  const [otherReason, setOtherReason] = useState('');
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);

  const events = useMemo(
    () => db.deliveryEvents.filter((event) => event.deliveryId === delivery.id),
    [db.deliveryEvents, delivery.id]
  );
  const earning = useMemo(
    () => db.riderEarnings.find((row) => row.deliveryId === delivery.id),
    [db.riderEarnings, delivery.id]
  );
  const terminal = isDeliveryTerminal(delivery.status);
  const offered = delivery.assignmentStatus === 'OFFERED';
  const accepted = delivery.assignmentStatus === 'ACCEPTED';
  const net =
    earning?.netAmount ??
    Math.max(
      0,
      delivery.deliveryFee -
        Math.round(
          (delivery.deliveryFee * (rider?.commissionPercentage ?? db.revenueSettings.deliveryCommissionPercentage ?? 10)) /
            100
        )
    );

  const run = async (key: string, work: () => Promise<{ error?: string } | { success?: boolean }>) => {
    setBusy(key);
    setError(null);
    const result = await work();
    setBusy(null);
    if ('error' in result && result.error) {
      setError(result.error);
      toast.error(result.error);
      return false;
    }
    onChanged?.();
    return true;
  };

  const accept = () =>
    run('accept', async () => {
      const result = await dbOperations.riderAcceptDelivery(delivery.id);
      if (!result.error) toast.success('Delivery accepted. Head to the pickup address.');
      return result;
    });

  const reject = () =>
    run('reject', async () => {
      const result = await dbOperations.riderRejectDelivery(delivery.id, 'Declined from rider dashboard');
      if (!result.error) toast.success('Assignment declined. GoodSale can reassign it.');
      return result;
    });

  const arrive = (stage: 'PICKUP' | 'DESTINATION') =>
    run(`arrive-${stage}`, async () => {
      const result = await dbOperations.riderMarkArrival(delivery.id, stage);
      if (!result.error) toast.success(stage === 'PICKUP' ? 'Pickup arrival recorded.' : 'Destination arrival recorded.');
      return result;
    });

  const transition = (status: Delivery['status'], note: string) =>
    run(status, async () => {
      const result = await dbOperations.advanceDelivery(delivery.id, status, { note });
      if (!result.error) toast.success(deliveryStatusLabel(status));
      return result;
    });

  const fail = (final: boolean) => {
    const selected = FAILURE_REASONS.find((reason) => reason.code === failureReason) || FAILURE_REASONS[0];
    const reason = failureReason === 'OTHER' ? otherReason.trim() : selected.label;
    if (!reason) {
      setError('Describe the reason for the failed attempt.');
      return;
    }
    return run(final ? 'fail-final' : 'attempt', async () => {
      // Record the structured issue first so admin review always receives the
      // category even if the lifecycle transition also creates a generic row.
      await dbOperations.reportDeliveryFailure(delivery.id, failureReason, reason);
      const result = final
        ? await dbOperations.advanceDelivery(delivery.id, 'FAILED_DELIVERY', {
            failureReason: reason,
            note: `Delivery failed: ${reason}`,
          })
        : await dbOperations.riderRecordFailedAttempt(delivery.id, reason);
      if (!result.error) toast.success(final ? 'Failed delivery recorded.' : 'Attempt recorded. You can try again.');
      return result;
    });
  };

  const confirm = () => {
    if (!/^\d{4,8}$/.test(code.trim())) {
      setError('Enter the buyer’s confirmation code.');
      return;
    }
    return run('confirm', async () => {
      const result = await dbOperations.confirmDeliveryWithCode(delivery.id, code.trim());
      if (!result.error) {
        setCode('');
        toast.success('Delivery confirmed. Escrow still belongs to the buyer until they release it.');
      }
      return result;
    });
  };

  const loadContact = () =>
    run('contact', async () => {
      const result = await dbOperations.riderContactSeller(delivery.id);
      if (result.error || !result.data) return { error: result.error || 'Contact unavailable' };
      setContact({ name: result.data.full_name, phone: result.data.phone });
      return { success: true };
    });

  return (
    <article className="rounded-2xl border border-ink-150 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-ink-800 dark:bg-ink-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-sm font-bold text-ink-900 dark:text-white">
              {delivery.deliveryNumber}
            </span>
            <DeliveryStatusBadge status={delivery.status} />
            {offered && (
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-bold text-gold-800 dark:bg-gold-400/15 dark:text-gold-300">
                Offer · {countdown(delivery.assignmentExpiresAt)}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-ink-400">
            {delivery.serviceType} · {delivery.deliveryMethod === 'GOODSALE_PARTNER' ? 'GoodDispatch' : delivery.deliveryMethod}
            {delivery.attemptCount > 0 ? ` · ${delivery.attemptCount} attempt${delivery.attemptCount === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="text-right">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-ink-400">Your net</span>
          <span className="font-mono text-lg font-bold text-jade-600 dark:text-jade-400">₦{net.toLocaleString()}</span>
          <span className="block text-[10px] text-ink-400">Fee ₦{delivery.deliveryFee.toLocaleString()}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-ink-50 p-3 text-xs dark:bg-ink-950/60">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">
            <MapPin className="h-3.5 w-3.5 text-jade-500" /> Pickup
          </span>
          <p className="font-semibold text-ink-800 dark:text-ink-200">
            {accepted ? delivery.pickupAddress || 'Seller address' : 'Full pickup address after acceptance'}
          </p>
          <p className="text-ink-400">{[delivery.pickupCity, delivery.pickupState].filter(Boolean).join(', ')}</p>
          {delivery.arrivedPickupAt && (
            <p className="mt-1 text-[10px] font-semibold text-jade-600 dark:text-jade-400">
              Arrived {formatWhen(delivery.arrivedPickupAt)}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-ink-50 p-3 text-xs dark:bg-ink-950/60">
          <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">
            <Navigation className="h-3.5 w-3.5 text-jade-500" /> Destination
          </span>
          <p className="font-semibold text-ink-800 dark:text-ink-200">
            {accepted ? delivery.deliveryAddress || 'Buyer address' : 'Full destination address after acceptance'}
          </p>
          <p className="text-ink-400">{[delivery.deliveryCity, delivery.deliveryState].filter(Boolean).join(', ')}</p>
          {delivery.arrivedDestinationAt && (
            <p className="mt-1 text-[10px] font-semibold text-jade-600 dark:text-jade-400">
              Arrived {formatWhen(delivery.arrivedDestinationAt)}
            </p>
          )}
        </div>
      </div>

      {accepted && !terminal && <div className="mt-3"><RiderLiveLocationControl delivery={delivery} rider={rider} /></div>}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-500 dark:text-ink-400">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {delivery.estimatedDeliveryDate
            ? `Due ${new Date(`${delivery.estimatedDeliveryDate}T00:00:00`).toLocaleDateString()}`
            : 'No delivery date set'}
        </span>
        {accepted && delivery.deliveryInstructions && (
          <span className="flex min-w-0 items-start gap-1">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-500" />
            <span className="truncate">{delivery.deliveryInstructions}</span>
          </span>
        )}
      </div>

      {contact && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-jade-200 bg-jade-50 px-3 py-2 text-xs dark:border-jade-500/25 dark:bg-jade-500/10">
          <span className="font-semibold text-ink-800 dark:text-ink-200">{contact.name}</span>
          <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 font-bold text-jade-700 dark:text-jade-300">
            <Phone className="h-3.5 w-3.5" /> {contact.phone}
          </a>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-ink-500/20 bg-ink-500/5 p-2.5 text-[11px] font-semibold text-ink-600 dark:text-ink-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {!terminal && (
        <div className="mt-4 space-y-3">
          {offered && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => void accept()}
                disabled={busy !== null}
                className="flex-1 rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-jade-700 disabled:opacity-50"
              >
                {busy === 'accept' ? 'Accepting…' : 'Accept delivery'}
              </button>
              <button
                onClick={() => void reject()}
                disabled={busy !== null}
                className="rounded-xl border border-ink-200 px-4 py-2.5 text-xs font-bold text-ink-600 transition-colors hover:border-ink-300 dark:border-ink-700 dark:text-ink-300"
              >
                Decline
              </button>
            </div>
          )}

          {accepted && delivery.status === 'RIDER_ASSIGNED' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {!delivery.arrivedPickupAt && (
                <button
                  onClick={() => void arrive('PICKUP')}
                  disabled={busy !== null}
                  className="flex-1 rounded-xl border border-jade-500/30 bg-jade-50 px-4 py-2.5 text-xs font-bold text-jade-700 dark:bg-jade-500/10 dark:text-jade-300"
                >
                  {busy === 'arrive-PICKUP' ? 'Recording…' : 'I have arrived at pickup'}
                </button>
              )}
              <button
                onClick={() => void transition('PICKED_UP', 'Rider confirmed package pickup')}
                disabled={busy !== null}
                className="flex-1 rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-jade-700 disabled:opacity-50"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <PackageCheck className="h-4 w-4" /> Confirm package pickup
                </span>
              </button>
            </div>
          )}

          {accepted && delivery.status === 'PICKED_UP' && (
            <button
              onClick={() => void transition('IN_TRANSIT', 'Rider is in transit')}
              disabled={busy !== null}
              className="w-full rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-jade-700 disabled:opacity-50"
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <Truck className="h-4 w-4" /> Start transit
              </span>
            </button>
          )}

          {accepted && ['IN_TRANSIT', 'ARRIVED_AT_HUB'].includes(delivery.status) && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {!delivery.arrivedDestinationAt && (
                <button
                  onClick={() => void arrive('DESTINATION')}
                  disabled={busy !== null}
                  className="flex-1 rounded-xl border border-jade-500/30 bg-jade-50 px-4 py-2.5 text-xs font-bold text-jade-700 dark:bg-jade-500/10 dark:text-jade-300"
                >
                  {busy === 'arrive-DESTINATION' ? 'Recording…' : 'I have arrived at destination'}
                </button>
              )}
              <button
                onClick={() => void transition('OUT_FOR_DELIVERY', 'Rider is out for delivery')}
                disabled={busy !== null}
                className="flex-1 rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-jade-700 disabled:opacity-50"
              >
                Mark out for delivery
              </button>
            </div>
          )}

          {accepted && ['OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED'].includes(delivery.status) && (
            <div className="rounded-xl border border-jade-200 bg-jade-50/60 p-3 dark:border-jade-500/20 dark:bg-jade-500/5">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                Buyer’s one-time confirmation code
              </label>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Code"
                  className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-center font-mono text-sm font-bold tracking-[0.3em] text-ink-900 outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                />
                <button
                  onClick={() => void confirm()}
                  disabled={busy !== null}
                  className="rounded-xl bg-jade-600 px-4 py-2 text-xs font-bold text-white hover:bg-jade-700 disabled:opacity-50"
                >
                  {busy === 'confirm' ? 'Checking…' : 'Complete'}
                </button>
              </div>
              <p className="mt-1.5 flex items-start gap-1 text-[10px] text-ink-400">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-jade-500" />
                Only the buyer’s real code completes the delivery. This does not release escrow.
              </p>
            </div>
          )}

          {accepted && ['OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED'].includes(delivery.status) && (
            <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-ink-500">
                Could not deliver?
              </label>
              <select
                value={failureReason}
                onChange={(event) => setFailureReason(event.target.value)}
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-800 outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-white"
              >
                {FAILURE_REASONS.map((reason) => (
                  <option key={reason.code} value={reason.code}>{reason.label}</option>
                ))}
              </select>
              {failureReason === 'OTHER' && (
                <input
                  value={otherReason}
                  onChange={(event) => setOtherReason(event.target.value)}
                  placeholder="Describe the issue"
                  className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-800 outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                />
              )}
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => void fail(false)}
                  disabled={busy !== null}
                  className="flex-1 rounded-xl border border-gold-500/40 bg-gold-50 px-3 py-2 text-[11px] font-bold text-gold-800 dark:bg-gold-400/10 dark:text-gold-300"
                >
                  Record failed attempt
                </button>
                <button
                  onClick={() => void fail(true)}
                  disabled={busy !== null}
                  className="flex-1 rounded-xl border border-ink-500/25 px-3 py-2 text-[11px] font-bold text-ink-600 dark:text-ink-300"
                >
                  End as failed delivery
                </button>
              </div>
            </div>
          )}

          {accepted && (
            <button
              onClick={() => void loadContact()}
              disabled={busy !== null || Boolean(contact)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-jade-700 disabled:opacity-50 dark:text-jade-300"
            >
              <Phone className="h-3.5 w-3.5" />
              {contact ? 'Seller contact revealed' : busy === 'contact' ? 'Loading…' : 'Contact seller'}
            </button>
          )}
        </div>
      )}

      {terminal && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400">
          <span className="inline-flex items-center gap-1 font-semibold text-ink-700 dark:text-ink-200">
            {delivery.status === 'DELIVERED' ? <CheckCircle2 className="h-4 w-4 text-jade-500" /> : <X className="h-4 w-4" />}
            {deliveryStatusLabel(delivery.status)}
          </span>
          {delivery.failureReason && <span>· {delivery.failureReason}</span>}
          {earning && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              Earnings {earning.status.toLowerCase()}
            </span>
          )}
        </div>
      )}

      {!compact && (
        <details className="mt-4 border-t border-ink-100 pt-3 dark:border-ink-800">
          <summary className="cursor-pointer text-[11px] font-bold text-ink-500 dark:text-ink-400">
            Tracking history
          </summary>
          <div className="mt-3">
            <DeliveryTimeline delivery={delivery} events={events} />
          </div>
        </details>
      )}
    </article>
  );
}
