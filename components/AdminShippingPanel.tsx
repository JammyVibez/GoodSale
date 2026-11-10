'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Calculator, CheckCircle2, ChevronDown, ChevronUp, Clock,
  DollarSign, Edit3, MapPin, Package, Plus, RefreshCw, Route, Save,
  Settings2, ShieldCheck, Trash2, Truck, Weight, XCircle, Zap,
} from 'lucide-react';
import { dbOperations, useDBState } from '@/lib/store';
import { confirmDialog } from '@/lib/feedback';
import { priceSellerShipping, type ShippingConfig } from '@/lib/shipping/engine';
import type {
  ShippingCourier, ShippingDistanceTier, ShippingRule, ShippingSettings, ShippingZone,
} from '@/lib/types';

const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';
const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500';
const btn =
  'px-3 py-2 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5';
const btnGhost =
  'px-3 py-2 bg-white dark:bg-ink-950 text-ink-600 dark:text-ink-300 border border-ink-200 dark:border-ink-800 font-bold text-xs rounded-xl transition-all cursor-pointer hover:bg-ink-500/5 inline-flex items-center gap-1.5';
const label = 'block text-xs font-bold text-ink-500 dark:text-ink-400 mb-1';

type Section = 'settings' | 'tiers' | 'zones' | 'rules' | 'couriers' | 'quotes' | 'calculator' | 'audit';

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const optNum = (value?: number) => (value == null ? '' : String(value));
const parseOpt = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

function Field({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      {children}
      {hint ? <p className="text-[10px] text-ink-400 mt-1 leading-snug">{hint}</p> : null}
    </div>
  );
}

function Toggle({ checked, onChange, label: text }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full text-left cursor-pointer"
    >
      <span className="text-xs font-bold text-ink-700 dark:text-ink-300">{text}</span>
      <span className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${checked ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function toSettingsForm(settings: ShippingSettings) {
  return Object.fromEntries(
    Object.entries(settings)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => [key, String(value)])
  ) as Record<string, string>;
}

const DEFAULT_RULE = {
  id: undefined as number | undefined,
  name: '',
  enabled: true,
  priority: '0',
  scope: 'GLOBAL' as ShippingRule['scope'],
  zoneId: '',
  state: '',
  city: '',
  originState: '',
  originCity: '',
  deliveryMethod: 'ANY' as ShippingRule['deliveryMethod'],
  serviceType: 'ANY' as ShippingRule['serviceType'],
  baseFee: '',
  perKmFee: '',
  minFee: '',
  maxFee: '',
  weightPerKg: '',
  oversizeSurcharge: '',
  remoteSurcharge: '',
  freeShippingThreshold: '',
  handlingFee: '',
  platformFee: '',
  sellerSponsored: false,
  platformSponsored: false,
  etaMinDays: '',
  etaMaxDays: '',
  manualQuote: false,
  notes: '',
};

export default function AdminShippingPanel() {
  const db = useDBState();
  const [section, setSection] = useState<Section>('settings');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<Record<string, string>>(toSettingsForm(db.shippingSettings));
  const [settingsFlags, setSettingsFlags] = useState({
    enabled: db.shippingSettings.enabled,
    manualQuotesEnabled: db.shippingSettings.manualQuotesEnabled,
    sellerSponsoredShipping: db.shippingSettings.sellerSponsoredShipping,
    platformSponsoredShipping: db.shippingSettings.platformSponsoredShipping,
  });

  useEffect(() => {
    setSettings(toSettingsForm(db.shippingSettings));
    setSettingsFlags({
      enabled: db.shippingSettings.enabled,
      manualQuotesEnabled: db.shippingSettings.manualQuotesEnabled,
      sellerSponsoredShipping: db.shippingSettings.sellerSponsoredShipping,
      platformSponsoredShipping: db.shippingSettings.platformSponsoredShipping,
    });
  }, [db.shippingSettings.updatedAt]);

  const [tierForm, setTierForm] = useState({ id: undefined as number | undefined, label: '', minKm: '0', maxKm: '', fee: '', priority: '0', enabled: true });
  const [zoneForm, setZoneForm] = useState({ id: undefined as number | undefined, name: '', state: '', city: '', kind: 'LOCAL' as ShippingZone['kind'], surcharge: '0', priority: '0', enabled: true, notes: '' });
  const [ruleForm, setRuleForm] = useState({ ...DEFAULT_RULE });
  const [courierForm, setCourierForm] = useState({ id: undefined as number | undefined, name: '', code: '', mode: 'MANUAL' as ShippingCourier['mode'], baseFee: '0', perKmFee: '0', expressMultiplier: '1', apiProvider: '', notes: '', enabled: true });
  const [quoteForm, setQuoteForm] = useState({ id: undefined as number | undefined, sellerId: '', state: '', city: '', amount: '', etaMinDays: '1', etaMaxDays: '7', notes: '', active: true, expiresAt: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  const sellers = useMemo(
    () => db.users.filter((u) => ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS', 'ADMIN'].includes(String(u.role))),
    [db.users]
  );

  const run = async (fn: () => Promise<{ success?: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    let result: { success?: boolean; error?: string };
    try {
      result = await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save shipping settings. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
    if (result?.error) {
      setError(result.error);
      return false;
    }
    setNotice('Shipping settings saved.');
    setTimeout(() => setNotice(null), 3500);
    return true;
  };

  const saveSettings = async () => {
    const numeric: Record<string, number> = {};
    for (const [key, value] of Object.entries(settings)) {
      numeric[key] = Number(value || 0);
    }
    await run(() => dbOperations.adminUpdateShippingSettings({
      ...(numeric as unknown as ShippingSettings),
      ...settingsFlags,
    }));
  };

  const saveTier = async () => {
    const ok = await run(() => dbOperations.adminUpsertShippingTier({
      id: tierForm.id,
      label: tierForm.label,
      minKm: Number(tierForm.minKm || 0),
      maxKm: parseOpt(tierForm.maxKm),
      fee: Number(tierForm.fee || 0),
      priority: Number(tierForm.priority || 0),
      enabled: tierForm.enabled,
    }));
    if (ok) setTierForm({ id: undefined, label: '', minKm: '0', maxKm: '', fee: '', priority: '0', enabled: true });
  };

  const saveZone = async () => {
    const ok = await run(() => dbOperations.adminUpsertShippingZone({
      id: zoneForm.id,
      name: zoneForm.name,
      state: zoneForm.state,
      city: zoneForm.city,
      kind: zoneForm.kind,
      surcharge: Number(zoneForm.surcharge || 0),
      priority: Number(zoneForm.priority || 0),
      enabled: zoneForm.enabled,
      notes: zoneForm.notes,
    }));
    if (ok) setZoneForm({ id: undefined, name: '', state: '', city: '', kind: 'LOCAL', surcharge: '0', priority: '0', enabled: true, notes: '' });
  };

  const saveRule = async () => {
    const ok = await run(() => dbOperations.adminUpsertShippingRule({
      id: ruleForm.id,
      name: ruleForm.name,
      enabled: ruleForm.enabled,
      priority: Number(ruleForm.priority || 0),
      scope: ruleForm.scope,
      zoneId: ruleForm.zoneId ? Number(ruleForm.zoneId) : undefined,
      state: ruleForm.state,
      city: ruleForm.city,
      originState: ruleForm.originState,
      originCity: ruleForm.originCity,
      deliveryMethod: ruleForm.deliveryMethod,
      serviceType: ruleForm.serviceType,
      baseFee: parseOpt(ruleForm.baseFee),
      perKmFee: parseOpt(ruleForm.perKmFee),
      minFee: parseOpt(ruleForm.minFee),
      maxFee: parseOpt(ruleForm.maxFee),
      weightPerKg: parseOpt(ruleForm.weightPerKg),
      oversizeSurcharge: parseOpt(ruleForm.oversizeSurcharge),
      remoteSurcharge: parseOpt(ruleForm.remoteSurcharge),
      freeShippingThreshold: parseOpt(ruleForm.freeShippingThreshold),
      handlingFee: parseOpt(ruleForm.handlingFee),
      platformFee: parseOpt(ruleForm.platformFee),
      sellerSponsored: ruleForm.sellerSponsored,
      platformSponsored: ruleForm.platformSponsored,
      etaMinDays: parseOpt(ruleForm.etaMinDays),
      etaMaxDays: parseOpt(ruleForm.etaMaxDays),
      manualQuote: ruleForm.manualQuote,
      notes: ruleForm.notes,
    }));
    if (ok) setRuleForm({ ...DEFAULT_RULE });
  };

  const saveCourier = async () => {
    const ok = await run(() => dbOperations.adminUpsertShippingCourier({
      id: courierForm.id,
      name: courierForm.name,
      code: courierForm.code,
      mode: courierForm.mode,
      baseFee: Number(courierForm.baseFee || 0),
      perKmFee: Number(courierForm.perKmFee || 0),
      expressMultiplier: Number(courierForm.expressMultiplier || 1),
      apiProvider: courierForm.apiProvider,
      notes: courierForm.notes,
      enabled: courierForm.enabled,
    }));
    if (ok) setCourierForm({ id: undefined, name: '', code: '', mode: 'MANUAL', baseFee: '0', perKmFee: '0', expressMultiplier: '1', apiProvider: '', notes: '', enabled: true });
  };

  const saveQuote = async () => {
    const ok = await run(() => dbOperations.adminUpsertManualShippingQuote({
      id: quoteForm.id,
      sellerId: Number(quoteForm.sellerId),
      state: quoteForm.state,
      city: quoteForm.city,
      amount: Number(quoteForm.amount || 0),
      etaMinDays: Number(quoteForm.etaMinDays || 0),
      etaMaxDays: Number(quoteForm.etaMaxDays || 0),
      notes: quoteForm.notes,
      active: quoteForm.active,
      expiresAt: quoteForm.expiresAt ? new Date(`${quoteForm.expiresAt}T23:59:59`).toISOString() : undefined,
    }));
    if (ok) setQuoteForm({ id: undefined, sellerId: '', state: '', city: '', amount: '', etaMinDays: '1', etaMaxDays: '7', notes: '', active: true, expiresAt: '' });
  };

  const remove = async (kind: string, id: number, name: string) => {
    if (!(await confirmDialog(`Delete ${name}? Historical orders keep their saved shipping snapshot.`))) return;
    if (kind === 'zone') await run(() => dbOperations.adminDeleteShippingZone(id));
    if (kind === 'tier') await run(() => dbOperations.adminDeleteShippingTier(id));
    if (kind === 'rule') await run(() => dbOperations.adminDeleteShippingRule(id));
    if (kind === 'courier') await run(() => dbOperations.adminDeleteShippingCourier(id));
    if (kind === 'quote') await run(() => dbOperations.adminDeleteManualShippingQuote(id));
  };

  // ---------------------------------------------------------------- calculator
  const [calc, setCalc] = useState({
    sellerId: '',
    state: 'Lagos State',
    city: 'Ikeja',
    distanceKm: '5',
    weightKg: '2',
    subtotal: '45000',
    method: 'GOODSALE_PARTNER' as 'GOODSALE_PARTNER' | 'THIRD_PARTY_COURIER' | 'PICKUP',
    service: 'STANDARD' as 'ECONOMY' | 'STANDARD' | 'EXPRESS',
    courierId: '',
  });

  const calculator = useMemo(() => {
    const sellerId = Number(calc.sellerId || sellers[0]?.id || 0);
    if (!sellerId) return null;
    const sellerSetting = db.sellerShippingSettings.find((s) => s.sellerId === sellerId);
    const seller = db.users.find((u) => u.id === sellerId);
    const config: ShippingConfig = {
      settings: db.shippingSettings,
      tiers: db.shippingTiers,
      zones: db.shippingZones,
      rules: db.shippingRules,
      couriers: db.shippingCouriers,
      sellerSettings: sellerSetting,
      manualQuotes: db.shippingManualQuotes.filter((q) => q.sellerId === sellerId),
    };
    return priceSellerShipping(config, {
      sellerId,
      sellerName: seller?.fullName || 'Seller',
      pickup: {
        address: sellerSetting?.pickupAddress || '',
        city: sellerSetting?.pickupCity || '',
        state: sellerSetting?.pickupState || '',
        lat: sellerSetting?.pickupLat,
        lng: sellerSetting?.pickupLng,
      },
      items: [{
        productId: 0,
        sellerId,
        quantity: 1,
        price: Number(calc.subtotal || 0),
        weightKg: Number(calc.weightKg || 1),
      }],
      destination: { address: 'Preview', city: calc.city, state: calc.state },
      distanceKm: Number(calc.distanceKm || 0),
      deliveryMethod: calc.method,
      service: calc.service,
      courierId: calc.courierId ? Number(calc.courierId) : undefined,
    });
  }, [calc, db, sellers]);

  const sections: { id: Section; label: string; Icon: React.ElementType; count?: number }[] = [
    { id: 'settings', label: 'General', Icon: Settings2 },
    { id: 'tiers', label: 'Distance tiers', Icon: Route, count: db.shippingTiers.length },
    { id: 'zones', label: 'Zones', Icon: MapPin, count: db.shippingZones.length },
    { id: 'rules', label: 'Pricing rules', Icon: DollarSign, count: db.shippingRules.length },
    { id: 'couriers', label: 'Couriers', Icon: Truck, count: db.shippingCouriers.length },
    { id: 'quotes', label: 'Manual quotes', Icon: Package, count: db.shippingManualQuotes.length },
    { id: 'calculator', label: 'Calculator', Icon: Calculator },
    { id: 'audit', label: 'Audit history', Icon: Clock, count: db.shippingAuditLogs.length },
  ];

  return (
    <div className="space-y-5">
      <div className={`${card} p-5 bg-gradient-to-br from-jade-500/10 via-transparent to-transparent`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-xl text-ink-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-jade-500" /> Shipping & Delivery Control
            </h2>
            <p className="text-xs text-ink-500 mt-1 max-w-2xl">
              Every checkout fee is calculated from these live rules by the server. Changes apply to new quotes only; historical orders keep their saved shipping snapshot.
            </p>
          </div>
          <button
            className={settingsFlags.enabled ? btn : btnGhost}
            onClick={() => {
              const enabled = !settingsFlags.enabled;
              void run(async () => {
                const result = await dbOperations.adminUpdateShippingSettings({ ...db.shippingSettings, enabled });
                if (!result.error) setSettingsFlags((prev) => ({ ...prev, enabled }));
                return result;
              });
            }}
            disabled={busy}
          >
            {settingsFlags.enabled ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {settingsFlags.enabled ? 'Shipping enabled' : 'Shipping paused'}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Active rules', value: String(db.shippingRules.filter((r) => r.enabled).length) },
            { label: 'Delivery zones', value: String(db.shippingZones.filter((z) => z.enabled).length) },
            { label: 'Free threshold', value: db.shippingSettings.freeShippingThreshold > 0 ? money(db.shippingSettings.freeShippingThreshold) : 'Off' },
            { label: 'Manual quotes', value: String(db.shippingManualQuotes.filter((q) => q.active).length) },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/70 dark:bg-ink-950/60 border border-ink-200/70 dark:border-ink-800 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{item.label}</p>
              <p className="font-display font-bold text-lg text-ink-900 dark:text-white mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {notice ? <div className="p-3 rounded-xl bg-jade-500/10 border border-jade-500/20 text-jade-600 text-xs font-bold">{notice}</div> : null}
      {error ? <div className="p-3 rounded-xl bg-ink-500/10 border border-ink-500/20 text-ink-600 dark:text-ink-300 text-xs font-bold">{error}</div> : null}

      <div className="flex flex-wrap gap-1.5 bg-ink-100 dark:bg-ink-900 p-1 rounded-xl">
        {sections.map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`px-3 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all ${
              section === item.id ? 'bg-jade-500 text-white shadow' : 'text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white'
            }`}
          >
            <item.Icon className="w-3.5 h-3.5" />
            {item.label}
            {typeof item.count === 'number' ? <span className="opacity-70">({item.count})</span> : null}
          </button>
        ))}
      </div>

      {section === 'settings' && (
        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white">Delivery pricing foundation</h3>
                <p className="text-xs text-ink-500 mt-1">Distance tiers override the local base for known local distances. Interstate uses base + per-km.</p>
              </div>
              <button className={btn} onClick={saveSettings} disabled={busy}>
                <Save className="w-3.5 h-3.5" /> Save pricing
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ['localBaseFee', 'Local base fee (₦)', 'Used when no local tier matches.'],
                ['perKmFee', 'Local fee per km (₦)', 'Applied with base outside a tier.'],
                ['interstateBaseFee', 'Interstate base fee (₦)', 'Nationwide starting rate.'],
                ['interstatePerKmFee', 'Interstate per km (₦)', 'Distance component.'],
                ['minFee', 'Minimum delivery charge (₦)', 'Clamp for the delivery fee.'],
                ['maxFee', 'Maximum delivery charge (₦)', 'Clamp for the delivery fee.'],
                ['manualQuoteAboveKm', 'Manual quote above (km)', 'Default 15 km.'],
                ['freeShippingThreshold', 'Free shipping over (₦)', '0 disables the platform threshold.'],
              ].map(([key, title, hint]) => (
                <Field key={key} hint={hint}>
                  <label className={label}>{title}</label>
                  <input className={inp} type="number" min="0" value={settings[key] ?? ''} onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))} />
                </Field>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className={`${card} p-5`}>
              <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-4">Surcharges & service fees</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  ['weightSurchargePerKg', 'Weight surcharge / kg (₦)'],
                  ['oversizeSurcharge', 'Oversize package (₦)'],
                  ['remoteSurcharge', 'Remote area (₦)'],
                  ['handlingFee', 'Handling fee (₦)'],
                  ['platformShippingFee', 'Platform shipping fee (₦)'],
                  ['economyFee', 'Economy service (₦)'],
                  ['standardFee', 'Standard service (₦)'],
                  ['expressFee', 'Express service (₦)'],
                ].map(([key, title]) => (
                  <Field key={key}>
                    <label className={label}>{title}</label>
                    <input className={inp} type="number" min="0" value={settings[key] ?? ''} onChange={(e) => setSettings((p) => ({ ...p, [key]: e.target.value }))} />
                  </Field>
                ))}
              </div>
            </div>
            <div className={`${card} p-5`}>
              <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">Sponsorship & experience</h3>
              <div className="space-y-3">
                <Toggle
                  checked={settingsFlags.sellerSponsoredShipping}
                  onChange={(v) => setSettingsFlags((p) => ({ ...p, sellerSponsoredShipping: v }))}
                  label="Honour seller-sponsored free shipping thresholds"
                />
                <Toggle
                  checked={settingsFlags.platformSponsoredShipping}
                  onChange={(v) => setSettingsFlags((p) => ({ ...p, platformSponsoredShipping: v }))}
                  label="Platform pays all standard shipping"
                />
                <div className="h-px bg-ink-200 dark:bg-ink-800" />
                <Toggle
                  checked={settingsFlags.manualQuotesEnabled}
                  onChange={(v) => setSettingsFlags((p) => ({ ...p, manualQuotesEnabled: v }))}
                  label="Allow manual quotations for unsupported routes"
                />
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Field><label className={label}>Default ETA min (days)</label><input className={inp} type="number" min="0" value={settings.defaultEtaMinDays ?? ''} onChange={(e) => setSettings((p) => ({ ...p, defaultEtaMinDays: e.target.value }))} /></Field>
                  <Field><label className={label}>Default ETA max (days)</label><input className={inp} type="number" min="0" value={settings.defaultEtaMaxDays ?? ''} onChange={(e) => setSettings((p) => ({ ...p, defaultEtaMaxDays: e.target.value }))} /></Field>
                </div>
                <button className={`${btn} w-full justify-center mt-2`} onClick={saveSettings} disabled={busy}>
                  <Save className="w-3.5 h-3.5" /> Save experience settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'tiers' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className={`${card} p-5 lg:col-span-2`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">Local distance tiers</h3>
            <div className="space-y-2">
              {db.shippingTiers.map((tier) => (
                <div key={tier.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-ink-200 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-950/40">
                  <div className="flex-1 min-w-[130px]">
                    <p className="text-xs font-bold text-ink-900 dark:text-white">{tier.label}</p>
                    <p className="text-[10px] text-ink-500">{tier.minKm}–{tier.maxKm ?? '∞'} km · priority {tier.priority}</p>
                  </div>
                  <span className="font-mono font-bold text-sm text-jade-600">{money(tier.fee)}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${tier.enabled ? 'bg-jade-500/10 text-jade-600' : 'bg-ink-500/10 text-ink-500'}`}>{tier.enabled ? 'ACTIVE' : 'OFF'}</span>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => setTierForm({ id: tier.id, label: tier.label, minKm: String(tier.minKm), maxKm: optNum(tier.maxKm), fee: String(tier.fee), priority: String(tier.priority), enabled: tier.enabled })}><Edit3 className="w-3.5 h-3.5 text-ink-500" /></button>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => void remove('tier', tier.id, tier.label)}><Trash2 className="w-3.5 h-3.5 text-ink-500" /></button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5">
                <div className="flex-1 min-w-[130px]">
                  <p className="text-xs font-bold text-ink-900 dark:text-white">Above {db.shippingSettings.manualQuoteAboveKm} km</p>
                  <p className="text-[10px] text-ink-500">Configured fallback for routes outside the automatic tiers</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/10 text-amber-600">MANUAL QUOTATION</span>
              </div>
              {db.shippingTiers.length === 0 ? <p className="text-xs text-ink-500">No tiers. Local quotes use the local base fee.</p> : null}
            </div>
          </div>
          <div className={`${card} p-5`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">{tierForm.id ? 'Edit tier' : 'Add distance tier'}</h3>
            <div className="space-y-3">
              <Field><label className={label}>Label</label><input className={inp} value={tierForm.label} onChange={(e) => setTierForm((p) => ({ ...p, label: e.target.value }))} placeholder="0–3 km" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field><label className={label}>Min km</label><input className={inp} type="number" min="0" value={tierForm.minKm} onChange={(e) => setTierForm((p) => ({ ...p, minKm: e.target.value }))} /></Field>
                <Field><label className={label}>Max km</label><input className={inp} type="number" min="0" value={tierForm.maxKm} onChange={(e) => setTierForm((p) => ({ ...p, maxKm: e.target.value }))} placeholder="blank = ∞" /></Field>
              </div>
              <Field><label className={label}>Fee (₦)</label><input className={inp} type="number" min="0" value={tierForm.fee} onChange={(e) => setTierForm((p) => ({ ...p, fee: e.target.value }))} /></Field>
              <Field><label className={label}>Priority</label><input className={inp} type="number" value={tierForm.priority} onChange={(e) => setTierForm((p) => ({ ...p, priority: e.target.value }))} /></Field>
              <Toggle checked={tierForm.enabled} onChange={(v) => setTierForm((p) => ({ ...p, enabled: v }))} label="Enabled" />
              <div className="flex gap-2">
                <button className={`${btn} flex-1 justify-center`} onClick={saveTier} disabled={busy}>{tierForm.id ? 'Update tier' : 'Add tier'}</button>
                {tierForm.id ? <button className={btnGhost} onClick={() => setTierForm({ id: undefined, label: '', minKm: '0', maxKm: '', fee: '', priority: '0', enabled: true })}>Cancel</button> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'zones' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className={`${card} p-5 lg:col-span-2`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">Custom delivery zones</h3>
            <div className="space-y-2">
              {db.shippingZones.map((zone) => (
                <div key={zone.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-ink-200 dark:border-ink-800">
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-xs font-bold text-ink-900 dark:text-white">{zone.name}</p>
                    <p className="text-[10px] text-ink-500">{zone.city ? `${zone.city}, ` : ''}{zone.state} · {zone.kind} · priority {zone.priority}</p>
                  </div>
                  <span className="font-mono font-bold text-xs text-jade-600">{zone.surcharge > 0 ? `+${money(zone.surcharge)}` : 'No surcharge'}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${zone.enabled ? 'bg-jade-500/10 text-jade-600' : 'bg-ink-500/10 text-ink-500'}`}>{zone.enabled ? 'ACTIVE' : 'OFF'}</span>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => setZoneForm({ id: zone.id, name: zone.name, state: zone.state, city: zone.city || '', kind: zone.kind, surcharge: String(zone.surcharge), priority: String(zone.priority), enabled: zone.enabled, notes: zone.notes || '' })}><Edit3 className="w-3.5 h-3.5 text-ink-500" /></button>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => void remove('zone', zone.id, zone.name)}><Trash2 className="w-3.5 h-3.5 text-ink-500" /></button>
                </div>
              ))}
              {db.shippingZones.length === 0 ? <p className="text-xs text-ink-500">No zones yet. Add remote or city-specific zones to apply surcharges and zone rules.</p> : null}
            </div>
          </div>
          <div className={`${card} p-5`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">{zoneForm.id ? 'Edit zone' : 'Add zone'}</h3>
            <div className="space-y-3">
              <Field><label className={label}>Zone name</label><input className={inp} value={zoneForm.name} onChange={(e) => setZoneForm((p) => ({ ...p, name: e.target.value }))} placeholder="Lekki remote" /></Field>
              <Field><label className={label}>State</label><input className={inp} value={zoneForm.state} onChange={(e) => setZoneForm((p) => ({ ...p, state: e.target.value }))} placeholder="Lagos State" /></Field>
              <Field hint="Leave blank to apply to the whole state."><label className={label}>City (optional)</label><input className={inp} value={zoneForm.city} onChange={(e) => setZoneForm((p) => ({ ...p, city: e.target.value }))} /></Field>
              <Field><label className={label}>Zone type</label><select className={inp} value={zoneForm.kind} onChange={(e) => setZoneForm((p) => ({ ...p, kind: e.target.value as ShippingZone['kind'] }))}><option value="LOCAL">Local</option><option value="INTERSTATE">Interstate</option><option value="REMOTE">Remote / difficult</option></select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field><label className={label}>Surcharge (₦)</label><input className={inp} type="number" min="0" value={zoneForm.surcharge} onChange={(e) => setZoneForm((p) => ({ ...p, surcharge: e.target.value }))} /></Field>
                <Field><label className={label}>Priority</label><input className={inp} type="number" value={zoneForm.priority} onChange={(e) => setZoneForm((p) => ({ ...p, priority: e.target.value }))} /></Field>
              </div>
              <Toggle checked={zoneForm.enabled} onChange={(v) => setZoneForm((p) => ({ ...p, enabled: v }))} label="Enabled" />
              <div className="flex gap-2">
                <button className={`${btn} flex-1 justify-center`} onClick={saveZone} disabled={busy}>{zoneForm.id ? 'Update zone' : 'Add zone'}</button>
                {zoneForm.id ? <button className={btnGhost} onClick={() => setZoneForm({ id: undefined, name: '', state: '', city: '', kind: 'LOCAL', surcharge: '0', priority: '0', enabled: true, notes: '' })}>Cancel</button> : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'rules' && (
        <div className="space-y-4">
          <div className={`${card} p-5`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white">Pricing rules</h3>
                <p className="text-xs text-ink-500 mt-1">Higher priority wins. Zone rules beat city, then state, then global at the same priority. Leave a fee blank to inherit the foundation setting.</p>
              </div>
              <button className={btnGhost} onClick={() => setRuleForm({ ...DEFAULT_RULE })}><Plus className="w-3.5 h-3.5" /> New rule</button>
            </div>
            <div className="space-y-2">
              {[...db.shippingRules].sort((a, b) => b.priority - a.priority).map((rule) => (
                <div key={rule.id} className={`rounded-xl border p-3 ${rule.enabled ? 'border-ink-200 dark:border-ink-800' : 'border-dashed border-ink-300 dark:border-ink-700 opacity-70'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[150px]">
                      <p className="text-xs font-bold text-ink-900 dark:text-white">{rule.name}</p>
                      <p className="text-[10px] text-ink-500">
                        {rule.scope}{rule.scope === 'ZONE' ? ` · ${db.shippingZones.find((z) => z.id === rule.zoneId)?.name || 'zone deleted'}` : rule.city ? ` · ${rule.city}` : rule.state ? ` · ${rule.state}` : ''}
                        {rule.originState || rule.originCity ? ` · from ${rule.originCity ? `${rule.originCity}, ` : ''}${rule.originState || 'any state'}` : ''}
                        {' '}· {rule.deliveryMethod} · {rule.serviceType} · priority {rule.priority}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${rule.manualQuote ? 'bg-amber-500/10 text-amber-600' : rule.enabled ? 'bg-jade-500/10 text-jade-600' : 'bg-ink-500/10 text-ink-500'}`}>
                      {rule.manualQuote ? 'MANUAL' : rule.enabled ? 'ACTIVE' : 'OFF'}
                    </span>
                    <button
                      className="text-[10px] font-bold text-ink-500 underline cursor-pointer"
                      onClick={() => {
                        void dbOperations.adminToggleShippingRule(rule.id, !rule.enabled);
                      }}
                    >{rule.enabled ? 'Disable' : 'Enable'}</button>
                    <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => setRuleForm({
                      id: rule.id, name: rule.name, enabled: rule.enabled, priority: String(rule.priority), scope: rule.scope,
                      zoneId: rule.zoneId ? String(rule.zoneId) : '', state: rule.state || '', city: rule.city || '',
                      originState: rule.originState || '', originCity: rule.originCity || '',
                      deliveryMethod: rule.deliveryMethod, serviceType: rule.serviceType, baseFee: optNum(rule.baseFee),
                      perKmFee: optNum(rule.perKmFee), minFee: optNum(rule.minFee), maxFee: optNum(rule.maxFee),
                      weightPerKg: optNum(rule.weightPerKg), oversizeSurcharge: optNum(rule.oversizeSurcharge),
                      remoteSurcharge: optNum(rule.remoteSurcharge), freeShippingThreshold: optNum(rule.freeShippingThreshold),
                      handlingFee: optNum(rule.handlingFee), platformFee: optNum(rule.platformFee),
                      sellerSponsored: rule.sellerSponsored, platformSponsored: rule.platformSponsored,
                      etaMinDays: optNum(rule.etaMinDays), etaMaxDays: optNum(rule.etaMaxDays),
                      manualQuote: rule.manualQuote, notes: rule.notes || '',
                    })}><Edit3 className="w-3.5 h-3.5 text-ink-500" /></button>
                    <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => void remove('rule', rule.id, rule.name)}><Trash2 className="w-3.5 h-3.5 text-ink-500" /></button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-ink-500">
                    {rule.baseFee != null ? <span>Base {money(rule.baseFee)}</span> : null}
                    {rule.perKmFee != null ? <span>{money(rule.perKmFee)}/km</span> : null}
                    {rule.minFee != null ? <span>Min {money(rule.minFee)}</span> : null}
                    {rule.maxFee != null ? <span>Max {money(rule.maxFee)}</span> : null}
                    {rule.freeShippingThreshold != null ? <span>Free over {money(rule.freeShippingThreshold)}</span> : null}
                    {rule.sellerSponsored ? <span>Seller sponsored</span> : null}
                    {rule.platformSponsored ? <span>Platform sponsored</span> : null}
                  </div>
                </div>
              ))}
              {db.shippingRules.length === 0 ? <p className="text-xs text-ink-500">No overrides. The general pricing foundation and distance tiers apply to every route.</p> : null}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white">{ruleForm.id ? 'Edit pricing rule' : 'Create pricing rule'}</h3>
              <button className="text-xs font-bold text-ink-500 inline-flex items-center gap-1 cursor-pointer" onClick={() => setExpanded(expanded === 'rule' ? null : 'rule')}>
                {expanded === 'rule' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} {expanded === 'rule' ? 'Less' : 'All options'}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field><label className={label}>Rule name</label><input className={inp} value={ruleForm.name} onChange={(e) => setRuleForm((p) => ({ ...p, name: e.target.value }))} placeholder="Lekki express" /></Field>
              <Field><label className={label}>Priority</label><input className={inp} type="number" value={ruleForm.priority} onChange={(e) => setRuleForm((p) => ({ ...p, priority: e.target.value }))} /></Field>
              <Field><label className={label}>Scope</label><select className={inp} value={ruleForm.scope} onChange={(e) => setRuleForm((p) => ({ ...p, scope: e.target.value as ShippingRule['scope'] }))}><option value="GLOBAL">Global</option><option value="STATE">State</option><option value="CITY">City</option><option value="ZONE">Zone</option></select></Field>
              <Field><label className={label}>Delivery method</label><select className={inp} value={ruleForm.deliveryMethod} onChange={(e) => setRuleForm((p) => ({ ...p, deliveryMethod: e.target.value as ShippingRule['deliveryMethod'] }))}><option value="ANY">Any</option><option value="GOODSALE_PARTNER">GoodDispatch</option><option value="THIRD_PARTY_COURIER">Third-party courier</option><option value="PICKUP">Pickup</option></select></Field>
            </div>
            {ruleForm.scope === 'ZONE' ? (
              <div className="mt-3"><Field><label className={label}>Delivery zone</label><select className={inp} value={ruleForm.zoneId} onChange={(e) => setRuleForm((p) => ({ ...p, zoneId: e.target.value }))}><option value="">Select zone…</option>{db.shippingZones.map((z) => <option key={z.id} value={z.id}>{z.name} · {z.state}</option>)}</select></Field></div>
            ) : null}
            {ruleForm.scope === 'STATE' || ruleForm.scope === 'CITY' ? (
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <Field><label className={label}>Destination state</label><input className={inp} value={ruleForm.state} onChange={(e) => setRuleForm((p) => ({ ...p, state: e.target.value }))} placeholder="Lagos State" /></Field>
                {ruleForm.scope === 'CITY' ? <Field><label className={label}>Destination city</label><input className={inp} value={ruleForm.city} onChange={(e) => setRuleForm((p) => ({ ...p, city: e.target.value }))} /></Field> : null}
              </div>
            ) : null}
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <Field hint="Optional. Leave blank to apply from every seller state."><label className={label}>Origin state (optional)</label><input className={inp} value={ruleForm.originState} onChange={(e) => setRuleForm((p) => ({ ...p, originState: e.target.value }))} placeholder="Lagos State" /></Field>
              <Field hint="Optional. Matches the seller pickup city."><label className={label}>Origin city (optional)</label><input className={inp} value={ruleForm.originCity} onChange={(e) => setRuleForm((p) => ({ ...p, originCity: e.target.value }))} placeholder="Ikeja" /></Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
              {[
                ['baseFee', 'Base fee'], ['perKmFee', 'Per km'], ['minFee', 'Min fee'], ['maxFee', 'Max fee'],
                ['freeShippingThreshold', 'Free over'], ['etaMinDays', 'ETA min days'], ['etaMaxDays', 'ETA max days'],
                ['weightPerKg', 'Weight / kg'], ['oversizeSurcharge', 'Oversize'], ['remoteSurcharge', 'Remote'],
                ['handlingFee', 'Handling'], ['platformFee', 'Platform fee'],
              ].map(([key, title]) => (
                <Field key={key}><label className={label}>{title}</label><input className={inp} type="number" min="0" value={ruleForm[key as keyof typeof ruleForm] as string} onChange={(e) => setRuleForm((p) => ({ ...p, [key]: e.target.value }))} placeholder="inherit" /></Field>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              <Toggle checked={ruleForm.enabled} onChange={(v) => setRuleForm((p) => ({ ...p, enabled: v }))} label="Rule enabled" />
              <Toggle checked={ruleForm.manualQuote} onChange={(v) => setRuleForm((p) => ({ ...p, manualQuote: v }))} label="Require manual quote" />
              <Toggle checked={ruleForm.platformSponsored} onChange={(v) => setRuleForm((p) => ({ ...p, platformSponsored: v }))} label="Platform sponsored" />
              <Toggle checked={ruleForm.sellerSponsored} onChange={(v) => setRuleForm((p) => ({ ...p, sellerSponsored: v }))} label="Seller sponsored" />
            </div>
            <div className="flex gap-2 mt-4">
              <button className={btn} onClick={saveRule} disabled={busy}><Save className="w-3.5 h-3.5" /> {ruleForm.id ? 'Update rule' : 'Create rule'}</button>
              {ruleForm.id ? <button className={btnGhost} onClick={() => setRuleForm({ ...DEFAULT_RULE })}>Cancel</button> : null}
            </div>
          </div>
        </div>
      )}

      {section === 'couriers' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className={`${card} p-5 lg:col-span-2`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-1">Courier rate cards</h3>
            <p className="text-xs text-ink-500 mb-3">Live API adapters are opt-in. Without provider credentials, couriers stay in manual mode and never invent a quote or tracking number.</p>
            <div className="space-y-2">
              {db.shippingCouriers.map((courier) => (
                <div key={courier.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-ink-200 dark:border-ink-800">
                  <div className="flex-1 min-w-[130px]">
                    <p className="text-xs font-bold text-ink-900 dark:text-white">{courier.name} <span className="font-mono text-[10px] text-ink-400">{courier.code}</span></p>
                    <p className="text-[10px] text-ink-500">{courier.mode === 'AUTO' ? `API · ${courier.apiProvider || 'provider not set'}` : 'Manual booking'} · {money(courier.baseFee)} + {money(courier.perKmFee)}/km</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${courier.enabled ? 'bg-jade-500/10 text-jade-600' : 'bg-ink-500/10 text-ink-500'}`}>{courier.enabled ? 'ACTIVE' : 'OFF'}</span>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => setCourierForm({ id: courier.id, name: courier.name, code: courier.code, mode: courier.mode, baseFee: String(courier.baseFee), perKmFee: String(courier.perKmFee), expressMultiplier: String(courier.expressMultiplier), apiProvider: courier.apiProvider || '', notes: courier.notes || '', enabled: courier.enabled })}><Edit3 className="w-3.5 h-3.5 text-ink-500" /></button>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => void remove('courier', courier.id, courier.name)}><Trash2 className="w-3.5 h-3.5 text-ink-500" /></button>
                </div>
              ))}
              {db.shippingCouriers.length === 0 ? <p className="text-xs text-ink-500">No couriers configured. Third-party checkout requires an admin rate card or a manual quotation.</p> : null}
            </div>
          </div>
          <div className={`${card} p-5`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">{courierForm.id ? 'Edit courier' : 'Add courier'}</h3>
            <div className="space-y-3">
              <Field><label className={label}>Display name</label><input className={inp} value={courierForm.name} onChange={(e) => setCourierForm((p) => ({ ...p, name: e.target.value }))} /></Field>
              <Field><label className={label}>Code</label><input className={inp} value={courierForm.code} onChange={(e) => setCourierForm((p) => ({ ...p, code: e.target.value }))} placeholder="GIG" /></Field>
              <Field><label className={label}>Mode</label><select className={inp} value={courierForm.mode} onChange={(e) => setCourierForm((p) => ({ ...p, mode: e.target.value as ShippingCourier['mode'] }))}><option value="MANUAL">Manual / admin rate card</option><option value="AUTO">Live API adapter</option></select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field><label className={label}>Base fee (₦)</label><input className={inp} type="number" min="0" value={courierForm.baseFee} onChange={(e) => setCourierForm((p) => ({ ...p, baseFee: e.target.value }))} /></Field>
                <Field><label className={label}>Per km (₦)</label><input className={inp} type="number" min="0" value={courierForm.perKmFee} onChange={(e) => setCourierForm((p) => ({ ...p, perKmFee: e.target.value }))} /></Field>
                <Field><label className={label}>Express multiplier</label><input className={inp} type="number" min="1" step="0.1" value={courierForm.expressMultiplier} onChange={(e) => setCourierForm((p) => ({ ...p, expressMultiplier: e.target.value }))} /></Field>
                <Field><label className={label}>API provider key</label><input className={inp} value={courierForm.apiProvider} onChange={(e) => setCourierForm((p) => ({ ...p, apiProvider: e.target.value }))} placeholder="registered adapter" /></Field>
              </div>
              <Toggle checked={courierForm.enabled} onChange={(v) => setCourierForm((p) => ({ ...p, enabled: v }))} label="Enabled" />
              <button className={`${btn} w-full justify-center`} onClick={saveCourier} disabled={busy}>{courierForm.id ? 'Update courier' : 'Add courier'}</button>
            </div>
          </div>
        </div>
      )}

      {section === 'quotes' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className={`${card} p-5 lg:col-span-2`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-1">Manual courier quotations</h3>
            <p className="text-xs text-ink-500 mb-3">Use these only when a genuine courier quote has been obtained. The amount is charged as the delivery fee for that seller and route.</p>
            <div className="space-y-2">
              {db.shippingManualQuotes.map((quote) => (
                <div key={quote.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-ink-200 dark:border-ink-800">
                  <div className="flex-1 min-w-[150px]">
                    <p className="text-xs font-bold text-ink-900 dark:text-white">{db.users.find((u) => u.id === quote.sellerId)?.fullName || `Seller #${quote.sellerId}`}</p>
                    <p className="text-[10px] text-ink-500">{quote.city ? `${quote.city}, ` : ''}{quote.state} · {quote.etaMinDays}–{quote.etaMaxDays} days {quote.expiresAt ? `· expires ${new Date(quote.expiresAt).toLocaleDateString()}` : ''}</p>
                  </div>
                  <span className="font-mono font-bold text-sm text-jade-600">{money(quote.amount)}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${quote.active ? 'bg-jade-500/10 text-jade-600' : 'bg-ink-500/10 text-ink-500'}`}>{quote.active ? 'ACTIVE' : 'OFF'}</span>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => setQuoteForm({ id: quote.id, sellerId: String(quote.sellerId), state: quote.state, city: quote.city || '', amount: String(quote.amount), etaMinDays: String(quote.etaMinDays), etaMaxDays: String(quote.etaMaxDays), notes: quote.notes || '', active: quote.active, expiresAt: quote.expiresAt ? quote.expiresAt.slice(0, 10) : '' })}><Edit3 className="w-3.5 h-3.5 text-ink-500" /></button>
                  <button className="p-1.5 rounded-lg hover:bg-ink-500/10 cursor-pointer" onClick={() => void remove('quote', quote.id, 'manual quotation')}><Trash2 className="w-3.5 h-3.5 text-ink-500" /></button>
                </div>
              ))}
              {db.shippingManualQuotes.length === 0 ? <p className="text-xs text-ink-500">No manual quotes. Unsupported routes will ask the buyer to request one.</p> : null}
            </div>
          </div>
          <div className={`${card} p-5`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">{quoteForm.id ? 'Edit quotation' : 'Add quotation'}</h3>
            <div className="space-y-3">
              <Field><label className={label}>Seller</label><select className={inp} value={quoteForm.sellerId} onChange={(e) => setQuoteForm((p) => ({ ...p, sellerId: e.target.value }))}><option value="">Select seller…</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field><label className={label}>State</label><input className={inp} value={quoteForm.state} onChange={(e) => setQuoteForm((p) => ({ ...p, state: e.target.value }))} /></Field>
                <Field><label className={label}>City (optional)</label><input className={inp} value={quoteForm.city} onChange={(e) => setQuoteForm((p) => ({ ...p, city: e.target.value }))} /></Field>
              </div>
              <Field><label className={label}>Quoted amount (₦)</label><input className={inp} type="number" min="0" value={quoteForm.amount} onChange={(e) => setQuoteForm((p) => ({ ...p, amount: e.target.value }))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field><label className={label}>ETA min days</label><input className={inp} type="number" min="0" value={quoteForm.etaMinDays} onChange={(e) => setQuoteForm((p) => ({ ...p, etaMinDays: e.target.value }))} /></Field>
                <Field><label className={label}>ETA max days</label><input className={inp} type="number" min="0" value={quoteForm.etaMaxDays} onChange={(e) => setQuoteForm((p) => ({ ...p, etaMaxDays: e.target.value }))} /></Field>
              </div>
              <Field><label className={label}>Expires (optional)</label><input className={inp} type="date" value={quoteForm.expiresAt} onChange={(e) => setQuoteForm((p) => ({ ...p, expiresAt: e.target.value }))} /></Field>
              <Field><label className={label}>Notes</label><input className={inp} value={quoteForm.notes} onChange={(e) => setQuoteForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Courier reference" /></Field>
              <Toggle checked={quoteForm.active} onChange={(v) => setQuoteForm((p) => ({ ...p, active: v }))} label="Active" />
              <button className={`${btn} w-full justify-center`} onClick={saveQuote} disabled={busy}>{quoteForm.id ? 'Update quotation' : 'Save quotation'}</button>
            </div>
          </div>
        </div>
      )}

      {section === 'calculator' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-5`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white flex items-center gap-2 mb-3"><Calculator className="w-4 h-4 text-jade-500" /> Preview shipping calculator</h3>
            <p className="text-xs text-ink-500 mb-4">Runs the same engine as checkout against the currently saved rules and tiers.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field><label className={label}>Seller</label><select className={inp} value={calc.sellerId} onChange={(e) => setCalc((p) => ({ ...p, sellerId: e.target.value }))}><option value="">First seller</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></Field>
              <Field><label className={label}>Service</label><select className={inp} value={calc.service} onChange={(e) => setCalc((p) => ({ ...p, service: e.target.value as typeof calc.service }))}><option value="ECONOMY">Economy</option><option value="STANDARD">Standard</option><option value="EXPRESS">Express</option></select></Field>
              <Field><label className={label}>Destination state</label><input className={inp} value={calc.state} onChange={(e) => setCalc((p) => ({ ...p, state: e.target.value }))} /></Field>
              <Field><label className={label}>Destination city</label><input className={inp} value={calc.city} onChange={(e) => setCalc((p) => ({ ...p, city: e.target.value }))} /></Field>
              <Field><label className={label}>Distance (km)</label><input className={inp} type="number" min="0" value={calc.distanceKm} onChange={(e) => setCalc((p) => ({ ...p, distanceKm: e.target.value }))} /></Field>
              <Field><label className={label}>Cart weight (kg)</label><input className={inp} type="number" min="0.1" step="0.1" value={calc.weightKg} onChange={(e) => setCalc((p) => ({ ...p, weightKg: e.target.value }))} /></Field>
              <Field><label className={label}>Cart subtotal (₦)</label><input className={inp} type="number" min="0" value={calc.subtotal} onChange={(e) => setCalc((p) => ({ ...p, subtotal: e.target.value }))} /></Field>
              <Field><label className={label}>Method</label><select className={inp} value={calc.method} onChange={(e) => setCalc((p) => ({ ...p, method: e.target.value as typeof calc.method }))}><option value="GOODSALE_PARTNER">GoodDispatch</option><option value="THIRD_PARTY_COURIER">Third-party courier</option><option value="PICKUP">Pickup</option></select></Field>
            </div>
          </div>
          <div className={`${card} p-5`}>
            <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-3">Quote result</h3>
            {!calculator ? <p className="text-xs text-ink-500">Add a seller to preview a quote.</p> : calculator.option ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-jade-500/5 border border-jade-500/20">
                  <div>
                    <p className="text-xs font-bold text-ink-900 dark:text-white">{calculator.option.label}</p>
                    <p className="text-[10px] text-ink-500">{calculator.option.etaMinDays}–{calculator.option.etaMaxDays} days · {calculator.option.breakdown.distanceKm != null ? `${calculator.option.breakdown.distanceKm} km` : 'distance unknown'}</p>
                  </div>
                  <span className="font-display font-bold text-2xl text-jade-600">{money(calculator.option.fee)}</span>
                </div>
                <div className="text-xs space-y-1.5">
                  {[
                    ['Local base', calculator.option.breakdown.baseFee],
                    ['Distance', calculator.option.breakdown.distanceFee],
                    ['Weight', calculator.option.breakdown.weightFee],
                    ['Oversize', calculator.option.breakdown.sizeFee],
                    ['Zone', calculator.option.breakdown.zoneFee],
                    ['Remote', calculator.option.breakdown.remoteFee],
                    ['Handling', calculator.option.breakdown.handlingFee],
                    ['Platform', calculator.option.breakdown.platformFee],
                    ['Free-shipping discount', -calculator.option.breakdown.discount],
                  ].filter(([, value]) => Number(value) !== 0).map(([title, value]) => (
                    <div key={String(title)} className="flex justify-between text-ink-500"><span>{title}</span><span className="font-mono">{money(Number(value))}</span></div>
                  ))}
                  {calculator.option.freeShipping ? <div className="p-2 rounded-lg bg-jade-500/10 text-jade-600 font-bold text-[11px] flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Free shipping applies</div> : null}
                  {calculator.option.ruleName ? <p className="text-[10px] text-ink-400">Rule: {calculator.option.ruleName}</p> : null}
                  {calculator.option.courierName ? <p className="text-[10px] text-ink-400">Courier: {calculator.option.courierName}</p> : null}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> No priceable route</p>
                <p className="mt-1">{calculator.unavailableReason || 'This route requires a manual quotation.'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'audit' && (
        <div className={`${card} p-5`}>
          <h3 className="font-sans font-bold text-sm text-ink-900 dark:text-white mb-1">Shipping fee audit history</h3>
          <p className="text-xs text-ink-500 mb-4">Who changed which shipping setting and when. Historical orders are unaffected by later changes.</p>
          <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
            {db.shippingAuditLogs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-start gap-3 p-3 rounded-xl border border-ink-200 dark:border-ink-800">
                <div className="w-8 h-8 rounded-lg bg-jade-500/10 flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-jade-500" /></div>
                <div className="flex-1 min-w-[180px]">
                  <p className="text-xs font-bold text-ink-900 dark:text-white">{log.action.replaceAll('_', ' ')}</p>
                  <p className="text-[11px] text-ink-500 mt-0.5">{log.details}</p>
                  <p className="text-[10px] text-ink-400 mt-1">{log.userName || 'System'} · {new Date(log.createdAt).toLocaleString()} · {log.entityType} #{log.entityId}</p>
                </div>
              </div>
            ))}
            {db.shippingAuditLogs.length === 0 ? <p className="text-xs text-ink-500">No shipping changes recorded yet.</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
