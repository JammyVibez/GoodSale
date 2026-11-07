'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2,
  ChevronRight, Clock3, Copy, ExternalLink, HelpCircle, KeyRound, Loader2,
  MapPin, MessageSquare, Navigation, Package, Phone, Radio, RefreshCw,
  ShieldCheck, Star, Truck, UserRound, XCircle,
} from 'lucide-react';
import type { ShipmentTrackingResult } from '@/lib/types';
import { deliveryStatusLabel, isDeliveryTerminal } from '@/lib/delivery';
import { formatDistanceKm, isValidLatLng, type LatLng } from '@/lib/geo';
import { toast } from '@/lib/feedback';
import GoogleMapCanvas, { type MapMarker } from '@/components/GoogleMapCanvas';
import { SmartImage } from '@/components/ui/SmartImage';
import Logo from '@/components/LogoIcon';

const LIVE_REASON: Record<string, string> = {
  ENDED: 'Live tracking has ended for this delivery.',
  NOT_ACTIVE: 'Live tracking starts once the rider is assigned and the shipment is active.',
  NOT_ASSIGNED: 'A rider has not been assigned yet. The timeline will update as the shipment moves.',
  RIDER_UNAVAILABLE: 'The assigned rider is currently unavailable.',
  RIDER_OFFLINE: 'The rider is offline. Live location is paused.',
  PERMISSION_DENIED: 'The rider has not granted location permission.',
  NOT_SHARING: 'The rider is not sharing live location right now.',
  NO_LOCATION: 'Waiting for the first real rider location update.',
  STALE: 'The last rider location is stale, so live tracking is paused.',
  DELIVERY_ENDED: 'This delivery has ended. Live tracking has stopped.',
  UNAVAILABLE: 'Live location is unavailable for this shipment.',
};

function statusClasses(status: string): string {
  if (status === 'DELIVERED') return 'bg-jade-500/15 text-jade-700 dark:text-jade-300 border-jade-500/30';
  if (status === 'CANCELLED' || status === 'RETURNED_TO_SELLER' || status === 'FAILED_DELIVERY') {
    return 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/20';
  }
  if (['PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_HUB', 'OUT_FOR_DELIVERY'].includes(status)) {
    return 'bg-gold-300/20 text-ink-700 dark:text-gold-200 border-gold-400/30';
  }
  return 'bg-jade-500/10 text-jade-700 dark:text-jade-300 border-jade-500/20';
}

function timeText(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function relativeText(value?: string): string {
  if (!value) return 'No update yet';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return 'No update yet';
  if (ms < 60_000) return 'Updated just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `Updated ${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

function BrandHeader() {
  return (
    <header className="border-b border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-950/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <Link href="/" className="rounded-xl" aria-label="GoodSale home">
          <Logo iconSize={34} textColorClass="text-ink-900 dark:text-white" />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/track" className="hidden rounded-full border border-ink-200 px-3 py-1.5 text-[11px] font-bold text-ink-600 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:text-ink-300 sm:inline-flex">
            Track another shipment
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-jade-600 px-3.5 py-2 text-[11px] font-bold text-white hover:bg-jade-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Marketplace
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function ShipmentTrackingPage({ trackingId }: { trackingId: string }) {
  const [data, setData] = useState<ShipmentTrackingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [pin, setPin] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueReason, setIssueReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [roadRoute, setRoadRoute] = useState<{ distanceKm: number; durationMinutes: number } | null>(null);

  const load = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const res = await fetch(`/api/tracking/${encodeURIComponent(trackingId)}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Shipment not found.');
      }
      setData(payload.data as ShipmentTrackingResult);
      setError(null);
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : 'Could not load this shipment.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [trackingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const terminal = data ? isDeliveryTerminal(data.status) : false;
  useEffect(() => {
    if (!data || terminal) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [data, terminal, load]);

  const copyTracking = async () => {
    try {
      await navigator.clipboard.writeText(data?.trackingId || trackingId);
      setCopied(true);
      toast.success('Tracking ID copied.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Select the tracking ID and copy it manually.');
    }
  };

  const revealCode = async () => {
    if (!data?.deliveryId) return;
    setLoadingCode(true);
    try {
      const res = await fetch('/api/deliveries/confirmation-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId: data.deliveryId }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not generate a confirmation code.');
      const next = payload.data?.code as string | undefined;
      if (!next) throw new Error('Could not generate a confirmation code.');
      setCode(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate a confirmation code.');
    } finally {
      setLoadingCode(false);
    }
  };

  const confirmReceipt = async () => {
    if (!data?.order?.id || !/^\d{4,8}$/.test(pin.trim())) {
      toast.error('Enter the 6-digit delivery PIN from your order.');
      return;
    }
    setConfirming(true);
    try {
      const res = await fetch('/api/orders/release-escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.order.id, pin: pin.trim() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not confirm receipt.');
      toast.success('Receipt confirmed. Escrow has been released to the seller.');
      setPin('');
      await load(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not confirm receipt.');
    } finally {
      setConfirming(false);
    }
  };

  const reportIssue = async () => {
    if (!data?.order?.id) return;
    if (issueReason.trim().length < 10) {
      toast.error('Describe the issue in at least 10 characters.');
      return;
    }
    setReporting(true);
    try {
      const res = await fetch('/api/disputes/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.order.id, reason: issueReason.trim() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not open a dispute.');
      toast.success('Issue reported. GoodSale support will review it.');
      setIssueReason('');
      setIssueOpen(false);
      await load(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not report this issue.');
    } finally {
      setReporting(false);
    }
  };

  const riderLocation = useMemo<LatLng | null>(() => {
    const point = data?.live?.riderLocation;
    if (!data?.live?.trackingActive || !point) return null;
    return isValidLatLng(point) ? { lat: point.lat, lng: point.lng } : null;
  }, [data?.live]);

  const destination = useMemo<LatLng | null>(() => {
    const point = data?.live?.destination || (data?.destination.lat != null && data.destination.lng != null
      ? { lat: data.destination.lat, lng: data.destination.lng }
      : null);
    return point && isValidLatLng(point) ? { lat: point.lat, lng: point.lng } : null;
  }, [data?.live?.destination, data?.destination.lat, data?.destination.lng]);

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (destination) {
      list.push({ id: 'destination', position: destination, label: 'B', title: 'Delivery destination', color: '#d4af37' });
    }
    if (riderLocation) {
      list.push({ id: 'rider', position: riderLocation, label: 'R', title: 'GoodSale rider', color: '#1fb377', pulse: true });
    }
    return list;
  }, [destination, riderLocation]);

  const mapCenter = riderLocation || destination;
  const liveActive = Boolean(riderLocation && data?.live?.trackingActive);
  const route = useMemo(
    () => riderLocation && destination ? { origin: riderLocation, destination } : null,
    [riderLocation, destination]
  );
  const onRoadRoute = useCallback((metrics: { distanceKm: number; durationMinutes: number } | null) => {
    setRoadRoute(metrics);
  }, []);
  useEffect(() => {
    setRoadRoute(null);
  }, [data?.live?.lastUpdated]);
  const terminalMessage =
    data?.status === 'CANCELLED'
      ? 'This shipment was cancelled. Live tracking has stopped.'
      : data?.status === 'RETURNED_TO_SELLER'
        ? 'This shipment was returned to the seller. Live tracking has stopped.'
        : 'Delivered. Live rider tracking has stopped.';

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
        <BrandHeader />
        <div className="mx-auto grid max-w-4xl place-items-center px-4 py-28">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-jade-500 border-t-transparent" />
            <p className="mt-4 text-sm font-semibold text-ink-500 dark:text-ink-300">Checking your shipment…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
        <BrandHeader />
        <div className="mx-auto max-w-lg px-4 py-20 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ink-500/10 text-ink-500">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold text-ink-900 dark:text-white">Shipment not found</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{error || 'Check the tracking ID and try again.'}</p>
          <Link href="/track" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-jade-600 px-5 py-3 text-xs font-bold text-white hover:bg-jade-700">
            Try another tracking ID <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const isPublic = !data.authorized;
  const isBuyer = data.viewerRole === 'BUYER';

  return (
    <div className="min-h-screen bg-ink-50 pb-16 dark:bg-ink-950">
      <BrandHeader />

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6 sm:py-7">
        <section className="overflow-hidden rounded-[1.75rem] border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900">
          <div className="relative overflow-hidden bg-gradient-to-br from-jade-950 via-jade-900 to-jade-800 px-4 py-5 text-white sm:px-6 sm:py-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 90% 5%, rgba(212,175,55,0.55), transparent 42%), radial-gradient(circle at 8% 95%, rgba(255,255,255,0.14), transparent 45%)',
              }}
            />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-200">
                    <ShieldCheck className="h-3 w-3" /> Escrow protected
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClasses(data.status)} bg-white/10`}>
                    {deliveryStatusLabel(data.status)}
                  </span>
                </div>
                <button type="button" onClick={() => void load(true)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/70 hover:text-white">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </button>
              </div>

              <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">GoodSale shipment tracking</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{data.trackingId}</h1>
                    <button
                      type="button"
                      onClick={() => void copyTracking()}
                      aria-label="Copy tracking ID"
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-white/10 text-white/80 hover:bg-white/20"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/65">
                    <span>Order <strong className="font-mono text-white/90">{data.orderNumber}</strong></span>
                    {data.order?.status && <span>Payment <strong className="text-white/90">{data.order.status.replace(/_/g, ' ')}</strong></span>}
                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {relativeText(data.lastUpdated)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-white/50">Estimated delivery</p>
                    <p className="mt-0.5 text-[11px] font-bold">
                      {data.deliveredAt
                        ? 'Delivered'
                        : data.estimatedDeliveryDate
                          ? new Date(`${data.estimatedDeliveryDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                          : 'Not confirmed yet'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-white/50">Delivery</p>
                    <p className="mt-0.5 text-[11px] font-bold">{data.deliveryMethod === 'PICKUP' ? 'Store pickup' : data.deliveryMethod === 'THIRD_PARTY_COURIER' ? 'Courier' : 'GoodSale rider'}</p>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 sm:col-span-1">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-white/50">Route</p>
                    <p className="mt-0.5 truncate text-[11px] font-bold">{data.destination.city || '—'}{data.destination.state ? `, ${data.destination.state}` : ''}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isPublic && (
            <div className="flex items-start gap-2 border-t border-ink-100 bg-gold-300/[0.08] px-4 py-3 text-[11px] text-ink-600 dark:border-ink-800 dark:text-ink-300 sm:px-6">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-600" />
              <p>
                <strong>Public tracking view.</strong> Progress is visible, but buyer, seller, address, phone, rider identity and GPS are hidden. Sign in as the buyer or seller for private delivery details.
              </p>
            </div>
          )}
        </section>

        {data.shipments.length > 1 && (
          <section className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Seller shipments in this order</p>
              <span className="text-[10px] font-semibold text-ink-400">{data.shipments.length} total</span>
            </div>
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
              {data.shipments.map((shipment) => (
                <Link
                  key={shipment.trackingId}
                  href={`/track/${shipment.trackingId}`}
                  className={`min-w-[190px] rounded-xl border p-2.5 transition-colors ${
                    shipment.isCurrent
                      ? 'border-jade-500 bg-jade-500/[0.06]'
                      : 'border-ink-200 hover:border-jade-400 dark:border-ink-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-ink-800 dark:text-ink-200">{shipment.trackingId}</span>
                    {shipment.isCurrent && <span className="text-[9px] font-bold text-jade-600">Current</span>}
                  </div>
                  <p className="mt-1 truncate text-[10px] font-semibold text-ink-700 dark:text-ink-300">{shipment.productTitle || 'Tracked shipment'}</p>
                  <p className="mt-0.5 text-[9px] text-ink-400">{deliveryStatusLabel(shipment.status)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.45fr_1fr]">
          <div className="space-y-4">
            {liveActive && mapCenter ? (
              <section className="relative overflow-hidden rounded-[1.75rem] border border-ink-200 bg-ink-950 shadow-sm dark:border-ink-800">
                <div className="relative h-[46vh] min-h-[340px] max-h-[560px]">
                  <GoogleMapCanvas
                    center={mapCenter}
                    zoom={15}
                    markers={markers}
                    route={route}
                    onRouteMetrics={onRoadRoute}
                    height="100%"
                    className="h-full rounded-none border-0"
                  />
                  <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-950/80 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur">
                      <Radio className="h-3 w-3 animate-pulse text-jade-400" /> Live rider location
                    </span>
                    <span className="rounded-full bg-ink-950/80 px-3 py-1.5 text-[10px] font-semibold text-white/80 backdrop-blur">
                      {relativeText(data.live?.lastUpdated)}
                    </span>
                  </div>
                </div>

                <div className="relative -mt-12 rounded-t-[1.75rem] bg-white px-4 pb-4 pt-4 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:bg-ink-900 sm:px-5">
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-200 dark:bg-ink-700" />
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-jade-500/10 text-sm font-black text-jade-700 dark:text-jade-300">
                      {data.rider?.photoUrl ? (
                        <img src={data.rider.photoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserRound className="h-6 w-6" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-bold text-ink-900 dark:text-white">{data.rider?.name || 'Assigned rider'}</p>
                        {data.rider && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-gold-300/20 px-1.5 py-0.5 text-[9px] font-bold text-ink-600 dark:text-gold-200">
                            <Star className="h-2.5 w-2.5 fill-current" /> {data.rider.rating || '—'}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {[data.rider?.vehicleType?.replace(/_/g, ' '), data.rider?.vehicle, data.rider?.plateNumber].filter(Boolean).join(' · ') || 'Vehicle details unavailable'}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-jade-700 dark:text-jade-300">{deliveryStatusLabel(data.status)}</p>
                    </div>
                    {data.rider?.phone ? (
                      <a href={`tel:${data.rider.phone}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-jade-600 px-3 py-2.5 text-[10px] font-bold text-white hover:bg-jade-700">
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-ink-50 px-2.5 py-2 dark:bg-ink-950/60">
                      <p className="text-[8px] font-bold uppercase tracking-wide text-ink-400">Last update</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-ink-700 dark:text-ink-300">{relativeText(data.live?.lastUpdated)}</p>
                    </div>
                    <div className="rounded-xl bg-ink-50 px-2.5 py-2 dark:bg-ink-950/60">
                      <p className="text-[8px] font-bold uppercase tracking-wide text-ink-400">Route</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-ink-700 dark:text-ink-300">
                        {roadRoute
                          ? formatDistanceKm(roadRoute.distanceKm)
                          : data.live?.routeDistanceKm != null
                            ? `~${formatDistanceKm(data.live.routeDistanceKm)}`
                            : 'Unavailable'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-ink-50 px-2.5 py-2 dark:bg-ink-950/60">
                      <p className="text-[8px] font-bold uppercase tracking-wide text-ink-400">Arrival</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-ink-700 dark:text-ink-300">
                        {roadRoute
                          ? `~${roadRoute.durationMinutes} min`
                          : data.live?.routeDurationMinutes != null
                            ? `~${data.live.routeDurationMinutes} min`
                            : 'ETA unavailable'}
                      </p>
                    </div>
                  </div>
                  {roadRoute ? (
                    <p className="mt-2 text-[9px] text-ink-400">Route and arrival time use Google Maps driving directions.</p>
                  ) : data.live?.routeIsEstimate && data.live.routeDistanceKm != null ? (
                    <p className="mt-2 text-[9px] text-ink-400">Distance is a labelled straight-line estimate. Road route and ETA are unavailable without Maps routing.</p>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="rounded-[1.75rem] border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-500/10 text-ink-500">
                    {terminal ? <CheckCircle2 className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-ink-900 dark:text-white">
                      {terminal ? 'Live tracking has stopped' : 'Live map unavailable right now'}
                    </h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                      {terminal
                        ? terminalMessage
                        : data.deliveryMethod === 'THIRD_PARTY_COURIER'
                          ? 'Courier shipments show verified courier milestones below. GoodSale does not invent a local rider GPS position for interstate deliveries.'
                          : isPublic
                            ? 'Live rider location is private. Sign in as the buyer or seller to see the map when a rider is sharing.'
                            : data.live
                              ? LIVE_REASON[data.live.trackingStatus] || LIVE_REASON[data.live.reason] || 'The rider is not sharing a real location yet.'
                              : 'Live location will appear only after a rider is assigned and starts sharing.'}
                    </p>
                    {data.live && !data.live.trackingActive && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-1 text-[9px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                        <AlertTriangle className="h-2.5 w-2.5" /> {data.live.trackingStatus.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-[1.75rem] border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">Shipment journey</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">Every entry below comes from a real backend event and timestamp.</p>
                </div>
                <span className="rounded-full bg-ink-100 px-2 py-1 text-[9px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                  {data.events.length} update{data.events.length === 1 ? '' : 's'}
                </span>
              </div>

              {data.events.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-dashed border-ink-200 p-6 text-center dark:border-ink-700">
                  <Clock3 className="mx-auto h-6 w-6 text-ink-300 dark:text-ink-600" />
                  <p className="mt-2 text-xs font-bold text-ink-600 dark:text-ink-300">Waiting for the first tracking event</p>
                  <p className="mt-1 text-[10px] text-ink-400">Nothing has been recorded by the delivery system yet.</p>
                </div>
              ) : (
                <ol className="relative mt-5 space-y-0">
                  <li className="relative flex gap-3 pb-5">
                    <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-jade-200 dark:bg-ink-700" />
                    <span className="relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-jade-500 bg-jade-500 text-white">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <p className="text-xs font-bold text-ink-900 dark:text-white">Order confirmed</p>
                        <time className="text-[9px] font-medium text-ink-400" dateTime={data.createdAt}>{timeText(data.createdAt)}</time>
                      </div>
                      <p className="mt-1 text-[10px] text-ink-500 dark:text-ink-400">Shipment record created from your order.</p>
                    </div>
                  </li>
                  {data.events.map((event, index) => {
                    const latest = index === data.events.length - 1;
                    const delivered = event.status === 'DELIVERED';
                    return (
                      <li key={event.id || `${event.status}-${event.createdAt}`} className="relative flex gap-3 pb-5 last:pb-0">
                        {index < data.events.length - 1 && (
                          <span className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px ${latest ? 'bg-jade-200' : 'bg-ink-200 dark:bg-ink-700'}`} />
                        )}
                        <span className={`relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${
                          delivered
                            ? 'border-jade-500 bg-jade-500 text-white'
                            : latest
                              ? 'border-jade-400 bg-white text-jade-600 dark:bg-ink-900 dark:text-jade-300'
                              : 'border-ink-200 bg-ink-50 text-ink-400 dark:border-ink-700 dark:bg-ink-950'
                        }`}>
                          {delivered ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className={`h-1.5 w-1.5 rounded-full ${latest ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-600'}`} />}
                        </span>
                        <div className={`min-w-0 flex-1 ${latest ? '' : 'opacity-80'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <p className="text-xs font-bold text-ink-900 dark:text-white">{deliveryStatusLabel(event.status)}</p>
                            <time className="text-[9px] font-medium text-ink-400" dateTime={event.createdAt}>{timeText(event.createdAt)}</time>
                          </div>
                          {event.note && <p className="mt-1 text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">{event.note}</p>}
                          {event.actorRole && <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-ink-300 dark:text-ink-500">{event.actorRole.replace(/_/g, ' ')}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            {data.deliveredAt && (
              <section className="rounded-[1.75rem] border border-jade-500/25 bg-jade-500/[0.06] p-4 dark:bg-jade-500/10 sm:p-5">
                <div className="flex items-center gap-2 text-jade-700 dark:text-jade-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <h2 className="font-display text-base font-bold">Delivered</h2>
                </div>
                <p className="mt-2 text-[11px] text-ink-600 dark:text-ink-300">Delivered on <strong>{timeText(data.deliveredAt)}</strong>.</p>
                {data.confirmedAt && <p className="mt-1 text-[10px] text-ink-500 dark:text-ink-400">Receipt confirmed {timeText(data.confirmedAt)}.</p>}
                {data.order && (
                  <div className="mt-3 flex gap-2.5 rounded-2xl bg-white p-2.5 dark:bg-ink-900">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
                      <SmartImage src={data.order.productImage} alt="" seed={`track-${data.order.id}`} className="h-full w-full" imgClassName="object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-ink-900 dark:text-white">{data.order.productTitle}</p>
                      <p className="text-[10px] text-ink-400">{data.order.orderNumber} · {data.order.paymentMethod}</p>
                      <p className="text-[10px] font-semibold text-ink-700 dark:text-ink-300">{data.order.totalAmount.toLocaleString(undefined, { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                )}
              </section>
            )}

            {!terminal && data.authorized && (
              <section className="rounded-[1.75rem] border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-jade-600" />
                  <h2 className="text-sm font-bold text-ink-900 dark:text-white">Delivery confirmation code</h2>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-ink-400">Share this one-time code with your rider only at handover. It confirms delivery but does not release escrow.</p>
                {isBuyer ? (
                  code ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-2 font-mono text-xl font-black tracking-[0.3em] text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-white">{code}</span>
                      <button type="button" onClick={() => void navigator.clipboard.writeText(code).then(() => toast.success('Code copied.'))} className="grid h-9 w-9 place-items-center rounded-xl border border-ink-200 text-ink-500 dark:border-ink-700" aria-label="Copy code">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => void revealCode()} disabled={loadingCode} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jade-600 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-jade-700 disabled:opacity-50">
                      {loadingCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                      Reveal my delivery code
                    </button>
                  )
                ) : (
                  <p className="mt-2 rounded-xl bg-ink-50 p-2.5 text-[10px] text-ink-500 dark:bg-ink-950/60 dark:text-ink-400">Only the buyer can reveal this code.</p>
                )}
              </section>
            )}

            {data.canConfirmReceipt && (
              <section className="rounded-[1.75rem] border border-gold-400/30 bg-gold-300/[0.08] p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-jade-600" />
                  <h2 className="text-sm font-bold text-ink-900 dark:text-white">Confirm you received it</h2>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">
                  Enter your 6-digit delivery PIN to release escrow to the seller. Do this only after inspecting the item.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="6-digit PIN"
                    className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 font-mono text-sm tracking-widest text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                  />
                  <button type="button" onClick={() => void confirmReceipt()} disabled={confirming} className="inline-flex items-center gap-1.5 rounded-xl bg-jade-600 px-3.5 py-2.5 text-[10px] font-bold text-white hover:bg-jade-700 disabled:opacity-50">
                    {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Confirm
                  </button>
                </div>
                {data.deliveryPin && <p className="mt-2 text-[9px] text-ink-400">Your order PIN: <strong className="font-mono text-ink-600 dark:text-ink-300">{data.deliveryPin}</strong></p>}
              </section>
            )}

            {data.authorized && data.rider && (
              <section className="rounded-[1.75rem] border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-5">
                <h2 className="text-sm font-bold text-ink-900 dark:text-white">Your delivery partner</h2>
                <div className="mt-3 flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-jade-500/10 text-jade-700 dark:text-jade-300">
                    {data.rider.photoUrl ? <img src={data.rider.photoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <UserRound className="h-6 w-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900 dark:text-white">{data.rider.name}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">{data.rider.vehicleType.replace(/_/g, ' ')} · {data.rider.completedDeliveries} deliveries</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-gold-600 dark:text-gold-300"><Star className="h-3 w-3 fill-current" /> {data.rider.rating || 'New rider'} · Trust {data.rider.trustScore}%</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {data.rider.phone && (
                    <a href={`tel:${data.rider.phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-jade-500/30 px-3 py-2 text-[10px] font-bold text-jade-700 hover:bg-jade-500/10 dark:text-jade-300">
                      <Phone className="h-3.5 w-3.5" /> Call rider
                    </a>
                  )}
                  <Link href="/support" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-[10px] font-bold text-ink-600 hover:border-jade-400 dark:border-ink-700 dark:text-ink-300">
                    <HelpCircle className="h-3.5 w-3.5" /> Get help
                  </Link>
                </div>
              </section>
            )}

            {data.authorized && (
              <section className="rounded-[1.75rem] border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-5">
                <h2 className="text-sm font-bold text-ink-900 dark:text-white">Delivery details</h2>
                <dl className="mt-3 space-y-2.5 text-[11px]">
                  <div>
                    <dt className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Destination</dt>
                    <dd className="mt-0.5 font-semibold text-ink-700 dark:text-ink-300">{data.destination.address || 'Address unavailable'}</dd>
                    <dd className="text-[10px] text-ink-400">{[data.destination.city, data.destination.state].filter(Boolean).join(', ')}</dd>
                  </div>
                  {data.destination.phone && (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Recipient phone</dt>
                      <dd className="mt-0.5 font-semibold text-ink-700 dark:text-ink-300">{data.destination.phone}</dd>
                    </div>
                  )}
                  {data.destination.instructions && (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Instructions</dt>
                      <dd className="mt-0.5 text-ink-600 dark:text-ink-400">{data.destination.instructions}</dd>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 border-t border-ink-100 pt-2.5 dark:border-ink-800">
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Tracking ID</dt>
                      <dd className="mt-0.5 font-mono text-[10px] font-bold text-ink-700 dark:text-ink-300">{data.trackingId}</dd>
                    </div>
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Order ID</dt>
                      <dd className="mt-0.5 font-mono text-[10px] font-bold text-ink-700 dark:text-ink-300">{data.orderNumber}</dd>
                    </div>
                  </div>
                  {(data.courierName || data.courierTrackingNumber) && (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Courier reference</dt>
                      <dd className="mt-0.5 font-semibold text-ink-700 dark:text-ink-300">{[data.courierName, data.courierTrackingNumber].filter(Boolean).join(' · ')}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {data.canReportIssue && (
              <section className="rounded-[1.75rem] border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-5">
                {!issueOpen ? (
                  <button type="button" onClick={() => setIssueOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2.5 text-[11px] font-bold text-ink-600 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:text-ink-300">
                    <MessageSquare className="h-3.5 w-3.5" /> Report an issue with this order
                  </button>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-bold text-ink-900 dark:text-white">What went wrong?</h2>
                      <button type="button" onClick={() => setIssueOpen(false)} aria-label="Close" className="text-ink-400 hover:text-ink-700 dark:hover:text-white"><XCircle className="h-4 w-4" /></button>
                    </div>
                    <textarea
                      value={issueReason}
                      onChange={(event) => setIssueReason(event.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="Describe the issue with the item or delivery…"
                      className="mt-2 w-full rounded-xl border border-ink-200 bg-white p-2.5 text-[11px] text-ink-800 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                    />
                    <button type="button" onClick={() => void reportIssue()} disabled={reporting} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink-900 px-3 py-2.5 text-[10px] font-bold text-white hover:bg-ink-800 disabled:opacity-50 dark:bg-white dark:text-ink-900">
                      {reporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      Submit issue to GoodSale
                    </button>
                    <p className="mt-2 text-[9px] leading-relaxed text-ink-400">This uses GoodSale&apos;s existing dispute process. Escrow stays protected while support reviews it.</p>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-ink-200 bg-white p-4 text-[10px] text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
              <p className="flex items-center gap-1.5 font-bold text-ink-700 dark:text-ink-200"><ShieldCheck className="h-3.5 w-3.5 text-jade-600" /> GoodSale tracking promise</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-jade-500" /> Events and timestamps come from the delivery backend.</li>
                <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-jade-500" /> GPS is shown only when a real rider is sharing.</li>
                <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-jade-500" /> Public views never reveal personal delivery details.</li>
              </ul>
            </section>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-[10px] text-ink-400 dark:border-ink-800 dark:bg-ink-900">
          <span>GoodSale · {data.trackingId} · Last checked {relativeText(data.lastUpdated).toLowerCase()}</span>
          <Link href={`/track`} className="font-bold text-jade-700 hover:underline dark:text-jade-300">Look up another shipment</Link>
        </div>
      </main>
    </div>
  );
}
