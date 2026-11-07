'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, MapPin, Navigation, Radio, Route } from 'lucide-react';
import type { Delivery, DeliveryTrackingView } from '@/lib/types';
import { isDeliveryTerminal } from '@/lib/delivery';
import { formatDistanceKm, isValidLatLng, type LatLng } from '@/lib/geo';
import { dbOperations } from '@/lib/store';
import GoogleMapCanvas, { type MapMarker } from './GoogleMapCanvas';

const TRACKING_LABELS: Record<DeliveryTrackingView['trackingStatus'], string> = {
  LIVE: 'Live location',
  ENDED: 'Delivery ended',
  PERMISSION_DENIED: 'Rider denied location permission',
  NOT_SHARING: 'Rider is not sharing location',
  RIDER_OFFLINE: 'Rider is offline',
  RIDER_UNAVAILABLE: 'Rider is unavailable',
  NOT_ASSIGNED: 'No rider assigned',
  NO_LOCATION: 'Waiting for rider location',
  STALE: 'Location is stale',
  UNAVAILABLE: 'Location unavailable',
};

function updatedText(value?: string) {
  if (!value) return 'No location update yet';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return 'No location update yet';
  if (ms < 60_000) return 'Updated just now';
  const mins = Math.floor(ms / 60_000);
  return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`;
}

export default function LiveDeliveryTracking({ delivery }: { delivery: Delivery }) {
  const [tracking, setTracking] = useState<DeliveryTrackingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminal = isDeliveryTerminal(delivery.status);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await dbOperations.fetchDeliveryTracking(delivery.id);
      if (cancelled) return;
      if (result.error) setError(result.error);
      else {
        setError(null);
        setTracking(result.data || null);
      }
    };
    void load();
    if (terminal) return () => { cancelled = true; };
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [delivery.id, terminal]);

  const rider = useMemo<LatLng | null>(() => {
    if (terminal) return null;
    const location = tracking?.riderLocation;
    return location && isValidLatLng(location) ? { lat: location.lat, lng: location.lng } : null;
  }, [terminal, tracking?.riderLocation]);
  const destination = useMemo<LatLng | null>(() => {
    const location = tracking?.destination;
    return location && isValidLatLng(location) ? { lat: location.lat, lng: location.lng } : null;
  }, [tracking?.destination]);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (destination) {
      list.push({ id: 'destination', position: destination, label: 'B', title: 'Delivery destination', color: '#ffffff' });
    }
    if (rider) {
      list.push({ id: 'rider', position: rider, label: 'R', title: 'Assigned rider', color: '#1fb377', pulse: true });
    }
    return list;
  }, [rider, destination]);

  const mapCenter = rider || destination;
  const statusLabel = terminal ? 'Delivery ended' : tracking ? TRACKING_LABELS[tracking.trackingStatus] : 'Checking location…';
  const active = Boolean(tracking?.trackingActive && rider);

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="flex items-center gap-1.5 text-xs font-bold text-ink-800 dark:text-ink-100">
            <Navigation className="h-4 w-4 text-jade-500" /> Live rider tracking
          </h5>
          <p className="mt-1 text-[11px] text-ink-400">
            Location is shared only during this active delivery. It stops when the delivery ends.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
            active
              ? 'bg-jade-500/10 text-jade-700 dark:text-jade-400'
              : 'bg-ink-500/10 text-ink-500 dark:text-ink-300'
          }`}
        >
          <Radio className={`h-3 w-3 ${active ? 'animate-pulse' : ''}`} />
          {statusLabel}
        </span>
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-ink-500/20 bg-ink-500/5 p-3 text-[11px] text-ink-600 dark:text-ink-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      ) : mapCenter ? (
        <div className="mt-3">
          <GoogleMapCanvas center={mapCenter} zoom={14} markers={markers} height="260px" />
          <p className="mt-2 text-[10px] text-ink-400">
            The line is intentionally not drawn: road geometry is only shown by a configured map provider, not invented here.
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-ink-200 p-6 text-center dark:border-ink-700">
          <MapPin className="mx-auto h-6 w-6 text-ink-300 dark:text-ink-600" />
          <p className="mt-2 text-xs font-bold text-ink-600 dark:text-ink-300">Location unavailable</p>
          <p className="mt-1 text-[11px] text-ink-400">
            We will show a real rider location here only after the assigned rider grants permission and starts sharing.
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
        <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950/60">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
            <Clock3 className="h-3 w-3" /> Last update
          </span>
          <p className="mt-1 font-semibold text-ink-700 dark:text-ink-300">
            {terminal ? 'Tracking ended' : active ? updatedText(tracking?.lastUpdated) : tracking?.lastUpdated ? updatedText(tracking.lastUpdated) : 'Location unavailable'}
          </p>
        </div>
        <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950/60">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
            <Route className="h-3 w-3" /> Route
          </span>
          <p className="mt-1 font-semibold text-ink-700 dark:text-ink-300">
            {tracking?.routeDistanceKm != null
              ? `${formatDistanceKm(tracking.routeDistanceKm)}${tracking.routeDurationMinutes ? ` · ~${tracking.routeDurationMinutes} min` : ''}`
              : 'Route unavailable'}
          </p>
          <p className="text-[10px] text-ink-400">
            {tracking?.routeIsEstimate && tracking.routeDistanceKm != null
              ? 'Straight-line estimate'
              : tracking?.routeProvider
                ? 'Provider road distance'
                : 'Needs coordinates'}
          </p>
        </div>
        <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950/60">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
            <MapPin className="h-3 w-3" /> Destination
          </span>
          <p className="mt-1 truncate font-semibold text-ink-700 dark:text-ink-300">
            {[delivery.deliveryCity, delivery.deliveryState].filter(Boolean).join(', ') || 'Not set'}
          </p>
          <p className="text-[10px] text-ink-400">{destination ? 'Coordinates available' : 'No destination coordinates'}</p>
        </div>
      </div>
    </div>
  );
}
