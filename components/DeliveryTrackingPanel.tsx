'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Copy, KeyRound, LifeBuoy, Lock, MapPin, MessageSquare, Package,
  Pencil, Phone, ShieldCheck, Truck, X,
} from 'lucide-react';
import type { Delivery, DeliveryEvent, DeliveryPartner } from '@/lib/types';
import { deliveryEtaText, deliveryStatusLabel, isDeliveryTerminal } from '@/lib/delivery';
import { dbOperations } from '@/lib/store';
import { toast } from '@/lib/feedback';
import DeliveryTimeline, { DeliveryStatusBadge } from './DeliveryTimeline';
import LiveDeliveryTracking from './LiveDeliveryTracking';

const canEditInstructions = (status: Delivery['status']) =>
  !['PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPTED', 'DELIVERED', 'RETURNED_TO_SELLER', 'CANCELLED'].includes(status);

export default function DeliveryTrackingPanel({
  delivery,
  events,
  rider,
  orderNumber,
  isBuyer,
  onDispute,
}: {
  delivery: Delivery;
  events: DeliveryEvent[];
  rider?: DeliveryPartner;
  orderNumber: string;
  isBuyer: boolean;
  onDispute?: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructions, setInstructions] = useState(delivery.deliveryInstructions || '');
  const [savingInstructions, setSavingInstructions] = useState(false);

  const eta = useMemo(() => deliveryEtaText(delivery), [delivery]);
  const carrier = rider?.fullName || delivery.courierName || '';
  const trackingNumber = delivery.trackingNumber?.trim();
  const shipmentTrackingId = delivery.trackingId?.trim();

  const copyTrackingId = async () => {
    if (!shipmentTrackingId) return;
    try {
      await navigator.clipboard.writeText(shipmentTrackingId);
      toast.success('Shipment tracking ID copied.');
    } catch {
      toast.error('Could not copy the tracking ID.');
    }
  };

  const revealCode = async () => {
    setLoadingCode(true);
    setCodeError(null);
    const result = await dbOperations.revealDeliveryCode(delivery.id);
    setLoadingCode(false);
    if ('error' in result && result.error) {
      setCodeError(result.error);
      return;
    }
    const data = (result as { data?: { code?: string; expires_at?: string } }).data;
    if (data?.code) {
      setCode(data.code);
      setExpiresAt(data.expires_at || null);
    } else {
      setCodeError('Could not generate a confirmation code. Please retry.');
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Delivery code copied. Share it with the rider at handover only.');
    } catch {
      toast.error('Could not copy. Please read the code to the rider.');
    }
  };

  const saveInstructions = async () => {
    setSavingInstructions(true);
    const result = await dbOperations.setDeliveryInstructions(delivery.id, instructions.trim());
    setSavingInstructions(false);
    if ('error' in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Delivery instructions saved.');
    setEditingInstructions(false);
  };

  const delivered = delivery.status === 'DELIVERED';

  return (
    <div className="rounded-2xl border border-jade-200/60 dark:border-jade-500/20 bg-jade-500/[0.03] dark:bg-jade-500/[0.04] p-4 sm:p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-ink-400 uppercase tracking-wider">
            <Truck className="w-3.5 h-3.5 text-jade-500" />
            Delivery Tracking
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-display font-bold text-sm text-ink-900 dark:text-white">
              {delivery.deliveryNumber}
            </span>
            <DeliveryStatusBadge status={delivery.status} />
          </div>
          <p className="text-[11px] text-ink-400 mt-1">
            Order {orderNumber} · {delivery.deliveryMethod === 'GOODSALE_PARTNER' ? 'GoodDispatch' : delivery.deliveryMethod === 'THIRD_PARTY_COURIER' ? 'External courier' : 'Marketplace delivery'} · {delivery.serviceType}
          </p>
        </div>
        <div className="text-right">
          <span className="block text-[11px] text-ink-400">Delivery fee paid</span>
          <span className="font-mono font-semibold text-sm text-ink-900 dark:text-white">
            ₦{delivery.deliveryFee.toLocaleString()}
          </span>
        </div>
      </div>

      <LiveDeliveryTracking delivery={delivery} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        <div className="rounded-xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 p-3">
          <span className="text-ink-400 text-[11px] block">GoodSale tracking ID</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="font-mono font-semibold text-ink-800 dark:text-ink-200 break-all">
              {shipmentTrackingId || 'Issued with the shipment'}
            </span>
            {shipmentTrackingId && (
              <button type="button" onClick={() => void copyTrackingId()} aria-label="Copy shipment tracking ID" className="text-ink-400 hover:text-jade-600">
                <Copy className="h-3 w-3" />
              </button>
            )}
          </div>
          {shipmentTrackingId && (
            <Link href={`/track/${shipmentTrackingId}`} className="mt-1 inline-flex text-[10px] font-bold text-jade-600 hover:underline dark:text-jade-400">
              Open premium tracking →
            </Link>
          )}
          {trackingNumber && (
            <span className="mt-1 block text-[10px] text-ink-400">Courier ref: {trackingNumber}</span>
          )}
        </div>
        <div className="rounded-xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 p-3">
          <span className="text-ink-400 text-[11px] block">{delivery.deliveryMethod === 'THIRD_PARTY_COURIER' ? 'Courier' : 'Rider / courier'}</span>
          <span className="font-semibold text-ink-800 dark:text-ink-200 block">
            {carrier || 'Not assigned yet'}
          </span>
          {rider?.phone && (
            <a href={`tel:${rider.phone}`} className="mt-1 inline-flex items-center gap-1 text-[11px] text-jade-600 dark:text-jade-400 font-semibold">
              <Phone className="w-3 h-3" /> {rider.phone}
            </a>
          )}
        </div>
        <div className="rounded-xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 p-3">
          <span className="text-ink-400 text-[11px] block">Estimated delivery</span>
          <span className="font-semibold text-ink-800 dark:text-ink-200 block">
            {delivery.estimatedDeliveryDate
              ? new Date(`${delivery.estimatedDeliveryDate}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                })
              : 'Confirmed by the courier after pickup'}
          </span>
          {eta && <span className="text-[11px] text-ink-400">Quoted window: {eta}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="text-xs">
            <span className="text-ink-400 flex items-center gap-1 mb-1">
              <MapPin className="w-3.5 h-3.5" /> Delivery address
            </span>
            <p className="font-semibold text-ink-800 dark:text-ink-200">
              {delivery.deliveryAddress || '—'}
            </p>
            <p className="text-ink-400">{[delivery.deliveryCity, delivery.deliveryState].filter(Boolean).join(', ')}</p>
          </div>

          <div className="text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-ink-400 flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> Delivery instructions
              </span>
              {isBuyer && canEditInstructions(delivery.status) && !editingInstructions && (
                <button
                  onClick={() => setEditingInstructions(true)}
                  className="text-[11px] font-bold text-jade-600 dark:text-jade-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3 h-3" /> {delivery.deliveryInstructions ? 'Edit' : 'Add'}
                </button>
              )}
            </div>
            {editingInstructions ? (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Gate code, landmark, preferred drop-off time…"
                  className="w-full p-2.5 text-xs bg-white dark:bg-ink-950 border border-ink-200 dark:border-ink-700 rounded-xl text-ink-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-jade-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveInstructions()}
                    disabled={savingInstructions}
                    className="px-3 py-1.5 bg-jade-500 hover:bg-jade-600 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                  >
                    {savingInstructions ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingInstructions(false);
                      setInstructions(delivery.deliveryInstructions || '');
                    }}
                    className="px-3 py-1.5 text-ink-500 text-[11px] font-bold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-ink-600 dark:text-ink-300 leading-relaxed">
                {delivery.deliveryInstructions || 'No special instructions provided.'}
              </p>
            )}
          </div>

          {delivery.failureReason && (
            <div className="rounded-xl border border-ink-500/20 bg-ink-500/5 p-3 text-xs text-ink-600 dark:text-ink-300">
              <strong className="block text-[11px] uppercase tracking-wide mb-0.5">Delivery issue</strong>
              {delivery.failureReason}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {delivered ? (
            <div className="rounded-2xl border border-jade-500/25 bg-jade-500/10 p-4 text-xs space-y-1">
              <span className="flex items-center gap-1.5 font-bold text-jade-700 dark:text-jade-400">
                <CheckCircle2 className="w-4 h-4" /> Delivery confirmed
              </span>
              <p className="text-ink-600 dark:text-ink-300">
                {delivery.confirmedAt
                  ? `Confirmed on ${new Date(delivery.confirmedAt).toLocaleString()}.`
                  : 'This delivery has been marked delivered.'}
              </p>
              <p className="text-ink-500 dark:text-ink-400">
                Your payment stays in escrow until you release it with your escrow release PIN.
              </p>
            </div>
          ) : isDeliveryTerminal(delivery.status) ? (
            <div className="rounded-2xl border border-ink-500/20 bg-ink-500/5 p-4 text-xs text-ink-600 dark:text-ink-300">
              This delivery is {deliveryStatusLabel(delivery.status).toLowerCase()}. Contact support if you need help.
            </div>
          ) : isBuyer ? (
            <div className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 space-y-3">
              <div>
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink-800 dark:text-ink-100">
                  <KeyRound className="w-4 h-4 text-jade-500" /> Delivery confirmation code
                </span>
                <p className="text-[11px] text-ink-400 mt-1 leading-relaxed">
                  Give this one-time code to the rider only when you receive your item. It confirms delivery — it does not release your escrow.
                </p>
              </div>

              {code ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold tracking-[0.35em] text-ink-900 dark:text-white bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-700 rounded-xl px-3 py-2">
                      {code}
                    </span>
                    <button
                      onClick={() => void copyCode()}
                      className="p-2 rounded-lg border border-ink-200 dark:border-ink-700 text-ink-500 hover:text-jade-600 cursor-pointer"
                      aria-label="Copy delivery code"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-400">
                    {expiresAt ? `Code expires ${new Date(expiresAt).toLocaleString()}.` : 'This code expires soon.'} Generate a new one any time.
                  </p>
                  <button
                    onClick={() => void revealCode()}
                    disabled={loadingCode}
                    className="text-[11px] font-bold text-jade-600 dark:text-jade-400 cursor-pointer disabled:opacity-50"
                  >
                    Generate a new code
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => void revealCode()}
                  disabled={loadingCode}
                  className="w-full px-3 py-2 bg-jade-500 hover:bg-jade-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  {loadingCode ? 'Generating…' : 'Reveal my delivery code'}
                </button>
              )}
              {codeError && <p className="text-[11px] font-semibold text-ink-600 dark:text-ink-300">{codeError}</p>}
              <p className="text-[11px] text-ink-400 flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-jade-500 shrink-0 mt-0.5" />
                Escrow stays protected during delivery. Release it yourself after you have inspected the item.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 text-xs text-ink-500 dark:text-ink-400 flex items-start gap-2">
              <Lock className="w-4 h-4 text-ink-400 shrink-0 mt-0.5" />
              The buyer&apos;s one-time confirmation code is required at handover. Riders cannot change delivery fees or release escrow.
            </div>
          )}

          {isBuyer && onDispute && !isDeliveryTerminal(delivery.status) && (
            <button
              onClick={onDispute}
              className="w-full px-3 py-2 rounded-xl border border-ink-200 dark:border-ink-700 text-[11px] font-bold text-ink-600 dark:text-ink-300 hover:border-jade-500/40 hover:text-jade-600 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LifeBuoy className="w-3.5 h-3.5" /> Report a delivery problem
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-jade-200/50 dark:border-jade-500/15 pt-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-xs font-bold text-ink-800 dark:text-ink-100 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-jade-500" /> Tracking history
          </h5>
          <span className="text-[11px] text-ink-400">{deliveryStatusLabel(delivery.status)}</span>
        </div>
        <DeliveryTimeline delivery={delivery} events={events} />
      </div>

      {isBuyer && onDispute && isDeliveryTerminal(delivery.status) && delivery.status !== 'CANCELLED' && (
        <button
          onClick={onDispute}
          className="text-[11px] font-bold text-ink-500 hover:text-jade-600 inline-flex items-center gap-1 cursor-pointer"
        >
          <X className="w-3 h-3" /> Something was wrong with this delivery
        </button>
      )}
    </div>
  );
}
