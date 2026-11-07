'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MapPin, Radio, ShieldCheck } from 'lucide-react';
import type { Delivery, DeliveryPartner } from '@/lib/types';
import { isDeliveryTerminal } from '@/lib/delivery';
import { dbOperations, useDBState } from '@/lib/store';
import { toast } from '@/lib/feedback';

const ACTIVE_STATUSES = new Set([
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'ARRIVED_AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPTED',
]);

export default function RiderLiveLocationControl({
  delivery,
  rider,
}: {
  delivery: Delivery;
  rider?: DeliveryPartner;
}) {
  const db = useDBState();
  const [sharing, setSharing] = useState(Boolean(rider?.locationSharing));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);
  const lastSentRef = useRef(0);
  const active =
    delivery.assignmentStatus === 'ACCEPTED' &&
    ACTIVE_STATUSES.has(delivery.status) &&
    !isDeliveryTerminal(delivery.status);

  const stopWatch = () => {
    if (watchRef.current != null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
  };

  const startWatch = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMessage('This browser does not support location sharing.');
      return;
    }
    stopWatch();
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const minInterval = Math.max(5, db.deliverySettings.locationUpdateIntervalSeconds || 15) * 1000;
        if (now - lastSentRef.current < minInterval) return;
        lastSentRef.current = now;
        void dbOperations.riderUpdateLocation({
          deliveryId: delivery.id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
          speedKmh:
            position.coords.speed != null && Number.isFinite(position.coords.speed)
              ? Math.max(0, position.coords.speed * 3.6)
              : undefined,
          headingDegrees:
            position.coords.heading != null && Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : undefined,
        }).then((result) => {
          if (result.error) setMessage(result.error);
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setSharing(false);
          stopWatch();
          setMessage('Location permission was denied. Buyers will see “Location unavailable”.');
          void dbOperations.riderSetLocationSharing(false, 'DENIED');
        } else {
          setMessage('Location is temporarily unavailable. We will retry while you are online.');
        }
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 10_000 }
    );
  };

  useEffect(() => {
    if (!active) {
      stopWatch();
      return;
    }
    if (sharing) startWatch();
    return stopWatch;
    // The watch is restarted only when sharing or the delivery changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sharing, delivery.id]);

  if (!active) return null;

  const enable = async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMessage('This browser does not support live location.');
      return;
    }
    setBusy(true);
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const result = await dbOperations.riderSetLocationSharing(true, 'GRANTED');
        setBusy(false);
        if (result.error) {
          setMessage(result.error);
          toast.error(result.error);
          return;
        }
        setSharing(true);
        lastSentRef.current = 0;
        await dbOperations.riderUpdateLocation({
          deliveryId: delivery.id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        });
        startWatch();
        toast.success('Live location sharing is on for this delivery.');
      },
      async (error) => {
        setBusy(false);
        const denied = error.code === error.PERMISSION_DENIED;
        await dbOperations.riderSetLocationSharing(false, denied ? 'DENIED' : 'UNKNOWN');
        setSharing(false);
        setMessage(
          denied
            ? 'Location permission was denied. The buyer will see “Location unavailable”.'
            : 'Could not get your location. Move to an open area and try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  };

  const disable = async () => {
    setBusy(true);
    stopWatch();
    const result = await dbOperations.riderSetLocationSharing(false, 'GRANTED');
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setSharing(false);
    setMessage('Live location sharing is off. The buyer will see “Location unavailable”.');
  };

  return (
    <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-700 dark:text-ink-200">
            <MapPin className="h-3.5 w-3.5 text-jade-500" /> Share live location
          </p>
          <p className="mt-1 text-[10px] text-ink-400">
            Only the buyer, seller and assigned rider can see it. It stops automatically when the delivery ends or you go offline.
          </p>
        </div>
        <button
          onClick={() => void (sharing ? disable() : enable())}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-bold disabled:opacity-50 ${
            sharing
              ? 'border border-jade-500/30 bg-jade-50 text-jade-700 dark:bg-jade-500/10 dark:text-jade-300'
              : 'bg-jade-600 text-white'
          }`}
        >
          <Radio className={`h-3 w-3 ${sharing ? 'animate-pulse' : ''}`} />
          {busy ? 'Saving…' : sharing ? 'Stop sharing' : 'Share location'}
        </button>
      </div>
      {message && (
        <p className="mt-2 flex items-start gap-1 text-[10px] text-ink-500 dark:text-ink-400">
          {message.includes('denied') ? (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-jade-500" />
          )}
          {message}
        </p>
      )}
    </div>
  );
}
