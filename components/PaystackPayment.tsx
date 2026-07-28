'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, CreditCard, Landmark, X, Lock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { isDemoMode } from '@/lib/demo';

interface PaystackPaymentProps {
  email: string;
  amount: number; // in NGN
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

async function verifyPayment(reference: string): Promise<boolean> {
  const res = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference }),
  });
  const data = await res.json();
  return Boolean(res.ok && data.success);
}

export default function PaystackPayment({
  email,
  amount,
  onSuccess,
  onCancel,
  metadata,
}: PaystackPaymentProps) {
  const [step, setStep] = useState<'READY' | 'PROCESSING' | 'SUCCESS' | 'ERROR'>('READY');
  const [error, setError] = useState<string | null>(null);
  const [demoTransfer, setDemoTransfer] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  const demo = isDemoMode();

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
        const ok = await verifyPayment(reference);
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
    [onSuccess]
  );

  const handlePaystackInline = async () => {
    setError(null);

    if (!publicKey) {
      if (!demo) {
        setError('Paystack public key is not configured. Set NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY.');
        setStep('ERROR');
        return;
      }
      // Demo fallback without collecting card PAN/CVV/PIN
      const reference = `DEMO_${Date.now().toString(36).toUpperCase()}`;
      await completeVerified(reference);
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
        amount: Math.round(amount * 100), // kobo
        currency: 'NGN',
        ref: `GS_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        metadata: {
          custom_fields: [
            { display_name: 'Platform', variable_name: 'platform', value: 'GoodSale' },
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

  const handleDemoBankTransfer = async () => {
    if (!demo) {
      setError('Bank transfer confirmation requires Paystack dedicated virtual accounts in production.');
      setStep('ERROR');
      return;
    }
    setDemoTransfer(true);
    const reference = `DEMO_BANK_${Date.now().toString(36).toUpperCase()}`;
    await completeVerified(reference);
    setDemoTransfer(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 select-none">
      <div className="bg-[#112330] w-full max-w-md border border-[#1d3243] rounded-3xl overflow-hidden shadow-2xl relative text-white flex flex-col">
        <div className="bg-[#0b1a26] px-6 py-4 flex items-center justify-between border-b border-[#1d3243]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#09a5db]/10 flex items-center justify-center border border-[#09a5db]/30">
              <Shield className="w-4 h-4 text-[#09a5db]" />
            </div>
            <div>
              <p className="font-sans font-black text-xs text-white uppercase tracking-wider">Paystack Secured</p>
              <p className="text-[10px] text-slate-400 font-mono">
                {publicKey ? 'Live Inline Checkout' : demo ? 'Demo Mode' : 'Not Configured'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-[#172b3a] flex items-center justify-center hover:bg-red-500/20 text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
            aria-label="Close payment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#122637] p-6 text-center space-y-1">
          <p className="text-slate-400 text-[10px] uppercase tracking-widest font-mono">Paying GoodSale Escrow Ltd</p>
          <p className="font-mono text-3xl font-black text-[#09a5db]">₦{amount.toLocaleString()}</p>
          <p className="text-slate-500 text-[10px]">{email}</p>
        </div>

        <div className="p-6 flex-1 flex flex-col">
          {(step === 'READY' || step === 'ERROR') && (
            <div className="space-y-5 flex-1 flex flex-col">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="p-4 bg-[#0b1a26] border border-[#1d3243] rounded-2xl space-y-3 text-xs text-slate-300 leading-relaxed">
                <p className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-[#09a5db] shrink-0 mt-0.5" />
                  Card numbers, CVV, and ATM PINs are collected only inside Paystack&apos;s PCI-compliant checkout — never on GoodSale.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  Escrow is credited only after server-side verification of the payment reference.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handlePaystackInline()}
                className="w-full py-3.5 bg-[#09a5db] hover:bg-[#078bb9] text-white font-sans font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-lg shadow-[#09a5db]/20 flex items-center justify-center gap-2 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                {publicKey ? 'Pay with Paystack' : 'Simulate Escrow Hold (Demo)'}
              </button>

              {demo && (
                <button
                  type="button"
                  disabled={demoTransfer}
                  onClick={() => void handleDemoBankTransfer()}
                  className="w-full py-3.5 bg-[#0b1a26] border border-[#1d3243] hover:border-[#09a5db]/40 text-slate-200 font-sans font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Landmark className="w-4 h-4" />
                  {demoTransfer ? 'Verifying…' : 'Demo Bank Transfer'}
                </button>
              )}
            </div>
          )}

          {step === 'PROCESSING' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="w-12 h-12 rounded-full border-4 border-slate-700 border-t-[#09a5db] animate-spin" />
              <div className="space-y-1">
                <p className="font-sans font-black text-xs text-white uppercase tracking-widest">Verifying Payment</p>
                <p className="text-[10px] text-slate-400">Confirming transaction with Paystack…</p>
              </div>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 py-12">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 animate-bounce">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="font-sans font-black text-sm text-emerald-400 uppercase tracking-widest">Escrow Hold Secure</p>
                <p className="text-[10px] text-slate-400">Payment verified. Funds locked in escrow ledger.</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#0b1a26] px-6 py-4 border-t border-[#1d3243] flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          <span>PCI DSS via Paystack · Server-verified references only</span>
        </div>
      </div>
    </div>
  );
}
