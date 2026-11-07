'use client';

import {
  Building2,
  CheckCircle2,
  Clock3,
  Hash,
  Landmark,
  Loader2,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';

const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

interface WithdrawReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  amount: number;
  availableBalance: number;
  fee?: number;
  bank: string;
  accountName: string;
  accountNumber: string;
}

export default function WithdrawReviewDialog({
  open,
  onClose,
  onConfirm,
  submitting,
  amount,
  availableBalance,
  fee = 0,
  bank,
  accountName,
  accountNumber,
}: WithdrawReviewDialogProps) {
  const remaining = Math.max(0, availableBalance - amount);
  const spacedNumber = accountNumber.replace(/(\d{4})(?=\d)/g, '$1 ');

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) onClose();
      }}
      title="Review your payout"
      description="Confirm the destination before we send this request to review."
    >
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-jade-500/25 bg-gradient-to-br from-jade-900 via-jade-950 to-ink-950 p-5 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border-[8px] border-gold-300/20"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-12 left-10 h-28 w-28 rounded-full bg-jade-500/25 blur-2xl"
          />
          <div className="relative">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-200/80">
              <Wallet className="h-3.5 w-3.5" /> Payout amount
            </p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-tight sm:text-4xl">
              {naira(amount)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-white/60">
              <Clock3 className="h-3.5 w-3.5" /> Stays pending until admin review and Paystack confirmation
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-150 bg-ink-50/70 dark:border-ink-800 dark:bg-ink-950/40">
          <div className="flex items-start gap-3 border-b border-ink-150 p-3.5 dark:border-ink-800">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-jade-700 shadow-sm dark:bg-ink-900 dark:text-jade-300">
              <Landmark className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Bank</p>
              <p className="mt-0.5 truncate text-sm font-bold text-ink-900 dark:text-white">{bank}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 border-b border-ink-150 p-3.5 dark:border-ink-800">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-jade-700 shadow-sm dark:bg-ink-900 dark:text-jade-300">
              <UserRound className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                Account name
              </p>
              <p className="mt-0.5 break-words text-sm font-bold text-ink-900 dark:text-white">
                {accountName}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-jade-700 shadow-sm dark:bg-ink-900 dark:text-jade-300">
              <Hash className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                Account number
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold tracking-[0.12em] text-ink-900 dark:text-white">
                {spacedNumber}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-ink-150 px-3.5 py-3 text-xs dark:border-ink-800">
          {fee > 0 && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">Withdrawal fee</span>
                <span className="font-mono font-bold text-ink-900 dark:text-white">{naira(fee)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">You receive</span>
                <span className="font-mono font-bold text-jade-700 dark:text-jade-300">
                  {naira(Math.max(0, amount - fee))}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-ink-150 pt-2 dark:border-ink-800">
            <span className="flex items-center gap-2 text-ink-500 dark:text-ink-400">
              <Building2 className="h-4 w-4 shrink-0" />
              Balance after request
            </span>
            <span className="font-mono font-bold text-ink-900 dark:text-white">{naira(remaining)}</span>
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-gold-400/10 px-3.5 py-3 text-[11px] leading-relaxed text-gold-800 dark:text-gold-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          Double-check these details. Bank transfers cannot be reversed after they are sent. Your
          payout request is reviewed before money leaves GoodSale.
        </p>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="w-full sm:w-auto" disabled={submitting} onClick={onClose}>
            Go back
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={submitting || amount <= 0}
            onClick={onConfirm}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? 'Sending request…' : 'Request payout'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
