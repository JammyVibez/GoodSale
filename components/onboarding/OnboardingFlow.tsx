// components/onboarding/OnboardingFlow.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  Compass,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import BrandLoader from '@/components/ui/BrandLoader';
import AuthShellBrand from '@/components/onboarding/OnboardingBrand';
import { addressCitiesFor, addressStates } from '@/lib/serviceAreas';
import { bootstrapStore, reloadFromSupabase, useDBState } from '@/lib/store';
import { uploadMedia } from '@/lib/upload';
import { postAuthDestination } from '@/lib/auth/redirects';

/** Three screens: who you are, where you are, how we reach you. */
const TOTAL_STEPS = 3;
const STEP_LABELS = ['Your account', 'Delivery', 'Notifications'];

const inputBase =
  'auth-field w-full rounded-xl px-3.5 py-3 text-sm font-medium tracking-tight disabled:opacity-60';
const labelBase = 'mb-1.5 block text-xs font-semibold text-ink-600 dark:text-white/70';
const tileBase =
  'rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-950';
const tileIdle =
  'border-ink-150 bg-ink-50 hover:border-ink-300 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20';
const tileActive = 'border-jade-500 bg-jade-500/[0.07] dark:border-jade-400 dark:bg-jade-400/10';

const NIGERIAN_PHONE = /^(?:\+?234|0)[789]\d{9}$/;

export default function OnboardingFlow() {
  const db = useDBState();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [buying, setBuying] = useState(true);
  const [selling, setSelling] = useState(false);
  const [stateName, setStateName] = useState('Lagos State');
  const [city, setCity] = useState('Ikeja');
  const [area, setArea] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [marketplaceNotifications, setMarketplaceNotifications] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const initialized = useRef(false);
  const finishedLocally = useRef(false);

  const profile = db.currentUser
    ? db.profiles.find((entry) => entry.userId === db.currentUser!.id)
    : undefined;

  useEffect(() => {
    void bootstrapStore().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!db.currentUser) {
      router.replace('/auth?next=%2Fonboarding');
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    setBuying(profile?.wantsBuying ?? true);
    setSelling(profile?.wantsSelling ?? false);
    if (profile?.state) setStateName(profile.state);
    if (profile?.city) setCity(profile.city);
    if (profile?.area) setArea(profile.area);
    setDisplayName(db.currentUser.fullName || '');
    setPhone(db.currentUser.phoneNumber || '');
    setPhotoUrl(profile?.photoUrl || '');
    setMarketplaceNotifications(profile?.marketplaceNotifications ?? true);
    setMarketingOptIn(profile?.marketingOptIn ?? false);

    // Map the previous five-screen saves onto the three-screen flow.
    const savedStep = profile?.onboardingStep ?? 0;
    const mappedStep = savedStep <= 1 ? 0 : savedStep === 2 ? 1 : 2;
    setStep(Math.min(Math.max(mappedStep, 0), TOTAL_STEPS - 1));
  }, [ready, db.currentUser, profile, router]);

  // Already onboarded accounts never see this screen again.
  useEffect(() => {
    if (!ready || !profile || finishedLocally.current) return;
    if (profile.onboardingCompletedAt) {
      router.replace(
        postAuthDestination(
          {
            onboardingCompletedAt: profile.onboardingCompletedAt,
            wantsSelling: profile.wantsSelling,
            storeOnboardingCompletedAt: profile.storeOnboardingCompletedAt,
          },
          undefined
        )
      );
    }
  }, [ready, profile, router]);

  const cityOptions = addressCitiesFor(stateName);

  const save = async (patch: Record<string, unknown>) => {
    const response = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Could not save your progress. Please try again.');
    }
    await reloadFromSupabase();
  };

  const advance = async (nextStep: number, patch: Record<string, unknown> = {}) => {
    setError('');
    setBusy(true);
    try {
      await save({ step: nextStep, ...patch });
      setStep(nextStep);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your progress.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async (destination?: string) => {
    setError('');
    setBusy(true);
    try {
      await save({
        step: TOTAL_STEPS,
        complete: true,
        purpose: { buying, selling },
        location: { state: stateName, city, area },
        notifications: {
          marketplace: marketplaceNotifications,
          marketing: marketingOptIn,
          push: marketplaceNotifications,
          email: true,
        },
      });
      finishedLocally.current = true;
      if (destination) {
        router.replace(destination);
        return;
      }
      setStep(TOTAL_STEPS);
      await reloadFromSupabase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish onboarding.');
    } finally {
      setBusy(false);
    }
  };

  const startSelling = async () => {
    setBusy(true);
    setError('');
    try {
      if (!selling) {
        await save({ purpose: { buying: true, selling: true }, step: TOTAL_STEPS });
        setSelling(true);
      }
      router.replace('/seller/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open seller setup.');
      setBusy(false);
    }
  };

  if (!ready) {
    return <BrandLoader message="Loading your account…" />;
  }

  if (!db.currentUser) {
    return (
      <div className="auth-stage grid min-h-dvh place-items-center px-6">
        <div className="auth-panel auth-hairline w-full max-w-sm rounded-3xl p-8 text-center">
          <p className="text-sm text-ink-600 dark:text-white/70">
            Sign in to continue setting up your GoodSale account.
          </p>
          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={() => router.replace('/auth?next=%2Fonboarding')}
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
        {/* Header + progress */}
        <div className="border-b border-ink-150 px-6 py-5 dark:border-white/10 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <AuthShellBrand />
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={() => finish('/')}
                disabled={busy}
                className="text-xs font-semibold text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
              >
                Skip setup
              </button>
            ) : (
              <span className="text-xs font-semibold text-jade-700 dark:text-jade-300">Complete</span>
            )}
          </div>

          {step < TOTAL_STEPS ? (
            <div className="mt-5">
              <div className="flex items-center justify-between text-[0.7rem] font-semibold text-ink-500 dark:text-white/45">
                <span className="uppercase tracking-[0.18em]">
                  Step {step + 1} of {TOTAL_STEPS} · {STEP_LABELS[step]}
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

          {/* 1 — Purpose + welcome */}
          {step === 0 ? (
            <div className="animate-fade-in">
              <p className="text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-gold-700 dark:text-gold-200/80">
                Welcome
              </p>
              <h1 className="mt-3 font-display text-[1.85rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white sm:text-[2.1rem]">
                What brings you to GoodSale?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-500 dark:text-white/60">
                One account can buy and sell — no second signup. Two more quick screens set up
                delivery and alerts, and every answer can change later in Settings.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  {
                    active: buying,
                    toggle: () => setBuying((value) => !value),
                    Icon: ShoppingBag,
                    title: 'Buy products',
                    detail: 'Shop with escrow protection and tracked delivery.',
                  },
                  {
                    active: selling,
                    toggle: () => setSelling((value) => !value),
                    Icon: Store,
                    title: 'Sell products',
                    detail: 'Open a store and list to buyers across Nigeria.',
                  },
                ].map(({ active, toggle, Icon, title, detail }) => (
                  <button
                    key={title}
                    type="button"
                    onClick={toggle}
                    aria-pressed={active}
                    className={`${tileBase} ${active ? tileActive : tileIdle}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Icon
                        className={`h-5 w-5 ${
                          active
                            ? 'text-jade-600 dark:text-jade-300'
                            : 'text-ink-400 dark:text-white/40'
                        }`}
                        aria-hidden="true"
                      />
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full border ${
                          active
                            ? 'border-jade-500 bg-jade-500 text-white dark:border-jade-400 dark:bg-jade-400 dark:text-ink-950'
                            : 'border-ink-300 dark:border-white/25'
                        }`}
                      >
                        {active ? <Check className="h-3 w-3" /> : null}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-white/45">
                      {detail}
                    </p>
                  </button>
                ))}
              </div>

              {!buying && !selling ? (
                <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-300">
                  Pick at least one to continue.
                </p>
              ) : null}

              <ul className="mt-6 grid gap-2 text-xs text-ink-500 dark:text-white/45 sm:grid-cols-3">
                {[
                  'Escrow held until delivery',
                  'Reviewed seller identities',
                  'Delivery across Nigeria',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-jade-600 dark:text-jade-300" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-400 dark:text-white/35">About a minute</span>
                <Button
                  size="lg"
                  loading={busy}
                  onClick={() => advance(1, { purpose: { buying, selling } })}
                  disabled={!buying && !selling}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* 2 — Delivery + profile */}
          {step === 1 ? (
            <div className="animate-fade-in">
              <h1 className="font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
                Where should we deliver?
              </h1>
              <p className="mt-2 text-sm text-ink-500 dark:text-white/55">
                This sets delivery estimates and nearby sellers. We never read your GPS — change it
                any time in Settings.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelBase} htmlFor="onboarding-state">
                    State
                  </label>
                  <select
                    id="onboarding-state"
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
                  <label className={labelBase} htmlFor="onboarding-city">
                    City
                  </label>
                  <select
                    id="onboarding-city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className={inputBase}
                  >
                    {city && !cityOptions.includes(city) ? <option value={city}>{city}</option> : null}
                    {cityOptions.length === 0 ? <option value="">Choose a state first</option> : null}
                    {cityOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className={labelBase} htmlFor="onboarding-area">
                    Area / neighbourhood{' '}
                    <span className="font-normal text-ink-400 dark:text-white/35">(optional)</span>
                  </label>
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                      aria-hidden="true"
                    />
                    <input
                      id="onboarding-area"
                      value={area}
                      onChange={(event) => setArea(event.target.value)}
                      placeholder="e.g. Yaba, Wuse II, GRA"
                      className={`${inputBase} pl-10`}
                      maxLength={80}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelBase} htmlFor="onboarding-name">
                    Display name
                  </label>
                  <input
                    id="onboarding-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={80}
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className={labelBase} htmlFor="onboarding-phone">
                    Phone number
                  </label>
                  <input
                    id="onboarding-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="0803 000 1111"
                    className={inputBase}
                  />
                  <p className="mt-1.5 text-[0.7rem] text-ink-400 dark:text-white/35">
                    Used for delivery and order updates only.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt="Your profile photo"
                    className="h-11 w-11 rounded-xl border border-ink-200 object-cover dark:border-white/15"
                  />
                ) : (
                  <div className="grid h-11 w-11 place-items-center rounded-xl border border-ink-200 bg-ink-50 text-ink-400 dark:border-white/12 dark:bg-white/5 dark:text-white/35">
                    <UserRound className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
                <label
                  htmlFor="onboarding-photo"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-jade-500 hover:text-jade-700 dark:border-white/15 dark:text-white/75 dark:hover:border-jade-400 dark:hover:text-jade-300"
                >
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  {uploading ? 'Uploading…' : photoUrl ? 'Replace photo' : 'Add photo (optional)'}
                </label>
                <input
                  id="onboarding-photo"
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
                      setPhotoUrl(await uploadMedia(file, 'avatars'));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Photo upload failed.');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(0)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button
                  size="lg"
                  loading={busy}
                  disabled={uploading}
                  onClick={() => {
                    const cleaned = phone.replace(/[\s-]/g, '');
                    if (cleaned && !NIGERIAN_PHONE.test(cleaned)) {
                      setError('Enter a Nigerian phone number, for example 0803 000 1111.');
                      return;
                    }
                    void advance(2, {
                      location: { state: stateName, city, area },
                      profile: {
                        displayName: displayName.trim().length >= 2 ? displayName.trim() : undefined,
                        phoneNumber: phone,
                        photoUrl,
                      },
                    });
                  }}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* 3 — Notifications */}
          {step === 2 ? (
            <div className="animate-fade-in">
              <h1 className="font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
                Stay in the loop
              </h1>
              <p className="mt-2 text-sm text-ink-500 dark:text-white/55">
                Order updates, delivery tracking, buyer messages and seller updates keep your trades
                moving. Promotions stay off unless you opt in.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  {
                    checked: marketplaceNotifications,
                    onChange: async (on: boolean) => {
                      setMarketplaceNotifications(on);
                      if (on && typeof window !== 'undefined' && 'Notification' in window) {
                        try {
                          if (Notification.permission === 'default') await Notification.requestPermission();
                        } catch {
                          /* in-app notifications still work */
                        }
                      }
                    },
                    title: 'Marketplace notifications',
                    detail: 'Order updates · delivery tracking · messages · seller updates',
                    icon: true,
                  },
                  {
                    checked: marketingOptIn,
                    onChange: (on: boolean) => setMarketingOptIn(on),
                    title: 'Promotions and deals',
                    detail: 'Optional offers from GoodSale and sellers. Turn it off any time.',
                    icon: false,
                  },
                ].map(({ checked, onChange, title, detail, icon }) => (
                  <label
                    key={title}
                    className={`${tileBase} flex cursor-pointer items-start gap-3 ${checked ? tileActive : tileIdle}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => void onChange(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-jade-500 dark:border-white/25"
                    />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
                        {icon ? (
                          <Bell className="h-3.5 w-3.5 text-jade-600 dark:text-jade-300" aria-hidden="true" />
                        ) : null}
                        {title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-500 dark:text-white/45">
                        {detail}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button variant="outline" onClick={() => setStep(1)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                <Button size="lg" loading={busy} onClick={() => finish()}>
                  Finish setup
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* Done */}
          {step === TOTAL_STEPS ? (
            <div className="animate-fade-in text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-jade-500/30 bg-jade-500/10 text-jade-700 dark:border-jade-400/40 dark:bg-jade-400/10 dark:text-jade-300">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </span>
              <h1 className="mt-5 font-display text-[1.85rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
                Your marketplace journey starts here.
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500 dark:text-white/55">
                Your account is ready. Browse the marketplace now, or open your store and list your
                first product.
              </p>

              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <Button variant="outline" size="lg" onClick={() => router.replace('/')}>
                  <Compass className="h-4 w-4" aria-hidden="true" />
                  Explore GoodSale
                </Button>
                <Button size="lg" loading={busy} onClick={startSelling}>
                  {!busy ? <Store className="h-4 w-4" aria-hidden="true" /> : null}
                  Start selling
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
