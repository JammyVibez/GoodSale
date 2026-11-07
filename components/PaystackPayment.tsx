'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, CreditCard, X, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { buildPaystackReference } from '@/lib/payments/helpers';

interface PaystackPaymentProps {
  email: string;
  amount: number; // in NGN
  orderId: number;
  /** Optional extra order ids for multi-item cart paid in one charge */
  orderIds?: number[];
  onSuccess: (reference: string) => void;
  onCancel: () => void;
  metadata?: Record<string, string | number | boolean>;
}

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: Record<string, unknown>) => { openIframe: () => void };
    };
  }
}

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Paystack requires a browser environment'));
      return;
    }
    if (window.PaystackPop) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack-inline]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Paystack')));
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

async function verifyPayment(reference: string, orderId: number, orderIds?: number[]): Promise<boolean> {
  const res = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, orderId, orderIds }),
  });
  const data = await res.json();
  return Boolean(res.ok && data.success && data.reconciliation?.reconciled !== false);
}

export default function PaystackPayment({
  email,
  amount,
  orderId,
  orderIds,
  onSuccess,
  onCancel,
  metadata,
}: PaystackPaymentProps) {
  const [step, setStep] = useState<'READY' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('READY');
  const [error, setError] = useState<string | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;

  useEffect(() => {
    if (publicKey) {
      loadPaystackScript().catch(() => {
        setError('Unable to load Paystack checkout. Check your network and try again.');
      });
    }
  }, [publicKey]);

  const completeVerified = useCallback(
    async (reference: string) => {
      setStep('PROCESSING');
      setError(null);
      try {
        const ok = await verifyPayment(reference, orderId, orderIds);
        if (!ok) {
          setStep('ERROR');
          setError('Payment could not be verified with Paystack. Funds were not released to escrow.');
          return;
        }
        setStep('SUCCESS');
        setTimeout(() => onSuccess(reference), 900);
      } catch {
        setStep('ERROR');
        setError('Verification request failed. Please contact support with your payment reference.');
      }
    },
    [onSuccess, orderId, orderIds]
  );

  const handlePaystackInline = async () => {
    setError(null);

    if (!orderId || orderId <= 0) {
      setError('Missing order id — create the order before paying.');
      setStep('ERROR');
      return;
    }

    const reference = buildPaystackReference(orderId);

    if (!publicKey) {
      setError('Card payments are not enabled yet. Paystack keys have not been configured for this deployment.');
      setStep('ERROR');
      return;
    }

    try {
      setStep('PROCESSING');
      await loadPaystackScript();
      if (!window.PaystackPop) {
        throw new Error('Paystack Inline unavailable');
      }

      const handler = window.PaystackPop.setup({
        key: publicKey,
        email,
        amount: Math.round(amount * 100),
        currency: 'NGN',
        ref: reference,
        metadata: {
          order_id: orderId,
          order_ids: (orderIds || [orderId]).join(','),
          custom_fields: [
            { display_name: 'Platform', variable_name: 'platform', value: 'GoodSale' },
            { display_name: 'Order ID', variable_name: 'order_id', value: String(orderId) },
          ],
          ...(metadata || {}),
        },
        callback: (response: { reference: string }) => {
          void completeVerified(response.reference);
        },
        onClose: () => {
          setStep('READY');
          onCancel();
        },
      });
      handler.openIframe();
    } catch (err) {
      setStep('ERROR');
      setError(err instanceof Error ? err.message : 'Unable to open Paystack checkout');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 p-0 backdrop-blur-sm select-none sm:items-center sm:p-4">
      <div className="relative flex max-h-[calc(100dvh-0.5rem)] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl border border-jade-800 bg-jade-900 text-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-jade-800 bg-jade-950 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#1fb377]/10 flex items-center justify-center border border-[#1fb377]/30">
              <Shield className="w-4 h-4 text-[#1fb377]" />
            </div>
            <div>
              <p className="font-sans font-bold text-xs text-white tracking-wider">Paystack Secured</p>
              <p className="text-xs text-ink-400 font-mono">
                Order #{orderId} · {publicKey ? 'Live Inline' : 'Not Configured'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-jade-800 flex items-center justify-center hover:bg-ink-500/20 text-ink-400 hover:text-ink-400 cursor-pointer transition-colors"
            aria-label="Close payment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#171c1a] p-6 text-center space-y-1">
          <p className="text-ink-400 text-xs tracking-widest font-mono">Paying GoodSale Escrow Ltd</p>
          <p className="font-mono text-3xl font-bold text-[#1fb377]">₦{amount.toLocaleString()}</p>
          <p className="text-ink-500 text-xs">{email}</p>
        </div>

        <div className="p-6 flex-1 flex flex-col">
          {(step === 'READY' || step === 'ERROR') && (
            <div className="space-y-5 flex-1 flex flex-col">
              {error && (
                <div className="p-3 bg-ink-500/10 border border-ink-500/20 rounded-xl text-ink-400 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-4 bg-jade-950 border border-jade-800 rounded-2xl space-y-3 text-xs text-ink-300 leading-relaxed">
                <p className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-[#1fb377] shrink-0 mt-0.5" />
                  Card numbers, CVV, and ATM PINs are collected only inside Paystack&apos;s PCI-compliant checkout — never on GoodSale.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-jade-400 shrink-0 mt-0.5" />
                  Escrow is credited only after server-side verification of the payment reference.
                </p>
              </div>

              {publicKey ? (
                <button
                  type="button"
                  onClick={() => void handlePaystackInline()}
                  className="w-full py-3.5 bg-[#1fb377] hover:bg-[#26cc84] text-white font-sans font-semibold text-xs tracking-wider rounded-xl cursor-pointer shadow-lg shadow-[#1fb377]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  Pay with Paystack
                </button>
              ) : (
                <div className="rounded-xl border border-jade-800 bg-jade-950 p-3 text-center text-xs text-ink-400 leading-relaxed">
                  Card checkout is not live yet. Paystack keys must be configured before orders can be paid.
                </div>
              )}
            </div>
          )}

          {step === 'PROCESSING' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="w-12 h-12 rounded-full border-4 border-ink-700 border-t-[#1fb377] animate-spin" />
              <div className="space-y-1">
                <p className="font-sans font-bold text-xs text-white tracking-widest">Verifying Payment</p>
                <p className="text-xs text-ink-400">Confirming transaction with Paystack…</p>
              </div>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="w-14 h-14 bg-jade-500/10 rounded-full flex items-center justify-center border border-jade-500/30 animate-bounce">
                <CheckCircle2 className="w-8 h-8 text-jade-400" />
              </div>
              <div className="space-y-1">
                <p className="font-sans font-bold text-sm text-jade-400 tracking-widest">Escrow Hold Secure</p>
                <p className="text-xs text-ink-400">Payment verified. Funds locked in escrow ledger.</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-jade-950 px-6 py-4 border-t border-jade-800 flex items-center justify-center gap-1.5 text-xs text-ink-400">
          <Lock className="w-3.5 h-3.5 text-ink-500" />
          <span>PCI DSS via Paystack · Server-verified references only</span>
        </div>
      </div>
    </div>
  );
}
