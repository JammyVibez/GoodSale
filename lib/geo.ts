/**
 * Shared geolocation helpers for GoodDispatch™ and SafeMeet™.
 */

export type LatLng = { lat: number; lng: number };

/** Lagos / Abuja centroids and common delivery presets */
export const CITY_COORDS: Record<string, LatLng> = {
  lagos: { lat: 6.5244, lng: 3.3792 },
  ikeja: { lat: 6.6018, lng: 3.3515 },
  lekki: { lat: 6.4474, lng: 3.4723 },
  gbagada: { lat: 6.55, lng: 3.39 },
  victoriaisland: { lat: 6.4281, lng: 3.4219 },
  yaba: { lat: 6.5095, lng: 3.371 },
  surulere: { lat: 6.4969, lng: 3.356 },
  abuja: { lat: 9.0765, lng: 7.3986 },
  'abuja cbd': { lat: 9.0579, lng: 7.4951 },
  garki: { lat: 9.033, lng: 7.486 },
  wuse: { lat: 9.071, lng: 7.483 },
};

export const DEFAULT_LAGOS: LatLng = CITY_COORDS.gbagada;

export const LOCATION_PRESETS = {
  lekki: {
    address: '24, Admiralty Way, Lekki Phase 1, Lagos',
    city: 'Lekki',
    state: 'Lagos State',
    ...CITY_COORDS.lekki,
  },
  abuja: {
    address: 'Plot 502, Constitution Avenue, Central Business District, Abuja',
    city: 'Abuja CBD',
    state: 'FCT Abuja',
    ...CITY_COORDS['abuja cbd'],
  },
  gbagada: {
    address: '14, Gbagada Phase-2, Gbagada, Lagos',
    city: 'Gbagada',
    state: 'Lagos State',
    ...CITY_COORDS.gbagada,
  },
} as const;

/** Haversine distance in kilometers */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** City-traffic ETA (minutes) assuming ~30 km/h + Lagos cushion */
export function estimateEtaMinutes(distanceKm: number, avgSpeedKmh = 30): number {
  const raw = (distanceKm / avgSpeedKmh) * 60;
  const cushion = distanceKm > 5 ? 15 : 5;
  return Math.max(1, Math.round(raw + cushion));
}

export function formatDistanceKm(km: number): string {
  if (km < 0.1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

/** Resolve approximate coords from city / state text when GPS is unavailable */
export function resolveCityCoords(city?: string, state?: string, address?: string): LatLng {
  const hay = `${city || ''} ${state || ''} ${address || ''}`.toLowerCase().replace(/\s+/g, ' ');
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (hay.includes(key)) return coords;
  }
  if (hay.includes('fct') || hay.includes('abuja')) return CITY_COORDS.abuja;
  return DEFAULT_LAGOS;
}

export function isValidLatLng(value?: Partial<LatLng> | null): value is LatLng {
  return (
    !!value &&
    typeof value.lat === 'number' &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    Math.abs(value.lat) <= 90 &&
    Math.abs(value.lng) <= 180
  );
}

/** Prefer live GPS, else stored coords, else city guess */
export function bestCoords(
  primary?: Partial<LatLng> | null,
  fallback?: Partial<LatLng> | null,
  city?: string,
  state?: string,
  address?: string
): LatLng {
  if (isValidLatLng(primary)) return { lat: primary.lat, lng: primary.lng };
  if (isValidLatLng(fallback)) return { lat: fallback.lat, lng: fallback.lng };
  return resolveCityCoords(city, state, address);
}

export type PartnerProximity<T> = {
  partner: T;
  distanceKm: number;
  etaMinutes: number;
  score: number;
};

type ScoreablePartner = {
  id: number;
  rating?: number;
  trustScore?: number;
  acceptanceRate?: number;
  activeDeliveriesCount?: number;
  lastLat?: number;
  lastLng?: number;
  city?: string;
  state?: string;
  address?: string;
};

/**
 * Rank delivery partners by real proximity to a destination + trust signals.
 * Used by Smart Match and seller “nearby rider” surfaces.
 */
export function rankPartnersByProximity<T extends ScoreablePartner>(
  origin: LatLng,
  partners: T[],
  opts?: { maxKm?: number }
): PartnerProximity<T>[] {
  const maxKm = opts?.maxKm ?? 80;
  return partners
    .map((partner) => {
      const loc = bestCoords(
        { lat: partner.lastLat, lng: partner.lastLng },
        null,
        partner.city,
        partner.state,
        partner.address
      );
      const distanceKm = parseFloat(haversineKm(origin, loc).toFixed(2));
      const etaMinutes = estimateEtaMinutes(distanceKm);
      const distanceScore = Math.max(0, 35 - distanceKm * 2.5);
      const ratingScore = partner.rating ? (partner.rating / 5) * 20 : 12;
      const trustScoreValue = ((partner.trustScore ?? 50) / 100) * 20;
      const acceptanceScore = ((partner.acceptanceRate ?? 80) / 100) * 15;
      const workloadScore = Math.max(0, 10 - (partner.activeDeliveriesCount ?? 0) * 4);
      const score = Math.round(
        distanceScore + ratingScore + trustScoreValue + acceptanceScore + workloadScore
      );
      return { partner, distanceKm, etaMinutes, score };
    })
    .filter((row) => row.distanceKm <= maxKm)
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
}

/** Geocode via Google Maps Geocoding API when a key is present (browser). */
export async function geocodeAddress(
  address: string,
  apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
): Promise<LatLng | null> {
  if (!address.trim()) return null;
  if (!apiKey) return resolveCityCoords(undefined, undefined, address);

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${apiKey}&region=ng`;
    const res = await fetch(url);
    if (!res.ok) return resolveCityCoords(undefined, undefined, address);
    const data = (await res.json()) as {
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    const loc = data.results?.[0]?.geometry?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch {
    // fall through
  }
  return resolveCityCoords(undefined, undefined, address);
}
