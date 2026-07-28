'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/lib/geo';
import { DEFAULT_LAGOS } from '@/lib/geo';

export type LiveLocationState = {
  coords: LatLng | null;
  accuracy: number | null;
  error: string | null;
  watching: boolean;
  source: 'gps' | 'fallback' | null;
  refresh: () => void;
};

type Options = {
  /** Continuously watch position (dispatch riders) */
  watch?: boolean;
  /** Minimum ms between updates when watching */
  throttleMs?: number;
  /** Use Lagos fallback when permission denied */
  fallback?: LatLng | null;
  enabled?: boolean;
  highAccuracy?: boolean;
};

/**
 * Browser geolocation with optional watch + throttle for rider telemetry.
 */
export function useLiveLocation(options: Options = {}): LiveLocationState {
  const {
    watch = false,
    throttleMs = 5000,
    fallback = DEFAULT_LAGOS,
    enabled = true,
    highAccuracy = true,
  } = options;

  const [coords, setCoords] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [source, setSource] = useState<'gps' | 'fallback' | null>(null);
  const lastEmit = useRef(0);
  const watchId = useRef<number | null>(null);

  const applyPosition = useCallback(
    (position: GeolocationPosition) => {
      const now = Date.now();
      if (watch && now - lastEmit.current < throttleMs) return;
      lastEmit.current = now;
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setAccuracy(position.coords.accuracy ?? null);
      setSource('gps');
      setError(null);
    },
    [throttleMs, watch]
  );

  const applyError = useCallback(
    (err: GeolocationPositionError | Error) => {
      const message = 'message' in err ? err.message : 'Geolocation unavailable';
      setError(message);
      if (fallback) {
        setCoords(fallback);
        setSource('fallback');
      }
    },
    [fallback]
  );

  const refresh = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      applyError(new Error('Browser does not support geolocation.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(applyPosition, applyError, {
      enableHighAccuracy: highAccuracy,
      timeout: 12000,
      maximumAge: 5000,
    });
  }, [applyError, applyPosition, highAccuracy]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    if (!navigator.geolocation) {
      applyError(new Error('Browser does not support geolocation.'));
      return;
    }

    refresh();

    if (watch) {
      setWatching(true);
      watchId.current = navigator.geolocation.watchPosition(applyPosition, applyError, {
        enableHighAccuracy: highAccuracy,
        timeout: 15000,
        maximumAge: 3000,
      });
    }

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setWatching(false);
    };
  }, [enabled, watch, refresh, applyPosition, applyError, highAccuracy]);

  return { coords, accuracy, error, watching, source, refresh };
}
