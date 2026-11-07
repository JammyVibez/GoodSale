'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
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

export type PremiumCheckoutProduct = 'VERIFIED_PLUS' | 'BUSINESS';

interface SubscriptionCheckoutDialogProps {
  open: boolean;
  onClose: () => void;
  email: string;
  product: PremiumCheckoutProduct;
  planCode?: string;
  title: string;
  price: number;
  onActivated: () => void | Promise<void>;
}

export default function SubscriptionCheckoutDialog({
  open,
  onClose,
  email,
  product,
  planCode,
  title,
  price,
  onActivated,
}: SubscriptionCheckoutDialogProps) {
  const [step, setStep] = useState<'READY' | 'OPENING' | 'VERIFYING' | 'SUCCESS'>('READY');
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(price);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('READY');
    setError(null);
    setAmount(price);
    setExpiresAt(null);
  }, [open, price, product, planCode]);

  const close = () => {
    if (step === 'OPENING' || step === 'VERIFYING') return;
    onClose();
  };

  const verify = async (reference: string) => {
    setStep('VERIFYING');
    setError(null);
    try {
      const res = await fetch('/api/premium/subscriptions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setStep('READY');
        setError(payload.error || 'Paystack has not confirmed this payment. No membership was activated.');
        return;
      }
      setExpiresAt(payload.expiresAt || null);
      setStep('SUCCESS');
      await onActivated();
    } catch {
      setStep('READY');
      setError('Verification failed. No membership was activated. Contact support with your payment reference.');
    }
  };

  const start = async () => {
    setError(null);
    setStep('OPENING');
    try {
      const res = await fetch('/api/premium/subscriptions/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, planCode }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setStep('READY');
        setError(payload.error || 'Membership checkout is unavailable right now.');
        return;
      }

      setAmount(Number(payload.amount));
      await loadPaystackScript();
      if (!window.PaystackPop) throw new Error('Paystack Inline unavailable');

      const handler = window.PaystackPop.setup({
        key: payload.publicKey,
        email: payload.email || email,
        amount: Math.round(Number(payload.amount) * 100),
        currency: payload.currency || 'NGN',
        ref: payload.reference,
        metadata: {
          purpose: 'PREMIUM_SUBSCRIPTION',
          premium_payment_id: payload.paymentId,
          product,
          plan_code: payload.planCode,
          custom_fields: [
            { display_name: 'Platform', variable_name: 'platform', value: 'GoodSale' },
            { display_name: 'Membership', variable_name: 'membership', value: payload.planCode || product },
          ],
        },
        callback: (response: { reference: string }) => {
          void verify(response.reference);
        },
        onClose: () => {
          setStep('READY');
          setError('Checkout closed. No membership was activated.');
        },
      });
      handler.openIframe();
    } catch (err) {
      setStep('READY');
      setError(err instanceof Error ? err.message : 'Could not open Paystack checkout.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`${title} membership`}
      description="Manual renewal. Paystack handles the charge and GoodSale activates the membership only after server verification."
    >
      <div className="space-y-4">
        {step === 'SUCCESS' ? (
          <div className="py-6 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-jade-500/10 text-jade-600 dark:text-jade-300">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h3 className="mt-4 font-display text-lg font-bold text-ink-900 dark:text-white">
              {title} is active
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              {naira(amount)} was verified by GoodSale&apos;s server.
              {expiresAt
                ? ` Your membership is active until ${new Date(expiresAt).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}.`
                : ' Your membership is now active.'}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              There is no automatic recurring charge. Renew manually before expiry to keep the benefits.
            </p>
            <Button className="mt-5 w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-gold-400/25 bg-gradient-to-br from-gold-50 to-white p-4 dark:border-gold-300/20 dark:from-gold-300/10 dark:to-ink-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
                    Membership
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-ink-950 dark:text-white">
                    {title}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
                    {product === 'VERIFIED_PLUS'
                      ? 'Paid seller visibility and tools. This is not identity or business verification.'
                      : 'Business membership. This does not verify the business or change trust standing.'}
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-extrabold text-ink-950 dark:text-white">
                  {naira(amount)}
                </p>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-jade-500/20 bg-jade-500/5 p-3.5 text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-600" />
                Card details stay inside Paystack&apos;s PCI-compliant checkout.
              </p>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-600" />
                The amount, reference, plan and account are re-checked on the server before activation.
              </p>
              <p className="flex items-start gap-2">
                <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-600" />
                Renewal is manual. GoodSale will not charge this card again without a new checkout.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={close}
                disabled={step !== 'READY'}
              >
                Cancel
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => void start()}
                disabled={step !== 'READY'}
              >
                {step === 'READY' ? (
                  <CreditCard className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {step === 'VERIFYING'
                  ? 'Verifying payment…'
                  : step === 'OPENING'
                    ? 'Opening Paystack…'
                    : `Pay ${naira(amount)}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
