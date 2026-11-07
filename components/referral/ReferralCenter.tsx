'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  Clock3,
  Coins,
  Copy,
  Facebook,
  Gift,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useDBState } from '@/lib/store';
import { toast } from '@/lib/feedback';
import type { ReferralDashboard, ReferralStatus } from '@/lib/referrals/types';
import { REFERRAL_STATUS_LABELS } from '@/lib/referrals/types';

interface ReferralCenterProps {
  onBack?: () => void;
  onNavigate?: (view: string, payload?: unknown) => void;
  onOpenAuth?: () => void;
}

const statusTone: Record<ReferralStatus, string> = {
  REGISTERED: 'bg-ink-500/10 text-ink-600 dark:bg-white/10 dark:text-white/70',
  VERIFICATION_PENDING: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
  QUALIFIED: 'bg-jade-500/10 text-jade-700 dark:text-jade-300',
  REWARD_PENDING: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
  REWARDED: 'bg-jade-500/15 text-jade-700 dark:text-jade-200',
  DISQUALIFIED: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

function Stat({
  label,
  value,
  detail,
  Icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-3.5 sm:p-4 ${
        accent
          ? 'border-gold-400/30 bg-gradient-to-br from-gold-50 to-white dark:from-gold-400/10 dark:to-ink-900'
          : 'border-ink-150 bg-white dark:border-ink-800 dark:bg-ink-900'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-mono text-[9px] font-bold uppercase leading-tight tracking-[0.14em] text-ink-400 sm:text-[10px] sm:tracking-[0.18em]">
          {label}
        </p>
        <Icon className={`h-4 w-4 shrink-0 ${accent ? 'text-gold-500' : 'text-jade-600 dark:text-jade-400'}`} />
      </div>
      <p className="mt-2 break-words font-display text-xl font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-2xl">
        {typeof value === 'number' ? value.toLocaleString('en-NG') : value}
      </p>
      {detail ? <p className="mt-1 break-words text-[10px] leading-snug text-ink-400 sm:text-[11px]">{detail}</p> : null}
    </div>
  );
}

function RewardStatus({ status }: { status: ReferralDashboard['history'][number]['rewardStatus'] }) {
  const map = {
    CREDITED: { label: 'Credited', tone: 'bg-jade-500/15 text-jade-700 dark:text-jade-200' },
    PENDING: { label: 'Pending', tone: 'bg-gold-400/20 text-gold-700 dark:text-gold-200' },
    DISQUALIFIED: { label: 'Not earned', tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' },
    NOT_EARNED: { label: 'Not yet', tone: 'bg-ink-500/10 text-ink-500 dark:bg-white/10 dark:text-white/60' },
  } as const;
  const item = map[status];
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${item.tone}`}>
      {item.label}
    </span>
  );
}

export default function ReferralCenter({ onBack, onNavigate, onOpenAuth }: ReferralCenterProps) {
  const db = useDBState();
  const user = db.currentUser;
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/referrals/me', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Could not load your referral dashboard.');
      }
      setData(payload.referral as ReferralDashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load referrals.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
    else setLoading(false);
  }, [user, load]);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const copyLink = async () => {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      toast.success('Referral link copied.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };

  const shareText = data?.shareText || 'Join me on GoodSale.';
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(data?.link || '');
  const campaign = data?.campaign || null;

  const shareTargets = useMemo(
    () => [
      {
        label: 'WhatsApp',
        Icon: MessageCircle,
        href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${data?.link || ''}`)}`,
        tone: 'hover:bg-[#25D366] hover:text-white',
      },
      {
        label: 'X',
        Icon: X,
        href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        tone: 'hover:bg-ink-950 hover:text-white',
      },
      {
        label: 'Facebook',
        Icon: Facebook,
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        tone: 'hover:bg-[#1877F2] hover:text-white',
      },
      {
        label: 'Telegram',
        Icon: Send,
        href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
        tone: 'hover:bg-[#229ED9] hover:text-white',
      },
    ],
    [data?.link, encodedText, encodedUrl, shareText]
  );

  const nativeShare = async () => {
    if (!data) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Join GoodSale',
          text: shareText,
          url: data.link,
        });
        return;
      } catch {
        // User cancelled or the platform rejected the share; fall back to copy.
      }
    }
    await copyLink();
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-jade-500/10 text-jade-600 dark:text-jade-300">
          <Gift className="h-8 w-8" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-ink-950 dark:text-white">
          Your referral centre
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-white/55">
          Sign in to get your personal code, share it, and track every real registration and
          GoodSale Coin reward.
        </p>
        <Button className="mt-6" onClick={onOpenAuth}>
          Sign in to continue
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-jade-600 dark:text-jade-400" />
          <p className="mt-3 text-xs font-semibold text-ink-400">Loading your referral ledger…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-600">
          <RefreshCw className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold text-ink-950 dark:text-white">
          Referral dashboard unavailable
        </h1>
        <p className="mt-2 text-sm text-ink-500">{error}</p>
        <Button className="mt-5" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const completion = data.stats.registered
    ? Math.min(100, Math.round((data.stats.qualified / data.stats.registered) * 100))
    : 0;

  return (
    <div className="min-h-screen overflow-x-clip bg-ink-50 px-4 pb-8 pt-6 transition-colors sm:px-6 sm:pb-12 lg:px-8 dark:bg-ink-950">
      <div className="mx-auto min-w-0 max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-2 text-xs font-bold text-ink-600 transition-colors hover:border-jade-400 hover:text-jade-700 dark:border-ink-800 dark:bg-ink-900 dark:text-white/70 dark:hover:text-jade-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-2 text-xs font-bold text-ink-600 transition-colors hover:border-jade-400 hover:text-jade-700 disabled:opacity-50 dark:border-ink-800 dark:bg-ink-900 dark:text-white/70"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Hero */}
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-jade-950 via-jade-900 to-ink-950 p-6 text-white shadow-xl sm:p-9">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-60 w-60 rounded-full bg-jade-400/20 blur-3xl" />
          <div className="pointer-events-none absolute right-6 top-4 font-display text-[9rem] font-black leading-none text-white/[0.035] sm:text-[13rem]">
            GS
          </div>

          <div className="relative grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-300/30 bg-gold-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-200">
                <Sparkles className="h-3.5 w-3.5" /> GoodSale Referrals
              </span>
              <h1 className="mt-5 max-w-xl font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-4xl">
                Bring real people.
                <span className="block bg-gradient-to-r from-gold-200 via-gold-300 to-gold-100 bg-clip-text text-transparent">
                  Earn real rewards.
                </span>
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/65">
                {campaign
                  ? `Earn ${campaign.referrerReward.toLocaleString('en-NG')} GoodSale Coins when a friend joins and qualifies. They get ${campaign.refereeReward.toLocaleString('en-NG')} coins too.`
                  : 'No referral campaign is active right now. Your code remains yours, and new referrals will be tracked when a campaign opens.'}
              </p>

              {campaign ? (
                <div className="mt-6 grid max-w-md grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      You receive
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-display text-2xl font-extrabold text-gold-200">
                      <Coins className="h-5 w-5" />
                      {campaign.referrerReward.toLocaleString('en-NG')}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/40">GoodSale Coins</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                      They receive
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-display text-2xl font-extrabold text-jade-200">
                      <Gift className="h-5 w-5" />
                      {campaign.refereeReward.toLocaleString('en-NG')}
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/40">GoodSale Coins</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-gold-300/15 bg-gold-300/[0.06] px-3.5 py-3 text-[11px] leading-relaxed text-gold-100/70">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
                Coins are promotional rewards. They are separate from your naira wallet, cannot be
                withdrawn, and are never converted to cash automatically.
              </div>
            </div>

            {/* Code + QR */}
            <div className="min-w-0 rounded-[26px] border border-white/12 bg-white/[0.07] p-4 backdrop-blur-md sm:p-5">
              <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                    Your referral code
                  </p>
                  <p className="mt-1.5 break-all font-mono text-xl font-black tracking-wider text-white sm:text-2xl">
                    {data.code || '—'}
                  </p>
                  <p className="mt-1 text-[10px] text-white/40">
                    Unique to your account. It never changes.
                  </p>
                </div>
                <div className="justify-self-start rounded-2xl bg-white p-2.5 shadow-lg sm:justify-self-end">
                  {data.link ? (
                    <QRCodeSVG
                      value={data.link}
                      size={104}
                      bgColor="#ffffff"
                      fgColor="#043a27"
                      level="M"
                    />
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-ink-950/35 p-2.5 pl-3">
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
                <span className="min-w-0 flex-1 break-all font-mono text-[10px] leading-relaxed text-white/70 sm:text-[11px]">
                  {data.link}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold-300 px-3 py-2.5 text-xs font-bold text-jade-950 transition-colors hover:bg-gold-200"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button
                  type="button"
                  onClick={() => void nativeShare()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/15"
                >
                  <Share2 className="h-4 w-4" />
                  {canNativeShare ? 'Share' : 'Copy'}
                </button>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {shareTargets.map((target) => (
                  <a
                    key={target.label}
                    href={target.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-2 text-[10px] font-bold text-white/70 transition-colors ${target.tone}`}
                  >
                    <target.Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{target.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Invitations" value={data.stats.invitations} detail="Link visits" Icon={Share2} />
          <Stat label="Registered" value={data.stats.registered} detail="Real accounts" Icon={UserPlus} />
          <Stat label="Qualified" value={data.stats.qualified} detail="Met the rules" Icon={CheckCircle2} />
          <Stat
            label="Pending"
            value={data.stats.pendingRewards}
            detail="Coins awaiting issue"
            Icon={Clock3}
            accent
          />
          <Stat
            label="Earned"
            value={data.stats.earnedRewards}
            detail="Coins credited"
            Icon={Trophy}
            accent
          />
          <Stat
            label="Coin balance"
            value={data.coinsBalance}
            detail="Promotional only"
            Icon={Coins}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          {/* History */}
          <div className="min-w-0 rounded-3xl border border-ink-150 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-950 dark:text-white">
                  <Users className="h-5 w-5 text-jade-600 dark:text-jade-400" />
                  Referral history
                </h2>
                <p className="mt-1 text-xs text-ink-400">
                  Names are shortened to protect referred members&apos; privacy.
                </p>
              </div>
              <div className="rounded-full border border-ink-200 px-3 py-1 text-[10px] font-bold text-ink-500 dark:border-ink-700 dark:text-white/50">
                {data.stats.qualified} of {data.stats.registered} qualified
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-jade-500 to-gold-400 transition-all duration-700"
                style={{ width: `${completion}%` }}
              />
            </div>

            {data.history.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-ink-200 px-5 py-10 text-center dark:border-ink-700">
                <UserPlus className="mx-auto h-7 w-7 text-ink-300" />
                <p className="mt-2 text-sm font-bold text-ink-700 dark:text-white/80">
                  No referrals yet
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  Share your link. New accounts will appear here as soon as they register.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-5 hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-ink-100 font-mono text-[10px] uppercase tracking-wider text-ink-400 dark:border-ink-800">
                        <th className="pb-3 pr-4 font-bold">Referred member</th>
                        <th className="pb-3 pr-4 font-bold">Registered</th>
                        <th className="pb-3 pr-4 font-bold">Status</th>
                        <th className="pb-3 pr-4 font-bold">Reward</th>
                        <th className="pb-3 text-right font-bold">Coins</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                      {data.history.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3 pr-4 font-bold text-ink-800 dark:text-white/85">
                            {item.refereeName}
                          </td>
                          <td className="py-3 pr-4 text-ink-400">
                            {new Date(item.createdAt).toLocaleDateString('en-NG', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTone[item.status]}`}
                            >
                              {REFERRAL_STATUS_LABELS[item.status] || item.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <RewardStatus status={item.rewardStatus} />
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-gold-600 dark:text-gold-300">
                            {item.rewardStatus === 'CREDITED'
                              ? `+${item.rewardCoins.toLocaleString('en-NG')}`
                              : item.rewardCoins
                                ? `${item.rewardCoins.toLocaleString('en-NG')} possible`
                                : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 space-y-2 sm:hidden">
                  {data.history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-ink-150 p-3.5 dark:border-ink-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-ink-900 dark:text-white">
                            {item.refereeName}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-400">
                            {new Date(item.createdAt).toLocaleDateString('en-NG')}
                          </p>
                        </div>
                        <RewardStatus status={item.rewardStatus} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${statusTone[item.status]}`}
                        >
                          {REFERRAL_STATUS_LABELS[item.status] || item.status}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-gold-600 dark:text-gold-300">
                          {item.rewardStatus === 'CREDITED'
                            ? `+${item.rewardCoins.toLocaleString('en-NG')} coins`
                            : item.rewardCoins
                              ? `${item.rewardCoins.toLocaleString('en-NG')} possible`
                              : 'No reward'}
                        </span>
                      </div>
                      {item.reason ? (
                        <p className="mt-2 text-[10px] text-rose-500">{item.reason}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Qualification and rewards */}
          <div className="min-w-0 space-y-5">
            <div className="min-w-0 rounded-3xl border border-ink-150 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-6">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink-950 dark:text-white">
                <Award className="h-5 w-5 text-gold-500" />
                How a referral qualifies
              </h2>
              {campaign ? (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-ink-500 dark:text-white/50">
                    Registration alone does not earn coins. The new member must complete every
                    required check and at least one qualifying marketplace action.
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {(data.qualification.length
                      ? data.qualification
                      : ['Complete the campaign qualification rules']
                    ).map((item, index) => (
                      <div key={`${item}-${index}`} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-jade-500/10 font-mono text-[9px] font-bold text-jade-700 dark:text-jade-300">
                          {index + 1}
                        </span>
                        <span className="text-xs leading-relaxed text-ink-600 dark:text-white/65">
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 rounded-xl bg-ink-50 px-3 py-2.5 text-[10px] leading-relaxed text-ink-400 dark:bg-ink-950/50">
                    {campaign.terms}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-ink-500">
                  No campaign is active. Your code is still valid and no rewards will be promised
                  until an admin publishes a campaign.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-ink-150 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink-950 dark:text-white">
                  <Coins className="h-5 w-5 text-gold-500" />
                  Reward history
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate?.('wallet')}
                  className="text-[10px] font-bold text-jade-600 hover:underline dark:text-jade-300"
                >
                  View wallet
                </button>
              </div>
              {data.rewards.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-dashed border-ink-200 px-4 py-6 text-center text-xs text-ink-400 dark:border-ink-700">
                  No referral coins credited yet.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-ink-100 dark:divide-ink-800">
                  {data.rewards.map((reward) => (
                    <div key={reward.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-ink-800 dark:text-white/85">
                          {reward.refereeName}
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[9px] text-ink-400">{reward.reference}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-gold-600 dark:text-gold-300">
                          +{reward.amount.toLocaleString('en-NG')}
                        </p>
                        <p className="text-[9px] text-ink-400">
                          {reward.status === 'ISSUED'
                            ? 'Credited'
                            : reward.status === 'REVERSED'
                              ? 'Reversed'
                              : 'Pending'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 px-2 pb-4 text-center text-[10px] leading-relaxed text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Referral attribution and reward decisions are verified on GoodSale&apos;s servers.
        </div>
      </div>
    </div>
  );
}
