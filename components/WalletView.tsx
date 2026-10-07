// components/WalletView.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet as WalletIcon, ShieldCheck, ArrowDownToLine, ArrowUpRight, ArrowDownLeft,
  Landmark, Clock, CheckCircle2, AlertCircle, Lock, Settings2, PiggyBank,
  Building2, User as UserIcon, Hash, Info
} from 'lucide-react';
import { useDBState, dbOperations } from '../lib/store';
import EmptyState from './ui/EmptyState';
import Toast from './ui/Toast';
import SegmentedControl from './ui/SegmentedControl';
import Button from './ui/Button';
import Card from './ui/Card';
import Meter from './ui/Meter';

type WalletMode = 'wallet' | 'direct';
type TxFilter = 'all' | 'credit' | 'debit';

interface WalletViewProps {
  onNavigate?: (view: string, payload?: any) => void;
  onOpenAuth?: () => void;
}

const MODE_KEY = 'goodsale_wallet_mode';
const MIN_WITHDRAWAL = 1000;

export default function WalletView({ onNavigate, onOpenAuth }: WalletViewProps) {
  const db = useDBState();
  const user = db.currentUser;

  const [mode, setMode] = useState<WalletMode>('wallet');
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; msg: string } | null>(null);

  // Wallet settlement preference — "use the wallet" or "settle straight to bank".
  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === 'wallet' || saved === 'direct') setMode(saved);
  }, []);

  const changeMode = (next: WalletMode) => {
    setMode(next);
    window.localStorage.setItem(MODE_KEY, next);
    setToast({
      kind: 'info',
      msg:
        next === 'wallet'
          ? 'Wallet mode on: escrow releases settle into your GoodSale wallet.'
          : 'Bank-direct mode on: escrow releases go straight to your bank account.',
    });
  };

  const wallet = useMemo(
    () => (user ? db.wallets.find((w) => w.userId === user.id) : undefined),
    [db.wallets, user]
  );

  const transactions = useMemo(() => {
    if (!wallet) return [];
    return db.walletTransactions
      .filter((t) => t.walletId === wallet.id)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [db.walletTransactions, wallet]);

  const { escrowAsSeller, escrowAsBuyer, escrowRows } = useMemo(() => {
    if (!user) return { escrowAsSeller: 0, escrowAsBuyer: 0, escrowRows: [] as Array<{ id: number; title: string; amount: number; role: 'SELLER' | 'BUYER'; number: string }> };
    let asSeller = 0;
    let asBuyer = 0;
    const rows: Array<{ id: number; title: string; amount: number; role: 'SELLER' | 'BUYER'; number: string }> = [];
    db.escrows.forEach((escrow) => {
      if (escrow.isReleased || escrow.isRefunded) return;
      const order = db.orders.find((o) => o.id === escrow.orderId);
      if (!order) return;
      if (order.sellerId === user.id) {
        asSeller += escrow.heldAmount;
        rows.push({ id: escrow.id, title: order.productTitle, amount: escrow.heldAmount, role: 'SELLER', number: order.orderNumber });
      } else if (order.buyerId === user.id) {
        asBuyer += escrow.heldAmount;
        rows.push({ id: escrow.id, title: order.productTitle, amount: escrow.heldAmount, role: 'BUYER', number: order.orderNumber });
      }
    });
    return { escrowAsSeller: asSeller, escrowAsBuyer: asBuyer, escrowRows: rows };
  }, [db.escrows, db.orders, user]);

  // Prefill the payout form from saved wallet bank details.
  useEffect(() => {
    if (!wallet) return;
    setBank((prev) => prev || wallet.bankName || '');
    setAccountName((prev) => prev || wallet.bankAccountName || '');
    setAccountNumber((prev) => prev || wallet.bankAccountNumber || '');
  }, [wallet]);

  const balance = wallet?.balance ?? 0;
  const pendingPayouts = transactions
    .filter((t) => t.type === 'DEBIT_WITHDRAWAL' && t.status === 'PENDING')
    .reduce((sum, t) => sum + t.amount, 0);

  const filteredTransactions = transactions.filter((t) => {
    if (txFilter === 'all') return true;
    if (txFilter === 'credit') return t.type.startsWith('CREDIT');
    return t.type.startsWith('DEBIT');
  });

  const parsedAmount = Number(amount);
  const amountError =
    amount.trim().length === 0
      ? null
      : !Number.isFinite(parsedAmount) || parsedAmount <= 0
        ? 'Enter a valid amount.'
        : parsedAmount < MIN_WITHDRAWAL
          ? `Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}.`
          : parsedAmount > balance
            ? 'Amount exceeds your available balance.'
            : null;

  const canSubmit =
    !!user &&
    !submitting &&
    !amountError &&
    parsedAmount >= MIN_WITHDRAWAL &&
    parsedAmount <= balance &&
    bank.trim().length > 1 &&
    accountName.trim().length > 1 &&
    /^\d{10}$/.test(accountNumber.trim());

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canSubmit) return;
    setSubmitting(true);
    try {
      const result = await dbOperations.withdrawFromWallet(user.id, parsedAmount, {
        bank: bank.trim(),
        name: accountName.trim(),
        number: accountNumber.trim(),
      });
      if (result.success) {
        setToast({
          kind: 'success',
          msg: `Payout of ₦${parsedAmount.toLocaleString()} requested — funds leave escrow to your bank.`,
        });
        setAmount('');
      } else {
        setToast({ kind: 'error', msg: result.message || 'Withdrawal could not be completed.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="bg-ink-50 dark:bg-ink-950 min-h-screen flex items-center justify-center px-4">
        <EmptyState
          state="empty-chat"
          icon={<WalletIcon />}
          title="Sign in to open your wallet"
          description="Your balance, escrow and payouts live behind your GoodSale account."
          action={
            <Button onClick={() => onOpenAuth?.()} className="tracking-wide">
              Sign in
            </Button>
          }
        />
      </div>
    );
  }

  const utilisation = escrowAsSeller + escrowAsBuyer > 0 ? (escrowAsSeller / (escrowAsSeller + escrowAsBuyer)) * 100 : 0;

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen pb-16 transition-colors duration-300">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h1 className="font-display font-bold text-3xl tracking-tight text-ink-900 dark:text-white animate-title-collapse">
              Wallet
            </h1>
            <p className="text-sm text-ink-500 mt-1.5">
              Your GoodSale balance, escrow exposure and instant bank payouts.
            </p>
          </div>
          <div className="w-full lg:w-auto lg:min-w-[340px]">
            <SegmentedControl
              aria-label="Settlement mode"
              value={mode}
              onChange={(v) => changeMode(v as WalletMode)}
              options={[
                { value: 'wallet', label: 'Use wallet', icon: <WalletIcon className="w-3.5 h-3.5" /> },
                { value: 'direct', label: 'Bank direct', icon: <Landmark className="w-3.5 h-3.5" /> },
              ]}
            />
            <p className="mt-2 text-xs text-ink-500 text-center lg:text-right">
              {mode === 'wallet'
                ? 'Escrow releases accumulate in your wallet, then you withdraw.'
                : 'Escrow releases settle straight to your saved bank account.'}
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative overflow-hidden rounded-3xl aurora-bg bg-ink-950 border border-jade-500/20 p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest font-mono font-bold text-jade-400">
                Available balance
              </span>
              <PiggyBank className="w-5 h-5 text-jade-400" />
            </div>
            <p className="mt-4 font-mono font-bold text-3xl">₦{balance.toLocaleString()}</p>
            <p className="mt-2 text-xs text-ink-300">
              {mode === 'wallet' ? 'Ready to withdraw any time' : 'Bank-direct settlement is active'}
            </p>
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest font-mono font-bold text-ink-500">
                Held in escrow
              </span>
              <Lock className="w-5 h-5 text-jade-600 dark:text-jade-400" />
            </div>
            <p className="mt-4 font-mono font-bold text-3xl text-ink-900 dark:text-white">
              ₦{(escrowAsSeller + escrowAsBuyer).toLocaleString()}
            </p>
            <div className="mt-3 space-y-1.5 text-xs text-ink-500">
              <p className="flex justify-between gap-3">
                <span>Awaiting your buyer&apos;s PIN</span>
                <span className="font-mono font-bold text-ink-800 dark:text-ink-200">
                  ₦{escrowAsSeller.toLocaleString()}
                </span>
              </p>
              <p className="flex justify-between gap-3">
                <span>You paid, awaiting delivery</span>
                <span className="font-mono font-bold text-ink-800 dark:text-ink-200">
                  ₦{escrowAsBuyer.toLocaleString()}
                </span>
              </p>
            </div>
            {escrowAsSeller + escrowAsBuyer > 0 && (
              <Meter className="mt-4" value={utilisation} tone="jade" />
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-widest font-mono font-bold text-ink-500">
                Payouts in progress
              </span>
              <Clock className="w-5 h-5 text-ink-500" />
            </div>
            <p className="mt-4 font-mono font-bold text-3xl text-ink-900 dark:text-white">
              ₦{pendingPayouts.toLocaleString()}
            </p>
            <p className="mt-2 text-xs text-ink-500">
              {pendingPayouts > 0 ? 'Confirming with your bank' : 'Nothing pending'}
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Withdraw */}
          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDownToLine className="w-5 h-5 text-jade-600 dark:text-jade-400" />
              <h2 className="font-display font-bold text-lg text-ink-900 dark:text-white">
                Withdraw to bank
              </h2>
            </div>
            <p className="text-sm text-ink-500 mb-5">
              Instant payout requests, minimum ₦{MIN_WITHDRAWAL.toLocaleString()}.
            </p>

            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-xs font-bold tracking-wider text-ink-500 mb-1.5">
                  Amount (₦)
                </label>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="0"
                  className="w-full rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-950 px-4 py-3 font-mono font-bold text-ink-900 dark:text-white focus-ring"
                />
                {amountError && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-ink-500">
                    <AlertCircle className="w-3.5 h-3.5" /> {amountError}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  {[25, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setAmount(String(Math.floor((balance * pct) / 100)))}
                      className="flex-1 rounded-xl bg-ink-100 dark:bg-ink-800 px-2 py-1.5 text-xs font-bold text-ink-600 dark:text-ink-300 hover:bg-ink-150 dark:hover:bg-ink-750 transition-colors press-scale focus-ring cursor-pointer"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold tracking-wider text-ink-500 mb-1.5">
                  Bank
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    placeholder="e.g. GTBank"
                    className="w-full rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-950 pl-10 pr-4 py-3 text-sm font-semibold text-ink-900 dark:text-white focus-ring"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold tracking-wider text-ink-500 mb-1.5">
                  Account name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="As it appears at the bank"
                    className="w-full rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-950 pl-10 pr-4 py-3 text-sm font-semibold text-ink-900 dark:text-white focus-ring"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold tracking-wider text-ink-500 mb-1.5">
                  Account number
                </label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    inputMode="numeric"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                    placeholder="10 digits"
                    className="w-full rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-950 pl-10 pr-4 py-3 font-mono font-bold text-ink-900 dark:text-white focus-ring"
                  />
                </div>
              </div>

              <Button type="submit" loading={submitting} disabled={!canSubmit} className="w-full">
                {submitting ? 'Requesting payout…' : `Withdraw ₦${(Number(amount) || 0).toLocaleString()}`}
              </Button>

              <p className="flex items-start gap-2 text-xs text-ink-500 leading-relaxed">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-jade-600 dark:text-jade-400" />
                Payouts are only made from money already released from escrow — funds still held by a
                buyer&apos;s PIN stay untouchable.
              </p>
            </form>
          </Card>

          {/* Escrow + transactions */}
          <div className="lg:col-span-3 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-jade-600 dark:text-jade-400" />
                  <h2 className="font-display font-bold text-lg text-ink-900 dark:text-white">
                    Escrow breakdown
                  </h2>
                </div>
                <span className="font-mono text-xs font-bold text-ink-500">
                  {escrowRows.length} active
                </span>
              </div>

              {escrowRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-ink-300 dark:border-ink-700 px-4 py-8 text-center">
                  <p className="text-sm font-bold text-ink-700 dark:text-ink-200">No money in escrow</p>
                  <p className="text-xs text-ink-500 mt-1">
                    Nothing is being held for or from you right now.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-ink-100 dark:divide-ink-800 list-stagger">
                  {escrowRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink-900 dark:text-white truncate">{row.title}</p>
                        <p className="font-mono text-xs text-ink-500">
                          {row.number} · {row.role === 'SELLER' ? 'releases on buyer PIN' : 'held for delivery'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold text-ink-900 dark:text-white">
                          ₦{row.amount.toLocaleString()}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-500">
                          <Lock className="w-3 h-3" /> {row.role === 'SELLER' ? 'Incoming' : 'Protected'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="font-display font-bold text-lg text-ink-900 dark:text-white">
                  Transactions
                </h2>
                <SegmentedControl
                  aria-label="Transaction filter"
                  className="sm:w-72"
                  value={txFilter}
                  onChange={(v) => setTxFilter(v as TxFilter)}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'credit', label: 'Credits' },
                    { value: 'debit', label: 'Debits' },
                  ]}
                />
              </div>

              {filteredTransactions.length === 0 ? (
                <EmptyState
                  state="empty-cart"
                  size="sm"
                  icon={<WalletIcon />}
                  title="No transactions yet"
                  description="Escrow releases, fees and payouts will appear here."
                />
              ) : (
                <div className="divide-y divide-ink-100 dark:divide-ink-800">
                  {filteredTransactions.map((tx) => {
                    const isCredit = tx.type.startsWith('CREDIT');
                    return (
                      <div key={tx.id} className="flex items-center gap-4 py-3.5">
                        <span
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            isCredit ? 'bg-jade-500/10 text-jade-600 dark:text-jade-400' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300'
                          }`}
                        >
                          {isCredit ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-ink-900 dark:text-white truncate">
                            {tx.description}
                          </p>
                          <p className="font-mono text-xs text-ink-500">
                            {tx.type.replace(/_/g, ' ').toLowerCase()} ·{' '}
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`font-mono font-bold ${
                              isCredit ? 'text-jade-600 dark:text-jade-400' : 'text-ink-900 dark:text-white'
                            }`}
                          >
                            {isCredit ? '+' : '−'}₦{tx.amount.toLocaleString()}
                          </p>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-500">
                            {tx.status === 'COMPLETED' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : tx.status === 'PENDING' ? (
                              <Clock className="w-3 h-3" />
                            ) : (
                              <AlertCircle className="w-3 h-3" />
                            )}
                            {tx.status.toLowerCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card variant="muted" className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <span className="w-10 h-10 rounded-2xl bg-white dark:bg-ink-900 flex items-center justify-center text-ink-500 shrink-0">
                <Settings2 className="w-5 h-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-bold text-ink-900 dark:text-white">
                  Prefer not to use the wallet?
                </p>
                <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                  Switch to <strong>Bank direct</strong> and every escrow release is settled to your
                  bank account instead of stacking up in the wallet. You can switch back any time.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant={mode === 'direct' ? 'secondary' : 'primary'}
                  onClick={() => changeMode(mode === 'direct' ? 'wallet' : 'direct')}
                >
                  {mode === 'direct' ? 'Reset to wallet' : 'Go bank-direct'}
                </Button>
                {onNavigate && (
                  <Button size="sm" variant="ghost" onClick={() => onNavigate('revenue')}>
                    Revenue hub
                  </Button>
                )}
              </div>
            </Card>

            <p className="flex items-start gap-2 text-xs text-ink-500 leading-relaxed px-1">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Wallet mode is a settlement preference on this device. Escrow itself always protects the
              buyer until the delivery PIN is confirmed.
            </p>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-5 z-50 pointer-events-none">
          <Toast kind={toast.kind}>{toast.msg}</Toast>
        </div>
      )}
    </div>
  );
}
