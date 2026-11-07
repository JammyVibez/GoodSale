'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Coins,
  Landmark,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  Settings2,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { confirmDialog, toast } from '@/lib/feedback';

type FinanceData = {
  success: boolean;
  provider: {
    fundingEnabled: boolean;
    payoutsEnabled: boolean;
    webhookConfigured: boolean;
  };
  settings: {
    funding_min: number;
    funding_max: number;
    withdrawal_min: number;
    withdrawal_max: number;
    withdrawal_fee: number;
    daily_withdrawal_limit: number;
  };
  summary: Record<string, number>;
  wallets: Array<{
    id: number;
    user_id: number;
    balance: number;
    bank_name?: string;
    bank_account_number?: string;
    profile?: { full_name?: string; email?: string; username?: string } | null;
  }>;
  withdrawals: Array<{
    id: number;
    request_number: string;
    user_id: number;
    amount: number;
    fee?: number;
    net_amount?: number;
    bank_name: string;
    account_name: string;
    account_number: string;
    status: string;
    paystack_reference?: string;
    created_at: string;
    profile?: { full_name?: string; email?: string } | null;
  }>;
  refunds: Array<{
    id: number;
    refund_number: string;
    order_id: number;
    amount: number;
    reason: string;
    status: string;
    transaction_id?: string;
    provider_reference?: string;
    created_at: string;
  }>;
  ledger: Array<{
    id: number;
    reference?: string;
    provider_reference?: string;
    amount: number;
    type: string;
    description: string;
    status: string;
    balance_after?: number;
    created_at: string;
  }>;
  audit: Array<{
    id: number;
    user_id?: number;
    action: string;
    entity_type: string;
    entity_id?: number;
    details: string;
    created_at: string;
  }>;
  funding: Array<{
    id: number;
    reference: string;
    amount: number;
    status: string;
    provider_reference?: string;
    created_at: string;
  }>;
};

type Tab = 'overview' | 'withdrawals' | 'refunds' | 'ledger' | 'wallets' | 'settings';

const naira = (value: number) =>
  `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  PROCESSING: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  SUCCESS: 'bg-jade-500/10 text-jade-700 dark:text-jade-300',
  COMPLETED: 'bg-jade-500/10 text-jade-700 dark:text-jade-300',
  APPROVED: 'bg-jade-500/10 text-jade-700 dark:text-jade-300',
  FAILED: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  REJECTED: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  CANCELLED: 'bg-ink-500/10 text-ink-500',
};

const inputClass =
  'w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-jade-500/40 dark:border-ink-800 dark:bg-ink-950 dark:text-white';

export default function AdminFinancePanel() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [query, setQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [adjustment, setAdjustment] = useState({ amount: '', reason: '' });
  const [settings, setSettings] = useState({
    fundingMin: '100',
    fundingMax: '500000',
    withdrawalMin: '1000',
    withdrawalMax: '1000000',
    withdrawalFee: '0',
    dailyWithdrawalLimit: '1000000',
  });
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async (search = query) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance${search ? `?q=${encodeURIComponent(search)}` : ''}`);
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setError(payload.error || 'Could not load finance data');
        return;
      }
      setData(payload as FinanceData);
      const next = payload.settings;
      setSettings({
        fundingMin: String(next.funding_min),
        fundingMax: String(next.funding_max),
        withdrawalMin: String(next.withdrawal_min),
        withdrawalMax: String(next.withdrawal_max),
        withdrawalFee: String(next.withdrawal_fee),
        dailyWithdrawalLimit: String(next.daily_withdrawal_limit),
      });
    } catch {
      setError('Could not reach the finance service');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data?.summary || {};
  const pendingWithdrawals = (data?.withdrawals || []).filter((entry) =>
    ['PENDING', 'PROCESSING'].includes(entry.status)
  );
  const openRefunds = (data?.refunds || []).filter((entry) =>
    ['PENDING', 'APPROVED', 'REQUESTED', 'UNDER_REVIEW', 'PROCESSING'].includes(entry.status)
  );

  const metrics = useMemo(
    () => [
      {
        label: 'Wallet liabilities',
        value: naira(summary.wallet_liabilities || 0),
        hint: `${summary.wallet_count || 0} wallets`,
        Icon: Wallet,
      },
      {
        label: 'Escrow held',
        value: naira(summary.escrow_held || 0),
        hint: `${summary.escrow_count || 0} active holds`,
        Icon: ShieldCheck,
      },
      {
        label: 'Pending payouts',
        value: naira((summary.pending_withdrawals || 0) + (summary.processing_withdrawals || 0)),
        hint: 'Awaiting provider confirmation',
        Icon: Clock3,
      },
      {
        label: 'Funding volume',
        value: naira(summary.funding_total || 0),
        hint: 'Paystack-confirmed credits',
        Icon: ArrowDownToLine,
      },
      {
        label: 'Wallet order volume',
        value: naira(summary.order_payment_total || 0),
        hint: 'Paid into escrow',
        Icon: Banknote,
      },
      {
        label: 'Refunded to wallets',
        value: naira(summary.refund_total || 0),
        hint: `${summary.pending_refunds || 0} refunds open`,
        Icon: Coins,
      },
    ],
    [summary]
  );

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok, 'Finance updated');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed', 'Finance action');
    } finally {
      setBusy(null);
    }
  };

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok || !payload.success) throw new Error(payload.error || 'Action failed');
    return payload;
  };

  const approveWithdrawal = (id: number) =>
    run(
      `approve-${id}`,
      async () => {
        const ok = await confirmDialog({
          title: 'Start Paystack payout?',
          message:
            'This claims the reserved funds and starts a Paystack transfer. The payout remains processing until Paystack confirms it.',
          confirmText: 'Start payout',
        });
        if (!ok) return;
        const res = await fetch('/api/admin/withdrawals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ withdrawalId: id, approve: true }),
        });
        const payload = await res.json();
        if (!res.ok || !payload.success) throw new Error(payload.error || 'Payout failed');
      },
      'Paystack transfer started — awaiting confirmation'
    );

  const verifyWithdrawal = (id: number) =>
    run(
      `verify-${id}`,
      async () => {
        await post({ action: 'PAYOUT_VERIFY', withdrawalId: id });
      },
      'Payout reconciled with Paystack'
    );

  const failWithdrawal = (id: number) =>
    run(
      `fail-${id}`,
      async () => {
        const reason = notes[id]?.trim();
        if (!reason) throw new Error('Enter a reason before failing this payout');
        const ok = await confirmDialog({
          title: 'Fail payout and return funds?',
          message: 'The reserved amount will be returned to the seller wallet and a reversal ledger entry recorded.',
          confirmText: 'Fail payout',
          danger: true,
        });
        if (!ok) return;
        await post({ action: 'PAYOUT_FAIL', withdrawalId: id, reason });
      },
      'Payout failed and funds returned'
    );

  const refundToWallet = (id: number) =>
    run(
      `refund-wallet-${id}`,
      async () => {
        const reason = notes[id]?.trim();
        if (reason.length < 5) throw new Error('Enter a refund reason of at least 5 characters');
        const ok = await confirmDialog({
          title: 'Refund to buyer wallet?',
          message: 'This credits the buyer wallet and records an idempotent REFUND ledger entry.',
          confirmText: 'Credit wallet',
        });
        if (!ok) return;
        await post({ action: 'REFUND_TO_WALLET', refundId: id, reason });
      },
      'Refund credited to buyer wallet'
    );

  const refundToProvider = (id: number) =>
    run(
      `refund-provider-${id}`,
      async () => {
        const reason = notes[id]?.trim() || 'GoodSale refund';
        const ok = await confirmDialog({
          title: 'Send refund to Paystack?',
          message:
            'Paystack will process the refund to the original payment method. It is not marked complete until the provider confirms it.',
          confirmText: 'Send refund',
        });
        if (!ok) return;
        await post({ action: 'REFUND_PROVIDER', refundId: id, reason });
      },
      'Refund sent to Paystack — awaiting confirmation'
    );

  const submitAdjustment = () =>
    run(
      'adjustment',
      async () => {
        if (!selectedUser) throw new Error('Select a wallet first');
        const amount = Number(adjustment.amount);
        if (!Number.isFinite(amount) || amount === 0) throw new Error('Enter a non-zero amount');
        if (adjustment.reason.trim().length < 10) {
          throw new Error('An adjustment reason of at least 10 characters is required');
        }
        const ok = await confirmDialog({
          title: 'Apply wallet adjustment?',
          message: 'This writes an immutable ADJUSTMENT ledger row with your admin ID and reason.',
          confirmText: 'Apply adjustment',
          danger: amount < 0,
        });
        if (!ok) return;
        await post({
          action: 'ADJUSTMENT',
          userId: selectedUser,
          amount,
          reason: adjustment.reason,
        });
        setAdjustment({ amount: '', reason: '' });
      },
      'Wallet adjustment recorded'
    );

  const saveSettings = () =>
    run(
      'settings',
      async () => {
        await post({ action: 'WALLET_SETTINGS', ...settings });
      },
      'Wallet limits and fees saved'
    );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'withdrawals', label: 'Payouts', count: pendingWithdrawals.length },
    { id: 'refunds', label: 'Refunds', count: openRefunds.length },
    { id: 'ledger', label: 'Ledger' },
    { id: 'wallets', label: 'Wallets' },
    { id: 'settings', label: 'Limits & fees' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">GoodSale Finance</h2>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            Provider-confirmed funding, escrow, payouts, refunds and an append-only ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${data?.provider.fundingEnabled ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
            Funding {data?.provider.fundingEnabled ? 'live' : 'unavailable'}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${data?.provider.payoutsEnabled ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
            Payouts {data?.provider.payoutsEnabled ? 'live' : 'unavailable'}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 rounded-xl bg-ink-100 p-1 dark:bg-ink-950">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              tab === item.id ? 'bg-jade-500 text-white shadow' : 'text-ink-600 hover:bg-white dark:text-ink-300 dark:hover:bg-ink-900'
            }`}
          >
            {item.label}
            {typeof item.count === 'number' ? ` (${item.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{metric.label}</p>
                    <p className="mt-1 font-mono text-lg font-bold text-ink-900 dark:text-white">{metric.value}</p>
                    <p className="mt-0.5 text-[10px] text-ink-400">{metric.hint}</p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-300">
                    <metric.Icon className="h-4 w-4" />
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                <Scale className="h-4 w-4 text-jade-600" /> Reconciliation
              </h3>
              <dl className="mt-3 space-y-2 text-xs">
                {[
                  ['Ledger entries', String(summary.ledger_count || 0)],
                  ['Successful payouts', naira(summary.successful_withdrawals || 0)],
                  ['Marketplace commission', naira(summary.commission_total || 0)],
                  ['Refunds open', String(summary.pending_refunds || 0)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-ink-100 pb-2 last:border-0 dark:border-ink-800">
                    <dt className="text-ink-500 dark:text-ink-400">{label}</dt>
                    <dd className="font-mono font-bold text-ink-900 dark:text-white">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
                Wallet liabilities and escrow are database aggregates. Paystack settlement reconciliation still requires the provider dashboard or the payout verification action; this screen does not invent a bank balance.
              </p>
            </div>

            <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                <ArrowUpRight className="h-4 w-4 text-jade-600" /> Funding attempts
              </h3>
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {(data?.funding || []).slice(0, 12).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 p-2.5 text-[11px] dark:border-ink-800">
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-ink-800 dark:text-ink-100">{naira(entry.amount)}</p>
                      <p className="truncate font-mono text-[9px] text-ink-400">{entry.reference}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[entry.status] || 'bg-ink-100 text-ink-500'}`}>{entry.status}</span>
                  </li>
                ))}
                {!data?.funding.length && <li className="text-xs text-ink-400">No funding attempts yet.</li>}
              </ul>
            </div>

            <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                <ArrowUpRight className="h-4 w-4 text-jade-600" /> Recent audit activity
              </h3>
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {(data?.audit || []).slice(0, 12).map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-ink-100 p-2.5 text-[11px] dark:border-ink-800">
                    <p className="font-bold text-ink-800 dark:text-ink-100">{entry.action.replace(/_/g, ' ')}</p>
                    <p className="mt-0.5 line-clamp-2 text-ink-500 dark:text-ink-400">{entry.details}</p>
                    <p className="mt-1 font-mono text-[9px] text-ink-400">
                      {new Date(entry.created_at).toLocaleString('en-NG')}
                    </p>
                  </li>
                ))}
                {!data?.audit.length && <li className="text-xs text-ink-400">No wallet audit entries yet.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'withdrawals' && (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="border-b border-ink-100 p-4 dark:border-ink-800">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Withdrawal requests</h3>
            <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
              Reserved funds leave the seller&apos;s available balance at request time. Approval starts a Paystack transfer; only the provider can mark it successful.
            </p>
          </div>
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {(data?.withdrawals || []).map((item) => (
              <li key={item.id} className="space-y-3 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink-900 dark:text-white">{item.request_number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[item.status] || 'bg-ink-100 text-ink-500'}`}>{item.status}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-ink-700 dark:text-ink-200">
                      {item.profile?.full_name || `User #${item.user_id}`} · {item.bank_name} ••••{String(item.account_number || '').slice(-4)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                      {item.account_name} · requested {new Date(item.created_at).toLocaleString('en-NG')}
                    </p>
                    {item.paystack_reference && <p className="mt-0.5 font-mono text-[10px] text-ink-400">Paystack: {item.paystack_reference}</p>}
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <p className="font-mono text-base font-bold text-ink-900 dark:text-white">{naira(item.amount)}</p>
                    <p className="text-[10px] text-ink-400">Net {naira(item.net_amount ?? item.amount)} · fee {naira(item.fee || 0)}</p>
                  </div>
                </div>

                {['PENDING', 'PROCESSING'].includes(item.status) && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {item.status === 'PENDING' && (
                      <Button size="sm" disabled={busy === `approve-${item.id}`} onClick={() => void approveWithdrawal(item.id)}>
                        {busy === `approve-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />}
                        Start Paystack payout
                      </Button>
                    )}
                    {item.status === 'PROCESSING' && (
                      <Button size="sm" variant="secondary" disabled={busy === `verify-${item.id}`} onClick={() => void verifyWithdrawal(item.id)}>
                        {busy === `verify-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Verify with Paystack
                      </Button>
                    )}
                    <input
                      value={notes[item.id] || ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Reason if failing this payout"
                      className={`${inputClass} sm:max-w-xs`}
                    />
                    <Button size="sm" variant="danger" disabled={busy === `fail-${item.id}`} onClick={() => void failWithdrawal(item.id)}>
                      {busy === `fail-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      Fail & return funds
                    </Button>
                  </div>
                )}
              </li>
            ))}
            {!data?.withdrawals.length && <li className="p-8 text-center text-xs text-ink-400">No withdrawal requests yet.</li>}
          </ul>
        </div>
      )}

      {tab === 'refunds' && (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="border-b border-ink-100 p-4 dark:border-ink-800">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Refund management</h3>
            <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
              Credit the buyer wallet idempotently, or send the refund to Paystack for the original payment method. Neither action bypasses the order/escrow policy.
            </p>
          </div>
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {(data?.refunds || []).map((refund) => (
              <li key={refund.id} className="space-y-3 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-ink-900 dark:text-white">{refund.refund_number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[refund.status] || 'bg-ink-100 text-ink-500'}`}>{refund.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">Order #{refund.order_id} · {refund.reason}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-400">{refund.provider_reference || refund.transaction_id || 'No provider reference'}</p>
                  </div>
                  <p className="font-mono text-base font-bold text-ink-900 dark:text-white">{naira(refund.amount)}</p>
                </div>
                {['PENDING', 'APPROVED', 'REQUESTED', 'UNDER_REVIEW', 'PROCESSING'].includes(refund.status) && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={notes[refund.id] || ''}
                      onChange={(event) => setNotes((current) => ({ ...current, [refund.id]: event.target.value }))}
                      placeholder="Refund reason / admin note"
                      className={`${inputClass} sm:max-w-sm`}
                    />
                    <Button size="sm" disabled={busy === `refund-wallet-${refund.id}`} onClick={() => void refundToWallet(refund.id)}>
                      {busy === `refund-wallet-${refund.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                      Refund to wallet
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy === `refund-provider-${refund.id}`} onClick={() => void refundToProvider(refund.id)}>
                      {busy === `refund-provider-${refund.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      Refund via Paystack
                    </Button>
                  </div>
                )}
              </li>
            ))}
            {!data?.refunds.length && <li className="p-8 text-center text-xs text-ink-400">No refund requests yet.</li>}
          </ul>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="flex flex-col gap-3 border-b border-ink-100 p-4 dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink-900 dark:text-white">Transaction ledger</h3>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">Append-only. Search by ledger or provider reference.</p>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void load(query);
              }}
            >
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Transaction ID…" className={`${inputClass} pl-8`} />
              </div>
              <Button size="sm" type="submit" variant="secondary">Search</Button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-ink-50 text-[10px] uppercase tracking-wide text-ink-400 dark:bg-ink-950">
                <tr>
                  <th className="px-4 py-2.5">Reference</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {(data?.ledger || []).map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-ink-500">{entry.provider_reference || entry.reference || `#${entry.id}`}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink-800 dark:text-ink-100">{entry.type.replace(/_/g, ' ')}</td>
                    <td className="max-w-[280px] px-4 py-2.5 text-ink-500 dark:text-ink-400"><span className="line-clamp-2">{entry.description}</span></td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${entry.amount > 0 ? 'text-jade-700 dark:text-jade-300' : 'text-ink-900 dark:text-white'}`}>{naira(entry.amount)}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[entry.status] || 'bg-ink-100 text-ink-500'}`}>{entry.status}</span></td>
                    <td className="px-4 py-2.5 text-[10px] text-ink-400">{new Date(entry.created_at).toLocaleDateString('en-NG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.ledger.length && <p className="p-8 text-center text-xs text-ink-400">No ledger entries match.</p>}
          </div>
        </div>
      )}

      {tab === 'wallets' && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900 lg:col-span-3">
            <div className="border-b border-ink-100 p-4 dark:border-ink-800">
              <h3 className="text-sm font-bold text-ink-900 dark:text-white">Wallet users</h3>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">Balances are read-only here. Use the audited adjustment form for corrections.</p>
            </div>
            <ul className="max-h-[560px] divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
              {(data?.wallets || []).map((wallet) => (
                <li key={wallet.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink-900 dark:text-white">{wallet.profile?.full_name || `User #${wallet.user_id}`}</p>
                    <p className="truncate text-[10px] text-ink-500 dark:text-ink-400">{wallet.profile?.email || '—'} · {wallet.bank_name || 'No bank saved'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink-900 dark:text-white">{naira(wallet.balance)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedUser(wallet.user_id);
                        setAdjustment({ amount: '', reason: '' });
                      }}
                    >
                      Adjust
                    </Button>
                  </div>
                </li>
              ))}
              {!data?.wallets.length && <li className="p-8 text-center text-xs text-ink-400">No wallets yet.</li>}
            </ul>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 lg:col-span-2">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Manual adjustment</h3>
            <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
              Every adjustment requires a reason and admin ID and creates an immutable ledger row.
            </p>
            {selectedUser ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-lg bg-ink-50 px-3 py-2 font-mono text-[11px] dark:bg-ink-950">
                  {data?.wallets.find((wallet) => wallet.user_id === selectedUser)?.profile?.full_name || `User #${selectedUser}`}
                </p>
                <input
                  value={adjustment.amount}
                  onChange={(event) => setAdjustment((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="Amount (negative to debit)"
                  inputMode="decimal"
                  className={inputClass}
                />
                <textarea
                  value={adjustment.reason}
                  onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="Reason (minimum 10 characters)"
                  rows={3}
                  className={inputClass}
                />
                <Button size="sm" className="w-full" disabled={busy === 'adjustment'} onClick={() => void submitAdjustment()}>
                  {busy === 'adjustment' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Record adjustment
                </Button>
                <button type="button" className="text-[11px] font-bold text-ink-400 hover:text-ink-600" onClick={() => setSelectedUser(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-ink-200 p-4 text-center text-[11px] text-ink-400 dark:border-ink-700">
                Select a wallet to record an audited adjustment.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
              <Settings2 className="h-4 w-4 text-jade-600" /> Wallet limits & fees
            </h3>
            <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
              These limits are enforced inside the database, not just in the UI.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ['Funding minimum', 'fundingMin'],
                ['Funding maximum', 'fundingMax'],
                ['Withdrawal minimum', 'withdrawalMin'],
                ['Withdrawal maximum', 'withdrawalMax'],
                ['Withdrawal fee', 'withdrawalFee'],
                ['Daily withdrawal limit', 'dailyWithdrawalLimit'],
              ].map(([label, key]) => (
                <label key={key} className="block text-[11px] font-bold text-ink-600 dark:text-ink-300">
                  {label}
                  <input
                    value={settings[key as keyof typeof settings]}
                    onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))}
                    inputMode="decimal"
                    className={`${inputClass} mt-1`}
                  />
                </label>
              ))}
            </div>
            <Button className="mt-4 w-full" disabled={busy === 'settings'} onClick={() => void saveSettings()}>
              {busy === 'settings' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save wallet settings
            </Button>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Provider readiness</h3>
            <dl className="mt-3 space-y-2 text-xs">
              {[
                ['Funding', data?.provider.fundingEnabled],
                ['Payouts', data?.provider.payoutsEnabled],
                ['Webhook signature', data?.provider.webhookConfigured],
              ].map(([label, ready]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2 last:border-0 dark:border-ink-800">
                  <dt className="text-ink-500 dark:text-ink-400">{label}</dt>
                  <dd className={`font-bold ${ready ? 'text-jade-600 dark:text-jade-300' : 'text-amber-600 dark:text-amber-300'}`}>
                    {ready ? 'Configured' : 'Unavailable'}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
              Paystack needs <code>NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY</code>, <code>PAYSTACK_SECRET_KEY</code> and the webhook URL <code>/api/payments/webhook</code>. Payouts also need Paystack Transfers enabled and a funded provider balance.
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
              GoodSale stores wallet balances as marketplace ledger entries. Funding and payouts are processed by Paystack; this code does not represent that GoodSale is independently licensed to hold stored value. Confirm the regulatory structure with the payment partner before launch.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
