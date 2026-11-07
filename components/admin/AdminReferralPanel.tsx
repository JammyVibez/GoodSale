'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Coins,
  Eye,
  Gift,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { confirmDialog, toast } from '@/lib/feedback';
import type {
  AdminReferralCampaign,
  AdminReferralData,
  ReferralAction,
} from '@/lib/referrals/types';
import { REFERRAL_ACTION_LABELS, REFERRAL_STATUS_LABELS } from '@/lib/referrals/types';

const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';
const inp =
  'w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-800 outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white';
const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50';
const btnPrimary = `${btn} bg-jade-600 text-white hover:bg-jade-700`;
const btnMuted = `${btn} border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-white/70 dark:hover:bg-ink-800`;
const btnDanger = `${btn} bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white`;

type Tab = 'overview' | 'campaigns' | 'referrals' | 'rewards';
type CampaignForm = {
  id?: number;
  name: string;
  description: string;
  status: AdminReferralCampaign['status'];
  audience: AdminReferralCampaign['audience'];
  referrerReward: string;
  refereeReward: string;
  requireEmailVerified: boolean;
  requireOnboarding: boolean;
  requireVerifiedReferrer: boolean;
  minReferrerAgeHours: string;
  qualifyingActions: ReferralAction[];
  disqualifyRefunded: boolean;
  maxRewardsPerUser: string;
  maxRewardsPerCampaign: string;
  startsAt: string;
  endsAt: string;
  terms: string;
};

const emptyForm: CampaignForm = {
  name: '',
  description: '',
  status: 'DRAFT',
  audience: 'ANY',
  referrerReward: '500',
  refereeReward: '250',
  requireEmailVerified: true,
  requireOnboarding: true,
  requireVerifiedReferrer: false,
  minReferrerAgeHours: '0',
  qualifyingActions: ['PURCHASE'],
  disqualifyRefunded: true,
  maxRewardsPerUser: '20',
  maxRewardsPerCampaign: '1000',
  startsAt: '',
  endsAt: '',
  terms: '',
};

function toLocalInput(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const statusTone: Record<string, string> = {
  ACTIVE: 'bg-jade-500/15 text-jade-700 dark:text-jade-300',
  DRAFT: 'bg-ink-500/10 text-ink-500 dark:text-white/60',
  PAUSED: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
  ENDED: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  REGISTERED: 'bg-ink-500/10 text-ink-500 dark:text-white/60',
  VERIFICATION_PENDING: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
  QUALIFIED: 'bg-jade-500/10 text-jade-700 dark:text-jade-300',
  REWARD_PENDING: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
  REWARDED: 'bg-jade-500/15 text-jade-700 dark:text-jade-200',
  DISQUALIFIED: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

export default function AdminReferralPanel() {
  const [data, setData] = useState<AdminReferralData | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<CampaignForm | null>(null);
  const [disqualifyId, setDisqualifyId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (query = search, campaign = campaignFilter, status = statusFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (campaign) params.set('campaign_id', campaign);
      if (status) params.set('status', status);
      const res = await fetch(`/api/admin/referrals?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Could not load referral management.');
      }
      setData(payload as AdminReferralData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load referral management.');
    } finally {
      setLoading(false);
    }
  }, [campaignFilter, search, statusFilter]);

  useEffect(() => {
    void load('', '');
    // Initial load only; searches are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (body: Record<string, unknown>, message: string) => {
    setBusy(String(body.action));
    try {
      const res = await fetch('/api/admin/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Referral action failed');
      }
      toast.success(message);
      await load(search, campaignFilter, statusFilter);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Referral action failed');
      return false;
    } finally {
      setBusy('');
    }
  };

  const analytics = data?.analytics;
  const flagged = useMemo(
    () => (data?.referrals || []).filter((row) => row.fraudFlags.length > 0),
    [data?.referrals]
  );

  const stats = [
    { label: 'Link clicks', value: analytics?.clicks ?? 0, Icon: Eye, tone: 'text-jade-600' },
    { label: 'Registered', value: analytics?.total ?? 0, Icon: Users, tone: 'text-jade-600' },
    { label: 'Qualified', value: analytics?.qualified ?? 0, Icon: CheckCircle2, tone: 'text-jade-600' },
    { label: 'Rewarded', value: analytics?.rewarded ?? 0, Icon: Award, tone: 'text-gold-600' },
    { label: 'Coins issued', value: analytics?.coins_issued ?? 0, Icon: Coins, tone: 'text-gold-600' },
    { label: 'Flagged', value: analytics?.unreviewed_flagged ?? 0, Icon: AlertTriangle, tone: 'text-rose-500' },
  ];

  const editCampaign = (campaign?: AdminReferralCampaign) => {
    if (!campaign) {
      setForm({ ...emptyForm, startsAt: toLocalInput(new Date().toISOString()) });
      return;
    }
    setForm({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      audience: campaign.audience,
      referrerReward: String(campaign.referrerReward),
      refereeReward: String(campaign.refereeReward),
      requireEmailVerified: campaign.requireEmailVerified,
      requireOnboarding: campaign.requireOnboarding,
      requireVerifiedReferrer: campaign.requireVerifiedReferrer,
      minReferrerAgeHours: String(campaign.minReferrerAgeHours),
      qualifyingActions: campaign.qualifyingActions,
      disqualifyRefunded: campaign.disqualifyRefunded,
      maxRewardsPerUser: String(campaign.maxRewardsPerUser),
      maxRewardsPerCampaign: String(campaign.maxRewardsPerCampaign),
      startsAt: toLocalInput(campaign.startsAt),
      endsAt: toLocalInput(campaign.endsAt),
      terms: campaign.terms,
    });
  };

  const toggleAction = (action: ReferralAction) => {
    setForm((current) =>
      current
        ? {
            ...current,
            qualifyingActions: current.qualifyingActions.includes(action)
              ? current.qualifyingActions.filter((entry) => entry !== action)
              : [...current.qualifyingActions, action],
          }
        : current
    );
  };

  const saveCampaign = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error('Campaign name is required.');
      return;
    }
    if (!form.qualifyingActions.length) {
      toast.error('Select at least one qualifying action.');
      return;
    }
    const ok = await post(
      {
        action: 'CAMPAIGN_SAVE',
        ...form,
        referrerReward: Number(form.referrerReward),
        refereeReward: Number(form.refereeReward),
        minReferrerAgeHours: Number(form.minReferrerAgeHours),
        maxRewardsPerUser: Number(form.maxRewardsPerUser),
        maxRewardsPerCampaign: Number(form.maxRewardsPerCampaign),
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      },
      form.id ? 'Campaign updated.' : 'Campaign created.'
    );
    if (ok) setForm(null);
  };

  const disqualify = async (row: AdminReferralData['referrals'][number]) => {
    if (reason.trim().length < 3) {
      toast.error('Add a clear disqualification reason.');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Disqualify this referral?',
      message: `This will stop the reward${row.status === 'REWARDED' ? ' and reverse coins already issued' : ''}. The decision is recorded in the audit log.`,
      confirmText: 'Disqualify',
      danger: true,
    });
    if (!confirmed) return;
    const ok = await post(
      { action: 'DISQUALIFY', referralId: row.id, reason: reason.trim() },
      'Referral disqualified and audited.'
    );
    if (ok) {
      setDisqualifyId(null);
      setReason('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-jade-950 via-jade-900 to-ink-950 p-6 text-white shadow-lg sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-gold-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold-300/25 bg-gold-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-200">
              <Gift className="h-3.5 w-3.5" /> Referral management
            </span>
            <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight">
              Real invitations. Verified rewards.
            </h2>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-white/60">
              Configure campaigns, inspect attribution, review fraud signals and issue or reverse
              GoodSale Coins only after genuine marketplace activity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(search, campaignFilter, statusFilter)}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-white/15 sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs font-semibold text-rose-600 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 rounded-xl bg-ink-100 p-1 dark:bg-ink-900">
        {(
          [
            ['overview', 'Overview'],
            ['campaigns', 'Campaigns'],
            ['referrals', 'Referrals'],
            ['rewards', 'Reward transactions'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              tab === id
                ? 'bg-jade-600 text-white shadow'
                : 'text-ink-600 hover:text-ink-950 dark:text-white/60 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className={`${card} flex items-center justify-center gap-2 p-12 text-xs text-ink-400`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading referral records…
        </div>
      ) : null}

      {tab === 'overview' && data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((stat) => (
              <div key={stat.label} className={`${card} p-4`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-ink-400">
                    {stat.label}
                  </p>
                  <stat.Icon className={`h-4 w-4 ${stat.tone}`} />
                </div>
                <p className="mt-2 font-display text-2xl font-extrabold text-ink-950 dark:text-white">
                  {stat.value.toLocaleString('en-NG')}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                  <ShieldCheck className="h-4 w-4 text-jade-600" /> Campaign health
                </h3>
                <span className="rounded-full bg-jade-500/10 px-2.5 py-1 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                  {data.campaigns.filter((entry) => entry.status === 'ACTIVE').length} active
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {data.campaigns.slice(0, 5).map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      setTab('campaigns');
                      editCampaign(campaign);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-150 px-3 py-2.5 text-left transition-colors hover:border-jade-400 dark:border-ink-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink-800 dark:text-white/85">
                        {campaign.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] text-ink-400">
                        {campaign.referrerReward} / {campaign.refereeReward} coins
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${statusTone[campaign.status]}`}
                    >
                      {campaign.status}
                    </span>
                  </button>
                ))}
                {!data.campaigns.length ? (
                  <p className="rounded-xl border border-dashed border-ink-200 p-6 text-center text-xs text-ink-400 dark:border-ink-700">
                    No campaigns yet.
                  </p>
                ) : null}
              </div>
            </div>

            <div className={`${card} p-5`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                  <AlertTriangle className="h-4 w-4 text-rose-500" /> Suspicious activity
                </h3>
                <button
                  type="button"
                  onClick={() => setTab('referrals')}
                  className="text-[10px] font-bold text-jade-600 hover:underline dark:text-jade-300"
                >
                  Review all
                </button>
              </div>
              {flagged.length ? (
                <div className="mt-4 space-y-2">
                  {flagged.slice(0, 5).map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-rose-500/15 bg-rose-500/[0.04] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-ink-800 dark:text-white/85">
                            {row.refereeName} · {row.code}
                          </p>
                          <p className="mt-1 text-[9px] text-rose-500">
                            {row.fraudFlags.join(' · ')}
                          </p>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] font-bold text-rose-500">
                          Risk {row.riskScore}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-ink-200 p-6 text-center text-xs text-ink-400 dark:border-ink-700">
                  No unreviewed fraud signals.
                </p>
              )}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
              <CalendarClock className="h-4 w-4 text-jade-600" /> Recent referral audit
            </h3>
            {data.audit.length ? (
              <div className="mt-4 divide-y divide-ink-100 dark:divide-ink-800">
                {data.audit.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] font-bold text-jade-700 dark:text-jade-300">
                        {entry.action} {entry.entityId ? `#${entry.entityId}` : ''}
                      </p>
                      <p className="mt-0.5 break-words text-[10px] text-ink-400">{entry.details}</p>
                    </div>
                    <span className="shrink-0 text-[9px] text-ink-400">
                      {new Date(entry.createdAt).toLocaleString('en-NG')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-ink-400">No admin referral actions yet.</p>
            )}
          </div>
        </>
      ) : null}

      {tab === 'campaigns' && data ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Rewards are snapshotted at attribution so an edit cannot silently change an existing
              referral&apos;s agreed amount.
            </p>
            <button type="button" onClick={() => editCampaign()} className={btnPrimary}>
              <Plus className="h-3.5 w-3.5" /> New campaign
            </button>
          </div>

          {form ? (
            <div className={`${card} space-y-5 p-5`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
                  <Sparkles className="h-4 w-4 text-gold-500" />
                  {form.id ? 'Edit campaign' : 'New referral campaign'}
                </h3>
                <button type="button" onClick={() => setForm(null)} className={btnMuted}>
                  <X className="h-3.5 w-3.5" /> Close
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Campaign name
                  </span>
                  <input
                    className={inp}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="GoodSale Launch Referrals"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Status
                  </span>
                  <select
                    className={inp}
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value as CampaignForm['status'] })
                    }
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="ENDED">Ended</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Audience
                  </span>
                  <select
                    className={inp}
                    value={form.audience}
                    onChange={(event) =>
                      setForm({ ...form, audience: event.target.value as CampaignForm['audience'] })
                    }
                  >
                    <option value="ANY">Buyers and sellers</option>
                    <option value="BUYER">Buyers</option>
                    <option value="SELLER">Sellers</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Referrer coins
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    className={inp}
                    value={form.referrerReward}
                    onChange={(event) => setForm({ ...form, referrerReward: event.target.value })}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    New member coins
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    className={inp}
                    value={form.refereeReward}
                    onChange={(event) => setForm({ ...form, refereeReward: event.target.value })}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Reward type
                  </span>
                  <input className={`${inp} opacity-60`} value="GoodSale Coins" readOnly />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Starts
                  </span>
                  <input
                    type="datetime-local"
                    className={inp}
                    value={form.startsAt}
                    onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Ends (optional)
                  </span>
                  <input
                    type="datetime-local"
                    className={inp}
                    value={form.endsAt}
                    onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Max rewarded referrals per user
                  </span>
                  <input
                    type="number"
                    min={0}
                    className={inp}
                    value={form.maxRewardsPerUser}
                    onChange={(event) => setForm({ ...form, maxRewardsPerUser: event.target.value })}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Max rewarded referrals per campaign
                  </span>
                  <input
                    type="number"
                    min={0}
                    className={inp}
                    value={form.maxRewardsPerCampaign}
                    onChange={(event) =>
                      setForm({ ...form, maxRewardsPerCampaign: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                    Minimum referrer account age (hours)
                  </span>
                  <input
                    type="number"
                    min={0}
                    className={inp}
                    value={form.minReferrerAgeHours}
                    onChange={(event) =>
                      setForm({ ...form, minReferrerAgeHours: event.target.value })
                    }
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Description
                </span>
                <textarea
                  className={`${inp} min-h-20`}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Explain the campaign in one or two sentences."
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['requireEmailVerified', 'Email must be verified'],
                    ['requireOnboarding', 'New member must complete onboarding'],
                    ['requireVerifiedReferrer', 'Referrer must be a verified seller'],
                    ['disqualifyRefunded', 'Reverse rewards if the qualifying order is refunded or disputed'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-150 p-3 text-xs text-ink-600 dark:border-ink-800 dark:text-white/70"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(form[key])}
                      onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-jade-600"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Qualifying actions (at least one required)
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {(Object.keys(REFERRAL_ACTION_LABELS) as ReferralAction[]).map((action) => (
                    <label
                      key={action}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition-colors ${
                        form.qualifyingActions.includes(action)
                          ? 'border-jade-400 bg-jade-500/5 text-ink-800 dark:text-white'
                          : 'border-ink-150 text-ink-500 dark:border-ink-800 dark:text-white/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.qualifyingActions.includes(action)}
                        onChange={() => toggleAction(action)}
                        className="mt-0.5 h-4 w-4 accent-jade-600"
                      />
                      {REFERRAL_ACTION_LABELS[action]}
                    </label>
                  ))}
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Terms / campaign notes
                </span>
                <textarea
                  className={`${inp} min-h-20`}
                  value={form.terms}
                  onChange={(event) => setForm({ ...form, terms: event.target.value })}
                />
              </label>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => setForm(null)} className={btnMuted}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveCampaign()}
                  disabled={busy === 'CAMPAIGN_SAVE'}
                  className={btnPrimary}
                >
                  {busy === 'CAMPAIGN_SAVE' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save campaign
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {data.campaigns.map((campaign) => (
              <div key={campaign.id} className={`${card} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-bold text-ink-950 dark:text-white">
                        {campaign.name}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${statusTone[campaign.status]}`}
                      >
                        {campaign.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-ink-400">
                      {campaign.audience} · {campaign.slug}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => editCampaign(campaign)}
                    className={btnMuted}
                    aria-label={`Edit ${campaign.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>

                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-500 dark:text-white/50">
                  {campaign.description || 'No description.'}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-gold-400/10 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gold-700 dark:text-gold-300">
                      Referrer
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold text-ink-950 dark:text-white">
                      {campaign.referrerReward.toLocaleString('en-NG')} <span className="text-[10px]">coins</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-jade-500/10 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-jade-700 dark:text-jade-300">
                      New member
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold text-ink-950 dark:text-white">
                      {campaign.refereeReward.toLocaleString('en-NG')} <span className="text-[10px]">coins</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {campaign.qualifyingActions.map((action) => (
                    <span
                      key={action}
                      className="rounded-full border border-ink-200 px-2 py-1 text-[9px] font-bold text-ink-500 dark:border-ink-700 dark:text-white/50"
                    >
                      {action}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3 dark:border-ink-800">
                  <p className="text-[9px] text-ink-400">
                    {campaign.maxRewardsPerUser} per user · {campaign.maxRewardsPerCampaign} per campaign
                  </p>
                  <button
                    type="button"
                    disabled={busy === 'SET_CAMPAIGN_STATUS'}
                    onClick={() =>
                      void post(
                        {
                          action: 'SET_CAMPAIGN_STATUS',
                          id: campaign.id,
                          status: campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                        },
                        campaign.status === 'ACTIVE' ? 'Campaign paused.' : 'Campaign activated.'
                      )
                    }
                    className={campaign.status === 'ACTIVE' ? btnMuted : btnPrimary}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {campaign.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'referrals' && data ? (
        <div className="space-y-4">
          <div className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
            <form
              className="flex flex-1 flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void load(search, campaignFilter, statusFilter);
              }}
            >
              <div className="relative min-w-52 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search referral code, name, email or username…"
                  className={`${inp} pl-8`}
                />
              </div>
              <select
                value={campaignFilter}
                onChange={(event) => {
                  setCampaignFilter(event.target.value);
                  void load(search, event.target.value, statusFilter);
                }}
                className={`${inp} w-auto`}
              >
                <option value="">All campaigns</option>
                {data.campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  void load(search, campaignFilter, event.target.value);
                }}
                className={`${inp} w-auto`}
              >
                <option value="">All statuses</option>
                <option value="REGISTERED">Registered</option>
                <option value="VERIFICATION_PENDING">Verification pending</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="REWARDED">Rewarded</option>
                <option value="DISQUALIFIED">Disqualified</option>
              </select>
              <button type="submit" className={btnPrimary} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Search
              </button>
            </form>
            <span className="shrink-0 text-[10px] font-bold text-ink-400">
              {data.referrals.length} referral{data.referrals.length === 1 ? '' : 's'}
            </span>
          </div>

          {disqualifyId ? (
            <div className={`${card} border-rose-500/30 p-4`}>
              <p className="text-xs font-bold text-ink-900 dark:text-white">
                Disqualify referral #{disqualifyId}
              </p>
              <p className="mt-1 text-[10px] text-ink-400">
                Reason is required and will be shown in the audit log. Issued coins are reversed.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. Duplicate accounts controlled by the same person"
                  className={inp}
                />
                <button type="button" onClick={() => setDisqualifyId(null)} className={btnMuted}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const row = data.referrals.find((entry) => entry.id === disqualifyId);
                    if (row) void disqualify(row);
                  }}
                  disabled={busy === 'DISQUALIFY'}
                  className={btnDanger}
                >
                  {busy === 'DISQUALIFY' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  Confirm
                </button>
              </div>
            </div>
          ) : null}

          <div className={`${card} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-xs">
                <thead className="bg-ink-50 dark:bg-ink-950/50">
                  <tr className="font-mono text-[9px] uppercase tracking-wider text-ink-400">
                    <th className="px-4 py-3 font-bold">Referral</th>
                    <th className="px-4 py-3 font-bold">Referrer</th>
                    <th className="px-4 py-3 font-bold">New member</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Reward</th>
                    <th className="px-4 py-3 font-bold">Risk</th>
                    <th className="px-4 py-3 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {data.referrals.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-mono text-[10px] font-bold text-jade-700 dark:text-jade-300">
                          {row.code || '—'}
                        </p>
                        <p className="mt-1 text-[9px] text-ink-400">#{row.id}</p>
                        <p className="mt-1 text-[9px] text-ink-400">
                          {new Date(row.createdAt).toLocaleDateString('en-NG')}
                        </p>
                        {row.campaignName ? (
                          <p className="mt-1 text-[9px] text-ink-400">{row.campaignName}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-ink-800 dark:text-white/85">
                          {row.referrer?.name || '—'}
                        </p>
                        <p className="mt-0.5 text-[9px] text-ink-400">{row.referrer?.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-ink-800 dark:text-white/85">
                          {row.referee?.name || row.refereeName}
                        </p>
                        <p className="mt-0.5 text-[9px] text-ink-400">{row.referee?.email}</p>
                        <p className="mt-0.5 text-[9px] text-ink-400">{row.referee?.role}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${statusTone[row.status]}`}
                        >
                          {REFERRAL_STATUS_LABELS[row.status] || row.status}
                        </span>
                        {row.disqualifiedReason ? (
                          <p className="mt-1 max-w-40 text-[9px] text-rose-500">
                            {row.disqualifiedReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-[10px] font-bold text-gold-600 dark:text-gold-300">
                          {row.referrerReward} / {row.refereeReward}
                        </p>
                        <p className="mt-0.5 text-[9px] text-ink-400">referrer / member</p>
                      </td>
                      <td className="px-4 py-3">
                        <p
                          className={`font-mono text-[10px] font-bold ${
                            row.riskScore >= 40 ? 'text-rose-500' : 'text-ink-400'
                          }`}
                        >
                          {row.riskScore}
                        </p>
                        {row.fraudFlags.length ? (
                          <div className="mt-1 flex max-w-40 flex-wrap gap-1">
                            {row.fraudFlags.map((flag) => (
                              <span
                                key={flag}
                                className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[8px] font-bold text-rose-500"
                              >
                                {flag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-[9px] text-jade-600">Clean</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1.5">
                          {row.fraudFlags.length && !row.fraudReviewedAt ? (
                            <button
                              type="button"
                              disabled={busy === 'MARK_REVIEWED'}
                              onClick={() =>
                                void post(
                                  { action: 'MARK_REVIEWED', referralId: row.id, notes: 'Reviewed by admin' },
                                  'Fraud review recorded.'
                                )
                              }
                              className={btnMuted}
                            >
                              <Eye className="h-3 w-3" /> Reviewed
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busy === 'REEVALUATE'}
                            onClick={() =>
                              void post(
                                { action: 'REEVALUATE', referralId: row.id },
                                'Referral re-evaluated.'
                              )
                            }
                            className={btnMuted}
                          >
                            <RefreshCw className={`h-3 w-3 ${busy === 'REEVALUATE' ? 'animate-spin' : ''}`} />
                            Re-check
                          </button>
                          {!['DISQUALIFIED'].includes(row.status) ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDisqualifyId(row.id);
                                setReason('');
                              }}
                              className={btnDanger}
                            >
                              <Ban className="h-3 w-3" /> Disqualify
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.referrals.length ? (
              <div className="p-12 text-center text-xs text-ink-400">
                No referrals match this search.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'rewards' && data ? (
        <div className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 p-4 dark:border-ink-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
              <Coins className="h-4 w-4 text-gold-500" /> GoodSale Coin reward transactions
            </h3>
            <span className="font-mono text-[10px] font-bold text-ink-400">
              {data.rewards.length} records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-ink-50 dark:bg-ink-950/50">
                <tr className="font-mono text-[9px] uppercase tracking-wider text-ink-400">
                  <th className="px-4 py-3 font-bold">Reference</th>
                  <th className="px-4 py-3 font-bold">Beneficiary</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Coins</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {data.rewards.map((reward) => (
                  <tr key={reward.id}>
                    <td className="px-4 py-3 font-mono text-[9px] text-ink-500">{reward.reference}</td>
                    <td className="px-4 py-3 font-bold text-ink-800 dark:text-white/85">
                      {reward.beneficiaryName}
                    </td>
                    <td className="px-4 py-3 text-[10px] text-ink-400">{reward.beneficiaryRole}</td>
                    <td className="px-4 py-3 font-mono font-bold text-gold-600 dark:text-gold-300">
                      {reward.amount.toLocaleString('en-NG')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                          reward.status === 'ISSUED'
                            ? 'bg-jade-500/15 text-jade-700 dark:text-jade-300'
                            : reward.status === 'REVERSED'
                              ? 'bg-rose-500/10 text-rose-600'
                              : 'bg-gold-400/15 text-gold-700'
                        }`}
                      >
                        {reward.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[9px] text-ink-400">
                      {reward.issuedAt ? new Date(reward.issuedAt).toLocaleString('en-NG') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.rewards.length ? (
            <div className="p-12 text-center text-xs text-ink-400">No reward transactions yet.</div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3 text-[10px] text-ink-400 dark:border-ink-800 dark:bg-ink-900">
        <Clock3 className="h-3.5 w-3.5 text-jade-600" />
        Attribution, qualification and reward issuance are server-side. GoodSale Coins never enter
        the naira wallet.
      </div>
    </div>
  );
}
