'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, isMapsConfigured } from '@/lib/maps/loadGoogleMaps';
import type { LatLng } from '@/lib/geo';
import { isValidLatLng } from '@/lib/geo';

export type MapMarker = {
  id: string;
  position: LatLng;
  label?: string;
  title?: string;
  color?: string;
  /** pulse ring for live rider */
  pulse?: boolean;
};

type GoogleMapCanvasProps = {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  className?: string;
  height?: string;
  /** Draw a simple path between ordered marker positions */
  path?: LatLng[];
};

/**
 * Interactive Google Maps canvas with iframe Embed fallback when JS API fails / no key.
 */
export default function GoogleMapCanvas({
  center,
  zoom = 14,
  markers = [],
  className = '',
  height = '280px',
  path,
}: GoogleMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polyRef = useRef<google.maps.Polyline | null>(null);
  const [mode, setMode] = useState<'js' | 'embed' | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!isMapsConfigured() || !containerRef.current) {
        if (!cancelled) setMode('embed');
        return;
      }

      const maps = await loadGoogleMaps();
      if (cancelled || !maps || !containerRef.current) {
        if (!cancelled) setMode('embed');
        return;
      }

      if (!mapRef.current) {
        mapRef.current = new maps.Map(containerRef.current, {
          center,
          zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#020617' }] },
            {
              featureType: 'poi',
              stylers: [{ visibility: 'off' }],
            },
          ],
        });
      } else {
        mapRef.current.setCenter(center);
        mapRef.current.setZoom(zoom);
      }

      setMode('js');
    }

    void boot();
    return () => {
      cancelled = true;
    };
    // center/zoom applied in marker effect too
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const maps = typeof window !== 'undefined' ? window.google?.maps : undefined;
    if (!maps || !mapRef.current || mode !== 'js') return;

    mapRef.current.setCenter(center);

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    markers.filter((m) => isValidLatLng(m.position)).forEach((m) => {
      const marker = new maps.Marker({
        map: mapRef.current!,
        position: m.position,
        title: m.title || m.label,
        label: m.label
          ? {
              text: m.label.slice(0, 2).toUpperCase(),
              color: '#fff',
              fontSize: '10px',
              fontWeight: '700',
            }
          : undefined,
        icon: m.color
          ? {
              path: maps.SymbolPath.CIRCLE,
              scale: m.pulse ? 10 : 8,
              fillColor: m.color,
              fillOpacity: 1,
              strokeColor: '#0f172a',
              strokeWeight: 2,
            }
          : undefined,
      });
      markersRef.current.push(marker);
    });

    if (polyRef.current) {
      polyRef.current.setMap(null);
      polyRef.current = null;
    }
    const pathPts = (path || []).filter(isValidLatLng);
    if (pathPts.length >= 2) {
      polyRef.current = new maps.Polyline({
        map: mapRef.current,
        path: pathPts,
        geodesic: true,
        strokeColor: '#10b981',
        strokeOpacity: 0.85,
        strokeWeight: 3,
      });
    }

    if (markers.length > 1) {
      const bounds = new maps.LatLngBounds();
      markers.forEach((m) => {
        if (isValidLatLng(m.position)) bounds.extend(m.position);
      });
      mapRef.current.fitBounds(bounds, 48);
    }
  }, [markers, path, center, mode]);

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const embedSrc = key
    ? `https://www.google.com/maps/embed/v1/view?key=${key}&center=${center.lat},${center.lng}&zoom=${zoom}&maptype=roadmap`
    : `https://maps.google.com/maps?q=${center.lat},${center.lng}&z=${zoom}&output=embed`;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 ${className}`} style={{ height }}>
      <div ref={containerRef} className={`absolute inset-0 ${mode === 'js' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
      {mode !== 'js' && (
        <iframe
          title="Google Maps"
          className="absolute inset-0 h-full w-full border-0"
          src={embedSrc}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
    </div>
  );
}
