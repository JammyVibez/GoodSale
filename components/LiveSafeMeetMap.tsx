'use client';

import React, { useMemo } from 'react';
import { Compass, AlertTriangle, CheckCircle2 } from 'lucide-react';
import GoogleMapCanvas from './GoogleMapCanvas';
import { useLiveLocation } from '@/lib/hooks/useLiveLocation';
import {
  haversineKm,
  estimateEtaMinutes,
  formatDistanceKm,
  DEFAULT_LAGOS,
} from '@/lib/geo';

interface SafeMeetLocation {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  safetyRating: number;
}

interface LiveSafeMeetMapProps {
  location: SafeMeetLocation;
  sellerArrived?: boolean;
  buyerArrived?: boolean;
}

export default function LiveSafeMeetMap({
  location,
  sellerArrived = false,
  buyerArrived = false,
}: LiveSafeMeetMapProps) {
  const { coords: userCoords, error: geoError, source } = useLiveLocation({
    watch: true,
    throttleMs: 8000,
    fallback: DEFAULT_LAGOS,
  });

  const distanceKm = useMemo(() => {
    if (!userCoords) return null;
    return parseFloat(haversineKm(userCoords, { lat: location.lat, lng: location.lng }).toFixed(2));
  }, [userCoords, location.lat, location.lng]);

  const etaMinutes = distanceKm != null ? estimateEtaMinutes(distanceKm) : null;

  const markers = useMemo(
    () => [
      ...(userCoords
        ? [
            {
              id: 'me',
              position: userCoords,
              label: 'You',
              title: 'Your live location',
              color: '#1fb377',
              pulse: true,
            },
          ]
        : []),
      {
        id: 'meet',
        position: { lat: location.lat, lng: location.lng },
        label: 'SM',              title: location.name,
              color: '#0A854B',
      },
    ],
    [userCoords, location]
  );

  return (
    <div className="w-full space-y-4 overflow-hidden rounded-3xl border border-ink-800 bg-ink-900 p-4 shadow-xl">
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-ink-800 bg-ink-950 p-3 text-xs">
        <div className="space-y-0.5">
          <span className="block font-mono text-xs uppercase tracking-wider text-ink-500">
            My Distance
          </span>
          <p className="font-mono text-sm font-extrabold text-jade-400">
            {distanceKm != null ? formatDistanceKm(distanceKm) : 'Calculating...'}
          </p>
        </div>
        <div className="space-y-0.5 border-l border-ink-800 pl-3">
          <span className="block font-mono text-xs uppercase tracking-wider text-ink-500">
            Transit ETA
          </span>
          <p className="font-mono text-sm font-extrabold text-jade-400">
            {etaMinutes != null ? `${etaMinutes} mins` : 'Estimating...'}
          </p>
        </div>
        <div className="space-y-0.5 border-l border-ink-800 pl-3">
          <span className="block font-mono text-xs uppercase tracking-wider text-ink-500">
            Target
          </span>
          <p
            className="truncate font-mono text-xs text-ink-400"
            title={`${location.lat}, ${location.lng}`}
          >
            {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
          </p>
        </div>
      </div>

      <div className="relative">
        <GoogleMapCanvas
          center={{ lat: location.lat, lng: location.lng }}
          zoom={14}
          markers={markers}
          path={userCoords ? [userCoords, { lat: location.lat, lng: location.lng }] : undefined}
          height="176px"
        />

        <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-lg border border-ink-800/80 bg-ink-950/80 px-2 py-1 text-xs font-bold text-ink-300 shadow-md backdrop-blur-md">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-jade-500" />
          <span>Real-time Geotracking</span>
        </div>

        <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between rounded-xl border border-ink-800/80 bg-ink-950/90 p-2 font-mono text-[10px] text-ink-400 backdrop-blur-md">
          <span className="flex items-center gap-1">
            <Compass className="h-3.5 w-3.5 text-jade-400" />
            Live verification check: ACTIVE
          </span>
          {geoError || source === 'fallback' ? (
            <span className="flex items-center gap-0.5 text-ink-500">
              <AlertTriangle className="h-3 w-3" /> Approximate GPS
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-jade-500">
              <CheckCircle2 className="h-3 w-3" /> GPS Locked
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2.5 text-xs">
        <div
          className={`flex flex-1 items-center gap-2 rounded-xl border p-2 ${
            buyerArrived
              ? 'border-jade-500/30 bg-jade-500/10 text-jade-400'
              : 'border-ink-800 bg-ink-950 text-ink-500'
          }`}
        >
          <div className={`h-1.5 w-1.5 rounded-full ${buyerArrived ? 'bg-jade-500' : 'bg-ink-600'}`} />
          <span>Buyer Status: {buyerArrived ? 'Arrived' : 'En route'}</span>
        </div>
        <div
          className={`flex flex-1 items-center gap-2 rounded-xl border p-2 ${
            sellerArrived
              ? 'border-jade-500/30 bg-jade-500/10 text-jade-400'
              : 'border-ink-800 bg-ink-950 text-ink-500'
          }`}
        >
          <div className={`h-1.5 w-1.5 rounded-full ${sellerArrived ? 'bg-jade-500' : 'bg-ink-600'}`} />
          <span>Seller Status: {sellerArrived ? 'Arrived' : 'En route'}</span>
        </div>
      </div>
    </div>
  );
}
