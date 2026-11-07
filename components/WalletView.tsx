// components/WalletView.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  Hash,
  Info,
  Landmark,
  Lock,
  Plus,
  Coins,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UserRound,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useDBState, dbOperations, reloadFromSupabase } from '../lib/store';
import { toast } from '../lib/feedback';
import { computeEscrowFee } from '@/lib/payments/helpers';
import WithdrawReviewDialog from './wallet/WithdrawReviewDialog';
import AddFundsDialog from './wallet/AddFundsDialog';
import EmptyState from './ui/EmptyState';
import SegmentedControl from './ui/SegmentedControl';
import Button from './ui/Button';
import Card from './ui/Card';
import Meter from './ui/Meter';

type TxFilter = 'all' | 'credit' | 'debit';

type WalletStatus = {
  fundingAvailable: boolean;
  payoutsAvailable: boolean;
  provider: { fundingEnabled: boolean; payoutsEnabled: boolean; webhookConfigured: boolean };
  limits: {
    funding_min: number;
    funding_max: number;
    withdrawal_min: number;
    withdrawal_max: number;
    withdrawal_fee: number;
    daily_withdrawal_limit: number;
  };
  funding: Array<{
    id: number;
    reference: string;
    amount: number;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
    provider_reference?: string;
    created_at: string;
  }>;
};

interface WalletViewProps {
  onNavigate?: (view: string, payload?: unknown) => void;
  onOpenAuth?: () => void;
}

const HIDE_BALANCE_KEY = 'goodsale_hide_wallet_balance';
const MIN_WITHDRAWAL = 1000;
const TX_PAGE_SIZE = 10;

const NIGERIAN_BANKS = [
  'Access Bank',
  'Citibank Nigeria',
  'Ecobank Nigeria',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank',
  'Globus Bank',
  'Guaranty Trust Bank',
  'Heritage Bank',
  'Jaiz Bank',
  'Keystone Bank',
  'Kuda Microfinance Bank',
  'Moniepoint Microfinance Bank',
  'Opay Digital Services',
  'Palmpay',
  'Polaris Bank',
  'Providus Bank',
  'Stanbic IBTC Bank',
  'Standard Chartered Bank',
  'Sterling Bank',
  'SunTrust Bank',
  'Taj Bank',
  'Titan Trust Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa',
  'Unity Bank',
  'Wema Bank',
  'Zenith Bank',
];

const naira = (value: number) =>
  `₦${Math.round(value).toLocaleString('en-NG')}`;

function dayLabel(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const time = date.getTime();
  if (!Number.isFinite(time)) return 'Earlier';
  if (time >= startOfToday) return 'Today';
  if (time >= startOfYesterday) return 'Yesterday';
  return date.toLocaleDateString('en-NG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function transactionLabel(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase();
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function WalletView({ onNavigate, onOpenAuth }: WalletViewProps) {
  const db = useDBState();
  const user = db.currentUser;

  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [showAllTx, setShowAllTx] = useState(false);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<number | null>(null);

  const payoutRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setHideBalance(window.localStorage.getItem(HIDE_BALANCE_KEY) === '1');
    } catch {
      /* storage can be unavailable in private browsing */
    }
  }, []);

  const toggleBalance = () => {
    setHideBalance((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(HIDE_BALANCE_KEY, next ? '1' : '0');
      } catch {
        /* non-blocking privacy preference */
      }
      return next;
    });
  };

  const refreshWalletStatus = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/wallet/status');
      const payload = await res.json();
      if (payload?.success) setWalletStatus(payload as WalletStatus);
    } catch {
      /* the wallet remains usable for ledger viewing when config lookup fails */
    }
  };

  useEffect(() => {
    void refreshWalletStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const wallet = useMemo(
    () => (user ? db.wallets.find((entry) => entry.userId === user.id) : undefined),
    [db.wallets, user]
  );

  const transactions = useMemo(() => {
    if (!wallet) return [];
    return db.walletTransactions
      .filter((entry) => entry.walletId === wallet.id)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [db.walletTransactions, wallet]);

  const escrow = useMemo(() => {
    if (!user) {
      return {
        asSeller: 0,
        asBuyer: 0,
        pendingEarnings: 0,
        rows: [] as Array<{
          id: number;
          title: string;
          amount: number;
          role: 'SELLER' | 'BUYER';
          number: string;
        }>,
      };
    }
    let asSeller = 0;
    let asBuyer = 0;
    let pendingEarnings = 0;
    const rows: Array<{
      id: number;
      title: string;
      amount: number;
      role: 'SELLER' | 'BUYER';
      number: string;
    }> = [];
    const settings = db.revenueSettings;
    db.escrows.forEach((entry) => {
      if (entry.isReleased || entry.isRefunded) return;
      const order = db.orders.find((item) => item.id === entry.orderId);
      if (!order) return;
      if (order.sellerId === user.id) {
        asSeller += entry.heldAmount;
        pendingEarnings += computeEscrowFee(entry.heldAmount, {
          pct: settings?.escrowPercentageFee ?? 1.5,
          min: settings?.escrowMinFee ?? 100,
          max: settings?.escrowMaxFee ?? 15000,
          deliveryFee: order.deliveryFee || 0,
        }).payout;
        rows.push({
          id: entry.id,
          title: order.productTitle,
          amount: entry.heldAmount,
          role: 'SELLER',
          number: order.orderNumber,
        });
      } else if (order.buyerId === user.id) {
        asBuyer += entry.heldAmount;
        rows.push({
          id: entry.id,
          title: order.productTitle,
          amount: entry.heldAmount,
          role: 'BUYER',
          number: order.orderNumber,
        });
      }
    });
    return { asSeller, asBuyer, pendingEarnings, rows };
  }, [db.escrows, db.orders, db.revenueSettings, user]);

  // Prefill the payout form from saved wallet bank details.
  useEffect(() => {
    if (!wallet) return;
    setBank((previous) => previous || wallet.bankName || '');
    setAccountName((previous) => previous || wallet.bankAccountName || '');
    setAccountNumber((previous) => previous || wallet.bankAccountNumber || '');
  }, [wallet]);

  const balance = wallet?.balance ?? 0;
  const minWithdrawal = walletStatus?.limits.withdrawal_min ?? MIN_WITHDRAWAL;
  const maxWithdrawal = walletStatus?.limits.withdrawal_max ?? 1_000_000;
  const withdrawalFee = walletStatus?.limits.withdrawal_fee ?? 0;

  const myWithdrawals = user
    ? db.withdrawalRequests.filter((entry) => entry.userId === user.id)
    : [];
  const pendingWithdrawalRequests = myWithdrawals.filter(
    (entry) => entry.status === 'PENDING' || entry.status === 'PROCESSING'
  );
  const pendingPayouts = pendingWithdrawalRequests.reduce((sum, entry) => sum + entry.amount, 0);

  const lifetimeReceived = transactions
    .filter(
      (entry) =>
        entry.status === 'COMPLETED' &&
        entry.amount > 0 &&
        entry.affectsBalance !== false
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalEarnings = transactions
    .filter(
      (entry) =>
        entry.status === 'COMPLETED' &&
        (entry.type === 'CREDIT_SALE' ||
          entry.type === 'CREDIT_DELIVERY' ||
          entry.type === 'SELLER_EARNINGS') &&
        entry.affectsBalance !== false
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const lifetimeWithdrawn = myWithdrawals
    .filter((entry) => entry.status === 'SUCCESS')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalSales = user
    ? db.orders
        .filter(
          (order) =>
            order.sellerId === user.id &&
            [
              'PAID_ESCROW',
              'SHIPPED',
              'OUT_FOR_DELIVERY',
              'DELIVERED_SUCCESS',
              'DISPUTED',
              'REFUND_REQUESTED',
            ].includes(order.status)
        )
        .reduce((sum, order) => sum + order.totalAmount, 0)
    : 0;

  const buyerPendingOrders = user
    ? db.orders
        .filter(
          (order) =>
            order.buyerId === user.id &&
            ['PENDING', 'PENDING_BANK_TRANSFER', 'INVOICE_SENT'].includes(order.status)
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4)
    : [];

  const coinsBalance = Number(user?.goodPoints || 0);

  const filteredTransactions = transactions.filter((entry) => {
    if (txFilter === 'all') return true;
    if (txFilter === 'credit') return entry.amount > 0;
    return entry.amount < 0;
  });

  const visibleTransactions = showAllTx
    ? filteredTransactions
    : filteredTransactions.slice(0, TX_PAGE_SIZE);

  const groupedTransactions = visibleTransactions.reduce<
    Array<{ label: string; items: typeof transactions }>
  >((groups, entry) => {
    const label = dayLabel(entry.createdAt);
    const current = groups[groups.length - 1];
    if (current && current.label === label) current.items.push(entry);
    else groups.push({ label, items: [entry] });
    return groups;
  }, []);

  const parsedAmount = Number(amount);
  const amountError =
    amount.trim().length === 0
      ? null
      : !Number.isFinite(parsedAmount) || parsedAmount <= 0
        ? 'Enter a valid amount.'
        : parsedAmount < minWithdrawal
          ? `Minimum withdrawal is ${naira(minWithdrawal)}.`
          : parsedAmount > maxWithdrawal
            ? `Maximum withdrawal is ${naira(maxWithdrawal)}.`
            : parsedAmount > balance
              ? 'Amount exceeds your available balance.'
              : null;

  const accountNumberValid = /^\d{10}$/.test(accountNumber.trim());
  const bankDetailsComplete =
    bank.trim().length > 1 && accountName.trim().length > 1 && accountNumberValid;

  const canSubmit =
    !!user &&
    !submitting &&
    !amountError &&
    Number.isFinite(parsedAmount) &&
    parsedAmount >= minWithdrawal &&
    parsedAmount <= maxWithdrawal &&
    parsedAmount <= balance &&
    bankDetailsComplete;

  const quickAmounts = useMemo(() => {
    const values = [
      { label: '25%', value: Math.floor(balance * 0.25) },
      { label: '50%', value: Math.floor(balance * 0.5) },
      { label: 'Max', value: Math.floor(Math.min(balance, maxWithdrawal)) },
    ];
    return values.filter((option) => option.value >= minWithdrawal);
  }, [balance, maxWithdrawal, minWithdrawal]);

  const focusPayoutForm = () => {
    const target = payoutRef.current;
    if (!target) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    window.setTimeout(() => amountRef.current?.focus(), reduced ? 0 : 320);
  };

  const handleWithdraw = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canSubmit) return;
    if (!walletStatus?.payoutsAvailable) {
      toast.error(
        'Bank payouts are unavailable until Paystack is configured for this deployment.',
        'Payouts unavailable'
      );
      return;
    }
    setReviewOpen(true);
  };

  const handlePayOrder = async (orderId: number) => {
    setPayingOrderId(orderId);
    try {
      const result = await dbOperations.payOrderWithWallet(orderId);
      if (result.success) {
        toast.success('Order paid from your wallet and protected by escrow.', 'Payment secured');
      } else {
        toast.error(result.message || 'Could not pay for this order.', 'Wallet payment failed');
      }
    } finally {
      setPayingOrderId(null);
    }
  };

  const submitWithdrawal = async () => {
    if (!user || !canSubmit || !walletStatus?.payoutsAvailable) return;
    setSubmitting(true);
    try {
      const result = await dbOperations.withdrawFromWallet(user.id, parsedAmount, {
        bank: bank.trim(),
        name: accountName.trim(),
        number: accountNumber.trim(),
      });
      if (result.success) {
        setReviewOpen(false);
        toast.success(
          `${naira(parsedAmount)} is reserved for ${bank.trim()} ••••${accountNumber.slice(-4)}. It stays pending until admin review and Paystack confirmation.`,
          'Payout requested'
        );
        setAmount('');
      } else {
        toast.error(result.message || 'Withdrawal could not be completed.', 'Payout failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
        <EmptyState
          state="empty-chat"
          icon={<WalletIcon />}
          title="Sign in to open your wallet"
          description="Your balance, escrow protection and payouts live behind your GoodSale account."
          action={
            <Button onClick={() => onOpenAuth?.()} className="tracking-wide">
              Sign in
            </Button>
          }
        />
      </div>
    );
  }

  const escrowTotal = escrow.asSeller + escrow.asBuyer;
  const escrowShare = escrowTotal > 0 ? (escrow.asSeller / escrowTotal) * 100 : 0;
  const maskedValue = '₦••••••';

  return (
    <div className="min-h-screen bg-ink-50 pb-16 transition-colors duration-300 dark:bg-ink-950">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-jade-700 dark:text-jade-300">
              <WalletIcon className="h-3.5 w-3.5" />
              Money
            </p>
            <h1 className="mt-1.5 animate-title-collapse font-display text-3xl font-bold tracking-tight text-ink-900 dark:text-white sm:text-[2.1rem]">
              Wallet &amp; payouts
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Your available balance, protected escrow and bank withdrawals — all in one ledger.
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${walletStatus?.fundingAvailable ? 'border-jade-500/25 bg-jade-500/10 text-jade-700 dark:text-jade-300' : 'border-ink-200 bg-ink-100 text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400'}`}>
              <ArrowDownToLine className="h-3 w-3" />
              Funding {walletStatus?.fundingAvailable ? 'available' : 'unavailable'}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ${walletStatus?.payoutsAvailable ? 'border-jade-500/25 bg-jade-500/10 text-jade-700 dark:text-jade-300' : 'border-ink-200 bg-ink-100 text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400'}`}>
              <Landmark className="h-3 w-3" />
              Payouts {walletStatus?.payoutsAvailable ? 'available' : 'unavailable'}
            </span>
            <p className="w-full text-[11px] leading-relaxed text-ink-500 dark:text-ink-400 lg:text-right">
              Released escrow settles to this wallet. Bank payouts require Paystack confirmation.
            </p>
          </div>
        </div>

        {/* Balance + escrow snapshot */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-3xl border border-jade-500/20 bg-ink-950 p-6 text-white shadow-xl shadow-jade-950/15 dark:border-jade-400/25 lg:col-span-2">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-jade-500/25 blur-3xl" />
              <div className="absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-gold-400/10 blur-3xl" />
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-jade-400/60 to-transparent" />
            </div>

            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-jade-200">
                  <WalletIcon className="h-3.5 w-3.5" />
                  Available balance
                </span>
                <button
                  type="button"
                  onClick={toggleBalance}
                  aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
                  className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-jade-100 transition-colors hover:bg-white/15 focus-ring"
                >
                  {hideBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <p className="mt-4 font-mono text-[2.15rem] font-bold leading-none tracking-tight sm:text-[2.6rem]">
                {hideBalance ? maskedValue : naira(balance)}
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-jade-100/65">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Protected by GoodSale Escrow
                </span>
                <span aria-hidden="true" className="text-jade-200/30">•</span>
                <span>
                  {pendingPayouts > 0
                    ? `${hideBalance ? 'Payout' : naira(pendingPayouts)} pending payout`
                    : 'No payouts pending'}
                </span>
              </p>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setAddFundsOpen(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gold-300 px-4 text-xs font-bold text-jade-950 shadow-lg shadow-black/10 transition-all press-scale hover:bg-gold-200 focus-ring"
                >
                  <Plus className="h-4 w-4" />
                  Add funds
                </button>
                <button
                  type="button"
                  onClick={focusPayoutForm}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-ink-950 shadow-lg shadow-black/10 transition-all press-scale hover:bg-jade-50 focus-ring"
                >
                  <ArrowDownToLine className="h-4 w-4" />
                  Withdraw funds
                </button>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('revenue')}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-bold text-white transition-colors hover:bg-white/10 focus-ring"
                  >
                    Revenue hub
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <Card className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
                Held in escrow
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-300">
                <Lock className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold text-ink-900 dark:text-white">
              {hideBalance ? maskedValue : naira(escrowTotal)}
            </p>
            <div className="mt-4 flex-1 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Incoming as seller</span>
                <span className="font-mono font-bold text-ink-800 dark:text-ink-200">
                  {hideBalance ? '••••' : naira(escrow.asSeller)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Protected as buyer</span>
                <span className="font-mono font-bold text-ink-800 dark:text-ink-200">
                  {hideBalance ? '••••' : naira(escrow.asBuyer)}
                </span>
              </div>
            </div>
            {escrowTotal > 0 && <Meter className="mt-4" value={escrowShare} tone="jade" />}
          </Card>

          <Card className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
                Payouts in progress
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gold-400/15 text-gold-700 dark:text-gold-300">
                <Clock3 className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 font-mono text-2xl font-bold text-ink-900 dark:text-white">
              {hideBalance ? maskedValue : naira(pendingPayouts)}
            </p>
            <p className="mt-2 flex-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
              {pendingPayouts > 0
                ? `${pendingWithdrawalRequests.length} request${pendingWithdrawalRequests.length === 1 ? '' : 's'} awaiting bank confirmation.`
                : 'Nothing pending. Approved payouts show here until Paystack confirms.'}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-bold text-ink-400 dark:text-ink-500">
              <ShieldCheck className="h-3 w-3" />
              Released only after delivery
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Pending earnings', value: escrow.pendingEarnings, hint: 'Released after buyer confirmation' },
            { label: 'Total earnings', value: totalEarnings, hint: 'Net of marketplace fees' },
            { label: 'Total sales', value: totalSales, hint: 'Paid seller orders' },
            { label: 'Withdrawn', value: lifetimeWithdrawn, hint: 'Provider-confirmed payouts' },
          ].map((item) => (
            <Card key={item.label} className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                {item.label}
              </p>
              <p className="mt-1.5 font-mono text-xl font-bold text-ink-900 dark:text-white">
                {hideBalance ? maskedValue : naira(item.value)}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-400 dark:text-ink-500">{item.hint}</p>
            </Card>
          ))}
        </div>

        {buyerPendingOrders.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 p-5 dark:border-ink-800">
              <div>
                <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">Pay an order with your wallet</h2>
                <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                  Eligible pending orders. The server debits your available balance and locks the payment in escrow.
                </p>
              </div>
              <span className="rounded-full bg-gold-400/15 px-2.5 py-1 text-[10px] font-bold text-gold-700 dark:text-gold-300">
                {buyerPendingOrders.length} awaiting payment
              </span>
            </div>
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {buyerPendingOrders.map((order) => {
                const canAfford = balance >= order.totalAmount;
                return (
                  <li key={order.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-900 dark:text-white">{order.productTitle}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-500 dark:text-ink-400">
                        {order.orderNumber} · {naira(order.totalAmount)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="w-full shrink-0 sm:w-auto"
                      disabled={!canAfford || payingOrderId === order.id}
                      onClick={() => void handlePayOrder(order.id)}
                    >
                      {payingOrderId === order.id ? 'Paying…' : canAfford ? 'Pay with wallet' : 'Insufficient balance'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {(walletStatus?.funding || []).some((entry) => entry.status !== 'SUCCESS') && (
          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 p-4 dark:border-ink-800">
              <h2 className="font-display text-sm font-bold text-ink-900 dark:text-white">Funding attempts</h2>
              <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                Pending and failed Paystack attempts are not added to your balance.
              </p>
            </div>
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {(walletStatus?.funding || [])
                .filter((entry) => entry.status !== 'SUCCESS')
                .slice(0, 5)
                .map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-ink-900 dark:text-white">{naira(entry.amount)}</p>
                      <p className="truncate font-mono text-[10px] text-ink-400">{entry.reference}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${entry.status === 'PENDING' ? 'bg-gold-400/15 text-gold-700 dark:text-gold-300' : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'}`}>
                      {entry.status.toLowerCase()}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Withdraw */}
          <div ref={payoutRef} className="lg:col-span-2">
            <Card className="overflow-hidden">
              <div className="flex items-start gap-3 border-b border-ink-100 p-5 dark:border-ink-800">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-jade-500/10 text-jade-700 dark:text-jade-300">
                  <Banknote className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold tracking-tight text-ink-900 dark:text-white">
                    Withdraw to bank
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    Minimum {naira(minWithdrawal)} · fee {naira(withdrawalFee)} · reviewed before payout
                  </p>
                </div>
                {wallet?.bankName && wallet?.bankAccountName && wallet?.bankAccountNumber && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-jade-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-jade-700 dark:text-jade-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Saved
                  </span>
                )}
              </div>

              <form onSubmit={handleWithdraw} className="space-y-4 p-5">
                <div>
                  <label
                    htmlFor="withdraw-amount"
                    className="mb-1.5 block text-xs font-bold tracking-wide text-ink-600 dark:text-ink-300"
                  >
                    Amount
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-ink-400">
                      ₦
                    </span>
                    <input
                      ref={amountRef}
                      id="withdraw-amount"
                      inputMode="numeric"
                      autoComplete="off"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
                      placeholder="0"
                      aria-invalid={!!amountError}
                      aria-describedby="withdraw-amount-help"
                      className="h-12 w-full rounded-2xl border border-ink-200 bg-white pl-8 pr-16 font-mono text-lg font-bold text-ink-900 transition-colors focus-ring dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(String(Math.floor(Math.min(balance, maxWithdrawal))))}
                      disabled={balance < minWithdrawal}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-jade-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-jade-700 transition-colors hover:bg-jade-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-jade-300"
                    >
                      Max
                    </button>
                  </div>

                  <div
                    id="withdraw-amount-help"
                    className="mt-1.5 flex items-start justify-between gap-3 text-[11px]"
                  >
                    <span className="text-ink-500 dark:text-ink-400">
                      Available {hideBalance ? '••••' : naira(balance)}
                    </span>
                    {amountError ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {amountError}
                      </span>
                    ) : (
                      <span className="text-ink-400 dark:text-ink-500">
                        {parsedAmount > 0 && Number.isFinite(parsedAmount)
                          ? naira(parsedAmount)
                          : `Min ${naira(minWithdrawal)}`}
                      </span>
                    )}
                  </div>

                  {quickAmounts.length > 0 && (
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    {quickAmounts.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => setAmount(String(option.value))}
                        className={`rounded-xl border px-2 py-1.5 text-[11px] font-bold transition-all press-scale focus-ring ${
                          amount === String(option.value)
                            ? 'border-jade-500 bg-jade-500/10 text-jade-700 dark:border-jade-400 dark:text-jade-300'
                            : 'border-ink-200 bg-white text-ink-600 hover:border-jade-400 dark:border-ink-800 dark:bg-ink-950 dark:text-ink-300'
                        }`}
                      >
                        {option.label}
                        <span className="ml-1 font-mono text-[9px] font-semibold opacity-60">
                          {option.value >= 1000 ? `${Math.round(option.value / 1000)}k` : option.value}
                        </span>
                      </button>
                    ))}
                  </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="withdraw-bank"
                    className="mb-1.5 block text-xs font-bold tracking-wide text-ink-600 dark:text-ink-300"
                  >
                    Bank
                  </label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      id="withdraw-bank"
                      list="goodsale-banks"
                      value={bank}
                      onChange={(event) => setBank(event.target.value)}
                      placeholder="Start typing your bank"
                      className="h-11 w-full rounded-2xl border border-ink-200 bg-white pl-10 pr-4 text-sm font-semibold text-ink-900 transition-colors focus-ring dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                    />
                    <datalist id="goodsale-banks">
                      {NIGERIAN_BANKS.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="withdraw-account-name"
                    className="mb-1.5 block text-xs font-bold tracking-wide text-ink-600 dark:text-ink-300"
                  >
                    Account name
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      id="withdraw-account-name"
                      value={accountName}
                      onChange={(event) => setAccountName(event.target.value)}
                      placeholder="Exactly as it appears at your bank"
                      className="h-11 w-full rounded-2xl border border-ink-200 bg-white pl-10 pr-4 text-sm font-semibold text-ink-900 transition-colors focus-ring dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label
                      htmlFor="withdraw-account-number"
                      className="block text-xs font-bold tracking-wide text-ink-600 dark:text-ink-300"
                    >
                      Account number
                    </label>
                    <span className="font-mono text-[10px] font-semibold text-ink-400 dark:text-ink-500">
                      {accountNumber.length}/10
                    </span>
                  </div>
                  <div className="relative">
                    <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      id="withdraw-account-number"
                      inputMode="numeric"
                      autoComplete="off"
                      value={accountNumber}
                      onChange={(event) =>
                        setAccountNumber(event.target.value.replace(/[^\d]/g, '').slice(0, 10))
                      }
                      placeholder="10-digit NUBAN"
                      aria-invalid={accountNumber.length > 0 && !accountNumberValid}
                      className="h-11 w-full rounded-2xl border border-ink-200 bg-white pl-10 pr-4 font-mono text-sm font-bold tracking-[0.12em] text-ink-900 transition-colors focus-ring dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                    />
                  </div>
                  {accountNumber.length > 0 && !accountNumberValid && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                      <AlertCircle className="h-3 w-3" />
                      Enter the full 10-digit account number.
                    </p>
                  )}
                </div>

                {withdrawalFee > 0 && (
                  <div className="space-y-1 rounded-xl border border-ink-150 bg-ink-50/60 px-3.5 py-3 text-[11px] dark:border-ink-800 dark:bg-ink-950/40">
                    <div className="flex justify-between gap-3 text-ink-500 dark:text-ink-400">
                      <span>Withdrawal fee</span>
                      <span className="font-mono font-bold text-ink-800 dark:text-ink-200">{naira(withdrawalFee)}</span>
                    </div>
                    <div className="flex justify-between gap-3 font-bold text-ink-900 dark:text-white">
                      <span>You receive</span>
                      <span className="font-mono">{naira(Math.max(0, parsedAmount - withdrawalFee))}</span>
                    </div>
                  </div>
                )}

                {walletStatus?.payoutsAvailable === false && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Bank payouts are unavailable until Paystack is configured. You can still view and use your wallet balance.
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!canSubmit || submitting || walletStatus?.payoutsAvailable === false}
                  className="w-full"
                  size="lg"
                >
                  {walletStatus?.payoutsAvailable === false
                    ? 'Payouts unavailable'
                    : canSubmit
                      ? `Review ${naira(parsedAmount)} payout`
                      : 'Withdraw to bank'}
                </Button>

                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-600 dark:text-jade-400" />
                  These bank details are saved to your wallet for next time. Payouts only use money
                  already released from escrow.
                </p>
              </form>
            </Card>
          </div>

          {/* Escrow + ledger */}
          <div className="space-y-6 lg:col-span-3">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-ink-100 p-5 dark:border-ink-800">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-jade-500/10 text-jade-700 dark:text-jade-300">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                      Escrow breakdown
                    </h2>
                    <p className="text-[11px] text-ink-500 dark:text-ink-400">
                      Money waiting on delivery confirmation
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-ink-200 px-2.5 py-1 font-mono text-[10px] font-bold text-ink-500 dark:border-ink-700 dark:text-ink-400">
                  {escrow.rows.length} active
                </span>
              </div>

              {escrow.rows.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-white/5 dark:text-ink-500">
                    <Lock className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">
                    No money in escrow
                  </p>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    Nothing is being held for or from you right now.
                  </p>
                </div>
              ) : (
                <ul className="max-h-72 divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
                  {escrow.rows.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink-900 dark:text-white">
                          {row.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-500 dark:text-ink-400">
                          {row.number} ·{' '}
                          {row.role === 'SELLER' ? 'releases on buyer PIN' : 'held for delivery'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold text-ink-900 dark:text-white">
                          {hideBalance ? '₦••••' : naira(row.amount)}
                        </p>
                        <span
                          className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold ${
                            row.role === 'SELLER'
                              ? 'text-jade-700 dark:text-jade-300'
                              : 'text-ink-500 dark:text-ink-400'
                          }`}
                        >
                          {row.role === 'SELLER' ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          {row.role === 'SELLER' ? 'Incoming' : 'Protected'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b border-ink-100 p-5 dark:border-ink-800">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-100 text-ink-600 dark:bg-white/5 dark:text-ink-300">
                      <ReceiptText className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                        Transactions
                      </h2>
                      <p className="text-[11px] text-ink-500 dark:text-ink-400">
                        {hideBalance
                          ? '•••• received · •••• withdrawn'
                          : `${naira(lifetimeReceived)} received · ${naira(lifetimeWithdrawn)} withdrawn`}
                      </p>
                    </div>
                  </div>
                  <SegmentedControl
                    aria-label="Transaction filter"
                    className="sm:w-64"
                    value={txFilter}
                    onChange={(value) => {
                      setTxFilter(value as TxFilter);
                      setShowAllTx(false);
                    }}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'credit', label: 'In' },
                      { value: 'debit', label: 'Out' },
                    ]}
                  />
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <EmptyState
                  state="empty-cart"
                  size="sm"
                  icon={<WalletIcon />}
                  title={txFilter === 'all' ? 'No transactions yet' : 'No matching transactions'}
                  description={
                    txFilter === 'all'
                      ? 'Escrow releases, fees and payouts will appear here.'
                      : 'Try another filter to see more of your wallet activity.'
                  }
                />
              ) : (
                <>
                  <div>
                    {groupedTransactions.map((group) => (
                      <section key={group.label} aria-label={group.label}>
                        <div className="sticky top-0 z-10 flex items-center justify-between border-y border-ink-100 bg-ink-50/90 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400 backdrop-blur first:border-t-0 dark:border-ink-800 dark:bg-ink-950/70 dark:text-ink-500">
                          <span>{group.label}</span>
                          <span className="font-mono text-[9px] tracking-normal">
                            {group.items.length}
                          </span>
                        </div>
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800/70">
                          {group.items.map((entry) => {
                            const isCredit = entry.amount > 0;
                            return (
                              <li
                                key={entry.id}
                                className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-ink-50/70 dark:hover:bg-ink-800/30"
                              >
                                <span
                                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                                    isCredit
                                      ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                                      : 'bg-ink-100 text-ink-600 dark:bg-white/5 dark:text-ink-300'
                                  }`}
                                >
                                  {isCredit ? (
                                    <ArrowDownLeft className="h-4 w-4" />
                                  ) : (
                                    <ArrowUpRight className="h-4 w-4" />
                                  )}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold text-ink-900 dark:text-white">
                                    {entry.description}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-500 dark:text-ink-400">
                                    <span className="truncate">{transactionLabel(entry.type)}</span>
                                    <span aria-hidden="true">·</span>
                                    {timeLabel(entry.createdAt) && (
                                      <span className="shrink-0">{timeLabel(entry.createdAt)}</span>
                                    )}
                                  </p>
                                  {(entry.reference || entry.providerReference) && (
                                    <p className="mt-0.5 truncate font-mono text-[9px] text-ink-400 dark:text-ink-500">
                                      {entry.providerReference || entry.reference}
                                    </p>
                                  )}
                                </div>

                                <div className="shrink-0 text-right">
                                  <p
                                    className={`font-mono text-sm font-bold ${
                                      isCredit
                                        ? 'text-jade-700 dark:text-jade-300'
                                        : 'text-ink-900 dark:text-white'
                                    }`}
                                  >
                                    {isCredit ? '+' : '−'}
                                    {naira(entry.amount)}
                                  </p>
                                  <span
                                    className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                      entry.status === 'COMPLETED'
                                        ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                                        : entry.status === 'PENDING' || entry.status === 'PROCESSING'
                                          ? 'bg-gold-400/15 text-gold-700 dark:text-gold-300'
                                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                                    }`}
                                  >
                                    {entry.status === 'COMPLETED' ? (
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                    ) : entry.status === 'PENDING' || entry.status === 'PROCESSING' ? (
                                      <Clock3 className="h-2.5 w-2.5" />
                                    ) : (
                                      <AlertCircle className="h-2.5 w-2.5" />
                                    )}
                                    {entry.status.toLowerCase()}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>

                  {filteredTransactions.length > TX_PAGE_SIZE && (
                    <button
                      type="button"
                      onClick={() => setShowAllTx((value) => !value)}
                      className="flex w-full items-center justify-center gap-1.5 border-t border-ink-100 px-5 py-3 text-xs font-bold text-jade-700 transition-colors hover:bg-jade-500/5 dark:border-ink-800 dark:text-jade-300"
                    >
                      {showAllTx ? (
                        'Show fewer transactions'
                      ) : (
                        <>
                          Show all {filteredTransactions.length} transactions
                          <ChevronRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </Card>

            {myWithdrawals.length > 0 && (
              <Card className="overflow-hidden">
                <div className="border-b border-ink-100 p-5 dark:border-ink-800">
                  <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">Payout history</h2>
                  <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
                    Pending and processing payouts are not successful until Paystack confirms them.
                  </p>
                </div>
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {myWithdrawals
                    .slice()
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, 8)
                    .map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-ink-900 dark:text-white">{entry.requestNumber}</p>
                          <p className="mt-0.5 truncate text-[10px] text-ink-500 dark:text-ink-400">
                            {entry.bankName} ••••{entry.accountNumber.slice(-4)} · {new Date(entry.createdAt).toLocaleDateString('en-NG')}
                          </p>
                          {entry.providerReference && <p className="truncate font-mono text-[9px] text-ink-400">{entry.providerReference}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-sm font-bold text-ink-900 dark:text-white">{naira(entry.amount)}</p>
                          <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            entry.status === 'SUCCESS'
                              ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                              : entry.status === 'FAILED' || entry.status === 'REJECTED'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                                : 'bg-gold-400/15 text-gold-700 dark:text-gold-300'
                          }`}>
                            {entry.status.toLowerCase()}
                          </span>
                        </div>
                      </li>
                    ))}
                </ul>
              </Card>
            )}

            <Card className="overflow-hidden">
              <div className="border-b border-ink-100 p-5 dark:border-ink-800">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-100 text-ink-600 dark:bg-white/5 dark:text-ink-300">
                    <Settings2 className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">Wallet settings</h2>
                    <p className="text-[11px] text-ink-500 dark:text-ink-400">Privacy, payout readiness and saved bank account.</p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-xs font-bold text-ink-900 dark:text-white">Hide my balance</p>
                    <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">Masks amounts on this device. Saved as a privacy preference.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={hideBalance}
                    onClick={toggleBalance}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${hideBalance ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-700'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${hideBalance ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink-900 dark:text-white">Saved bank account</p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-500 dark:text-ink-400">
                      {wallet?.bankName && wallet?.bankAccountNumber
                        ? `${wallet.bankName} ••••${wallet.bankAccountNumber.slice(-4)}`
                        : 'No bank account saved yet'}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={focusPayoutForm}>Manage</Button>
                </div>
                <div className="p-4">
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    GoodSale never asks for your bank PIN or password. Payouts are only marked successful after Paystack confirms them.
                  </p>
                </div>
              </div>
            </Card>

            <Card variant="muted" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gold-400/15 text-gold-700 dark:text-gold-300">
                <Coins className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold text-ink-900 dark:text-white">GoodSale Coins</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                  {coinsBalance.toLocaleString('en-NG')} promotional coins. Coins are rewards only — they are not cash, cannot be withdrawn, and are never mixed with your wallet balance.
                </p>
              </div>
              {onNavigate && (
                <Button size="sm" variant="ghost" onClick={() => onNavigate('rewards')}>
                  View rewards
                </Button>
              )}
            </Card>

            <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Escrow protects the buyer until the delivery PIN is confirmed. Wallet balances are stored in GoodSale&apos;s ledger; funding and payouts are settled by Paystack under its licensed payment structure.
            </p>
          </div>
        </div>
      </div>

      <WithdrawReviewDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => void submitWithdrawal()}
        submitting={submitting}
        amount={parsedAmount}
        availableBalance={balance}
        fee={withdrawalFee}
        bank={bank.trim()}
        accountName={accountName.trim()}
        accountNumber={accountNumber.trim()}
      />

      <AddFundsDialog
        open={addFundsOpen}
        onClose={() => setAddFundsOpen(false)}
        onFunded={async () => {
          await reloadFromSupabase();
          await refreshWalletStatus();
        }}
        email={user.email || ''}
        min={walletStatus?.limits.funding_min ?? 100}
        max={walletStatus?.limits.funding_max ?? 500000}
        enabled={walletStatus?.fundingAvailable === true}
      />
    </div>
  );
}
