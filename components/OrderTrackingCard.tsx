'use client';

import React from 'react';
import { Navigation } from 'lucide-react';
import LiveDispatchMap from './LiveDispatchMap';
import { bestCoords, formatDistanceKm, haversineKm } from '@/lib/geo';
import { DeliveryJobStatus, type DeliveryJob, type Order } from '@/lib/types';

/**
 * A rider is actively trackable once a delivery job exists and has not finished.
 * Buyers, sellers and dispatch all use the same component so the map, ETA and
 * journey timeline stay identical everywhere and update live via Realtime.
 */
export function hasLiveTracking(job?: DeliveryJob): job is DeliveryJob {
  if (!job) return false;
  return (
    job.status === DeliveryJobStatus.ACCEPTED ||
    job.status === DeliveryJobStatus.PICKED_UP ||
    job.status === DeliveryJobStatus.IN_TRANSIT ||
    job.status === DeliveryJobStatus.ARRIVED
  );
}

type OrderTrackingCardProps = {
  order: Order;
  job?: DeliveryJob;
  partnerName?: string;
  height?: string;
  className?: string;
};

export default function OrderTrackingCard({
  order,
  job,
  partnerName,
  height = '340px',
  className = '',
}: OrderTrackingCardProps) {
  const dest = order.deliveryLat != null && order.deliveryLng != null
    ? { lat: order.deliveryLat, lng: order.deliveryLng }
    : null;
  const pickup = order.pickupLat != null && order.pickupLng != null
    ? { lat: order.pickupLat, lng: order.pickupLng }
    : null;
  const rider =
    job?.currentLat != null && job?.currentLng != null
      ? { lat: job.currentLat, lng: job.currentLng }
      : null;

  const distanceKm = rider && dest ? haversineKm(rider, dest) : null;
  const etaMinutes =
    distanceKm != null && job?.currentSpeed != null && job.currentSpeed > 0
      ? Math.max(1, Math.round((distanceKm / job.currentSpeed) * 60))
      : null;

  const history = [...(job?.trackingHistory ?? [])].reverse();
  const statusLabel = job?.status ? job.status.replace(/_/g, ' ') : 'NOT DISPATCHED';
  const riderLabel = rider ? 'Last reported rider location' : 'Waiting for a real rider GPS update';

  return (
    <div
      className={`space-y-4 rounded-3xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-ink-900 dark:text-white">
            <Navigation className="h-4 w-4 text-jade-500" />
            Track your order
          </h3>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            {partnerName ? `${partnerName} · ` : ''}
            {riderLabel}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            rider ? 'bg-jade-500/10 text-jade-600 dark:text-jade-400' : 'bg-ink-500/10 text-ink-500'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full bg-ink-400`} />
          {statusLabel}
        </span>
      </div>

      <LiveDispatchMap
        rider={rider}
        destination={dest}
        pickup={pickup}
        speedKmh={job?.currentSpeed}
        statusLabel={rider ? 'Last rider location' : 'Awaiting rider GPS'}
        gpsLocked={false}
        height={height}
      />

      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-ink-100 bg-ink-50 p-3 text-xs dark:border-ink-800 dark:bg-ink-950">
        <div>
          <span className="block text-ink-400">Distance left</span>
          <span className="font-semibold text-jade-600 dark:text-jade-400">
            {distanceKm != null ? formatDistanceKm(distanceKm) : '—'}
          </span>
        </div>
        <div className="border-l border-ink-100 pl-3 dark:border-ink-800">
          <span className="block text-ink-400">ETA</span>
          <span className="font-semibold text-jade-600 dark:text-jade-400">
            {etaMinutes != null ? `~${etaMinutes} min at current speed` : 'Unavailable'}
          </span>
        </div>
        <div className="border-l border-ink-100 pl-3 dark:border-ink-800">
          <span className="block text-ink-400">Delivering to</span>
          <span className="block truncate font-semibold text-ink-700 dark:text-ink-300">
            {order.deliveryCity || order.deliveryState || 'Destination'}
          </span>
        </div>
      </div>

      {history.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-ink-500 dark:text-ink-400">Journey updates</h4>
          <ol className="space-y-2 border-l border-ink-100 pl-4 dark:border-ink-800">
            {history.map((entry, idx) => (
              <li key={`${entry.status}-${entry.time}-${idx}`} className="relative text-xs">
                <span
                  className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${
                    idx === 0 ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-700'
                  }`}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink-800 dark:text-ink-200">
                    {entry.status.replace(/_/g, ' ')}
                  </span>
                  <span className="shrink-0 text-ink-400">
                    {new Date(entry.time).toLocaleString()}
                  </span>
                </div>
                {entry.note && (
                  <p className="mt-0.5 leading-snug text-ink-500 dark:text-ink-400">{entry.note}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
