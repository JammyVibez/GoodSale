/**
 * Server-side route abstraction.
 *
 * Google Distance Matrix is used only when a server API key is configured.
 * Without it, we return a clearly-labelled straight-line estimate; we never
 * fabricate road directions or a precise travel time.
 */
import { haversineKm, type LatLng } from '@/lib/geo';

export type RouteResult = {
  distanceKm: number;
  durationMinutes: number;
  provider: string;
  isEstimate: boolean;
};

export function mapsProviderConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}

function fallbackRoute(pickup: LatLng, destination: LatLng): RouteResult {
  const distanceKm = Math.round(haversineKm(pickup, destination) * 10) / 10;
  // A straight-line distance cannot produce a real road ETA. Keep the value
  // conservative and explicitly mark it as an estimate in the database/UI.
  const durationMinutes = Math.max(1, Math.round((distanceKm / 25) * 60 + 5));
  return {
    distanceKm,
    durationMinutes,
    provider: 'HAVERSINE_ESTIMATE',
    isEstimate: true,
  };
}

export async function resolveRoute(
  pickup?: Partial<LatLng> | null,
  destination?: Partial<LatLng> | null
): Promise<RouteResult | null> {
  if (
    !pickup ||
    !destination ||
    typeof pickup.lat !== 'number' ||
    typeof pickup.lng !== 'number' ||
    typeof destination.lat !== 'number' ||
    typeof destination.lng !== 'number'
  ) {
    return null;
  }

  const p = { lat: pickup.lat, lng: pickup.lng };
  const d = { lat: destination.lat, lng: destination.lng };
  const key =
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';
  if (!key) return fallbackRoute(p, d);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const url =
      'https://maps.googleapis.com/maps/api/distancematrix/json' +
      `?origins=${p.lat},${p.lng}&destinations=${d.lat},${d.lng}` +
      `&mode=driving&units=metric&region=ng&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return fallbackRoute(p, d);
    const payload = (await res.json()) as {
      status?: string;
      rows?: { elements?: { status?: string; distance?: { value?: number }; duration?: { value?: number } }[] }[];
    };
    const element = payload.rows?.[0]?.elements?.[0];
    if (payload.status !== 'OK' || element?.status !== 'OK') return fallbackRoute(p, d);
    const metres = element?.distance?.value;
    const seconds = element?.duration?.value;
    if (typeof metres !== 'number' || typeof seconds !== 'number') return fallbackRoute(p, d);
    return {
      distanceKm: Math.round((metres / 1000) * 10) / 10,
      durationMinutes: Math.max(1, Math.round(seconds / 60)),
      provider: 'GOOGLE_DISTANCE_MATRIX',
      isEstimate: false,
    };
  } catch {
    return fallbackRoute(p, d);
  } finally {
    clearTimeout(timer);
  }
}
