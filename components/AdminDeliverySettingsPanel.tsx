'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Radio, Save, Settings2 } from 'lucide-react';
import { dbOperations, useDBState } from '@/lib/store';
import { toast } from '@/lib/feedback';

const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500';

export default function AdminDeliverySettingsPanel() {
  const db = useDBState();
  const settings = db.deliverySettings;
  const [form, setForm] = useState({
    autoAssignEnabled: settings.autoAssignEnabled,
    offerTimeoutMinutes: String(settings.offerTimeoutMinutes),
    maxActiveDeliveries: String(settings.maxActiveDeliveries),
    maxPickupDistanceKm: String(settings.maxPickupDistanceKm),
    maxOffersPerDelivery: String(settings.maxOffersPerDelivery),
    locationUpdateIntervalSeconds: String(settings.locationUpdateIntervalSeconds),
    trackingStaleMinutes: String(settings.trackingStaleMinutes),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      autoAssignEnabled: settings.autoAssignEnabled,
      offerTimeoutMinutes: String(settings.offerTimeoutMinutes),
      maxActiveDeliveries: String(settings.maxActiveDeliveries),
      maxPickupDistanceKm: String(settings.maxPickupDistanceKm),
      maxOffersPerDelivery: String(settings.maxOffersPerDelivery),
      locationUpdateIntervalSeconds: String(settings.locationUpdateIntervalSeconds),
      trackingStaleMinutes: String(settings.trackingStaleMinutes),
    });
    // Re-sync only when the persisted values change, not on unrelated state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.autoAssignEnabled,
    settings.offerTimeoutMinutes,
    settings.maxActiveDeliveries,
    settings.maxPickupDistanceKm,
    settings.maxOffersPerDelivery,
    settings.locationUpdateIntervalSeconds,
    settings.trackingStaleMinutes,
  ]);

  const save = async () => {
    setBusy(true);
    const result = await dbOperations.updateDeliverySettings({
      auto_assign_enabled: form.autoAssignEnabled,
      offer_timeout_minutes: Number(form.offerTimeoutMinutes),
      max_active_deliveries: Number(form.maxActiveDeliveries),
      max_pickup_distance_km: Number(form.maxPickupDistanceKm),
      max_offers_per_delivery: Number(form.maxOffersPerDelivery),
      location_update_interval_seconds: Number(form.locationUpdateIntervalSeconds),
      tracking_stale_minutes: Number(form.trackingStaleMinutes),
    });
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Delivery logistics settings saved.');
  };

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-ink-900 dark:text-white">
            <Settings2 className="h-4 w-4 text-jade-500" /> Automated matching & tracking
          </h3>
          <p className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
            Automated offers are optional. Manual admin assignment always remains available.
          </p>
        </div>
        <button
          onClick={() => void save()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-jade-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
        <input
          type="checkbox"
          checked={form.autoAssignEnabled}
          onChange={(event) => setForm((current) => ({ ...current, autoAssignEnabled: event.target.checked }))}
          className="mt-0.5 h-4 w-4 accent-[#0a854b]"
        />
        <span>
          <span className="flex items-center gap-1 text-xs font-bold text-ink-800 dark:text-ink-100">
            <Radio className="h-3.5 w-3.5 text-jade-500" /> Automatically offer ready deliveries
          </span>
          <span className="mt-1 block text-[11px] text-ink-500 dark:text-ink-400">
            When a seller marks a GoodDispatch delivery ready, rank approved online riders by service area,
            straight-line pickup distance (when coordinates exist), workload, rating, acceptance rate and vehicle suitability.
          </span>
        </span>
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Offer timeout (minutes)', 'offerTimeoutMinutes'],
          ['Max active per rider', 'maxActiveDeliveries'],
          ['Max pickup distance (km)', 'maxPickupDistanceKm'],
          ['Max offers per delivery', 'maxOffersPerDelivery'],
          ['Location interval (seconds)', 'locationUpdateIntervalSeconds'],
          ['Tracking stale after (minutes)', 'trackingStaleMinutes'],
        ].map(([label, key]) => (
          <label key={key} className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {label}
            <input
              type="number"
              min={1}
              value={form[key as keyof typeof form] as string}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              className={`${inp} mt-1 normal-case`}
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-ink-400">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-jade-500" /> Acceptance timeout is enforced by the database.
        </span>
        <span>Distance is only used when real coordinates exist; otherwise no distance is invented.</span>
      </div>
    </div>
  );
}
