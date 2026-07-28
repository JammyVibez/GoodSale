/**
 * Lazy-load the Google Maps JavaScript API (Places optional).
 */

export type GoogleMapsNamespace = typeof google.maps;

const SCRIPT_ID = 'goodsale-google-maps-js';

type MapsWindow = Window & {
  google?: typeof google;
  __goodsaleMapsPromise?: Promise<GoogleMapsNamespace | null>;
  __goodsaleMapsCallback?: () => void;
};

export function getMapsApiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

export function isMapsConfigured(): boolean {
  return Boolean(getMapsApiKey());
}

export function loadGoogleMaps(libraries: string[] = ['places']): Promise<GoogleMapsNamespace | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  const key = getMapsApiKey();
  if (!key) return Promise.resolve(null);

  const w = window as MapsWindow;

  if (w.google?.maps) {
    return Promise.resolve(w.google.maps);
  }

  if (w.__goodsaleMapsPromise) {
    return w.__goodsaleMapsPromise;
  }

  w.__goodsaleMapsPromise = new Promise((resolve) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      const check = () => {
        if (w.google?.maps) resolve(w.google.maps);
        else setTimeout(check, 50);
      };
      check();
      return;
    }

    w.__goodsaleMapsCallback = () => {
      resolve(w.google?.maps ?? null);
    };

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    const libs = libraries.length ? `&libraries=${libraries.join(',')}` : '';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key
    )}${libs}&callback=__goodsaleMapsCallback&v=weekly`;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return w.__goodsaleMapsPromise;
}
