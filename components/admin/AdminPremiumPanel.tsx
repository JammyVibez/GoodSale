'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CreditCard, Flame, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from '@/lib/feedback';

type Benefit = {
  id: number;
  planCode: string;
  label: string;
  description: string;
  included: boolean;
  sortOrder: number;
  active: boolean;
};
type FlashSale = {
  id: number;
  productId: number;
  sellerId: number;
  salePrice: number;
  quantityLimit: number;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  moderationStatus: string;
  moderationReason: string | null;
  amountPaid: number;
  creditsApplied: number;
  walletCharge: number;
};
type PremiumPayment = {
  id: number;
  userId: number;
  product: string;
  planCode: string | null;
  reference: string;
  amount: number;
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};
type CreditLot = {
  id: number;
  userId: number;
  amount: number;
  remaining: number;
  source: string;
  reference: string;
  expiresAt: string;
};
type Audit = {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
};
type Claim = {
  id: number;
  reference: string;
  orderId: number;
  buyerId: number;
  reason: string;
  status: string;
  resolution: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const card = 'rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900';
const input =
  'h-9 w-full rounded-lg border border-ink-200 bg-ink-50 px-2 text-xs text-ink-800 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100';

export default function AdminPremiumPanel() {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [credits, setCredits] = useState<CreditLot[]>([]);
  const [payments, setPayments] = useState<PremiumPayment[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [grant, setGrant] = useState({ userId: '', amount: '', reason: '' });
  const [draft, setDraft] = useState({
    planCode: 'VERIFIED_PLUS',
    label: '',
    description: '',
    sortOrder: '100',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [premiumRes, claimsRes] = await Promise.all([
        fetch('/api/admin/premium', { cache: 'no-store' }),
        fetch('/api/admin/claims', { cache: 'no-store' }),
      ]);
      const premium = await premiumRes.json().catch(() => ({}));
      const claimPayload = await claimsRes.json().catch(() => ({}));
      if (!premiumRes.ok || !premium.success) throw new Error(premium.error || 'Could not load premium operations');
      setBenefits(premium.benefits || []);
      setFlashSales(premium.flashSales || []);
      setCredits(premium.credits || []);
      setPayments(premium.payments || []);
      setAudit(premium.audit || []);
      setClaims(claimsRes.ok && claimPayload.success ? claimPayload.claims || [] : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load premium operations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, message: string) => {
    setSaving(String(body.action));
    try {
      const res = await fetch('/api/admin/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || 'Action failed');
      toast.success(message);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setSaving(null);
    }
  };

  const saveBenefit = (benefit: Benefit) =>
    post(
      {
        action: 'UPSERT_BENEFIT',
        benefit: {
          id: benefit.id,
          planCode: benefit.planCode,
          label: benefit.label,
          description: benefit.description,
          included: benefit.included,
          sortOrder: benefit.sortOrder,
          active: benefit.active,
        },
      },
      'Membership benefit saved'
    );

  const reviewFlash = (sale: FlashSale, decision: 'APPROVE' | 'REJECT') => {
    const reason =
      decision === 'REJECT'
        ? window.prompt('Reason for rejecting this Flash Sale (shown to the seller):')
        : window.prompt('Optional review note for this Flash Sale:') || '';
    if (decision === 'REJECT' && !reason?.trim()) return;
    void post(
      { action: 'REVIEW_FLASH', promotionId: sale.id, decision, reason: reason || '' },
      decision === 'APPROVE' ? 'Flash Sale approved' : 'Flash Sale rejected and refunded'
    );
  };

  const resolveClaim = async (claim: Claim, status: 'APPROVED' | 'REJECTED' | 'REVIEWING') => {
    const resolution = window.prompt(
      status === 'REVIEWING' ? 'Review note:' : `Decision note for ${claim.reference}:`
    );
    if (resolution == null || (status !== 'REVIEWING' && resolution.trim().length < 5)) return;
    setSaving(`claim-${claim.id}`);
    try {
      const res = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: claim.id, status, resolution }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) throw new Error(payload.error || 'Claim update failed');
      toast.success('Protection claim updated');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Claim update failed');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-xs font-bold text-ink-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading premium operations…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-ink-950 dark:text-white">Premium operations</h2>
          <p className="mt-1 text-xs text-ink-400">
            Paid memberships are separate from verification. Every credit grant, sale review and Protect decision is audited.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-xs font-bold text-ink-600 dark:border-ink-800 dark:text-ink-300"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className={`${card} border-gold-300/40`}>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-gold-500" />
          <h3 className="text-sm font-bold text-ink-900 dark:text-white">Flash Sale review queue</h3>
        </div>
        {flashSales.length === 0 ? (
          <p className="mt-3 text-xs text-ink-400">No scheduled or pending Flash Sales.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {flashSales.map((sale) => (
              <div key={sale.id} className="rounded-xl border border-ink-150 p-3 text-xs dark:border-ink-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-ink-800 dark:text-white">
                      Promo #{sale.id} · product #{sale.productId} · ₦{sale.salePrice.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {sale.status} · {sale.startsAt ? new Date(sale.startsAt).toLocaleString() : 'immediate'} · limit{' '}
                      {sale.quantityLimit || 'catalog'} · paid ₦{sale.amountPaid.toLocaleString()} (credits ₦
                      {sale.creditsApplied.toLocaleString()}, wallet ₦{sale.walletCharge.toLocaleString()})
                    </p>
                    {sale.moderationReason && <p className="mt-1 text-[10px] text-ink-500">{sale.moderationReason}</p>}
                  </div>
                  {sale.status === 'PENDING_REVIEW' && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={saving === 'REVIEW_FLASH'}
                        onClick={() => reviewFlash(sale, 'APPROVE')}
                        className="rounded-lg bg-jade-500 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={saving === 'REVIEW_FLASH'}
                        onClick={() => reviewFlash(sale, 'REJECT')}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-bold text-red-600 disabled:opacity-50"
                      >
                        Reject + refund
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} border-jade-500/25`}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-jade-600" />
          <h3 className="text-sm font-bold text-ink-900 dark:text-white">GoodSale Protect claims</h3>
        </div>
        {claims.length === 0 ? (
          <p className="mt-3 text-xs text-ink-400">No protection claims filed.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-ink-150 p-3 text-xs dark:border-ink-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-ink-800 dark:text-white">
                      {claim.reference} · order #{claim.orderId} · buyer #{claim.buyerId}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {claim.status} · {new Date(claim.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">{claim.reason}</p>
                    {claim.resolution && <p className="mt-1 text-[10px] font-bold text-ink-500">Decision: {claim.resolution}</p>}
                  </div>
                  {['OPEN', 'REVIEWING'].includes(claim.status) && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={saving === `claim-${claim.id}`}
                        onClick={() => void resolveClaim(claim, 'REVIEWING')}
                        className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-[10px] font-bold text-ink-600 disabled:opacity-50"
                      >
                        Reviewing
                      </button>
                      <button
                        type="button"
                        disabled={saving === `claim-${claim.id}`}
                        onClick={() => void resolveClaim(claim, 'APPROVED')}
                        className="rounded-lg bg-jade-500 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={saving === `claim-${claim.id}`}
                        onClick={() => void resolveClaim(claim, 'REJECTED')}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-bold text-red-600 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className={card}>
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-gold-500" />
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Membership benefit copy</h3>
          </div>
          <p className="mt-1 text-[10px] text-ink-400">These labels appear on the Revenue Centre plan cards.</p>
          <div className="mt-3 space-y-2">
            {benefits.map((benefit, index) => (
              <div key={benefit.id} className="rounded-xl border border-ink-150 p-2.5 dark:border-ink-800">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{benefit.planCode}</span>
                  <label className="flex items-center gap-1 text-[9px] font-bold text-ink-500">
                    <input
                      type="checkbox"
                      checked={benefit.active}
                      onChange={(event) => {
                        const next = [...benefits];
                        next[index] = { ...benefit, active: event.target.checked };
                        setBenefits(next);
                      }}
                    />
                    Active
                  </label>
                </div>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[1fr_60px_auto]">
                  <input
                    value={benefit.label}
                    onChange={(event) => {
                      const next = [...benefits];
                      next[index] = { ...benefit, label: event.target.value };
                      setBenefits(next);
                    }}
                    className={input}
                  />
                  <input
                    type="number"
                    value={benefit.sortOrder}
                    onChange={(event) => {
                      const next = [...benefits];
                      next[index] = { ...benefit, sortOrder: Number(event.target.value) };
                      setBenefits(next);
                    }}
                    className={input}
                  />
                  <button
                    type="button"
                    disabled={saving === 'UPSERT_BENEFIT'}
                    onClick={() => void saveBenefit(benefit)}
                    className="rounded-lg bg-jade-500 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                <input
                  value={benefit.description}
                  onChange={(event) => {
                    const next = [...benefits];
                    next[index] = { ...benefit, description: event.target.value };
                    setBenefits(next);
                  }}
                  placeholder="Optional description"
                  className={`${input} mt-1.5`}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-dashed border-ink-200 p-3 dark:border-ink-700">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Add benefit</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <select
                value={draft.planCode}
                onChange={(event) => setDraft({ ...draft, planCode: event.target.value })}
                className={input}
              >
                <option value="VERIFIED_PLUS">Verified+</option>
                <option value="BUSINESS_PRO">Business Pro</option>
                <option value="BUSINESS_PREMIUM">Business Premium</option>
                <option value="BUSINESS_ENTERPRISE">Business Enterprise</option>
              </select>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
                className={input}
              />
              <input
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                placeholder="Benefit label"
                className={`${input} sm:col-span-2`}
              />
              <input
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="Optional description"
                className={`${input} sm:col-span-2`}
              />
            </div>
            <button
              type="button"
              disabled={saving === 'UPSERT_BENEFIT' || draft.label.trim().length < 3}
              onClick={() =>
                void post(
                  {
                    action: 'UPSERT_BENEFIT',
                    benefit: {
                      planCode: draft.planCode,
                      label: draft.label,
                      description: draft.description,
                      sortOrder: Number(draft.sortOrder),
                      included: true,
                      active: true,
                    },
                  },
                  'Membership benefit created'
                )
              }
              className="mt-2 rounded-lg bg-jade-500 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
            >
              Add benefit
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className={card}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-jade-600" />
              <h3 className="text-sm font-bold text-ink-900 dark:text-white">Grant promotional credits</h3>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={grant.userId}
                onChange={(event) => setGrant({ ...grant, userId: event.target.value.replace(/[^\d]/g, '') })}
                placeholder="Member profile ID"
                className={input}
              />
              <input
                value={grant.amount}
                onChange={(event) => setGrant({ ...grant, amount: event.target.value.replace(/[^\d]/g, '') })}
                placeholder="Credit amount ₦"
                className={input}
              />
              <input
                value={grant.reason}
                onChange={(event) => setGrant({ ...grant, reason: event.target.value })}
                placeholder="Reason (audited)"
                className={`${input} sm:col-span-2`}
              />
            </div>
            <button
              type="button"
              disabled={saving === 'GRANT_CREDITS' || !grant.userId || !grant.amount || grant.reason.trim().length < 3}
              onClick={() => {
                void post(
                  {
                    action: 'GRANT_CREDITS',
                    userId: Number(grant.userId),
                    amount: Number(grant.amount),
                    reason: grant.reason,
                  },
                  'Credits granted'
                );
                setGrant({ userId: '', amount: '', reason: '' });
              }}
              className="mt-2 rounded-lg bg-jade-500 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
            >
              Grant credits
            </button>
            {credits.length > 0 && (
              <ul className="mt-3 max-h-40 space-y-1 overflow-auto border-t border-ink-150 pt-2 text-[10px] dark:border-ink-800">
                {credits.slice(0, 12).map((lot) => (
                  <li key={lot.id} className="flex items-center justify-between gap-2 text-ink-500 dark:text-ink-300">
                    <span className="truncate">
                      Member #{lot.userId} · {lot.source}
                    </span>
                    <span className="font-bold">
                      ₦{lot.remaining.toLocaleString()} / ₦{lot.amount.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={card}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-ink-500" />
                <h3 className="text-sm font-bold text-ink-900 dark:text-white">Premium audit trail</h3>
              </div>
              <button
                type="button"
                disabled={saving === 'RUN_JOBS'}
                onClick={() => void post({ action: 'RUN_JOBS' }, 'Premium lifecycle jobs completed')}
                className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-[10px] font-bold text-ink-600 disabled:opacity-50 dark:border-ink-800 dark:text-ink-300"
              >
                Run lifecycle now
              </button>
            </div>
            {payments.length > 0 && (
              <div className="mt-3 border-b border-ink-150 pb-2 dark:border-ink-800">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Recent membership payments</p>
                <ul className="mt-1.5 max-h-32 space-y-1 overflow-auto text-[10px]">
                  {payments.slice(0, 10).map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 text-ink-500 dark:text-ink-300">
                      <span className="truncate">
                        #{payment.userId} · {payment.product === 'VERIFIED_PLUS' ? 'Verified+' : `Business ${payment.planCode || ''}`}
                      </span>
                      <span className={`font-bold ${payment.status === 'SUCCESS' ? 'text-jade-600' : 'text-ink-400'}`}>
                        ₦{payment.amount.toLocaleString()} · {payment.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {audit.length === 0 ? (
              <p className="mt-3 text-xs text-ink-400">No premium audit entries yet.</p>
            ) : (
              <ul className="mt-3 max-h-64 space-y-2 overflow-auto text-[10px]">
                {audit.map((entry) => (
                  <li key={entry.id} className="border-b border-ink-100 pb-1.5 last:border-0 dark:border-ink-800">
                    <p className="font-bold text-ink-700 dark:text-ink-200">{entry.action.replace(/_/g, ' ')}</p>
                    <p className="text-ink-400">
                      {entry.entityType} #{entry.entityId ?? '—'} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    {entry.details && <p className="text-ink-500 dark:text-ink-300">{entry.details}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
