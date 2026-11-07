// components/verification/VerifiedBadge.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  Info,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { formatVerificationDate, isVerifiedSeller } from '@/lib/verification';

export interface PublicVerification {
  verified: boolean;
  stage: string;
  verifiedAt: string | null;
  sellerType: 'INDIVIDUAL' | 'BUSINESS';
  storeName: string;
  city: string;
  state: string;
  memberSince: string | null;
}

/**
 * Buyer-facing verification panel. It asks the server for the public summary
 * every time it opens, so a stale client cache can never keep a badge alive.
 */
function VerificationPanel({
  sellerId,
  open,
  onClose,
  fallbackName,
}: {
  sellerId: number;
  open: boolean;
  onClose: () => void;
  fallbackName?: string;
}) {
  const [data, setData] = useState<PublicVerification | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);

    fetch(`/api/sellers/${sellerId}/verification`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !body?.success) {
          setError(body?.error || 'Verification details are unavailable right now.');
          return;
        }
        setData(body.verification as PublicVerification);
      })
      .catch(() => {
        if (!cancelled) setError('Verification details are unavailable right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, sellerId]);

  const verified = Boolean(data?.verified);
  const location = [data?.city, data?.state].filter(Boolean).join(', ');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="GoodSale Verified"
      description="What GoodSale checked before this badge was issued."
    >
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking verification status…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-300">
          {error}
        </div>
      ) : data && !verified ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <p className="text-sm font-semibold text-ink-900 dark:text-white">
            This seller is no longer verified
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            GoodSale verification can be suspended, revoked or expire. Treat this store like any
            other unverified seller and keep payments inside GoodSale escrow.
          </p>
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-gold-300/40 bg-gradient-to-br from-jade-900 via-jade-800 to-ink-950 p-5 text-white">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-gold-300/40">
                <ShieldCheck className="h-6 w-6 text-gold-300" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-base font-bold tracking-tight">
                  GoodSale Verified seller
                </p>
                <p className="text-xs text-white/65">{data.storeName || fallbackName || 'Verified store'}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/70">
              GoodSale completed its seller verification process for this store. The badge confirms
              the checks below were passed — it is not a guarantee that every transaction is free of
              risk, so keep orders and payments inside GoodSale.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-150 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-950/40">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Verified on
              </dt>
              <dd className="mt-1 text-sm font-semibold text-ink-900 dark:text-white">
                {formatVerificationDate(data.verifiedAt)}
              </dd>
            </div>
            <div className="rounded-xl border border-ink-150 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-950/40">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {data.sellerType === 'BUSINESS' ? (
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Seller type
              </dt>
              <dd className="mt-1 text-sm font-semibold text-ink-900 dark:text-white">
                {data.sellerType === 'BUSINESS' ? 'Registered business' : 'Individual seller'}
              </dd>
            </div>
            <div className="rounded-xl border border-ink-150 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-950/40">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <Store className="h-3.5 w-3.5" aria-hidden="true" /> Store
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-ink-900 dark:text-white">
                {data.storeName || '—'}
              </dd>
            </div>
            <div className="rounded-xl border border-ink-150 bg-ink-50 p-3 dark:border-ink-800 dark:bg-ink-950/40">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Location
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-ink-900 dark:text-white">
                {location || 'Nigeria'}
              </dd>
            </div>
          </dl>

          <div className="rounded-2xl border border-jade-500/20 bg-jade-500/[0.05] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-jade-700 dark:text-jade-300">
              What GoodSale checked
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-700 dark:text-ink-200">
              {[
                'Government-issued identity document',
                'Selfie matched against the submitted document',
                'Contact phone and email',
                data.sellerType === 'BUSINESS'
                  ? 'Business registration certificate and registered name'
                  : 'Seller details recorded against the account',
                'Store profile, location and contact details',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-jade-600 dark:text-jade-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            GoodSale never shows identity documents, document numbers or private addresses on a
            seller profile. Only the summary above is public.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * Non-interactive verification mark for compact places (chat rows, headers)
 * where a nested button would be invalid. Renders nothing unless verified.
 */
export function VerifiedMark({
  status,
  expiresAt,
  className = '',
}: {
  status?: string | null;
  expiresAt?: string | null;
  className?: string;
}) {
  const verified = isVerifiedSeller({ verificationStatus: status, verificationExpiresAt: expiresAt });
  if (!verified) return null;

  return (
    <span
      title="GoodSale Verified seller"
      aria-label="GoodSale Verified seller"
      className={`inline-grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700 dark:bg-gold-300/15 dark:text-gold-200 ${className}`}
    >
      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}

/**
 * The badge itself. `status` / `expiresAt` come from the database-backed
 * profile record; when they are not verified this renders nothing at all.
 */
export default function VerifiedBadge({
  sellerId,
  status,
  expiresAt,
  variant = 'inline',
  fallbackName,
  className = '',
}: {
  sellerId: number;
  status?: string | null;
  expiresAt?: string | null;
  variant?: 'inline' | 'pill' | 'storefront' | 'icon';
  fallbackName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const verified = isVerifiedSeller({ verificationStatus: status, verificationExpiresAt: expiresAt });

  if (!verified) return null;

  const base =
    'inline-flex items-center gap-1 rounded-full font-semibold transition-all focus-ring cursor-pointer';

  const look =
    variant === 'icon'
      ? 'h-5 w-5 justify-center border border-gold-300/60 bg-gold-50 text-gold-700 hover:bg-gold-100 dark:border-gold-300/30 dark:bg-gold-300/10 dark:text-gold-200 dark:hover:bg-gold-300/20'
      : variant === 'storefront'
        ? 'border border-gold-300/60 bg-jade-900 px-2.5 py-1 text-[11px] text-gold-100 hover:bg-jade-800'
        : variant === 'pill'
          ? 'border border-gold-300/50 bg-gold-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gold-700 hover:bg-gold-100 dark:bg-gold-300/10 dark:text-gold-200 dark:hover:bg-gold-300/20'
          : 'border border-gold-300/50 bg-gold-50/80 px-2 py-0.5 text-[11px] text-gold-700 hover:bg-gold-100 dark:border-gold-300/30 dark:bg-gold-300/10 dark:text-gold-200 dark:hover:bg-gold-300/20';

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label="GoodSale Verified seller — view verification details"
        title="GoodSale Verified — view what was checked"
        className={`${base} ${look} ${className}`}
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {variant !== 'icon' && (
          <span>{variant === 'inline' ? 'Verified' : 'GoodSale Verified'}</span>
        )}
      </button>
      <VerificationPanel
        sellerId={sellerId}
        open={open}
        onClose={() => setOpen(false)}
        fallbackName={fallbackName}
      />
    </>
  );
}
