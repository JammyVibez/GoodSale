// components/marketplace/QuickBuySheet.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
  Sparkles,
  Truck,
  Wallet as WalletIcon,
  X,
  Zap,
} from 'lucide-react';
import { dbOperations, useDBState } from '@/lib/store';
import { effectiveProductPrice } from '@/lib/productPricing';
import { calculateSplitPayBreakdown } from '@/lib/escrow/proofAndSplit';
import { computeFulfillmentEta } from '@/lib/marketplace/discovery';
import { computePlatformFee } from '@/lib/fees';
import { toast } from '@/lib/feedback';
import { SmartImage } from '@/components/ui/SmartImage';
import Button from '@/components/ui/Button';

interface QuickBuySheetProps {
  productId: number | null;
  onClose: () => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onNavigate: (view: string, payload?: unknown) => void;
}

function naira(amount: number): string {
  return `₦${Math.round(Number(amount) || 0).toLocaleString('en-NG')}`;
}

export default function QuickBuySheet({
  productId,
  onClose,
  onOpenAuth,
  onNavigate,
}: QuickBuySheetProps) {
  const db = useDBState();
  const user = db.currentUser;

  const product = useMemo(
    () => (productId ? db.products.find((p) => p.id === productId) : undefined),
    [db.products, productId]
  );
  const sellerProfile = useMemo(
    () => (product ? db.profiles.find((p) => p.userId === product.sellerId) : undefined),
    [db.profiles, product]
  );
  const buyerProfile = useMemo(
    () => (user ? db.profiles.find((p) => p.userId === user.id) : undefined),
    [db.profiles, user]
  );
  const userWallet = useMemo(
    () => (user ? db.wallets.find((w) => w.userId === user.id) : undefined),
    [db.wallets, user]
  );

  const supportsPartial = useMemo(
    () =>
      Boolean(
        product &&
          ((product.paymentMethods || []).some((m) => m.toLowerCase() === 'partial') ||
            product.partialPercent)
      ),
    [product]
  );

  const [quantity, setQuantity] = useState(1);
  const [payPlan, setPayPlan] = useState<'FULL' | 'SPLIT'>('FULL');
  const [handoverMode, setHandoverMode] = useState<'DELIVERY' | 'SAFEMEET'>('DELIVERY');
  const [selectedSafeMeetId, setSelectedSafeMeetId] = useState<number>(1);
  const [safeMeetTime, setSafeMeetTime] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setQuantity(1);
    setPayPlan('FULL');
    setHandoverMode('DELIVERY');
    const firstSafeMeet = db.safeMeetLocations[0]?.id || 1;
    setSelectedSafeMeetId(firstSafeMeet);
    setSafeMeetTime(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
    setAddress(buyerProfile?.address || '14 Admiralty Way, Lekki Phase 1');
    setCity(buyerProfile?.city || sellerProfile?.city || 'Lagos');
    setStateName(buyerProfile?.state || sellerProfile?.state || 'Lagos State');
  }, [productId, buyerProfile, sellerProfile, db.safeMeetLocations]);

  useEffect(() => {
    if (!productId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [productId, onClose]);

  if (!productId || !product) return null;

  const unitPrice = effectiveProductPrice(product);
  const itemTotal = unitPrice * quantity;
  const deliveryFee =
    handoverMode === 'SAFEMEET'
      ? 0
      : Math.max(0, Number(db.shippingSettings?.localBaseFee) || 1000);
  const taxAmount = computePlatformFee(db.revenueSettings, itemTotal).amount;

  const splitBreakdown = calculateSplitPayBreakdown({
    itemTotal,
    deliveryFee,
    taxAmount,
    depositPercent: product.partialPercent || 30,
    remainingDays: product.partialRemainingDays || 7,
  });

  const dueNow = payPlan === 'SPLIT' ? splitBreakdown.depositAmountPaid : splitBreakdown.totalAmount;
  const eta = computeFulfillmentEta(product, sellerProfile?.state, buyerProfile?.state);
  const walletCoversDue = Boolean(userWallet && userWallet.balance >= dueNow);

  const handleConfirmQuickBuy = async (channel: 'wallet' | 'escrow') => {
    if (!user) {
      onClose();
      onOpenAuth('register');
      toast.info('Sign in or create an account to lock this order in escrow.');
      return;
    }

    setSubmitting(true);
    try {
      const paymentMethod = payPlan === 'SPLIT' ? 'partial' : 'escrow';
      const deliveryMethod = handoverMode === 'SAFEMEET' ? 'SAFEMEET_PICKUP' : 'GOODSALE_PARTNER';

      const order = await dbOperations.placeOrder(
        product.id,
        handoverMode === 'SAFEMEET'
          ? `SafeMeet Hub: ${
              db.safeMeetLocations.find((l) => l.id === selectedSafeMeetId)?.name || 'Verified SafeMeet Point'
            }`
          : address.trim() || 'Standard Delivery Address',
        city.trim() || 'Lagos',
        stateName.trim() || 'Lagos State',
        paymentMethod,
        deliveryMethod,
        false,
        undefined,
        eta.tier === 'SAME_DAY' ? 'EXPRESS' : 'STANDARD',
        false,
        undefined,
        undefined,
        undefined,
        quantity,
        {
          fee: deliveryFee,
          etaMin: eta.tier === 'SAME_DAY' ? 0 : 1,
          etaMax: eta.tier === 'SAME_DAY' ? 1 : 3,
        },
        {
          safeMeetLocationId: handoverMode === 'SAFEMEET' ? selectedSafeMeetId : undefined,
          safeMeetScheduledAt: handoverMode === 'SAFEMEET' ? safeMeetTime : undefined,
        }
      );

      if (!order) {
        toast.error('Unable to create order — verify listing availability.');
        return;
      }

      if (handoverMode === 'SAFEMEET' && selectedSafeMeetId) {
        dbOperations.createSafeMeetMeetup(
          order.id,
          selectedSafeMeetId,
          safeMeetTime || new Date(Date.now() + 86_400_000).toISOString()
        );
      }

      if (channel === 'wallet' && walletCoversDue) {
        const paid = await dbOperations.payOrderWithWallet(order.id);
        if (paid.success) {
          toast.success(`Escrow locked via Wallet (${order.orderNumber}). PIN: ${order.deliveryPin}`);
          onClose();
          onNavigate('buyer-profile');
          return;
        }
      }

      onClose();
      onNavigate('checkout', { productId: product.id });
      toast.success(`Quick-buy order ${order.orderNumber} ready — complete payment to lock escrow.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-ink-950/60 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-buy-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg animate-sheet-rise overflow-hidden rounded-t-3xl border border-ink-200 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-900 sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-150 px-5 py-4 dark:border-ink-800">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-jade-600 text-white">
              <Zap className="h-4 w-4 fill-white" aria-hidden="true" />
            </span>
            <div>
              <h2 id="quick-buy-title" className="font-display text-base font-extrabold text-ink-900 dark:text-white">
                Express Escrow Quick Buy
              </h2>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                Sub-minute checkout · funds held until PIN verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick buy"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[78dvh] space-y-4 overflow-y-auto px-5 py-4">
          {/* Item summary */}
          <div className="flex items-center gap-3 rounded-2xl border border-ink-150 bg-ink-50/70 p-3 dark:border-ink-800 dark:bg-ink-950/50">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
              <SmartImage
                src={product.images?.[0]}
                alt={product.title}
                seed={`qb-${product.id}`}
                className="h-full w-full"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 font-display text-sm font-bold text-ink-900 dark:text-white">
                {product.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                {eta.label} · {product.quantity} available
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-mono text-sm font-extrabold text-jade-700 dark:text-jade-300">
                  {naira(unitPrice)}
                </span>
                <div className="ml-auto inline-flex items-center rounded-lg border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="h-8 w-8 text-xs font-bold text-ink-700 hover:bg-ink-50 dark:text-ink-200 cursor-pointer"
                  >
                    −
                  </button>
                  <span className="min-w-[26px] text-center font-mono text-xs font-bold text-ink-900 dark:text-white">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => setQuantity((q) => Math.min(product.quantity || 1, q + 1))}
                    className="h-8 w-8 text-xs font-bold text-ink-700 hover:bg-ink-50 dark:text-ink-200 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Plan: Full Escrow vs Split-Pay Deposit */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              1. Escrow payment plan
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPayPlan('FULL')}
                className={`min-h-[56px] rounded-2xl border p-3 text-left transition-colors cursor-pointer ${
                  payPlan === 'FULL'
                    ? 'border-jade-600 bg-jade-50/80 dark:border-jade-400 dark:bg-jade-950/50'
                    : 'border-ink-200 bg-white hover:border-ink-300 dark:border-ink-800 dark:bg-ink-950'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-ink-900 dark:text-white">Full Escrow</span>
                  {payPlan === 'FULL' && <CheckCircle2 className="h-4 w-4 text-jade-600 dark:text-jade-400" />}
                </div>
                <p className="mt-0.5 font-mono text-xs font-extrabold text-jade-700 dark:text-jade-300">
                  {naira(splitBreakdown.totalAmount)}
                </p>
              </button>

              <button
                type="button"
                disabled={!supportsPartial}
                onClick={() => supportsPartial && setPayPlan('SPLIT')}
                className={`min-h-[56px] rounded-2xl border p-3 text-left transition-colors ${
                  !supportsPartial
                    ? 'cursor-not-allowed border-ink-150 bg-ink-50 opacity-60 dark:border-ink-800 dark:bg-ink-950/40'
                    : payPlan === 'SPLIT'
                      ? 'cursor-pointer border-jade-600 bg-jade-50/80 dark:border-jade-400 dark:bg-jade-950/50'
                      : 'cursor-pointer border-ink-200 bg-white hover:border-ink-300 dark:border-ink-800 dark:bg-ink-950'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-ink-900 dark:text-white">
                    Split-Pay ({splitBreakdown.depositPercent}%)
                  </span>
                  {payPlan === 'SPLIT' && <CheckCircle2 className="h-4 w-4 text-jade-600 dark:text-jade-400" />}
                </div>
                <p className="mt-0.5 font-mono text-xs font-extrabold text-jade-700 dark:text-jade-300">
                  {supportsPartial ? `${naira(splitBreakdown.depositAmountPaid)} today` : 'Seller full only'}
                </p>
              </button>
            </div>
            {payPlan === 'SPLIT' && supportsPartial && (
              <p className="rounded-xl bg-jade-500/10 px-3 py-2 text-[11px] font-medium text-jade-800 dark:text-jade-200">
                Lock item now with <strong>{naira(splitBreakdown.depositAmountPaid)}</strong>. Settle remaining{' '}
                <strong>{naira(splitBreakdown.balanceRemaining)}</strong> within {splitBreakdown.remainingDays} days prior to PIN release.
              </p>
            )}
          </div>

          {/* Handover Mode: Rider vs SafeMeet */}
          <div className="space-y-2">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
              2. Handover &amp; delivery
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setHandoverMode('DELIVERY')}
                className={`min-h-[52px] rounded-2xl border p-3 text-left transition-colors cursor-pointer ${
                  handoverMode === 'DELIVERY'
                    ? 'border-jade-600 bg-jade-50/80 dark:border-jade-400 dark:bg-jade-950/50'
                    : 'border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink-900 dark:text-white">
                  <Truck className="h-3.5 w-3.5 text-jade-600" /> Rider Delivery
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-500 dark:text-ink-400">
                  {naira(Number(db.shippingSettings?.localBaseFee) || 1000)} · Tracked
                </span>
              </button>

              <button
                type="button"
                disabled={!product.pickupAvailable && db.safeMeetLocations.length === 0}
                onClick={() => setHandoverMode('SAFEMEET')}
                className={`min-h-[52px] rounded-2xl border p-3 text-left transition-colors ${
                  !product.pickupAvailable && db.safeMeetLocations.length === 0
                    ? 'cursor-not-allowed border-ink-150 bg-ink-50 opacity-60 dark:border-ink-800 dark:bg-ink-950/40'
                    : handoverMode === 'SAFEMEET'
                      ? 'cursor-pointer border-jade-600 bg-jade-50/80 dark:border-jade-400 dark:bg-jade-950/50'
                      : 'cursor-pointer border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink-900 dark:text-white">
                  <MapPin className="h-3.5 w-3.5 text-jade-600" /> SafeMeet Hub
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-500 dark:text-ink-400">
                  ₦0 fee · Inspect first
                </span>
              </button>
            </div>

            {handoverMode === 'DELIVERY' ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street delivery address"
                  aria-label="Street delivery address"
                  className="sm:col-span-2 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  aria-label="City"
                  className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                />
                <input
                  type="text"
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  placeholder="State"
                  aria-label="State"
                  className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  aria-label="SafeMeet Hub"
                  value={selectedSafeMeetId}
                  onChange={(e) => setSelectedSafeMeetId(Number(e.target.value))}
                  className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs font-semibold text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                >
                  {db.safeMeetLocations.length > 0 ? (
                    db.safeMeetLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.address})
                      </option>
                    ))
                  ) : (
                    <option value={1}>Lekki Phase 1 Verified Hub</option>
                  )}
                </select>
                <input
                  type="datetime-local"
                  aria-label="SafeMeet schedule time"
                  value={safeMeetTime}
                  onChange={(e) => setSafeMeetTime(e.target.value)}
                  className="rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-xs text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* Escrow assurance strip */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-jade-500/20 bg-jade-500/[0.06] p-3 text-xs">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-jade-600 dark:text-jade-400" />
            <p className="leading-relaxed text-ink-700 dark:text-ink-300">
              Seller uploads <strong>live pre-dispatch proof</strong> before shipping. Release funds only after you confirm the 6-digit PIN.
            </p>
          </div>
        </div>

        {/* Sticky footer action */}
        <div className="border-t border-ink-150 bg-ink-50/70 px-5 py-4 dark:border-ink-800 dark:bg-ink-950/60">
          <div className="mb-3 flex items-baseline justify-between text-xs">
            <span className="text-ink-500 dark:text-ink-400">
              Due now ({payPlan === 'SPLIT' ? `${splitBreakdown.depositPercent}% escrow deposit` : 'full escrow hold'})
            </span>
            <span className="font-display text-xl font-extrabold text-ink-900 dark:text-white">
              {naira(dueNow)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {walletCoversDue && (
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => void handleConfirmQuickBuy('wallet')}
                className="min-h-[46px]"
              >
                <WalletIcon className="h-4 w-4 text-jade-600" />
                <span>Pay via Wallet</span>
              </Button>
            )}
            <Button
              type="button"
              loading={submitting}
              loadingText="Securing order…"
              onClick={() => void handleConfirmQuickBuy('escrow')}
              className={`min-h-[46px] ${walletCoversDue ? '' : 'sm:col-span-2'}`}
            >
              <CreditCard className="h-4 w-4" />
              <span>Continue to Escrow Checkout</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
