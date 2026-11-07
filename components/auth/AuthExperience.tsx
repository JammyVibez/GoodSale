// components/auth/AuthExperience.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import AuthShell from './AuthShell';
import Button from '@/components/ui/Button';
import { dbOperations, getDBState, useDBState, UserRole } from '@/lib/store';
import type { Profile } from '@/lib/types';
import { postAuthDestination } from '@/lib/auth/redirects';
import { rememberSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/client';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthExperienceProps {
  initialMode?: Mode;
  /** Internal path to return to after a successful sign-in. */
  next?: string;
  /** Referral code captured from /auth/register?ref=… */
  referralCode?: string;
}

type ReferralPreview = {
  valid: boolean;
  code: string;
  referrerLabel?: string;
  campaign?: {
    referrerReward: number;
    refereeReward: number;
    name: string;
  };
  error?: string;
};

function cleanReferralCode(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 40);
}

const NIGERIAN_PHONE = /^(?:\+?234|0)[789]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const inputBase =
  'auth-field w-full rounded-xl py-3 pl-11 pr-4 text-sm font-medium tracking-tight disabled:opacity-60';

const labelBase = 'mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold text-ink-600 dark:text-white/70';

const RULES = [
  { key: 'length', label: '8+ characters', test: (v: string) => v.length >= 8 },
  { key: 'upper', label: 'Uppercase', test: (v: string) => /[A-Z]/.test(v) },
  { key: 'lower', label: 'Lowercase', test: (v: string) => /[a-z]/.test(v) },
  { key: 'number', label: 'Number', test: (v: string) => /[0-9]/.test(v) },
];

function strengthOf(value: string) {
  return RULES.filter((rule) => rule.test(value)).length;
}

/**
 * A profile that predates migration 023 may have finished the old address form.
 * Treat a saved state + city as completed so nobody is pushed through onboarding
 * twice.
 */
function onboardingSnapshot(profile?: Profile) {
  if (!profile) return null;
  return {
    onboardingCompletedAt:
      profile.onboardingCompletedAt || (profile.state && profile.city ? 'legacy-onboarding' : undefined),
    wantsSelling: profile.wantsSelling,
    storeOnboardingCompletedAt: profile.storeOnboardingCompletedAt,
  };
}

function Field({
  id,
  label,
  action,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  action?: React.ReactNode;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={labelBase}>
        <label htmlFor={id}>{label}</label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-300">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400 dark:text-white/40">{hint}</p>
      ) : null}
    </div>
  );
}

export default function AuthExperience({
  initialMode = 'login',
  next,
  referralCode,
}: AuthExperienceProps) {
  const router = useRouter();
  const db = useDBState();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);

  // Registration
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  // Forgot / reset
  const [resetEmail, setResetEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [referralPreview, setReferralPreview] = useState<ReferralPreview | null>(null);
  const recoveryRef = useRef<HTMLInputElement>(null);

  const strength = strengthOf(newPassword);
  const rulesMet = useMemo(
    () => RULES.map((rule) => ({ ...rule, met: rule.test(newPassword) })),
    [newPassword]
  );

  const currentProfile = db.currentUser
    ? db.profiles.find((profile) => profile.userId === db.currentUser!.id)
    : undefined;

  const signedInDestination = postAuthDestination(onboardingSnapshot(currentProfile), next);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stored = '';
    try {
      stored = sessionStorage.getItem('goodsale_referral_code') || '';
    } catch {
      // storage disabled
    }
    if (!stored) {
      const cookie = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('gs_ref='));
      stored = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : '';
    }
    const fromUrl = new URLSearchParams(window.location.search).get('ref') || '';
    const code = cleanReferralCode(referralCode || fromUrl || stored);
    if (!code) return;

    setInviteCode(code);
    try {
      sessionStorage.setItem('goodsale_referral_code', code);
    } catch {
      // storage disabled
    }
    document.cookie = `gs_ref=${encodeURIComponent(code)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;

    void fetch('/api/referrals/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as ReferralPreview & { success?: boolean };
        setReferralPreview({
          valid: Boolean(payload.valid),
          code,
          referrerLabel: payload.referrerLabel,
          campaign: payload.campaign,
          error: payload.error,
        });
      })
      .catch(() => setReferralPreview({ valid: false, code, error: 'lookup_failed' }));
  }, [referralCode]);

  useEffect(() => {
    if (mode === 'reset') {
      const client = createClient();
      void client?.auth.getSession().then(({ data }) => {
        if (!data.session) {
          setFormError('This reset link has expired. Request a new one below.');
          setMode('forgot');
        }
      });
    }
  }, [mode]);

  const go = (nextMode: Mode) => {
    setErrors({});
    setFormError('');
    setNotice('');
    setMode(nextMode);
    if (typeof window !== 'undefined') {
      const url = nextMode === 'register' ? '/auth/register' : '/auth';
      window.history.replaceState(null, '', url);
    }
  };

  const destinationFor = (userId: number, fallbackNext?: string) => {
    const profile = getDBState().profiles.find((entry) => entry.userId === userId);
    return postAuthDestination(onboardingSnapshot(profile), fallbackNext ?? next);
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    const nextErrors: Record<string, string> = {};
    if (!identifier.trim()) nextErrors.identifier = 'Enter your email address or phone number.';
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      const user = await dbOperations.loginWithPassword(identifier.trim(), password);
      rememberSession(remember);
      router.replace(destinationFor(user.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed.';
      setFormError(
        /invalid login credentials|invalid.*password|invalid.*email/i.test(message)
          ? 'Those details do not match an account. Check your email and password, or reset it below.'
          : /email not confirmed/i.test(message)
            ? 'Confirm your email address first — check your inbox for the GoodSale link.'
            : message
      );
      setBusy(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    const nextErrors: Record<string, string> = {};

    if (!firstName.trim()) nextErrors.firstName = 'Enter your first name.';
    if (!lastName.trim()) nextErrors.lastName = 'Enter your last name.';
    if (!EMAIL.test(email.trim())) nextErrors.email = 'Enter a valid email address, e.g. name@example.com.';
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!NIGERIAN_PHONE.test(cleanPhone)) {
      nextErrors.phone = 'Enter a Nigerian number, e.g. 0803 000 1111 or +2348030001111.';
    }
    if (strength < RULES.length) {
      nextErrors.newPassword = 'Use 8+ characters with uppercase, lowercase and a number.';
    }
    if (newPassword !== confirmPassword) nextErrors.confirmPassword = 'Both passwords must match.';
    if (!accepted) nextErrors.accepted = 'Accept the Terms and Privacy Policy to continue.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setFormError('Please fix the highlighted fields — your details are still here.');
      return;
    }

    setBusy(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      // Username is generated from the email by the database trigger.
      const user = await dbOperations.registerUser(
        fullName,
        '',
        email.trim(),
        cleanPhone,
        // Selling is chosen in onboarding, so new accounts start as buyers.
        UserRole.BUYER,
        newPassword,
        inviteCode || undefined
      );
      try {
        sessionStorage.removeItem('goodsale_referral_code');
      } catch {
        // storage disabled
      }
      document.cookie = 'gs_ref=; path=/; max-age=0; samesite=lax';
      rememberSession(true);
      if (!user) {
        setNotice('Account created. Check your email to confirm it, then sign in.');
        setMode('login');
        setIdentifier(email.trim());
        setBusy(false);
        return;
      }
      router.replace('/onboarding');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      setFormError(
        /already registered|already exists/i.test(message)
          ? 'An account with that email already exists. Sign in instead, or reset the password.'
          : message
      );
      setBusy(false);
    }
  };

  const handleForgot = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    if (!EMAIL.test(resetEmail.trim())) {
      setErrors({ resetEmail: 'Enter the email address on your GoodSale account.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const client = createClient();
      if (!client) throw new Error('Authentication is not configured.');
      const { error } = await client.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth?mode=reset')}`,
      });
      if (error) throw error;
      setNotice(
        'If that email has a GoodSale account, a reset link is on its way. The link expires after one use.'
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not send the reset link.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    const nextErrors: Record<string, string> = {};
    if (strength < RULES.length) {
      nextErrors.recoveryPassword = 'Use 8+ characters with uppercase, lowercase and a number.';
    }
    if (recoveryPassword !== recoveryConfirm) {
      nextErrors.recoveryConfirm = 'Both passwords must match.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      const client = createClient();
      if (!client) throw new Error('Authentication is not configured.');
      const { error } = await client.auth.updateUser({ password: recoveryPassword });
      if (error) throw error;
      setNotice('Password updated. Taking you to GoodSale…');
      const currentUser = getDBState().currentUser;
      const destination = currentUser ? destinationFor(currentUser.id) : '/';
      setTimeout(() => router.replace(destination), 700);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not update your password.');
      setBusy(false);
    }
  };

  const heading =
    mode === 'login'
      ? { title: 'Welcome back', sub: 'Sign in to continue your GoodSale journey.' }
      : mode === 'register'
        ? { title: 'Create your account', sub: 'Buy and sell with escrow protection across Nigeria.' }
        : mode === 'forgot'
          ? { title: 'Reset your password', sub: 'We will email you a secure, single-use link.' }
          : { title: 'Choose a new password', sub: 'Make it strong — this protects your escrow payouts.' };

  return (
    <AuthShell>
      <div className="animate-fade-in">
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.32em] text-gold-700 dark:text-gold-200/80">
          {mode === 'register' ? 'Join GoodSale' : mode === 'login' ? 'Account access' : 'Account recovery'}
        </p>
        <h2 className="mt-3 font-display text-[1.9rem] font-extrabold leading-tight tracking-[-0.03em] text-ink-950 dark:text-white">
          {heading.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-white/55">{heading.sub}</p>

        {formError ? (
          <div
            role="alert"
            className="animate-shake mt-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-50 px-3.5 py-3 text-xs font-medium leading-relaxed text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        ) : null}

        {notice ? (
          <div
            role="status"
            className="mt-5 flex items-start gap-2.5 rounded-xl border border-jade-400/30 bg-jade-500/10 px-3.5 py-3 text-xs font-medium leading-relaxed text-jade-800 dark:text-jade-100"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-jade-600 dark:text-jade-300" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        ) : null}

        {mode === 'login' && db.currentUser ? (
          <div className="mt-5 rounded-xl border border-ink-200 dark:border-white/10 bg-ink-50 dark:bg-white/[0.04] p-3.5">
            <p className="text-xs text-ink-500 dark:text-white/55">You are already signed in.</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink-950 dark:text-white">{db.currentUser.fullName}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => router.replace(signedInDestination)}
                className="flex-1 rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-800 dark:bg-white/10 dark:hover:bg-white/15"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={async () => {
                  await dbOperations.logout();
                  setNotice('Signed out. You can use another account now.');
                }}
                className="flex-1 rounded-lg border border-ink-200 dark:border-white/12 px-3 py-2 text-xs font-semibold text-ink-600 dark:text-white/70 transition-colors hover:text-ink-950 dark:hover:text-white "
              >
                Use another account
              </button>
            </div>
          </div>
        ) : null}

        {/* ── LOGIN ───────────────────────────────────────────────────────── */}
        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="mt-6 space-y-4" noValidate>
            <Field id="login-identifier" label="Email or phone" error={errors.identifier}>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="login-identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  aria-invalid={Boolean(errors.identifier)}
                  aria-describedby={errors.identifier ? 'login-identifier-error' : undefined}
                  placeholder="you@example.com"
                  className={inputBase}
                />
              </div>
            </Field>

            <Field
              id="login-password"
              label="Password"
              error={errors.password}
              action={
                <button
                  type="button"
                  onClick={() => go('forgot')}
                  className="text-[0.7rem] font-semibold text-gold-700 transition-colors hover:text-gold-800 dark:text-gold-300 dark:hover:text-gold-200"
                >
                  Forgot password?
                </button>
              }
            >
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  placeholder="Your password"
                  className={`${inputBase} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((value) => !value)}
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showLoginPassword}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 dark:text-white/40 transition-colors hover:bg-ink-100 dark:hover:bg-white/5 hover:text-ink-950 dark:hover:text-white "
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-ink-600 dark:text-white/60 select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 rounded border-ink-300 dark:border-white/25 bg-white accent-jade-600 dark:bg-white/5 dark:accent-jade-400"
              />
              Keep me signed in on this device
            </label>                <Button type="submit" size="lg" className="w-full" loading={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                  {!busy ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                </Button>

            <p className="flex items-center justify-center gap-1.5 text-[0.7rem] text-ink-400 dark:text-white/35">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Protected by Supabase Auth · passwords are never stored by GoodSale
            </p>

            <p className="pt-1 text-center text-sm text-ink-500 dark:text-white/55">
              New to GoodSale?{' '}
              <button
                type="button"
                onClick={() => go('register')}
                className="font-semibold text-gold-700 transition-colors hover:text-gold-800 dark:text-gold-300 dark:hover:text-gold-200"
              >
                Create an account
              </button>
            </p>
          </form>
        ) : null}

        {/* ── REGISTER ────────────────────────────────────────────────────── */}
        {mode === 'register' ? (
          <form onSubmit={handleRegister} className="mt-6 space-y-4" noValidate>
            {inviteCode ? (
              <div
                className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 ${
                  referralPreview?.valid
                    ? 'border-gold-400/35 bg-gradient-to-br from-gold-50 to-jade-50/40 dark:from-gold-400/10 dark:to-jade-400/5'
                    : 'border-ink-200 bg-ink-50 dark:border-white/10 dark:bg-white/[0.04]'
                }`}
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gold-300 text-jade-950">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 text-xs leading-relaxed">
                  {referralPreview?.valid ? (
                    <>
                      <p className="font-bold text-ink-900 dark:text-white">
                        Referred by {referralPreview.referrerLabel || 'a GoodSale member'}
                      </p>
                      <p className="mt-0.5 text-ink-500 dark:text-white/55">
                        Join with code{' '}
                        <span className="font-mono font-bold text-gold-700 dark:text-gold-300">{inviteCode}</span>.
                        {referralPreview.campaign
                          ? ` Your friend earns ${referralPreview.campaign.referrerReward.toLocaleString('en-NG')} coins after you qualify, and you receive ${referralPreview.campaign.refereeReward.toLocaleString('en-NG')}.`
                          : ' Your referral will be tracked securely.'}
                      </p>
                    </>
                  ) : (
                    <p className="text-ink-500 dark:text-white/55">
                      Referral code <span className="font-mono">{inviteCode}</span> could not be
                      matched. You can still create your account normally.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="first-name" label="First name" error={errors.firstName}>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                    aria-hidden="true"
                  />
                  <input
                    id="first-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    aria-invalid={Boolean(errors.firstName)}
                    placeholder="Chidi"
                    className={inputBase}
                  />
                </div>
              </Field>

              <Field id="last-name" label="Last name" error={errors.lastName}>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                    aria-hidden="true"
                  />
                  <input
                    id="last-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    aria-invalid={Boolean(errors.lastName)}
                    placeholder="Okonkwo"
                    className={inputBase}
                  />
                </div>
              </Field>
            </div>

            <Field id="register-email" label="Email address" error={errors.email}>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="register-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  placeholder="you@example.com"
                  className={inputBase}
                />
              </div>
            </Field>

            <Field
              id="register-phone"
              label="Phone number"
              error={errors.phone}
              hint="Nigerian mobile — used for delivery and order updates."
            >
              <div className="relative">
                <Phone
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="register-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  aria-invalid={Boolean(errors.phone)}
                  placeholder="0803 000 1111"
                  className={inputBase}
                />
              </div>
            </Field>

            <Field id="register-password" label="Password" error={errors.newPassword}>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="register-password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  aria-invalid={Boolean(errors.newPassword)}
                  placeholder="Create a strong password"
                  className={`${inputBase} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((value) => !value)}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showNewPassword}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 dark:text-white/40 transition-colors hover:bg-ink-100 dark:hover:bg-white/5 hover:text-ink-950 dark:hover:text-white "
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {newPassword ? (
              <div className="rounded-xl border border-ink-150 dark:border-white/8 bg-ink-50 dark:bg-white/[0.03] px-3 py-2.5">
                <div className="flex gap-1" aria-hidden="true">
                  {RULES.map((rule, index) => (
                    <span
                      key={rule.key}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        index < strength ? 'bg-gold-300' : 'bg-ink-200 dark:bg-white/12'
                      }`}
                    />
                  ))}
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {rulesMet.map((rule) => (
                    <li
                      key={rule.key}
                      className={`flex items-center gap-1 text-[0.68rem] ${
                        rule.met ? 'text-jade-700 dark:text-jade-200' : 'text-ink-400 dark:text-white/35'
                      }`}
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Field id="confirm-password" label="Confirm password" error={errors.confirmPassword}>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="confirm-password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={Boolean(errors.confirmPassword)}
                  placeholder="Repeat your password"
                  className={inputBase}
                />
              </div>
            </Field>

            <div>
              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink-600 dark:text-white/60">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  aria-invalid={Boolean(errors.accepted)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 dark:border-white/25 bg-white accent-jade-600 dark:bg-white/5 dark:accent-jade-400"
                />
                <span>
                  I agree to the{' '}
                  <Link href="/terms" className="font-semibold text-gold-700 underline-offset-2 hover:underline dark:text-gold-300">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="font-semibold text-gold-700 underline-offset-2 hover:underline dark:text-gold-300">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {errors.accepted ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-300">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {errors.accepted}
                </p>
              ) : null}
            </div>

            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {busy ? 'Creating your account…' : 'Create account'}
              {!busy ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
            </Button>

            <p className="text-center text-sm text-ink-500 dark:text-white/55">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => go('login')}
                className="font-semibold text-gold-700 transition-colors hover:text-gold-800 dark:text-gold-300 dark:hover:text-gold-200"
              >
                Sign in
              </button>
            </p>
          </form>
        ) : null}

        {/* ── FORGOT ──────────────────────────────────────────────────────── */}
        {mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="mt-6 space-y-4" noValidate>
            <Field id="reset-email" label="Account email" error={errors.resetEmail}>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="reset-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  aria-invalid={Boolean(errors.resetEmail)}
                  placeholder="you@example.com"
                  className={inputBase}
                />
              </div>
            </Field>

            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {busy ? 'Sending link…' : 'Email me a reset link'}
            </Button>

            <button
              type="button"
              onClick={() => go('login')}
              className="w-full rounded-xl border border-ink-200 dark:border-white/12 py-3 text-sm font-semibold text-ink-600 dark:text-white/70 transition-colors hover:bg-ink-100 dark:hover:bg-white/5 hover:text-ink-950 dark:hover:text-white "
            >
              Back to sign in
            </button>
          </form>
        ) : null}

        {/* ── RESET (arrives from the emailed link) ───────────────────────── */}
        {mode === 'reset' ? (
          <form onSubmit={handleReset} className="mt-6 space-y-4" noValidate>
            <Field id="recovery-password" label="New password" error={errors.recoveryPassword}>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="recovery-password"
                  ref={recoveryRef}
                  type={showRecovery ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  aria-invalid={Boolean(errors.recoveryPassword)}
                  placeholder="Create a strong password"
                  className={`${inputBase} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowRecovery((value) => !value)}
                  aria-label={showRecovery ? 'Hide password' : 'Show password'}
                  aria-pressed={showRecovery}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 dark:text-white/40 transition-colors hover:bg-ink-100 dark:hover:bg-white/5 hover:text-ink-950 dark:hover:text-white "
                >
                  {showRecovery ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <Field id="recovery-confirm" label="Confirm new password" error={errors.recoveryConfirm}>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400 dark:text-white/35"
                  aria-hidden="true"
                />
                <input
                  id="recovery-confirm"
                  type={showRecovery ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={recoveryConfirm}
                  onChange={(event) => setRecoveryConfirm(event.target.value)}
                  aria-invalid={Boolean(errors.recoveryConfirm)}
                  placeholder="Repeat your new password"
                  className={inputBase}
                />
              </div>
            </Field>

            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        ) : null}
      </div>
    </AuthShell>
  );
}
