'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, MapPin, Navigation, RefreshCw, Truck } from 'lucide-react';
import type { AvailableDelivery } from '@/lib/types';
import { dbOperations } from '@/lib/store';
import { toast } from '@/lib/feedback';

export default function RiderRequestsPanel({
  online,
  onAccepted,
}: {
  online: boolean;
  onAccepted: () => void;
}) {
  const [requests, setRequests] = useState<AvailableDelivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await dbOperations.riderRequests();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRequests(result.data ?? []);
  }, []);

  useEffect(() => {
    if (online) void load();
    else setRequests([]);
  }, [online, load]);

  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(timer);
  }, [online, load]);

  const accept = async (request: AvailableDelivery) => {
    setAccepting(request.id);
    setError(null);
    const result = await dbOperations.riderAcceptDelivery(request.id);
    setAccepting(null);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      void load();
      return;
    }
    toast.success('Delivery accepted. It is now in My Deliveries.');
    onAccepted();
    void load();
  };

  if (!online) {
    return (
      <div className="rounded-2xl border border-ink-150 bg-white p-8 text-center dark:border-ink-800 dark:bg-ink-900">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300">
          <Truck className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-sm font-bold text-ink-900 dark:text-white">You are offline</h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500 dark:text-ink-400">
          Go online in Availability to see delivery requests inside your service area. Offline riders never receive new requests.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Available deliveries</h3>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            Requests are shown with city-level pickup and destination only until you accept. Refreshes automatically.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[11px] font-bold text-ink-600 hover:border-jade-400 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-ink-500/20 bg-ink-500/5 p-3 text-xs font-semibold text-ink-600 dark:text-ink-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading && requests.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-10 text-center dark:border-ink-700 dark:bg-ink-950/40">
          <Navigation className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-600" />
          <h4 className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-200">No requests in your area yet</h4>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500 dark:text-ink-400">
            New requests appear here when a seller marks a package ready in one of your service states.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {requests.map((request) => (
            <article
              key={request.id}
              className="flex flex-col rounded-2xl border border-ink-150 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-ink-800 dark:bg-ink-900"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full bg-jade-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-jade-700 dark:bg-jade-500/15 dark:text-jade-300">
                  {request.serviceType}
                </span>
                <div className="text-right">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-ink-400">You earn</span>
                  <span className="font-mono text-lg font-bold text-jade-600 dark:text-jade-400">
                    ₦{request.riderNet.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-500" />
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-400">Pickup area</span>
                    <span className="font-semibold text-ink-800 dark:text-ink-200">
                      {[request.pickupCity, request.pickupState].filter(Boolean).join(', ') || 'See after accepting'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-500" />
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-400">Destination area</span>
                    <span className="font-semibold text-ink-800 dark:text-ink-200">
                      {[request.deliveryCity, request.deliveryState].filter(Boolean).join(', ') || 'See after accepting'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-[10px] text-ink-400 dark:border-ink-800">
                <span>Fee ₦{request.deliveryFee.toLocaleString()}</span>
                <span>
                  {request.estimatedDeliveryDate
                    ? `Due ${new Date(`${request.estimatedDeliveryDate}T00:00:00`).toLocaleDateString()}`
                    : 'Due date on acceptance'}
                </span>
              </div>

              <button
                onClick={() => void accept(request)}
                disabled={accepting !== null}
                className="mt-3 w-full rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-jade-700 disabled:opacity-50"
              >
                {accepting === request.id ? 'Accepting…' : 'Accept delivery'}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
