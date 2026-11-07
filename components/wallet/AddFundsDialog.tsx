'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: Record<string, unknown>) => { openIframe: () => void };
    };
  }
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Paystack requires a browser'));
      return;
    }
    if (window.PaystackPop) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack-inline]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Paystack')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.dataset.paystackInline = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Paystack Inline'));
    document.body.appendChild(script);
  });
}

interface AddFundsDialogProps {
  open: boolean;
  onClose: () => void;
  onFunded: () => void | Promise<void>;
  email: string;
  min: number;
  max: number;
  enabled: boolean;
}

export default function AddFundsDialog({
  open,
  onClose,
  onFunded,
  email,
  min,
  max,
  enabled,
}: AddFundsDialogProps) {
  const [amount, setAmount] = useState('5000');
  const [step, setStep] = useState<'FORM' | 'OPENING' | 'VERIFYING' | 'SUCCESS'>('FORM');
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount);
  const amountError =
    !Number.isFinite(parsed) || parsed <= 0
      ? 'Enter a valid amount.'
      : parsed < min
        ? `Minimum funding is ${naira(min)}.`
        : parsed > max
          ? `Maximum funding is ${naira(max)}.`
          : null;

  const reset = () => {
    setStep('FORM');
    setError(null);
  };

  const close = () => {
    if (step === 'OPENING' || step === 'VERIFYING') return;
    reset();
    onClose();
  };

  const verify = async (reference: string) => {
    setStep('VERIFYING');
    setError(null);
    try {
      const res = await fetch('/api/wallet/fund/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setStep('FORM');
        setError(payload.error || 'Paystack has not confirmed this payment yet. No balance was added.');
        return;
      }
      setStep('SUCCESS');
      await onFunded();
    } catch {
      setStep('FORM');
      setError('Verification could not be completed. Contact support with your payment reference.');
    }
  };

  const start = async () => {
    if (!enabled || amountError) return;
    setError(null);
    setStep('OPENING');
    try {
      const res = await fetch('/api/wallet/fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parsed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setStep('FORM');
        setError(payload.error || 'Wallet funding is unavailable right now.');
        return;
      }

      await loadPaystackScript();
      if (!window.PaystackPop) throw new Error('Paystack Inline unavailable');

      const handler = window.PaystackPop.setup({
        key: payload.publicKey,
        email: payload.email || email,
        amount: Math.round(parsed * 100),
        currency: 'NGN',
        ref: payload.reference,
        metadata: {
          purpose: 'WALLET_FUNDING',
          wallet_funding_id: payload.intentId,
          reference: payload.reference,
          custom_fields: [
            { display_name: 'Platform', variable_name: 'platform', value: 'GoodSale' },
            { display_name: 'Wallet', variable_name: 'wallet', value: 'GoodSale Wallet' },
          ],
        },
        callback: (response: { reference: string }) => {
          void verify(response.reference);
        },
        onClose: () => {
          setStep('FORM');
          setError('Checkout closed. Your wallet was not credited.');
        },
      });
      handler.openIframe();
    } catch (err) {
      setStep('FORM');
      setError(err instanceof Error ? err.message : 'Could not open Paystack checkout.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add money to your wallet"
      description="Paystack handles the payment. Your wallet is credited only after server verification."
    >
      <div className="space-y-4">
        {!enabled && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Wallet funding is unavailable because Paystack is not configured for this deployment.
              Add <code className="font-mono">NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY</code> and{' '}
              <code className="font-mono">PAYSTACK_SECRET_KEY</code> to enable it.
            </span>
          </div>
        )}

        {step === 'SUCCESS' ? (
          <div className="py-6 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-jade-500/10 text-jade-600 dark:text-jade-300">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold text-ink-900 dark:text-white">
              Wallet funded
            </h3>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              {naira(parsed)} was confirmed by Paystack and added to your available balance.
            </p>
            <Button className="mt-5 w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-ink-150 bg-ink-50/60 p-4 dark:border-ink-800 dark:bg-ink-950/40">
              <label htmlFor="wallet-fund-amount" className="text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                Amount to add
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-xl font-bold text-ink-400">
                  ₦
                </span>
                <input
                  id="wallet-fund-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
                  disabled={!enabled || step !== 'FORM'}
                  className="h-14 w-full rounded-2xl border border-ink-200 bg-white pl-9 pr-4 font-mono text-xl font-bold text-ink-900 focus-ring disabled:opacity-60 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                <span className="text-ink-500 dark:text-ink-400">
                  {naira(min)} – {naira(max)}
                </span>
                {amountError && (
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                    <AlertCircle className="h-3 w-3" /> {amountError}
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[2000, 5000, 10000].map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!enabled || step !== 'FORM' || value < min || value > max}
                    onClick={() => setAmount(String(value))}
                    className="rounded-xl border border-ink-200 bg-white px-2 py-2 text-xs font-bold text-ink-700 hover:border-jade-400 disabled:opacity-40 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
                  >
                    {naira(value)}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-jade-500/20 bg-jade-500/5 p-3.5 text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-600" />
                Card details stay inside Paystack&apos;s PCI-compliant checkout. GoodSale never sees your PIN or CVV.
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-600" />
                The amount, reference and wallet owner are re-checked server-side before any credit.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" className="w-full sm:w-auto" onClick={close} disabled={step !== 'FORM'}>
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => void start()}
                disabled={!enabled || !!amountError || step !== 'FORM'}
              >
                {step === 'FORM' ? (
                  <Wallet className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {step === 'VERIFYING'
                  ? 'Verifying payment…'
                  : step === 'OPENING'
                    ? 'Opening Paystack…'
                    : `Add ${parsed > 0 ? naira(parsed) : 'money'}`}
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-[10px] text-ink-400">
              <CreditCard className="h-3 w-3" /> Secured by Paystack
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
