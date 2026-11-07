'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, MapPin, Navigation, Power, Radio } from 'lucide-react';
import type { DeliveryPartner } from '@/lib/types';
import { dbOperations } from '@/lib/store';
import { toast } from '@/lib/feedback';
import { deliveryCitiesFor, deliveryStates } from '@/lib/serviceAreas';

export default function RiderAvailabilityPanel({
  rider,
  onChanged,
}: {
  rider: DeliveryPartner;
  onChanged: () => void;
}) {
  const states = useMemo(() => deliveryStates(), []);
  const [online, setOnline] = useState(rider.isAvailable);
  const [stateName, setStateName] = useState(rider.state || states[0] || '');
  const [cityName, setCityName] = useState(rider.city || '');
  const [serviceStates, setServiceStates] = useState<string[]>(rider.serviceStates ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cities = useMemo(
    () => (stateName ? deliveryCitiesFor(stateName) : []),
    [stateName]
  );

  const toggleServiceState = (state: string) => {
    setServiceStates((current) =>
      current.includes(state) ? current.filter((item) => item !== state) : [...current, state]
    );
  };

  const locate = () =>
    new Promise<{ lat?: number; lng?: number }>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 }
      );
    });

  const save = async (nextOnline: boolean) => {
    setBusy(true);
    setError(null);
    const coords = nextOnline ? await locate() : {};
    const result = await dbOperations.riderAvailability({
      online: nextOnline,
      lat: coords.lat,
      lng: coords.lng,
      state: stateName || undefined,
      city: cityName || undefined,
      serviceStates,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    setOnline(nextOnline);
    toast.success(nextOnline ? 'You are online and visible for requests.' : 'You are offline. New requests are paused.');
    onChanged();
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">Availability</h3>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Control when you receive requests and which states are inside your service area.
        </p>
      </div>

      <div className={`rounded-2xl border p-4 ${online ? 'border-jade-300 bg-jade-50/70 dark:border-jade-500/30 dark:bg-jade-500/10' : 'border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-950/50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-full ${online ? 'bg-jade-600 text-white' : 'bg-ink-200 text-ink-500 dark:bg-ink-700 dark:text-ink-300'}`}>
              <Power className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-900 dark:text-white">
                {online ? 'Online · receiving requests' : 'Offline · requests paused'}
              </p>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                {online
                  ? `Seeing requests in ${serviceStates.length ? serviceStates.join(', ') : stateName || 'your operating area'}.`
                  : 'Go online when you are ready to deliver.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => void save(!online)}
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold shadow-sm transition-colors disabled:opacity-50 ${
              online
                ? 'border border-ink-300 bg-white text-ink-700 dark:border-ink-600 dark:bg-ink-900 dark:text-ink-200'
                : 'bg-jade-600 text-white hover:bg-jade-700'
            }`}
          >
            {busy ? 'Saving…' : online ? 'Go offline' : 'Go online'}
          </button>
        </div>
        {online && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-jade-700 dark:text-jade-300">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> Live request feed is active
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-ink-500/20 bg-ink-500/5 p-3 text-xs font-semibold text-ink-600 dark:text-ink-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
          Operating state
          <select
            value={stateName}
            onChange={(event) => {
              setStateName(event.target.value);
              setCityName('');
            }}
            className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs font-semibold text-ink-900 outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
          >
            {states.map((state) => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-600 dark:text-ink-300">
          Operating city
          <select
            value={cityName}
            onChange={(event) => setCityName(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs font-semibold text-ink-900 outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
          >
            <option value="">All cities in {stateName || 'state'}</option>
            {cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-500">
            <MapPin className="h-3.5 w-3.5 text-jade-500" /> Service states
          </h4>
          <span className="text-[10px] text-ink-400">
            {serviceStates.length ? `${serviceStates.length} selected` : 'Defaults to your operating state'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {states.map((state) => {
            const selected = serviceStates.includes(state);
            return (
              <button
                key={state}
                type="button"
                onClick={() => toggleServiceState(state)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                  selected
                    ? 'border-jade-500 bg-jade-500 text-white'
                    : 'border-ink-200 bg-white text-ink-500 hover:border-jade-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300'
                }`}
              >
                {selected && <Check className="h-3 w-3" />} {state.replace(' State', '')}
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex items-start gap-1 text-[10px] text-ink-400">
          <Navigation className="mt-0.5 h-3 w-3 shrink-0" />
          Clearing every state falls back to your operating state, so you never miss requests by accident.
        </p>
      </div>

      <button
        onClick={() => void save(online)}
        disabled={busy}
        className="w-full rounded-xl border border-jade-500/40 bg-jade-50 px-4 py-2.5 text-xs font-bold text-jade-700 dark:bg-jade-500/10 dark:text-jade-300 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save operating area'}
      </button>
    </div>
  );
}
