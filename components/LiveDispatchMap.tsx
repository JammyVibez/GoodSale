'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Compass, Navigation, MapPin, Bike, CheckCircle2, AlertTriangle } from 'lucide-react';
import GoogleMapCanvas, { type MapMarker } from './GoogleMapCanvas';
import {
  haversineKm,
  formatDistanceKm,
  isValidLatLng,
  type LatLng,
} from '@/lib/geo';

type LiveDispatchMapProps = {
  rider?: LatLng | null;
  destination?: LatLng | null;
  pickup?: LatLng | null;
  speedKmh?: number | null;
  statusLabel?: string;
  geoError?: string | null;
  gpsLocked?: boolean;
  className?: string;
  height?: string;
};

/**
 * Live GoodDispatch map: pickup → rider → buyer destination with ETA.
 */
export default function LiveDispatchMap({
  rider,
  destination,
  pickup,
  speedKmh,
  statusLabel = 'Live tracking',
  geoError,
  gpsLocked = true,
  className = '',
  height = '320px',
}: LiveDispatchMapProps) {
  const center: LatLng | null = isValidLatLng(rider)
    ? rider
    : isValidLatLng(destination)
      ? destination
      : isValidLatLng(pickup)
        ? pickup
        : null;
  const straightLineKm =
    isValidLatLng(rider) && isValidLatLng(destination)
      ? haversineKm(rider, destination)
      : isValidLatLng(pickup) && isValidLatLng(destination)
        ? haversineKm(pickup, destination)
        : null;
  const [routeMetrics, setRouteMetrics] = useState<{ distanceKm: number; durationMinutes: number } | null>(null);
  const onRouteMetrics = useCallback((metrics: { distanceKm: number; durationMinutes: number } | null) => {
    setRouteMetrics(metrics);
  }, []);
  const route = useMemo(
    () => gpsLocked && isValidLatLng(rider) && isValidLatLng(destination)
      ? { origin: rider, destination }
      : null,
    [gpsLocked, rider, destination]
  );

  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];
    if (isValidLatLng(pickup)) {
      list.push({
        id: 'pickup',
        position: pickup,
        label: 'P',
        title: 'Pickup / seller',
        color: '#0A854B',
      });
    }
    if (isValidLatLng(rider)) {
      list.push({
        id: 'rider',
        position: rider,
        label: 'R',
        title: 'Dispatch rider',
        color: '#1fb377',
        pulse: true,
      });
    }
    if (isValidLatLng(destination)) {
      list.push({
        id: 'dest',
        position: destination,
        label: 'B',
        title: 'Buyer destination',
        color: '#ffffff',
      });
    }
    return list;
  }, [pickup, rider, destination]);

  return (
    <div className={`w-full space-y-3 rounded-3xl border border-ink-800 bg-ink-900 p-4 shadow-xl ${className}`}>
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-ink-800 bg-ink-950 p-3 text-xs">
        <div className="space-y-0.5">
          <span className="block font-mono text-xs tracking-wider text-ink-500">
            Distance
          </span>
          <p className="font-mono text-sm font-semibold text-jade-400">
            {routeMetrics
              ? formatDistanceKm(routeMetrics.distanceKm)
              : gpsLocked && straightLineKm != null
                ? `~${formatDistanceKm(straightLineKm)}`
                : '—'}
          </p>
        </div>
        <div className="space-y-0.5 border-l border-ink-800 pl-3">
          <span className="block font-mono text-xs tracking-wider text-ink-500">
            ETA
          </span>
          <p className="font-mono text-sm font-semibold text-jade-400">
            {routeMetrics ? `~${routeMetrics.durationMinutes} mins` : 'Unavailable'}
          </p>
        </div>
        <div className="space-y-0.5 border-l border-ink-800 pl-3">
          <span className="block font-mono text-xs tracking-wider text-ink-500">
            Speed
          </span>
          <p className="font-mono text-sm font-semibold text-ink-400">
            {gpsLocked && speedKmh != null ? `${Math.round(speedKmh)} km/h` : '—'}
          </p>
        </div>
      </div>

      <div className="relative">
        {center ? (
          <GoogleMapCanvas
            center={center}
            zoom={13}
            markers={markers}
            route={route}
            onRouteMetrics={onRouteMetrics}
            height={height}
          />
        ) : (
          <div className="grid place-items-center rounded-2xl border border-ink-800 bg-ink-950 px-5 text-center text-xs text-ink-400" style={{ height }}>
            No real coordinates are available yet. The map will appear after location data is shared.
          </div>
        )}

        <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-lg border border-ink-800/80 bg-ink-950/80 px-2 py-1 text-xs font-bold text-ink-300 shadow-md backdrop-blur-md">
          <div className={`h-1.5 w-1.5 rounded-full ${gpsLocked ? 'animate-pulse bg-jade-500' : 'bg-ink-400'}`} />
          <span>{statusLabel}</span>
        </div>

        <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between rounded-xl border border-ink-800/80 bg-ink-950/90 p-2 font-mono text-[10px] text-ink-400 backdrop-blur-md">
          <span className="flex items-center gap-1">
            <Compass className="h-3.5 w-3.5 text-jade-400" />
            GoodDispatch™ GPS
          </span>
          {geoError || !gpsLocked ? (
            <span className="flex items-center gap-0.5 text-ink-500">
              <AlertTriangle className="h-3 w-3" /> GPS unavailable
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-jade-500">
              <CheckCircle2 className="h-3 w-3" /> GPS Locked
            </span>
          )}
        </div>
      </div>

      {gpsLocked && straightLineKm != null && !routeMetrics && (
        <p className="text-[10px] text-ink-500">Distance is a straight-line estimate. Road route and ETA require a configured Google Maps key.</p>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-ink-400">
        {isValidLatLng(pickup) && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-ink-800 bg-ink-950 px-2 py-1">
            <MapPin className="h-3 w-3 text-jade-400" /> Pickup
          </span>
        )}
        {isValidLatLng(rider) && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-ink-800 bg-ink-950 px-2 py-1">
            <Bike className="h-3 w-3 text-jade-400" /> {gpsLocked ? 'Rider live' : 'Last rider location'}
          </span>
        )}
        {isValidLatLng(destination) && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-ink-800 bg-ink-950 px-2 py-1">
            <Navigation className="h-3 w-3 text-jade-400" /> Destination
          </span>
        )}
      </div>
    </div>
  );
}
