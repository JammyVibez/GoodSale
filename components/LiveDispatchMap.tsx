'use client';

import React, { useMemo } from 'react';
import { Compass, Navigation, MapPin, Bike, CheckCircle2, AlertTriangle } from 'lucide-react';
import GoogleMapCanvas, { type MapMarker } from './GoogleMapCanvas';
import {
  haversineKm,
  estimateEtaMinutes,
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
  const center: LatLng = isValidLatLng(rider)
    ? rider
    : isValidLatLng(destination)
      ? destination
      : isValidLatLng(pickup)
        ? pickup
        : { lat: 6.5244, lng: 3.3792 };

  const distanceKm =
    isValidLatLng(rider) && isValidLatLng(destination)
      ? haversineKm(rider, destination)
      : isValidLatLng(pickup) && isValidLatLng(destination)
        ? haversineKm(pickup, destination)
        : null;

  const eta =
    distanceKm != null
      ? estimateEtaMinutes(distanceKm, speedKmh && speedKmh > 5 ? speedKmh : 30)
      : null;

  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];
    if (isValidLatLng(pickup)) {
      list.push({
        id: 'pickup',
        position: pickup,
        label: 'P',
        title: 'Pickup / seller',
        color: '#10b981',
      });
    }
    if (isValidLatLng(rider)) {
      list.push({
        id: 'rider',
        position: rider,
        label: 'R',
        title: 'Dispatch rider',
        color: '#6366f1',
        pulse: true,
      });
    }
    if (isValidLatLng(destination)) {
      list.push({
        id: 'dest',
        position: destination,
        label: 'B',
        title: 'Buyer destination',
        color: '#f43f5e',
      });
    }
    return list;
  }, [pickup, rider, destination]);

  const path = useMemo(() => {
    const pts: LatLng[] = [];
    if (isValidLatLng(pickup)) pts.push(pickup);
    if (isValidLatLng(rider)) pts.push(rider);
    if (isValidLatLng(destination)) pts.push(destination);
    return pts;
  }, [pickup, rider, destination]);

  return (
    <div className={`w-full space-y-3 rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl ${className}`}>
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs">
        <div className="space-y-0.5">
          <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-500">
            Distance
          </span>
          <p className="font-mono text-sm font-extrabold text-emerald-400">
            {distanceKm != null ? formatDistanceKm(distanceKm) : '—'}
          </p>
        </div>
        <div className="space-y-0.5 border-l border-slate-800 pl-3">
          <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-500">
            ETA
          </span>
          <p className="font-mono text-sm font-extrabold text-indigo-400">
            {eta != null ? `${eta} mins` : '—'}
          </p>
        </div>
        <div className="space-y-0.5 border-l border-slate-800 pl-3">
          <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-500">
            Speed
          </span>
          <p className="font-mono text-sm font-extrabold text-amber-400">
            {speedKmh != null ? `${Math.round(speedKmh)} km/h` : '—'}
          </p>
        </div>
      </div>

      <div className="relative">
        <GoogleMapCanvas center={center} zoom={13} markers={markers} path={path} height={height} />

        <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-lg border border-slate-800/80 bg-slate-950/80 px-2 py-1 text-[9px] font-bold text-slate-300 shadow-md backdrop-blur-md">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span>{statusLabel}</span>
        </div>

        <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/90 p-2 font-mono text-[8px] text-slate-400 backdrop-blur-md">
          <span className="flex items-center gap-1">
            <Compass className="h-3.5 w-3.5 text-indigo-400" />
            GoodDispatch™ GPS
          </span>
          {geoError || !gpsLocked ? (
            <span className="flex items-center gap-0.5 text-amber-500">
              <AlertTriangle className="h-3 w-3" /> Approximate
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-emerald-500">
              <CheckCircle2 className="h-3 w-3" /> GPS Locked
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
        {isValidLatLng(pickup) && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1">
            <MapPin className="h-3 w-3 text-emerald-400" /> Pickup
          </span>
        )}
        {isValidLatLng(rider) && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1">
            <Bike className="h-3 w-3 text-indigo-400" /> Rider live
          </span>
        )}
        {isValidLatLng(destination) && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1">
            <Navigation className="h-3 w-3 text-rose-400" /> Destination
          </span>
        )}
      </div>
    </div>
  );
}
