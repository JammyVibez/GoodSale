'use client';

import React, { useState } from 'react';
import {
  CheckCircle2, ClipboardCheck, Clock, MapPin, MessageSquare, PackageCheck,
  Phone, ShieldCheck, Truck,
} from 'lucide-react';
import type { Delivery, DeliveryEvent, DeliveryPartner } from '@/lib/types';
import { deliveryStatusLabel, isDeliveryTerminal } from '@/lib/delivery';
import { dbOperations } from '@/lib/store';
import { toast } from '@/lib/feedback';
import DeliveryTimeline, { DeliveryStatusBadge } from './DeliveryTimeline';

type SellerAction = 'CONFIRM_AVAILABILITY' | 'PREPARING' | 'READY_FOR_PICKUP';

export default function SellerDeliveryPanel({
  delivery,
  events,
  rider,
}: {
  delivery: Delivery;
  events: DeliveryEvent[];
  rider?: DeliveryPartner;
}) {
  const [busy, setBusy] = useState<SellerAction | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const closed = isDeliveryTerminal(delivery.status);
  const awaitingPreparation = delivery.status === 'AWAITING_SELLER_PREPARATION';
  const ready = delivery.status === 'READY_FOR_PICKUP';

  const run = async (action: SellerAction) => {
    setBusy(action);
    const result = await dbOperations.sellerDeliveryAction(delivery.id, action);
    setBusy(null);
    if ('error' in result && result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(
      action === 'READY_FOR_PICKUP'
        ? 'Marked ready for pickup. GoodDispatch will assign a rider.'
        : action === 'PREPARING'
          ? 'Marked as preparing.'
          : 'Availability confirmed.'
    );
  };

  return (
    <div className="w-full basis-full mt-3 rounded-2xl border border-ink-200 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-950/40 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 flex items-center gap-1">
            <Truck className="w-3 h-3 text-jade-500" /> {delivery.deliveryNumber}
          </span>
          <div className="mt-1 flex items-center gap-2">
            <DeliveryStatusBadge status={delivery.status} />
            <span className="text-[11px] text-ink-400">
              {delivery.deliveryMethod === 'THIRD_PARTY_COURIER' ? 'External courier' : 'GoodDispatch'} · {delivery.serviceType}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-ink-400">
          Delivery fee <strong className="font-mono text-ink-700 dark:text-ink-200">₦{delivery.deliveryFee.toLocaleString()}</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-[11px] text-ink-400 flex items-center gap-1 mb-0.5">
            <MapPin className="w-3 h-3" /> Deliver to buyer
          </span>
          <p className="font-semibold text-ink-700 dark:text-ink-200">{delivery.deliveryAddress || '—'}</p>
          <p className="text-ink-400">{[delivery.deliveryCity, delivery.deliveryState].filter(Boolean).join(', ')}</p>
        </div>
        <div>
          <span className="text-[11px] text-ink-400 flex items-center gap-1 mb-0.5">
            <MessageSquare className="w-3 h-3" /> Buyer instructions
          </span>
          <p className="text-ink-600 dark:text-ink-300 leading-relaxed">
            {delivery.deliveryInstructions || 'No special instructions provided.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 px-3 py-2">
          <span className="text-[10px] text-ink-400 block">Rider / courier</span>
          <span className="font-semibold text-ink-700 dark:text-ink-200 block truncate">
            {rider?.fullName || delivery.courierName || 'Not assigned yet'}
          </span>
          {rider?.phone && (
            <a href={`tel:${rider.phone}`} className="text-[10px] text-jade-600 dark:text-jade-400 inline-flex items-center gap-1">
              <Phone className="w-2.5 h-2.5" /> {rider.phone}
            </a>
          )}
        </div>
        <div className="rounded-xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 px-3 py-2">
          <span className="text-[10px] text-ink-400 block">Tracking number</span>
          <span className="font-mono text-[11px] text-ink-700 dark:text-ink-200 break-all">
            {delivery.trackingNumber || 'Pending'}
          </span>
        </div>
        <div className="rounded-xl bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 px-3 py-2">
          <span className="text-[10px] text-ink-400 block">Estimated delivery</span>
          <span className="text-[11px] font-semibold text-ink-700 dark:text-ink-200">
            {delivery.estimatedDeliveryDate
              ? new Date(`${delivery.estimatedDeliveryDate}T00:00:00`).toLocaleDateString()
              : 'After pickup'}
          </span>
        </div>
      </div>

      {!closed && (
        <div className="flex flex-wrap items-center gap-2">
          {awaitingPreparation && (
            <>
              <button
                onClick={() => void run('CONFIRM_AVAILABILITY')}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-[11px] font-bold text-ink-700 dark:text-ink-200 hover:border-jade-500/40 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-jade-500" />
                {busy === 'CONFIRM_AVAILABILITY' ? 'Saving…' : 'Confirm availability'}
              </button>
              <button
                onClick={() => void run('PREPARING')}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 text-[11px] font-bold text-ink-700 dark:text-ink-200 hover:border-jade-500/40 disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-gold-500" />
                {busy === 'PREPARING' ? 'Saving…' : 'Mark preparing'}
              </button>
              <button
                onClick={() => void run('READY_FOR_PICKUP')}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-lg bg-jade-500 hover:bg-jade-600 text-white text-[11px] font-bold disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
              >
                <PackageCheck className="w-3.5 h-3.5" />
                {busy === 'READY_FOR_PICKUP' ? 'Updating…' : 'Mark ready for pickup'}
              </button>
            </>
          )}
          {ready && (
            <span className="text-[11px] text-ink-500 dark:text-ink-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-jade-500" />
              Ready for pickup — waiting for a rider to be assigned.
            </span>
          )}
          {!awaitingPreparation && !ready && (
            <span className="text-[11px] text-ink-500 dark:text-ink-400">
              {deliveryStatusLabel(delivery.status)}. The rider and GoodSale team update delivery from here.
            </span>
          )}
        </div>
      )}

      <p className="text-[10px] text-ink-400 flex items-start gap-1.5">
        <ShieldCheck className="w-3 h-3 text-jade-500 shrink-0 mt-0.5" />
        Delivery is confirmed with the buyer&apos;s one-time code. Sellers cannot mark an order delivered or release escrow.
      </p>

      <button
        onClick={() => setShowHistory((value) => !value)}
        className="text-[11px] font-bold text-jade-600 dark:text-jade-400 cursor-pointer"
      >
        {showHistory ? 'Hide delivery history' : 'View delivery history'}
      </button>
      {showHistory && <DeliveryTimeline delivery={delivery} events={events} showProgress={false} />}
    </div>
  );
}
