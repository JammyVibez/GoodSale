// components/onboarding/SellerOnboardingFlow.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  MapPin,
  PackagePlus,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import BrandLoader from '@/components/ui/BrandLoader';
import OnboardingBrand from '@/components/onboarding/OnboardingBrand';
import { addressCitiesFor, addressStates } from '@/lib/serviceAreas';
import { bootstrapStore, reloadFromSupabase, useDBState } from '@/lib/store';
import { uploadMedia } from '@/lib/upload';

/** Three screens: store identity, location + contact, review. */
const TOTAL_STEPS = 3;
const STEP_LABELS = ['Store', 'Location', 'Review'];

const inputBase =
  'auth-field w-full rounded-xl px-3.5 py-3 text-sm font-medium tracking-tight disabled:opacity-60';
const labelBase = 'mb-1.5 block text-xs font-semibold text-ink-600 dark:text-white/70';
const tileBase =
  'rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-950';
const tileIdle =
  'border-ink-150 bg-ink-50 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20';
const tileActive = 'border-jade-500 bg-jade-500/[0.07] dark:border-jade-400 dark:bg-jade-400/10';

const NIGERIAN_PHONE = /^(?:\+?234|0)[789]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SellerOnboardingFlow() {
  const db = useDBState();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [sellerType, setSellerType] = useState<'INDIVIDUAL' | 'BUSINESS'>('INDIVIDUAL');
  const [storeName, setStoreName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [stateName, setStateName] = useState('Lagos State');
  const [city, setCity] = useState('Ikeja');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [policies, setPolicies] = useState('');
  const [uploading, setUploading] = useState(false);

  const initialized = useRef(false);

  const profile = db.currentUser
    ? db.profiles.find((entry) => entry.userId === db.currentUser!.id)
    : undefined;
  const store = db.currentUser
    ? db.businesses.find((entry) => entry.ownerId === db.currentUser!.id)
    : undefined;

  useEffect(() => {
    void bootstrapStore().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!db.currentUser) {
      router.replace('/auth?next=%2Fseller%2Fonboarding');
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    if (store) {
      setSellerType(store.sellerType);
      setStoreName(store.name);
      setDescription(store.description);
      setLogoUrl(store.logoUrl);
      if (store.state) setStateName(store.state);
      if (store.city) setCity(store.city);
      setArea(store.area);
      setAddress(store.address);
      setContactPhone(store.contactPhone);
      setContactEmail(store.contactEmail);
      setPolicies(store.policies);
    } else {
      if (profile?.state) setStateName(profile.state);
      if (profile?.city) setCity(profile.city);
      setArea(profile?.area ?? '');
      setContactPhone(db.currentUser?.phoneNumber ?? '');
      setContactEmail(db.currentUser?.email ?? '');
      setAddress(profile?.address ?? '');
    }

    // Map the previous five-screen saves onto the three-screen flow.
    const savedStep = profile?.sellerOnboardingStep ?? 0;
    const mappedStep = savedStep <= 1 ? 0 : savedStep === 2 ? 1 : 2;
    setStep(
      profile?.storeOnboardingCompletedAt
        ? TOTAL_STEPS
        : Math.min(Math.max(mappedStep, 0), TOTAL_STEPS - 1)
    );
  }, [ready, db.currentUser, profile, store, router]);

  const cityOptions = addressCitiesFor(stateName);

  const saveStore = async (options: { step?: number; complete?: boolean }) => {
    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sellerType,
        storeName,
        description,
        logoUrl,
        state: stateName,
        city,
        area,
        address,
        contactPhone,
        contactEmail,
        policies,
        ...options,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Could not save your store. Please try again.');
    }
    await reloadFromSupabase();
  };

  const goTo = async (nextStep: number) => {
    setError('');
    setBusy(true);
    try {
      await saveStore({ step: nextStep });
      setStep(nextStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your store.');
    } finally {
      setBusy(false);
    }
  };

  const saveAndExit = async () => {
    setError('');
    setBusy(true);
    try {
      await saveStore({ step });
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your store.');
      setBusy(false);
    }
  };

  const finish = async () => {
    setError('');
    setBusy(true);
    try {
      await saveStore({ complete: true, step: TOTAL_STEPS });
      setStep(TOTAL_STEPS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish store setup.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <BrandLoader message="Loading your store…" />;
  }

  if (!db.currentUser) {
    return (
      <div className="auth-stage grid min-h-dvh place-items-center px-6">
        <div className="auth-panel auth-hairline w-full max-w-sm rounded-3xl p-8 text-center">
          <p className="text-sm text-ink-600 dark:text-white/70">Sign in to open your GoodSale store.</p>
          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={() => router.replace('/auth?next=%2Fseller%2Fonboarding')}
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-stage min-h-dvh px-4 py-6 sm:px-6 sm:py-10">
      <div className="auth-panel auth-hairline mx-auto w-full max-w-3xl overflow-hidden rounded-[28px]">
        <div className="border-b border-ink-150 px-6 py-5 dark:border-white/10 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <OnboardingBrand />
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={saveAndExit}
                disabled={busy}
                className="text-xs font-semibold text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
              >
                Save &amp; exit
              </button>
            ) : (
              <span className="text-xs font-semibold text-jade-700 dark:text-jade-300">Store ready</span>
            )}
          </div>

          {step < TOTAL_STEPS ? (
            <div className="mt-5">
              <div className="flex items-center justify-between text-[0.7rem] font-semibold text-ink-500 dark:text-white/45">
                <span className="uppercase tracking-[0.18em]">
                  Store setup · {step + 1} of {TOTAL_STEPS} · {STEP_LABELS[step]}
                </span>
                <span>{Math.round(((step + 1) / TOTAL_STEPS) * 100)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-150 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-jade-500 transition-[width] duration-500 dark:bg-jade-400"
                  style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-7 sm:px-8 sm:py-9">
          {error ? (
            <div
              role="alert"
              className="animate-shake mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-50 px-3.5 py-3 text-xs font-medium text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* 1 — Type + store identity */}
          {step === 0 ? (
            <div className="animate-fade-in">
              <h1 className="font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
                Set up your store
              </h1>
              <p className="mt-2 text-sm text-ink-500 dark:text-white/55">
                Buyers see this name and logo on every listing. Both can change later — and selling
                never changes how you buy.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: 'INDIVIDUAL' as const,
                    Icon: UserRound,
                    title: 'Individual',
                    detail: 'You sell as yourself, with your own name on the store.',
                  },
                  {
                    value: 'BUSINESS' as const,
                    Icon: Building2,
                    title: 'Business',
                    detail: 'A registered company or a shop with a brand name.',
                  },
                ].map(({ value, Icon, title, detail }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSellerType(value)}
                    aria-pressed={sellerType === value}
                    className={`${tileBase} ${sellerType === value ? tileActive : tileIdle}`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        sellerType === value
                          ? 'text-jade-600 dark:text-jade-300'
                          : 'text-ink-400 dark:text-white/40'
                      }`}
                      aria-hidden="true"
                    />
                    <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-white/45">
                      {detail}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-4">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt="Store logo"
                    className="h-14 w-14 rounded-2xl border border-ink-200 object-cover dark:border-white/15"
                  />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-ink-200 bg-ink-50 text-ink-400 dark:border-white/12 dark:bg-white/5 dark:text-white/35">
                    <Store className="h-6 w-6" aria-hidden="true" />
                  </div>
                )}
                <label
                  htmlFor="store-logo"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-jade-500 hover:text-jade-700 dark:border-white/15 dark:text-white/75 dark:hover:border-jade-400 dark:hover:text-jade-300"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Add logo (optional)'}
                </label>
                <input
                  id="store-logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    setError('');
                    try {
                      setLogoUrl(await uploadMedia(file, 'avatars'));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Logo upload failed.');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className={labelBase} htmlFor="store-name">
                    Store name
                  </label>
                  <input
                    id="store-name"
                    value={storeName}
                    onChange={(event) => setStoreName(event.target.value)}
                    maxLength={80}
                    placeholder="e.g. Maison Lagos"
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className={labelBase} htmlFor="store-description">
                    What do you sell?{' '}
                    <span className="font-normal text-ink-400 dark:text-white/35">(optional)</span>
                  </label>
                  <textarea
                    id="store-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder="Phones and accessories, checked and tested before every dispatch."
                    className={`${inputBase} resize-none`}
                  />
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => router.replace('/')} disabled={busy}>
                  Not now
                </Button>
                <Button
                  size="lg"
                  loading={busy}
                  disabled={storeName.trim().length < 2 || uploading}
                  onClick={() => goTo(1)}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* 2 — Location + contact */}
          {step === 1 ? (
            <div className="animate-fade-in">
              <h1 className="font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
                Where do you operate?
              </h1>
              <p className="mt-2 text-sm text-ink-500 dark:text-white/55">
                Buyers filter by state and city, and GoodDispatch prices delivery from this address.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelBase} htmlFor="store-state">
                    State
                  </label>
                  <select
                    id="store-state"
                    value={stateName}
                    onChange={(event) => {
                      const nextState = event.target.value;
                      setStateName(nextState);
                      setCity(addressCitiesFor(nextState)[0] ?? '');
                    }}
                    className={inputBase}
                  >
                    {addressStates().map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelBase} htmlFor="store-city">
                    City
                  </label>
                  <select
                    id="store-city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className={inputBase}
                  >
                    {city && !cityOptions.includes(city) ? <option value={city}>{city}</option> : null}
                    {cityOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelBase} htmlFor="store-area">
                    Area <span className="font-normal text-ink-400 dark:text-white/35">(optional)</span>
                  </label>
                  <input
                    id="store-area"
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                    placeholder="e.g. Ikeja GRA"
                    maxLength={80}
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className={labelBase} htmlFor="store-address">
                    Pickup address{' '}
                    <span className="font-normal text-ink-400 dark:text-white/35">(optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                      aria-hidden="true"
                    />
                    <input
                      id="store-address"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Street and landmark"
                      maxLength={240}
                      className={`${inputBase} pl-10`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelBase} htmlFor="store-phone">
                    Contact phone
                  </label>
                  <input
                    id="store-phone"
                    type="tel"
                    inputMode="tel"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    placeholder="0803 000 1111"
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className={labelBase} htmlFor="store-email">
                    Contact email
                  </label>
                  <input
                    id="store-email"
                    type="email"
                    inputMode="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    placeholder="store@example.com"
                    className={inputBase}
                  />
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(0)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  size="lg"
                  loading={busy}
                  disabled={!stateName || !city}
                  onClick={() => {
                    const cleanedPhone = contactPhone.replace(/[\s-]/g, '');
                    if (cleanedPhone && !NIGERIAN_PHONE.test(cleanedPhone)) {
                      setError('Enter a Nigerian store phone number, for example 0803 000 1111.');
                      return;
                    }
                    if (contactEmail.trim() && !EMAIL.test(contactEmail.trim())) {
                      setError('Enter a valid store email address.');
                      return;
                    }
                    void goTo(2);
                  }}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* 3 — Policies + review */}
          {step === 2 ? (
            <div className="animate-fade-in">
              <h1 className="font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
                Review your store
              </h1>
              <p className="mt-2 text-sm text-ink-500 dark:text-white/55">
                Add your returns and dispatch expectations, then open the store. Everything here can
                be edited later.
              </p>

              <div className="mt-5">
                <label className={labelBase} htmlFor="store-policies">
                  Store policies{' '}
                  <span className="font-normal text-ink-400 dark:text-white/35">(optional)</span>
                </label>
                <textarea
                  id="store-policies"
                  value={policies}
                  onChange={(event) => setPolicies(event.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder={
                    'Dispatch: same day for orders before 2pm.\nReturns: 3 days for unused items in original packaging.'
                  }
                  className={`${inputBase} resize-none leading-relaxed`}
                />
                <p className="mt-2 text-[0.7rem] text-ink-400 dark:text-white/35">
                  Escrow, delivery confirmation and dispute rules are set by GoodSale and always apply.
                </p>
              </div>

              <dl className="mt-5 divide-y divide-ink-150 overflow-hidden rounded-2xl border border-ink-150 dark:divide-white/8 dark:border-white/10">
                {[
                  ['Seller type', sellerType === 'BUSINESS' ? 'Business' : 'Individual'],
                  ['Store name', storeName || '—'],
                  ['Description', description || 'Not added'],
                  ['Location', [area, city, stateName].filter(Boolean).join(', ') || '—'],
                  ['Pickup address', address || 'Not added'],
                  ['Contact', [contactPhone, contactEmail].filter(Boolean).join(' · ') || '—'],
                  ['Policies', policies ? 'Added' : 'Not added'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-6 px-4 py-2.5">
                    <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-400 dark:text-white/40">
                      {label}
                    </dt>
                    <dd className="max-w-[62%] text-right text-sm text-ink-800 dark:text-white/80">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-gold-600/20 bg-gold-50 px-3.5 py-3 text-[0.72rem] leading-relaxed text-gold-800 dark:border-gold-300/20 dark:bg-gold-300/5 dark:text-gold-100/80">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-600 dark:text-gold-300" aria-hidden="true" />
                <span>
                  Your store will not show a verified badge yet. Add identity or CAC documents in
                  Verification after setup — GoodSale reviews every application before any badge appears.
                </span>
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  size="lg"
                  loading={busy}
                  disabled={storeName.trim().length < 2}
                  onClick={finish}
                >
                  Open my store
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* Done */}
          {step === TOTAL_STEPS ? (
            <div className="animate-fade-in">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-jade-500/30 bg-jade-500/10 text-jade-700 dark:border-jade-400/40 dark:bg-jade-400/10 dark:text-jade-300">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </span>
              <h1 className="mt-5 font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
                {storeName || 'Your store'} is set up.
              </h1>
              <p className="mt-2 text-sm text-ink-500 dark:text-white/55">
                You can buy and sell with the same account. Next, add your first listing — escrow and
                delivery are handled by GoodSale.
              </p>

              <ol className="mt-6 space-y-2.5">
                {[
                  'Add a product with clear photos and an honest condition.',
                  'Set your price and delivery preference.',
                  'Dispatch when an order is paid into escrow.',
                  'Get paid after the buyer confirms delivery with their PIN.',
                ].map((item, index) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-xl border border-ink-150 bg-ink-50 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-jade-500/10 text-[0.65rem] font-bold text-jade-700 dark:bg-jade-400/15 dark:text-jade-300">
                      {index + 1}
                    </span>
                    <span className="text-xs leading-relaxed text-ink-600 dark:text-white/65">
                      {item}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={() => router.replace('/?view=dashboard')}
                >
                  <PackagePlus className="h-4 w-4" aria-hidden="true" />
                  Go to seller dashboard
                </Button>
                <Button variant="outline" size="lg" onClick={() => setStep(0)}>
                  Edit store details
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
