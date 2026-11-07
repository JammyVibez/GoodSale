'use client';

import React from 'react';
import {
  Check, Clock3, MapPin, PackageCheck, RotateCcw, Truck, XCircle,
} from 'lucide-react';
import type { Delivery, DeliveryEvent, DeliveryStatus } from '@/lib/types';
import {
  DELIVERY_MAIN_PATH,
  deliveryProgressIndex,
  deliveryStatusLabel,
  deliveryTimeline,
  isDeliveryFailed,
} from '@/lib/delivery';

export function deliveryStatusClasses(status: DeliveryStatus): string {
  if (status === 'DELIVERED') return 'bg-jade-500 text-white';
  if (status === 'CANCELLED' || status === 'FAILED_DELIVERY' || status === 'RETURNED_TO_SELLER') {
    return 'bg-ink-500/10 text-ink-600 dark:text-ink-300 border border-ink-500/20';
  }
  if (status === 'DELIVERY_ATTEMPTED' || status === 'AWAITING_RIDER' || status === 'AWAITING_SELLER_PREPARATION') {
    return 'bg-gold-500/15 text-gold-700 dark:text-gold-400 border border-gold-500/25';
  }
  return 'bg-jade-500/10 text-jade-700 dark:text-jade-400 border border-jade-500/20';
}

function eventIcon(status: DeliveryStatus) {
  if (status === 'DELIVERED') return PackageCheck;
  if (status === 'CANCELLED' || status === 'FAILED_DELIVERY') return XCircle;
  if (status === 'RETURNED_TO_SELLER') return RotateCcw;
  if (status === 'PICKED_UP' || status === 'IN_TRANSIT' || status === 'ARRIVED_AT_HUB' || status === 'OUT_FOR_DELIVERY') return Truck;
  if (status === 'DELIVERY_ATTEMPTED') return MapPin;
  return Check;
}

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold tracking-wide ${deliveryStatusClasses(status)}`}>
      {deliveryStatusLabel(status)}
    </span>
  );
}

export default function DeliveryTimeline({
  delivery,
  events,
  max = 25,
  showProgress = true,
}: {
  delivery: Delivery;
  events: DeliveryEvent[];
  max?: number;
  showProgress?: boolean;
}) {
  const history = deliveryTimeline(events, delivery.id);
  const recent = [...history].reverse().slice(0, max);
  const progress = deliveryProgressIndex(delivery.status);
  const failed = isDeliveryFailed(delivery) || delivery.status === 'CANCELLED';

  return (
    <div className="space-y-4">
      {showProgress && (
        <div>
          <div className="flex items-center justify-between text-[11px] text-ink-400 mb-1.5">
            <span>{deliveryStatusLabel(DELIVERY_MAIN_PATH[0])}</span>
            <span>{deliveryStatusLabel('DELIVERED')}</span>
          </div>
          <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${failed ? 'bg-ink-400' : 'bg-jade-500'}`}
              style={{ width: `${failed ? 100 : ((Math.max(progress, 0) + 1) / DELIVERY_MAIN_PATH.length) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400">
            <Clock3 className="w-3.5 h-3.5" />
            <span>Last update {new Date(delivery.updatedAt).toLocaleString()}</span>
            {failed && delivery.failureReason && (
              <span className="text-ink-600 dark:text-ink-300">· Reason: {delivery.failureReason}</span>
            )}
            {delivery.status === 'CANCELLED' && delivery.cancellationReason && (
              <span className="text-ink-600 dark:text-ink-300">· {delivery.cancellationReason}</span>
            )}
          </div>
        </div>
      )}

      {recent.length === 0 ? (
        <p className="text-xs text-ink-400">
          Tracking updates appear here as the seller, rider or GoodSale team updates this delivery.
        </p>
      ) : (
        <ol className="relative border-l border-ink-200 dark:border-ink-800 ml-2 space-y-4">
          {recent.map((event, index) => {
            const Icon = eventIcon(event.status);
            return (
              <li key={event.id} className="ml-4">
                <span
                  className={`absolute -left-[9px] mt-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full ${
                    index === 0
                      ? 'bg-jade-500 text-white'
                      : 'bg-white dark:bg-ink-900 text-ink-400 border border-ink-200 dark:border-ink-700'
                  }`}
                >
                  <Icon className="w-2.5 h-2.5" />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xs font-bold text-ink-800 dark:text-ink-100">
                    {deliveryStatusLabel(event.status)}
                  </span>
                  <span className="text-[10px] font-mono text-ink-400">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                  {event.actorRole && event.actorRole !== 'SYSTEM' && (
                    <span className="text-[10px] uppercase tracking-wide text-ink-400">· {event.actorRole}</span>
                  )}
                </div>
                {event.note && (
                  <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 leading-relaxed">{event.note}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
