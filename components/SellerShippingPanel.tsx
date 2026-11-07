'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, MapPin, Package, Save, Truck, Weight,
} from 'lucide-react';
import { dbOperations, useDBState } from '@/lib/store';

const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';
const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500';
const label = 'block text-xs font-bold text-ink-500 dark:text-ink-400 mb-1';
const btn =
  'px-4 py-2.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5';

function Toggle({ checked, onChange, label: text }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between gap-3 w-full text-left cursor-pointer">
      <span className="text-xs font-bold text-ink-700 dark:text-ink-300">{text}</span>
      <span className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function SellerShippingPanel() {
  const db = useDBState();
  const user = db.currentUser;
  const existing = db.sellerShippingSettings.find((s) => s.sellerId === user?.id);
  const profile = db.profiles.find((p) => p.userId === user?.id);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    pickupAddress: '',
    pickupCity: '',
    pickupState: '',
    pickupLat: '',
    pickupLng: '',
    handlingDays: '1',
    defaultWeightKg: '1',
    freeShippingThreshold: '',
    localEnabled: true,
    interstateEnabled: true,
    pickupEnabled: true,
  });

  useEffect(() => {
    setForm({
      pickupAddress: existing?.pickupAddress || profile?.address || '',
      pickupCity: existing?.pickupCity || profile?.city || '',
      pickupState: existing?.pickupState || profile?.state || '',
      pickupLat: existing?.pickupLat != null ? String(existing.pickupLat) : profile?.lat != null ? String(profile.lat) : '',
      pickupLng: existing?.pickupLng != null ? String(existing.pickupLng) : profile?.lng != null ? String(profile.lng) : '',
      handlingDays: String(existing?.handlingDays ?? 1),
      defaultWeightKg: String(existing?.defaultWeightKg ?? 1),
      freeShippingThreshold: existing?.freeShippingThreshold != null ? String(existing.freeShippingThreshold) : '',
      localEnabled: existing?.localEnabled ?? true,
      interstateEnabled: existing?.interstateEnabled ?? true,
      pickupEnabled: existing?.pickupEnabled ?? true,
    });
  }, [existing, profile]);

  const products = useMemo(
    () => db.products.filter((p) => p.sellerId === user?.id),
    [db.products, user?.id]
  );

  const save = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await dbOperations.updateSellerShippingSettings({
      pickupAddress: form.pickupAddress,
      pickupCity: form.pickupCity,
      pickupState: form.pickupState,
      pickupLat: form.pickupLat.trim() === '' ? undefined : Number(form.pickupLat),
      pickupLng: form.pickupLng.trim() === '' ? undefined : Number(form.pickupLng),
      handlingDays: Number(form.handlingDays || 0),
      defaultWeightKg: Number(form.defaultWeightKg || 1),
      freeShippingThreshold: form.freeShippingThreshold.trim() === '' ? undefined : Number(form.freeShippingThreshold),
      localEnabled: form.localEnabled,
      interstateEnabled: form.interstateEnabled,
      pickupEnabled: form.pickupEnabled,
    });
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setNotice('Delivery settings saved. New checkout quotes will use this pickup address and handling time.');
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div className="space-y-5">
      <div className={`${card} p-5 bg-gradient-to-br from-jade-500/10 via-transparent to-transparent`}>
        <h2 className="font-display font-bold text-xl text-ink-900 dark:text-white flex items-center gap-2">
          <Truck className="w-5 h-5 text-jade-500" /> Delivery & Pickup Settings
        </h2>
        <p className="text-xs text-ink-500 mt-1 max-w-2xl">
          Buyers see delivery fees calculated from your pickup location, package details and GoodSale&apos;s administrator pricing. You cannot override platform freight charges.
        </p>
      </div>

      {notice ? <div className="p-3 rounded-xl bg-jade-500/10 border border-jade-500/20 text-jade-600 text-xs font-bold flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {notice}</div> : null}
      {error ? <div className="p-3 rounded-xl bg-ink-500/10 border border-ink-500/20 text-ink-600 dark:text-ink-300 text-xs font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</div> : null}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${card} p-5 lg:col-span-2`}>
          <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-jade-500" /> Pickup location</h3>
          <div className="space-y-3">
            <div>
              <label className={label}>Street pickup address</label>
              <input className={inp} value={form.pickupAddress} onChange={(e) => setForm((p) => ({ ...p, pickupAddress: e.target.value }))} placeholder="Shop 12, Admiralty Way" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label}>City</label><input className={inp} value={form.pickupCity} onChange={(e) => setForm((p) => ({ ...p, pickupCity: e.target.value }))} placeholder="Lekki" /></div>
              <div><label className={label}>State</label><input className={inp} value={form.pickupState} onChange={(e) => setForm((p) => ({ ...p, pickupState: e.target.value }))} placeholder="Lagos State" /></div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Pickup latitude (optional)</label>
                <input className={inp} type="number" step="any" value={form.pickupLat} onChange={(e) => setForm((p) => ({ ...p, pickupLat: e.target.value }))} placeholder="6.4478" />
              </div>
              <div>
                <label className={label}>Pickup longitude (optional)</label>
                <input className={inp} type="number" step="any" value={form.pickupLng} onChange={(e) => setForm((p) => ({ ...p, pickupLng: e.target.value }))} placeholder="3.4723" />
              </div>
            </div>
            <p className="text-[10px] text-ink-400 leading-relaxed">Coordinates improve distance-based local quotes. Without them, GoodSale uses your city/state and the local base rate.</p>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-4">Handling & packages</h3>
          <div className="space-y-3">
            <div>
              <label className={label}>Handling time (days)</label>
              <input className={inp} type="number" min="0" max="60" value={form.handlingDays} onChange={(e) => setForm((p) => ({ ...p, handlingDays: e.target.value }))} />
            </div>
            <div>
              <label className={label}>Default package weight (kg)</label>
              <input className={inp} type="number" min="0.1" step="0.1" value={form.defaultWeightKg} onChange={(e) => setForm((p) => ({ ...p, defaultWeightKg: e.target.value }))} />
              <p className="text-[10px] text-ink-400 mt-1">Used for listings without a weight. Per-listing weight and dimensions are set in the Create Listing wizard.</p>
            </div>
            <div>
              <label className={label}>Free delivery over (₦, optional)</label>
              <input className={inp} type="number" min="0" value={form.freeShippingThreshold} onChange={(e) => setForm((p) => ({ ...p, freeShippingThreshold: e.target.value }))} placeholder="e.g. 100000" />
            </div>
          </div>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-4">Delivery methods you accept</h3>
        <div className="grid sm:grid-cols-3 gap-5">
          <Toggle checked={form.localEnabled} onChange={(v) => setForm((p) => ({ ...p, localEnabled: v }))} label="Local delivery" />
          <Toggle checked={form.interstateEnabled} onChange={(v) => setForm((p) => ({ ...p, interstateEnabled: v }))} label="Interstate delivery" />
          <Toggle checked={form.pickupEnabled} onChange={(v) => setForm((p) => ({ ...p, pickupEnabled: v }))} label="Buyer pickup" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-5 pt-4 border-t border-ink-200 dark:border-ink-800">
          <p className="text-[10px] text-ink-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Admin free-shipping thresholds and maximum charges always take precedence.</p>
          <button className={btn} onClick={save} disabled={busy}><Save className="w-3.5 h-3.5" /> {busy ? 'Saving…' : 'Save delivery settings'}</button>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-1 flex items-center gap-2"><Package className="w-4 h-4 text-jade-500" /> Package details on your listings</h3>
        <p className="text-xs text-ink-500 mb-3">Weight and dimensions drive weight and oversize surcharges. Update them when you create or edit a listing.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {products.slice(0, 8).map((product) => (
            <div key={product.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-ink-200 dark:border-ink-800">
              <span className="text-xs font-semibold text-ink-800 dark:text-ink-200 truncate">{product.title}</span>
              <span className="text-[10px] text-ink-500 flex items-center gap-1 shrink-0"><Weight className="w-3 h-3" /> {product.weightKg ? `${product.weightKg} kg` : 'uses default'} · {product.dimensionsCm || 'no dims'}</span>
            </div>
          ))}
          {products.length === 0 ? <p className="text-xs text-ink-500">No listings yet.</p> : null}
        </div>
      </div>
    </div>
  );
}
