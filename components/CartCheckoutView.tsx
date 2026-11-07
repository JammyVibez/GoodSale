// components/CartCheckoutView.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  ShoppingCart, Shield, CreditCard, ChevronRight, CheckCircle2, 
  MapPin, Award, Trash2, KeyRound, QrCode, ClipboardCheck, ArrowLeft, RefreshCw,
  Truck, ExternalLink, Sparkles, ShieldAlert, ShieldCheck, CheckCircle,
  Coins, FileText, Upload, Navigation, Minus, Plus, Check, BadgeCheck,
  ShoppingBag, Bell, Headphones, ChevronLeft, Gift, Clock, ChevronDown, Copy, Package
} from 'lucide-react';
import { 
  getDBState, saveDBState, dbOperations, Product, Order, OrderStatus, UserRole
} from '../lib/store';
import PaystackPayment from './PaystackPayment';
import { toast } from '@/lib/feedback';
import EmptyState from './ui/EmptyState';
import { SmartImage } from './ui/SmartImage';
import LiveDispatchMap from './LiveDispatchMap';
import DeliveryTrackingPanel from './DeliveryTrackingPanel';
import PremiumCheckout from './checkout/PremiumCheckout';
import { useLiveLocation } from '@/lib/hooks/useLiveLocation';
import {
  LOCATION_PRESETS,
  rankPartnersByProximity,
  bestCoords,
  formatDistanceKm,
} from '@/lib/geo';
import { computePlatformFee } from '@/lib/fees';
import { orderPaymentDue } from '@/lib/payments/helpers';
import { effectiveProductPrice } from '@/lib/productPricing';
import { isVerifiedSeller } from '@/lib/verification';
import { recordSponsoredConversion } from '@/lib/ads/conversion';
import type { ShippingQuoteResult } from '@/lib/types';

interface CartCheckoutViewProps {
  onBack: () => void;
  onNavigate: (view: string, payload?: any) => void;
  cart: number[];
  onRemoveFromCart: (productId: number) => void;
  onClearCart: () => void;
  preselectedProductId?: number | null;
  onOpenAuth?: () => void;
}

type OrderFilter = 'all' | 'active' | 'delivered' | 'issues';

const ESCROW_ACTIVE_STATUSES = [
  OrderStatus.PAID_ESCROW,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DISPUTED,
];
const ORDER_ISSUE_STATUSES = [
  OrderStatus.DISPUTED,
  OrderStatus.REFUND_REQUESTED,
  OrderStatus.REFUNDED,
  OrderStatus.CANCELLED,
];
const ORDER_PENDING_PAYMENT_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.PENDING_BANK_TRANSFER,
  OrderStatus.PARTIAL_DEPOSIT_PAID,
  OrderStatus.INVOICE_SENT,
  OrderStatus.COD_PENDING,
];
const ORDER_PROGRESS_STEPS = ['Placed', 'Paid', 'In transit', 'Delivered'];

const ORDER_STATUS_META: Partial<Record<OrderStatus, {
  label: string;
  tone: 'jade' | 'gold' | 'neutral' | 'danger';
  hint: string;
  progress: number;
}>> = {
  [OrderStatus.PENDING]: {
    label: 'Awaiting payment', tone: 'gold', progress: 0,
    hint: 'Complete payment to start escrow protection. Use Pay now below to finish this order.',
  },
  [OrderStatus.PENDING_BANK_TRANSFER]: {
    label: 'Checking transfer', tone: 'gold', progress: 0,
    hint: 'Your bank transfer receipt is waiting for confirmation.',
  },
  [OrderStatus.PARTIAL_DEPOSIT_PAID]: {
    label: 'Deposit received', tone: 'gold', progress: 0,
    hint: 'Your deposit is secured. Complete the balance before dispatch.',
  },
  [OrderStatus.INVOICE_SENT]: {
    label: 'Invoice sent', tone: 'gold', progress: 0,
    hint: 'Your invoice is ready. Payment secures this order with escrow.',
  },
  [OrderStatus.COD_PENDING]: {
    label: 'Pay on delivery', tone: 'gold', progress: 0,
    hint: 'Have the exact amount ready when the rider arrives.',
  },
  [OrderStatus.PAID_ESCROW]: {
    label: 'Payment secured', tone: 'jade', progress: 1,
    hint: 'Your money is held safely in escrow. The seller is preparing your order.',
  },
  [OrderStatus.SHIPPED]: {
    label: 'In transit', tone: 'jade', progress: 2,
    hint: 'Your item has left the seller and is on the way to you.',
  },
  [OrderStatus.OUT_FOR_DELIVERY]: {
    label: 'Out for delivery', tone: 'jade', progress: 2,
    hint: 'The rider is heading to your delivery address now.',
  },
  [OrderStatus.DELIVERED_SUCCESS]: {
    label: 'Delivered', tone: 'jade', progress: 3,
    hint: 'Delivered successfully. Your escrow payment has been released to the seller.',
  },
  [OrderStatus.DISPUTED]: {
    label: 'Under review', tone: 'danger', progress: 1,
    hint: 'GoodSale is reviewing this order. Escrow is frozen until the case is resolved.',
  },
  [OrderStatus.REFUND_REQUESTED]: {
    label: 'Refund requested', tone: 'neutral', progress: 1,
    hint: 'Your refund request is being reviewed.',
  },
  [OrderStatus.REFUNDED]: {
    label: 'Refunded', tone: 'neutral', progress: 1,
    hint: 'This order has been refunded.',
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelled', tone: 'neutral', progress: 0,
    hint: 'This order was cancelled.',
  },
};

const ORDER_TONE_CLASSES = {
  jade: 'border-jade-500/25 bg-jade-500/10 text-jade-700 dark:text-jade-300',
  gold: 'border-gold-400/30 bg-gold-300/15 text-ink-700 dark:text-gold-200',
  neutral: 'border-ink-200 bg-ink-100 text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300',
  danger: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300',
};

function orderStatusMeta(status: OrderStatus) {
  return ORDER_STATUS_META[status] ?? {
    label: status.replace(/_/g, ' ').toLowerCase(),
    tone: 'neutral' as const,
    hint: 'We will update this order as it progresses.',
    progress: 1,
  };
}

function orderIsIssue(status: OrderStatus) {
  return ORDER_ISSUE_STATUSES.includes(status);
}

function orderHasEscrowStarted(status: OrderStatus) {
  return !ORDER_PENDING_PAYMENT_STATUSES.includes(status) &&
    ![OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(status);
}

function deliveryMethodLabel(order: Order) {
  if (order.deliveryMethod === 'PICKUP') return 'Store pickup';
  if (order.deliveryMethod === 'THIRD_PARTY_COURIER') return 'Courier delivery';
  return `GoodSale rider${order.serviceType ? ` · ${order.serviceType.toLowerCase()}` : ''}`;
}

export default function CartCheckoutView({
  onBack,
  onNavigate,
  cart,
  onRemoveFromCart,
  onClearCart,
  preselectedProductId = null,
  onOpenAuth,
}: CartCheckoutViewProps) {
  const [db, setDb] = useState(getDBState());
  const [activeStep, setActiveStep] = useState<'cart' | 'checkout' | 'checkout-legacy' | 'orders'>('cart');

  // Cart-line controls live here so the marketplace's number[] cart contract stays intact.
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [excludedIds, setExcludedIds] = useState<number[]>([]);
  const [applyPoints, setApplyPoints] = useState(false);
  
  // Checkout Fields
  const [deliveryAddress, setDeliveryAddress] = useState<string>(LOCATION_PRESETS.gbagada.address);
  const [city, setCity] = useState<string>(LOCATION_PRESETS.gbagada.city);
  const [state, setState] = useState<string>(LOCATION_PRESETS.gbagada.state);
  const [phoneNumber, setPhoneNumber] = useState('+234 812 345 6789');
  const [deliveryLat, setDeliveryLat] = useState<number>(LOCATION_PRESETS.gbagada.lat);
  const [deliveryLng, setDeliveryLng] = useState<number>(LOCATION_PRESETS.gbagada.lng);

  const buyerGps = useLiveLocation({ watch: true, throttleMs: 10000, enabled: true });

  // Prefer live GPS for delivery pin when available
  useEffect(() => {
    if (buyerGps.coords && buyerGps.source === 'gps') {
      setDeliveryLat(buyerGps.coords.lat);
      setDeliveryLng(buyerGps.coords.lng);
    }
  }, [buyerGps.coords, buyerGps.source]);

  // New States for GoodDispatch Marketplace & Protection
  const [deliveryMethod, setDeliveryMethod] = useState<'GOODSALE_PARTNER' | 'THIRD_PARTY_COURIER' | 'PICKUP'>('GOODSALE_PARTNER');
  const [serviceType, setServiceType] = useState<'ECONOMY' | 'STANDARD' | 'EXPRESS'>('STANDARD');
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [hasGoodSaleProtect, setHasGoodSaleProtect] = useState(false);
  const [smartMatchingActive, setSmartMatchingActive] = useState(false);
  const [smartMatchResult, setSmartMatchResult] = useState<string | null>(null);

  // Expanded Payment and Checkout States
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('escrow');
  const [bankTransferReceipt, setBankTransferReceipt] = useState<string | null>(null);
  const [bankTransferUploading, setBankTransferUploading] = useState(false);
  const [invoiceTerms, setInvoiceTerms] = useState<string>('Net 15');
  const [pendingPayOrderIds, setPendingPayOrderIds] = useState<number[]>([]);
  const [pendingPayAmount, setPendingPayAmount] = useState(0);
  const [payingExistingOrder, setPayingExistingOrder] = useState(false);

  // Interactive Verification PIN state
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [visiblePinOrderId, setVisiblePinOrderId] = useState<number | null>(null);

  // Selected Order for Receipt View
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  // Dispute state
  const [showDisputeFormOrderId, setShowDisputeFormOrderId] = useState<number | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [showPaystackModal, setShowPaystackModal] = useState(false);

  // Database-driven shipping quote (server-authoritative)
  const [shippingQuote, setShippingQuote] = useState<ShippingQuoteResult | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // Match algorithm: real GPS proximity + trust / workload
  const deliveryOrigin = useMemo(
    () =>
      bestCoords(
        { lat: deliveryLat, lng: deliveryLng },
        buyerGps.coords,
        city,
        state,
        deliveryAddress
      ),
    [deliveryLat, deliveryLng, buyerGps.coords, city, state, deliveryAddress]
  );

  const rankedCouriers = useMemo(() => {
    const activePartners = db.deliveryPartners.filter((p) => p.status === 'APPROVED' && p.isAvailable);
    return rankPartnersByProximity(deliveryOrigin, activePartners);
  }, [db.deliveryPartners, deliveryOrigin]);

  const runSmartMatching = () => {
    setSmartMatchingActive(true);
    setSmartMatchResult(null);
    
    setTimeout(() => {
      if (rankedCouriers.length === 0) {
        setSmartMatchingActive(false);
        setSmartMatchResult("No active dispatch riders are currently available near your location. Please assign manually or retry shortly.");
        return;
      }

      const best = rankedCouriers[0];
      setSelectedPartnerId(best.partner.id);
      setSmartMatchResult(
        `Smart Match Successful! Recommended ${best.partner.fullName} (${best.score}% fit) — ${formatDistanceKm(best.distanceKm)} away, ~${best.etaMinutes} mins ETA, trust ${best.partner.trustScore}%.`
      );
      setSmartMatchingActive(false);
    }, 900);
  };

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  // Pre-fill buy now product
  useEffect(() => {
    if (preselectedProductId) {
      const timer = setTimeout(() => {
        setActiveStep('checkout');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [preselectedProductId]);

  // Items to purchase
  const cartItems = preselectedProductId 
    ? db.products.filter(p => p.id === preselectedProductId)
    : db.products.filter(p => cart.includes(p.id));

  const qtyFor = (item: Product) => {
    const requested = quantities[item.id] ?? 1;
    return Math.max(1, Math.min(requested, Math.max(1, item.quantity)));
  };
  const changeQty = (item: Product, delta: number) => {
    const next = Math.max(1, Math.min(qtyFor(item) + delta, Math.max(1, item.quantity)));
    setQuantities((prev) => ({ ...prev, [item.id]: next }));
  };
  const toggleSelected = (id: number) => {
    setExcludedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const checkoutItems = cartItems.filter((item) => !excludedIds.includes(item.id));
  const currentCheckoutItem = checkoutItems[0] || cartItems[0];
  const checkoutQuoteKey = checkoutItems.map((item) => `${item.id}:${qtyFor(item)}`).join('|');

  const requestShippingQuote = async (signal?: AbortSignal): Promise<ShippingQuoteResult> => {
    const res = await fetch('/api/shipping/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        items: checkoutItems.map((item) => ({ productId: item.id, quantity: qtyFor(item) })),
        destination: { address: deliveryAddress, city, state, lat: deliveryLat, lng: deliveryLng },
        deliveryMethod,
        serviceType,
      }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success || !payload?.quote) {
      throw new Error(payload?.error || 'Could not calculate delivery for this address.');
    }
    return payload.quote as ShippingQuoteResult;
  };

  useEffect(() => {
    if (!db.currentUser || checkoutItems.length === 0) {
      setShippingQuote(null);
      setShippingError(null);
      setShippingLoading(false);
      return;
    }
    const controller = new AbortController();
    setShippingLoading(true);
    setShippingError(null);
    const timer = setTimeout(() => {
      requestShippingQuote(controller.signal)
        .then((quote) => setShippingQuote(quote))
        .catch((error) => {
          if (controller.signal.aborted) return;
          setShippingQuote(null);
          setShippingError(error instanceof Error ? error.message : 'Could not calculate delivery.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setShippingLoading(false);
        });
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // Recalculate on any address, cart, method or service change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutQuoteKey, deliveryAddress, city, state, deliveryLat, deliveryLng, deliveryMethod, serviceType, db.currentUser?.id]);

  // Get active payment methods globally configured by admin, default to all if not set
  const enabledGlobalMethods = db.paymentSettings?.enabledMethods || ['escrow', 'cod', 'card', 'bank', 'invoice', 'partial'];
  
  // Intersect product specific methods with global enabled ones.
  const productMethods = currentCheckoutItem
    ? ((currentCheckoutItem as any).paymentMethods || ['escrow', 'card', 'cod', 'bank', 'invoice', 'partial'])
    : ['escrow', 'card', 'cod', 'bank', 'invoice', 'partial'];
  
  const allowedCheckoutMethods = productMethods.filter((m: string) => enabledGlobalMethods.includes(m.toLowerCase()));
  
  // Ensure we have at least 'escrow' if nothing else is left
  if (allowedCheckoutMethods.length === 0) {
    allowedCheckoutMethods.push('escrow');
  }

  // Auto-select first allowed payment method when item changes
  useEffect(() => {
    if (currentCheckoutItem) {
      if (allowedCheckoutMethods.length > 0 && !allowedCheckoutMethods.includes(selectedPaymentMethod)) {
        setSelectedPaymentMethod(allowedCheckoutMethods[0]);
      }
    }
  }, [currentCheckoutItem, selectedPaymentMethod, allowedCheckoutMethods]);

  useEffect(() => {
    if (activeStep === 'orders') {
      setOrderFilter('all');
      setExpandedOrderId(null);
      setVisiblePinOrderId(null);
    }
  }, [activeStep]);

  const user = db.currentUser;
  
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-jade-500/10 dark:bg-jade-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-jade-500/20">
          <Shield className="w-8 h-8 text-jade-500" />
        </div>
        <h2 className="font-display font-bold text-2xl text-ink-900 dark:text-white mb-2">Create an account to use your cart</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Guests can browse the GoodSale catalog freely. Sign up or sign in to save items, checkout with escrow, and track deliveries.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-jade-500 to-jade-600 hover:from-jade-600 hover:to-jade-700 text-white font-sans font-bold text-xs tracking-tight rounded-xl cursor-pointer shadow-md shadow-jade-500/10 transition-all"
          >
            Create Account / Sign In
          </button>
          <button
            onClick={onBack}
            className="w-full py-2.5 bg-transparent border border-ink-200 dark:border-ink-800 hover:bg-ink-100 dark:hover:bg-ink-900 text-ink-700 dark:text-ink-300 font-sans font-bold text-xs tracking-tight rounded-xl cursor-pointer transition-all"
          >
            Go Back to Catalog
          </button>
        </div>
      </div>
    );
  }

  const subtotal = checkoutItems.reduce((acc, p) => acc + effectiveProductPrice(p) * qtyFor(p), 0);
  // Per-item platform fee — mirrors Order.taxAmount (admin-toggleable, OFF at launch).
  const platformFeeMeta = computePlatformFee(db.revenueSettings, subtotal);
  const escrowFee = checkoutItems.reduce(
    (acc, p) => acc + computePlatformFee(db.revenueSettings, effectiveProductPrice(p) * qtyFor(p)).amount,
    0
  );
  
  const protectFee = hasGoodSaleProtect ? (db.revenueSettings?.goodSaleProtectFee || 1500) : 0;
  const pointsDiscount = applyPoints
    ? Math.min(user.goodPoints, Math.floor(subtotal / 10)) * 10
    : 0;
  
  const selectedMethodOptions = (shippingQuote?.groups || []).map((group) =>
    group.options.find((option) => option.method === deliveryMethod)
  );
  const methodAvailable = (method: 'GOODSALE_PARTNER' | 'THIRD_PARTY_COURIER' | 'PICKUP') =>
    Boolean(shippingQuote?.groups.length) &&
    shippingQuote!.groups.every((group) => group.options.some((option) => option.method === method));
  const methodTotal = (method: 'GOODSALE_PARTNER' | 'THIRD_PARTY_COURIER' | 'PICKUP') =>
    (shippingQuote?.groups || []).reduce((sum, group) => {
      const option = group.options.find((candidate) => candidate.method === method);
      return sum + (option?.fee || 0);
    }, 0);
  const shippingChooseAnotherMethod = Boolean(shippingQuote) && !methodAvailable(deliveryMethod);
  const requiresManualQuote = Boolean(shippingQuote?.requiresManualQuote) || shippingChooseAnotherMethod;
  const deliveryCharge = !shippingQuote || requiresManualQuote ? 0 : methodTotal(deliveryMethod);
  const shippingEta = selectedMethodOptions.filter(Boolean).length
    ? {
        min: Math.min(...selectedMethodOptions.filter((option) => Boolean(option)).map((option) => option!.etaMinDays)),
        max: Math.max(...selectedMethodOptions.filter((option) => Boolean(option)).map((option) => option!.etaMaxDays)),
      }
    : null;
  const shippingBlocked = shippingLoading || !shippingQuote || requiresManualQuote || Boolean(shippingError);

  const totalDue = Math.max(0, subtotal + escrowFee + deliveryCharge + protectFee - pointsDiscount);

  // Create order(s); for card/escrow/partial open Paystack after order exists
  const handlePayIntoEscrow = async (customMethod?: string) => {
    if (checkoutItems.length === 0) {
      toast.error('Select at least one item to check out.');
      return;
    }

    // Block checkout for listings that sold out or were withdrawn while in the cart.
    const unavailable = checkoutItems.filter(
      (item) => item.quantity <= 0 || item.stockStatus === 'SOLD' || item.stockStatus === 'UNAVAILABLE' || item.stockStatus === 'OUT_OF_STOCK'
    );
    if (unavailable.length > 0) {
      toast.error(`Remove unavailable ${unavailable.length > 1 ? 'items' : 'item'} before paying: ${unavailable.map((i) => i.title).join(', ')}`);
      return;
    }

    const pm = (customMethod || selectedPaymentMethod || 'escrow').toLowerCase();
    const needsPaystack = ['escrow', 'card', 'partial'].includes(pm);

    // Revalidate with the server immediately before creating orders. The
    // order insert only carries server-priced fees, then the verifier applies
    // the quote authoritatively before any payment is opened.
    setShippingLoading(true);
    setShippingError(null);
    let freshQuote: ShippingQuoteResult;
    try {
      freshQuote = await requestShippingQuote();
      setShippingQuote(freshQuote);
    } catch (error) {
      setShippingLoading(false);
      const message = error instanceof Error ? error.message : 'Delivery could not be priced.';
      setShippingError(message);
      toast.error(message);
      return;
    }
    setShippingLoading(false);

    if (freshQuote.requiresManualQuote || freshQuote.groups.some((group) => !group.options.some((option) => option.method === deliveryMethod))) {
      toast.error('Choose an available delivery method or request a manual courier quotation.');
      return;
    }
    if (!freshQuote.quoteId) {
      toast.error('Delivery quote could not be verified. Please retry.');
      return;
    }

    const createdIds: number[] = [];
    let payAmount = 0;
    const seenSeller = new Set<number>();

    for (const item of checkoutItems) {
      const group = freshQuote.groups.find((candidate) => candidate.sellerId === item.sellerId);
      const option = group?.options.find((candidate) => candidate.method === deliveryMethod);
      if (!option) {
        toast.error('Delivery is unavailable for one of the sellers in your cart.');
        return;
      }
      const alreadyCharged = seenSeller.has(item.sellerId);
      const fee = alreadyCharged ? 0 : option.fee;
      const breakdown = alreadyCharged
        ? { ...option.breakdown, total: 0, discount: option.fee, freeShipping: true }
        : { ...option.breakdown, total: fee };

      const order = await dbOperations.placeOrder(
        item.id,
        deliveryAddress,
        city,
        state,
        pm,
        deliveryMethod,
        applyPoints,
        deliveryMethod === 'GOODSALE_PARTNER' && selectedPartnerId ? selectedPartnerId : undefined,
        serviceType,
        hasGoodSaleProtect,
        bankTransferReceipt || undefined,
        invoiceTerms,
        { lat: deliveryOrigin.lat, lng: deliveryOrigin.lng },
        qtyFor(item),
        {
          fee,
          breakdown,
          quoteId: freshQuote.quoteId,
          ruleId: option.breakdown.ruleId,
          zoneId: option.breakdown.zoneId,
          etaMin: option.etaMinDays,
          etaMax: option.etaMaxDays,
        }
      );
      seenSeller.add(item.sellerId);
      if (order?.id) {
        createdIds.push(order.id);
        payAmount += order.totalAmount;
      }
    }

    if (createdIds.length === 0) {
      toast.error('Could not create the order. Please retry.');
      return;
    }

    const verified = await dbOperations.applyVerifiedShipping(freshQuote.quoteId, createdIds);
    if ('error' in verified) {
      toast.error(verified.error || 'Shipping could not be verified. Please retry payment from your orders.');
      return;
    }
    payAmount = verified.orders.reduce((sum, order) => sum + order.totalAmount, 0) || payAmount;
    // A partial checkout charges the deposit now; the balance is a later payment.
    if (pm === 'partial') {
      payAmount = Math.round(payAmount * ((currentCheckoutItem?.partialPercent || 30) / 100));
    }

    if (needsPaystack) {
      setPayingExistingOrder(false);
      setPendingPayOrderIds(createdIds);
      setPendingPayAmount(payAmount);
      setShowPaystackModal(true);
      return;
    }

    onClearCart();
    void recordSponsoredConversion(
      createdIds.map((id) => ({ id, productId: getDBState().orders.find((order) => order.id === id)?.productId }))
    );
    setActiveStep('orders');
  };

  const handlePaystackSuccess = async () => {
    const paidOrders = pendingPayOrderIds.map((id) => ({
      id,
      productId: getDBState().orders.find((order) => order.id === id)?.productId,
    }));
    setShowPaystackModal(false);
    setPendingPayOrderIds([]);
    setPendingPayAmount(0);
    void recordSponsoredConversion(paidOrders);
    if (!payingExistingOrder) onClearCart();
    setPayingExistingOrder(false);
    setActiveStep('orders');
  };

  const handlePayPendingOrder = (order: Order) => {
    setPayingExistingOrder(true);
    setPendingPayOrderIds([order.id]);
    setPendingPayAmount(
      orderPaymentDue({
        payment_method: order.paymentMethod,
        status: order.status,
        total_amount: order.totalAmount,
        deposit_percent: order.depositPercent,
        balance_remaining: order.balanceRemaining,
      }).amount
    );
    setShowPaystackModal(true);
  };

  // Submit Secret PIN Verification to release funds
  const handleVerifyDeliveryPin = async (orderId: number) => {
    setPinError(null);
    setPinSuccess(null);

    const result = await dbOperations.completeDelivery(orderId, enteredPin);
    if (result && 'error' in result) {
      setPinError(result.error || 'Verification failed');
    } else {
      setPinSuccess('PIN verified! Escrow funds released to the merchant wallet.');
      setEnteredPin('');
      setTimeout(() => setPinSuccess(null), 4000);
    }
  };

  // Preset location fillers for Lagos/Abuja
  const handlePresetLocation = (cityPreset: string) => {
    if (cityPreset === 'Lag') {
      setDeliveryAddress(LOCATION_PRESETS.lekki.address);
      setCity(LOCATION_PRESETS.lekki.city);
      setState(LOCATION_PRESETS.lekki.state);
      setDeliveryLat(LOCATION_PRESETS.lekki.lat);
      setDeliveryLng(LOCATION_PRESETS.lekki.lng);
    } else {
      setDeliveryAddress(LOCATION_PRESETS.abuja.address);
      setCity(LOCATION_PRESETS.abuja.city);
      setState(LOCATION_PRESETS.abuja.state);
      setDeliveryLat(LOCATION_PRESETS.abuja.lat);
      setDeliveryLng(LOCATION_PRESETS.abuja.lng);
    }
  };

  const useMyGpsLocation = () => {
    buyerGps.refresh();
    if (buyerGps.coords) {
      setDeliveryLat(buyerGps.coords.lat);
      setDeliveryLng(buyerGps.coords.lng);
      setDeliveryAddress(
        `Live GPS pin ${buyerGps.coords.lat.toFixed(5)}, ${buyerGps.coords.lng.toFixed(5)}`
      );
      setCity(city || 'My location');
    }
  };

  // Get User Order log
  const myOrders = db.orders.filter(order => 
    order.buyerId === user.id || order.sellerId === user.id
  ).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const activeOrderCount = myOrders.filter(
    (order) => order.status !== OrderStatus.DELIVERED_SUCCESS && !orderIsIssue(order.status)
  ).length;
  const deliveredOrderCount = myOrders.filter(
    (order) => order.status === OrderStatus.DELIVERED_SUCCESS
  ).length;
  const issueOrderCount = myOrders.filter((order) => orderIsIssue(order.status)).length;
  const escrowProtectedValue = myOrders
    .filter((order) => ESCROW_ACTIVE_STATUSES.includes(order.status))
    .reduce((sum, order) => sum + order.totalAmount, 0);

  const orderFilters: { id: OrderFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All orders', count: myOrders.length },
    { id: 'active', label: 'In progress', count: activeOrderCount },
    { id: 'delivered', label: 'Delivered', count: deliveredOrderCount },
    { id: 'issues', label: 'Needs attention', count: issueOrderCount },
  ];
  const filteredOrders = myOrders.filter((order) => {
    if (orderFilter === 'active') {
      return order.status !== OrderStatus.DELIVERED_SUCCESS && !orderIsIssue(order.status);
    }
    if (orderFilter === 'delivered') return order.status === OrderStatus.DELIVERED_SUCCESS;
    if (orderFilter === 'issues') return orderIsIssue(order.status);
    return true;
  });

  const toggleOrderDetails = (orderId: number) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId));
    setVisiblePinOrderId(null);
    setEnteredPin('');
    setPinError(null);
    setPinSuccess(null);
  };

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        
        {/* Navigation Tabs */}
        <div className="mb-6 flex flex-col gap-3 border-b border-ink-200 pb-4 dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between">
          <button 
            onClick={onBack}
            className="text-xs font-bold text-ink-500 hover:text-ink-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Continue Shopping
          </button>

          <div className="flex w-full gap-2 overflow-x-auto rounded-xl bg-ink-100 p-1 dark:bg-ink-900 sm:w-auto">
            <button
              onClick={() => setActiveStep('cart')}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-sans font-bold transition-all ${activeStep === 'cart' ? 'bg-jade-500 text-white shadow' : 'text-ink-700 dark:text-ink-400 hover:text-ink-950'}`}
            >
              Cart ({cart.length})
            </button>
            <button
              onClick={() => setActiveStep('checkout')}
              disabled={cartItems.length === 0}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-sans font-bold transition-all ${activeStep === 'checkout' ? 'bg-jade-500 text-white shadow' : 'text-ink-700 dark:text-ink-400 hover:text-ink-950 disabled:opacity-50'}`}
            >
              Checkout
            </button>
            <button
              onClick={() => setActiveStep('orders')}
              className={`shrink-0 rounded-lg px-4 py-2 text-xs font-sans font-bold transition-all ${activeStep === 'orders' ? 'bg-jade-500 text-white shadow' : 'text-ink-700 dark:text-ink-400 hover:text-ink-950'}`}
            >
              My Orders ({myOrders.length})
            </button>
          </div>
        </div>

        {/* STEP 1: Shopping Cart */}
        {activeStep === 'cart' && (
          <div className="space-y-5">
            {/* Cart hero */}
            <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-jade-950 via-jade-900 to-jade-800 px-5 py-6 text-white sm:px-8 sm:py-8">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 82% 10%, rgba(212,175,55,0.55), transparent 42%), radial-gradient(circle at 15% 90%, rgba(255,255,255,0.18), transparent 45%)',
                }}
              />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to marketplace"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 text-white/85 transition-colors hover:bg-white/20 cursor-pointer"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
                    <ShoppingCart className="h-6 w-6" />
                  </span>
                  <div>
                    <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Your Cart</h1>
                    <p className="mt-1 text-xs text-white/70 sm:text-sm">
                      {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} ·{' '}
                      <button onClick={onBack} className="font-semibold text-gold-200 underline underline-offset-4 hover:text-gold-100 cursor-pointer">
                        Keep shopping
                      </button>
                    </p>
                  </div>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10">
                    <Bell className="h-5 w-5 text-white/80" />
                  </span>
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/10">
                    <Headphones className="h-5 w-5 text-white/80" />
                  </span>
                  <span className="ml-2 grid h-14 w-14 place-items-center rounded-2xl bg-gold-300 text-jade-950 shadow-lg shadow-gold-400/20">
                    <ShoppingBag className="h-7 w-7" />
                  </span>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
              {/* Cart line items */}
              <div className="min-w-0 space-y-3">
                {cartItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
                    <EmptyState
                      state="empty-cart"
                      size="sm"
                      icon={<ShoppingCart />}
                      title="Your shopping cart is empty"
                      description="Browse escrow-protected listings and add something you love."
                      action={
                        <button
                          type="button"
                          onClick={() => onNavigate('marketplace')}
                          className="inline-flex items-center gap-2 rounded-xl bg-jade-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-jade-700 cursor-pointer"
                        >
                          Browse marketplace
                        </button>
                      }
                    />
                  </div>
                ) : (
                  cartItems.map((item) => {
                    const selected = !excludedIds.includes(item.id);
                    const seller = db.users.find((u) => u.id === item.sellerId);
                    const sellerProfile = db.profiles.find((p) => p.userId === item.sellerId);
                    const verified = isVerifiedSeller({
                      verificationStatus: sellerProfile?.verificationStatus,
                      verificationExpiresAt: sellerProfile?.verificationExpiresAt,
                    });
                    const qty = qtyFor(item);
                    const saving = item.compareAtPrice && item.compareAtPrice > item.price
                      ? (item.compareAtPrice - item.price) * qty
                      : 0;
                    return (
                      <article
                        key={item.id}
                        className={`relative rounded-3xl border bg-white p-3 shadow-sm transition-all dark:bg-ink-900 sm:p-4 ${
                          selected ? 'border-jade-500/25' : 'border-ink-200 opacity-70 dark:border-ink-800'
                        }`}
                      >
                        <div className="flex gap-3 sm:gap-4">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={selected}
                            aria-label={`${selected ? 'Deselect' : 'Select'} ${item.title}`}
                            onClick={() => toggleSelected(item.id)}
                            className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors cursor-pointer ${
                              selected
                                ? 'border-jade-600 bg-jade-600 text-white'
                                : 'border-ink-300 bg-white text-transparent dark:border-ink-600 dark:bg-ink-900'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </button>

                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-ink-100 dark:bg-ink-800 sm:h-24 sm:w-24">
                            <SmartImage src={item.images?.[0]} alt={item.title} seed={`cart-${item.id}`} className="h-full w-full" imgClassName="object-cover" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-bold text-ink-900 dark:text-white sm:text-base">{item.title}</h3>
                                <p className="mt-0.5 truncate text-[11px] text-ink-500 dark:text-ink-400">
                                  {[item.brand, item.category, item.condition.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              {!preselectedProductId && (
                                <button
                                  type="button"
                                  aria-label={`Remove ${item.title}`}
                                  onClick={() => onRemoveFromCart(item.id)}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-white cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            {verified && (
                              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-jade-500/10 px-2 py-0.5 text-[10px] font-bold text-jade-700 dark:bg-jade-500/15 dark:text-jade-300">
                                <BadgeCheck className="h-3 w-3" /> Verified Seller
                              </span>
                            )}

                            <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
                              <span className="text-base font-black tracking-tight text-jade-700 dark:text-jade-300">
                                ₦{(effectiveProductPrice(item) * qty).toLocaleString()}
                              </span>
                              {item.compareAtPrice && item.compareAtPrice > item.price && (
                                <span className="text-[11px] text-ink-400 line-through">
                                  ₦{(item.compareAtPrice * qty).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {saving > 0 && (
                              <span className="mt-1 inline-flex rounded-full bg-jade-500/10 px-2 py-0.5 text-[10px] font-bold text-jade-600 dark:bg-jade-500/15 dark:text-jade-300">
                                Save ₦{saving.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink-100 pt-3 dark:border-ink-800 sm:mt-2 sm:border-0 sm:pt-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                            {item.quantity <= 5 ? `Only ${item.quantity} left` : 'In stock'}
                          </span>
                          <div className="flex items-center rounded-full border border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-950">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              disabled={qty <= 1}
                              onClick={() => changeQty(item, -1)}
                              className="grid h-8 w-8 place-items-center rounded-full text-ink-600 transition-colors hover:text-jade-700 disabled:opacity-30 dark:text-ink-300 dark:hover:text-jade-300 cursor-pointer"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 text-center text-xs font-black tabular-nums text-ink-900 dark:text-white">{qty}</span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              disabled={qty >= Math.max(1, item.quantity)}
                              onClick={() => changeQty(item, 1)}
                              className="grid h-8 w-8 place-items-center rounded-full text-ink-600 transition-colors hover:text-jade-700 disabled:opacity-30 dark:text-ink-300 dark:hover:text-jade-300 cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}

                {/* Real loyalty redemption — same GoodPoints used by escrow checkout */}
                {cartItems.length > 0 && (
                  <div className="flex items-center gap-3 rounded-3xl border border-jade-500/20 bg-jade-500/[0.07] p-4 dark:border-jade-500/15 dark:bg-jade-500/10">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-jade-600 text-white">
                      <Gift className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink-900 dark:text-white">Have GoodPoints?</p>
                      <p className="text-[11px] text-ink-500 dark:text-ink-400">
                        {applyPoints
                          ? `Redeeming ₦${pointsDiscount.toLocaleString()} (${user.goodPoints.toLocaleString()} points available).`
                          : `${user.goodPoints.toLocaleString()} points available · 1 point = ₦10 off escrow.`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={user.goodPoints <= 50}
                      onClick={() => setApplyPoints((v) => !v)}
                      className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                        applyPoints
                          ? 'border-jade-600 bg-jade-600 text-white'
                          : 'border-jade-600 text-jade-700 hover:bg-jade-500/10 dark:text-jade-300'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {applyPoints ? 'Applied' : 'Apply'}
                    </button>
                  </div>
                )}
              </div>

              {/* Order summary */}
              <aside className="space-y-3 lg:sticky lg:top-24">
                <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900">
                  <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">Order Summary</h2>
                  <div className="mt-4 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-500 dark:text-ink-400">Subtotal ({checkoutItems.length} {checkoutItems.length === 1 ? 'item' : 'items'})</span>
                      <span className="font-bold text-ink-900 dark:text-white">₦{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-500 dark:text-ink-400">{shippingLoading ? 'Calculating delivery…' : 'Shipping fee'}</span>
                      <span className="font-bold text-ink-900 dark:text-white">
                        {shippingError ? 'Unavailable' : requiresManualQuote ? 'Manual quote' : shippingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : deliveryCharge === 0 ? 'Free' : `₦${deliveryCharge.toLocaleString()}`}
                      </span>
                    </div>
                    {!shippingLoading && shippingQuote?.groups.map((group) => {
                      const option = group.options.find((candidate) => candidate.method === deliveryMethod);
                      if (!option) return null;
                      return (
                        <div key={group.sellerId} className="flex justify-between pl-3 text-[10px] text-ink-400">
                          <span className="truncate pr-2">{group.sellerName} · {option.freeShipping ? 'Free' : `₦${option.fee.toLocaleString()}`}</span>
                          <span className="shrink-0">{option.etaMinDays}–{option.etaMaxDays}d</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between">
                      <span className="text-ink-500 dark:text-ink-400">
                        Platform fee{platformFeeMeta.enabled && platformFeeMeta.percentage > 0 ? ` (${platformFeeMeta.percentage}%)` : ''}
                      </span>
                      <span className="font-bold text-ink-900 dark:text-white">₦{escrowFee.toLocaleString()}</span>
                    </div>
                    {hasGoodSaleProtect && (
                      <div className="flex justify-between text-jade-700 dark:text-jade-300">
                        <span>GoodSale Protect™</span>
                        <span className="font-bold">₦{protectFee.toLocaleString()}</span>
                      </div>
                    )}
                    {pointsDiscount > 0 && (
                      <div className="flex justify-between text-jade-700 dark:text-jade-300">
                        <span>GoodPoints discount</span>
                        <span className="font-bold">−₦{pointsDiscount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between border-t border-ink-100 pt-3 dark:border-ink-800">
                      <span className="text-sm font-bold text-ink-900 dark:text-white">Total</span>
                      <span className="font-display text-xl font-black text-jade-700 dark:text-jade-300">₦{totalDue.toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveStep('checkout')}
                    disabled={checkoutItems.length === 0}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-400 px-4 py-3.5 text-sm font-black text-ink-900 shadow-lg shadow-gold-400/25 transition-all hover:from-gold-200 hover:to-gold-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    <Shield className="h-4 w-4" />
                    Proceed to Checkout
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-medium text-ink-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-jade-500" /> Escrow protected · funds release after delivery PIN
                  </p>
                </div>

                <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-700 dark:text-ink-200">
                    <Headphones className="h-3.5 w-3.5 text-jade-600 dark:text-jade-400" /> Need help with an order?
                  </p>
                  <button
                    onClick={() => onNavigate('support')}
                    className="mt-1.5 text-[11px] font-semibold text-jade-700 hover:text-jade-600 dark:text-jade-300 cursor-pointer"
                  >
                    Open the support centre →
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* STEP 2: Premium four-step checkout */}
        {activeStep === 'checkout' && (
          <PremiumCheckout
            items={checkoutItems.map((item) => ({ product: item, quantity: qtyFor(item) }))}
            user={user}
            profile={db.profiles.find((entry) => entry.userId === user.id)}
            revenueSettings={db.revenueSettings}
            paymentSettings={db.paymentSettings}
            deliveryPartners={db.deliveryPartners}
            onBack={() => setActiveStep('cart')}
            onOrders={() => setActiveStep('orders')}
            onClearCart={onClearCart}
          />
        )}

        {/* Legacy single-page checkout retained as a fallback during rollout. */}
        {activeStep === 'checkout-legacy' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Core checkout form */}
            <div className="lg:col-span-8 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-6">
              <h3 className="font-sans font-semibold text-sm text-ink-900 dark:text-white pb-3 border-b border-ink-100 dark:border-ink-800 flex items-center gap-1.5">
                <CreditCard className="w-5 h-5 text-jade-500" />
                Nigerian Delivery & Escrow Payout Rules
              </h3>

              {/* Preset selectors */}
              <div className="p-4 bg-ink-50 dark:bg-ink-800/40 rounded-2xl space-y-3">
                <span className="text-xs font-bold text-ink-400 tracking-tight block">Delivery Location</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePresetLocation('Lag')}
                    className="p-2.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl hover:border-jade-500 text-xs font-bold transition-all cursor-pointer text-left"
                  >
                    Lagos Lekki Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetLocation('Abj')}
                    className="p-2.5 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl hover:border-jade-500 text-xs font-bold transition-all cursor-pointer text-left"
                  >
                    Abuja CBD Preset
                  </button>
                </div>
                <button
                  type="button"
                  onClick={useMyGpsLocation}
                  className="w-full flex items-center justify-center gap-2 p-2.5 bg-jade-500/10 border border-jade-500/30 rounded-xl text-xs font-bold text-jade-700 dark:text-jade-400 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Use my live GPS location
                  {buyerGps.source === 'gps' && (
                    <span className="font-mono text-xs opacity-80">
                      {deliveryLat.toFixed(4)}, {deliveryLng.toFixed(4)}
                    </span>
                  )}
                </button>
                <div className="rounded-2xl overflow-hidden border border-ink-200 dark:border-ink-700">
                  <LiveDispatchMap
                    destination={buyerGps.source === 'gps' ? buyerGps.coords : null}
                    statusLabel={buyerGps.source === 'gps' ? 'GPS-confirmed delivery pin' : 'Waiting for a GPS fix'}
                    geoError={buyerGps.source === 'gps' ? buyerGps.error : 'A live location will appear only after you grant GPS access'}
                    gpsLocked={false}
                    height="300px"
                  />
                </div>
              </div>

              {/* Input details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="text-ink-400 block mb-1">Detailed Delivery Address</label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-jade-500"
                  />
                </div>

                <div>
                  <label className="text-ink-400 block mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-ink-400 block mb-1">State / Region</label>
                  <input
                    type="text"
                    required
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-ink-400 block mb-1">Recipient Mobile Phone</label>
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white"
                  />
                </div>
              </div>

              {/* DELIVERY AND LOGISTICS OPTIONS */}
              <div className="space-y-4 pt-4 border-t border-ink-100 dark:border-ink-800">
                <span className="text-xs font-bold text-ink-400 tracking-tight block">Delivery & Logistics Carrier</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: GoodDispatch Network */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMethod('GOODSALE_PARTNER');
                      setSelectedPartnerId(null);
                      setSmartMatchResult(null);
                    }}
                    className={`p-4 border rounded-2xl text-left transition-all relative ${
                      deliveryMethod === 'GOODSALE_PARTNER'
                        ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                        : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Truck className="w-5 h-5 text-jade-500" />
                      <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white">GoodDispatch™</span>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400 leading-normal">
                      Verified dispatch riders with real-time GPS & secure PIN release.
                    </p>
                    <div className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold font-mono px-2 py-0.5 bg-jade-100 dark:bg-jade-950/40 text-jade-600 rounded-full">
                      {shippingLoading ? 'Pricing…' : methodAvailable('GOODSALE_PARTNER') ? `₦${methodTotal('GOODSALE_PARTNER').toLocaleString()}` : 'Unavailable'}
                    </div>
                  </button>

                  {/* Option 2: Third Party Courier */}
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMethod('THIRD_PARTY_COURIER');
                      setSelectedPartnerId(null);
                      setSmartMatchResult(null);
                    }}
                    className={`p-4 border rounded-2xl text-left transition-all relative ${
                      deliveryMethod === 'THIRD_PARTY_COURIER'
                        ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                        : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ExternalLink className="w-5 h-5 text-jade-500" />
                      <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white">Third-Party Courier</span>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400 leading-normal">
                      Booked with a configured courier. If the route has no rate, GoodSale arranges a manual quotation.
                    </p>
                    <div className="mt-2.5 inline-block text-xs font-bold font-mono px-2 py-0.5 bg-jade-100 dark:bg-jade-950/40 text-jade-600 rounded-full">
                      {shippingLoading ? 'Pricing…' : methodAvailable('THIRD_PARTY_COURIER') ? `₦${methodTotal('THIRD_PARTY_COURIER').toLocaleString()}` : 'Manual quote'}
                    </div>
                  </button>

                  {/* Option 3: Store Pickup */}
                  <button
                    type="button"
                    disabled={cartItems.some(item => !item.pickupAvailable)}
                    onClick={() => {
                      setDeliveryMethod('PICKUP');
                      setSelectedPartnerId(null);
                      setSmartMatchResult(null);
                    }}
                    className={`p-4 border rounded-2xl text-left transition-all relative disabled:opacity-40 ${
                      deliveryMethod === 'PICKUP'
                        ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                        : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <MapPin className="w-5 h-5 text-ink-500" />
                      <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white">Store Self-Pickup</span>
                    </div>
                    <p className="text-xs text-ink-500 dark:text-ink-400 leading-normal">
                      Pick up directly from the merchant&apos;s physical shop or SafeMeet hub.
                    </p>
                    <div className="mt-2.5 inline-block text-xs font-bold font-mono px-2 py-0.5 bg-ink-100 dark:bg-ink-950/40 text-ink-600 rounded-full">
                      {methodAvailable('PICKUP') ? 'Free ₦0' : 'Seller pickup unavailable'}
                    </div>
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-ink-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {shippingLoading ? 'Calculating delivery time…' : shippingEta ? `Estimated delivery in ${shippingEta.min}–${shippingEta.max} day${shippingEta.max === 1 ? '' : 's'}` : 'Delivery time shown once a route is priced'}
                  </span>
                  {shippingQuote?.groups.length ? <span className="text-ink-400">{shippingQuote.groups.length} seller shipment{shippingQuote.groups.length === 1 ? '' : 's'} · fees combined</span> : null}
                </div>
                {shippingError ? <p className="text-xs font-semibold text-ink-500">{shippingError}</p> : null}
                {requiresManualQuote && !shippingError ? (
                  <p className="text-xs font-semibold text-amber-600">
                    This route is outside the automatic pricing tiers. Select another method or ask support for a manual courier quotation.
                  </p>
                ) : null}
              </div>

              {/* GOODDISPATCH MARKETPLACE AND SMART MATCHING PANEL */}
              {deliveryMethod === 'GOODSALE_PARTNER' && (
                <div className="p-5 bg-ink-50 dark:bg-ink-800/20 border border-ink-200 dark:border-ink-800 rounded-3xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-ink-200/60 dark:border-ink-800 pb-3">
                    <div>
                      <h4 className="font-sans font-semibold text-xs text-ink-900 dark:text-white flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-jade-500" />
                        GoodDispatch™ Delivery Marketplace
                      </h4>
                      <p className="text-xs text-ink-400 mt-0.5">Select a verified rider or use our machine-learning match system.</p>
                    </div>

                    <button
                      type="button"
                      disabled={smartMatchingActive}
                      onClick={runSmartMatching}
                      className="px-3 py-1.5 bg-jade-600 hover:bg-jade-700 dark:bg-jade-500 dark:hover:bg-jade-600 text-white font-sans font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 shadow-sm disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-ink-300 animate-spin-slow" />
                      {smartMatchingActive ? 'Smart Matching...' : 'Smart Match Me'}
                    </button>
                  </div>

                  {/* Service speed selection */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-ink-400 tracking-tight block">Select Service Tier</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { type: 'ECONOMY' as const, label: 'Economy', desc: 'Lowest cost' },
                        { type: 'STANDARD' as const, label: 'Standard', desc: 'Everyday delivery' },
                        { type: 'EXPRESS' as const, label: 'Express', desc: 'Fastest option' },
                      ].map((tier) => (
                        <button
                          key={tier.type}
                          type="button"
                          onClick={() => setServiceType(tier.type as any)}
                          className={`p-2.5 border rounded-xl text-center transition-all ${
                            serviceType === tier.type
                              ? 'border-jade-500 bg-jade-500/5 text-jade-600 dark:text-jade-400 font-bold'
                              : 'border-ink-200 dark:border-ink-800 text-ink-600 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800'
                          }`}
                        >
                          <span className="block text-xs">{tier.label}</span>
                          <span className="block text-xs font-mono mt-0.5">
                            {shippingLoading ? '…' : requiresManualQuote ? 'Manual' : shippingQuote?.serviceTotals?.[tier.type] != null ? `₦${shippingQuote.serviceTotals[tier.type].toLocaleString()}` : '—'}
                          </span>
                          <span className="block text-[10px] text-ink-400 font-medium mt-0.5">{tier.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Match alert or result banner */}
                  {smartMatchingActive && (
                    <div className="p-4 bg-white dark:bg-ink-900 border border-jade-500/30 rounded-2xl text-center space-y-2 animate-pulse">
                      <div className="w-8 h-8 rounded-full border-2 border-jade-500 border-t-transparent animate-spin mx-auto"></div>
                      <p className="text-xs font-sans font-semibold text-ink-800 dark:text-ink-200">
                        Running multi-criteria compatibility algorithm...
                      </p>
                      <p className="text-xs text-ink-400 max-w-xs mx-auto">
                        Evaluating courier workload, coordinates proximity, rating thresholds, vehicle capacities, and safety trust index.
                      </p>
                    </div>
                  )}

                  {smartMatchResult && !smartMatchingActive && (
                    <div className="p-3 bg-jade-500/10 border border-jade-500/20 rounded-xl text-left flex gap-2.5 items-start">
                      <Sparkles className="w-4 h-4 text-jade-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-jade-800 dark:text-jade-300 leading-normal font-sans">
                        {smartMatchResult}
                      </p>
                    </div>
                  )}

                  {/* Courier grid list */}
                  {!smartMatchingActive && (
                    <div className="space-y-2.5">
                      <span className="text-xs font-bold text-ink-400 tracking-tight block">Available Couriers Marketplace</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                        {rankedCouriers.map(({ partner: courier, distanceKm: distance, etaMinutes, score }) => {
                            const isSelected = selectedPartnerId === courier.id;
                            
                            // Estimate dynamic times based on service type
                            let pickup = `${Math.max(10, etaMinutes)} mins`;
                            let delivery = `${Math.max(etaMinutes + 20, 45)} mins`;
                            if (serviceType === 'EXPRESS') {
                              pickup = `${Math.max(8, Math.round(etaMinutes * 0.7))} mins`;
                              delivery = `${Math.max(etaMinutes + 10, 30)} mins`;
                            } else if (serviceType === 'ECONOMY') {
                              pickup = `${Math.max(20, etaMinutes + 10)} mins`;
                              delivery = 'Same Day';
                            }

                            return (
                              <button
                                key={courier.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPartnerId(courier.id);
                                  setSmartMatchResult(null); // Clear automated tag to reflect manual choice
                                }}
                                className={`p-3 border rounded-xl text-left transition-all cursor-pointer flex gap-3 relative ${
                                  isSelected
                                    ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                                    : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900/45'
                                }`}
                              >
                                {/* Photo or initials avatar */}
                                <div className="w-10 h-10 rounded-full bg-ink-100 dark:bg-ink-800 shrink-0 overflow-hidden relative flex items-center justify-center">
                                  {courier.photoUrl ? (
                                    <img
                                      src={courier.photoUrl}
                                      alt={courier.fullName}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-xs font-bold font-sans text-ink-500">
                                      {courier.fullName.split(' ').map(n => n[0]).join('')}
                                    </span>
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-jade-500/10 flex items-center justify-center">
                                      <CheckCircle2 className="w-5 h-5 text-jade-500 bg-white dark:bg-ink-900 rounded-full" />
                                    </div>
                                  )}
                                </div>

                                {/* Courier details */}
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-1">
                                    <span className="font-sans font-semibold text-xs text-ink-900 dark:text-white truncate">
                                      {courier.fullName}
                                    </span>
                                    <ShieldAlert className="w-3.5 h-3.5 text-ink-500 fill-ink-100 dark:fill-none" />
                                    <span className="text-[10px] bg-ink-100 dark:bg-ink-800 font-mono font-bold text-ink-500 dark:text-ink-400 px-1 rounded">
                                      {courier.trustScore}%
                                    </span>
                                  </div>

                                  <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-ink-400">
                                    <span className="font-semibold text-ink-600 dark:text-ink-300">
                                      {courier.vehicleType === 'BICYCLE' ? 'Bicycle' :
                                       courier.vehicleType === 'MOTORCYCLE' ? 'Motorcycle' :
                                       courier.vehicleType === 'CAR' ? 'Car' :
                                       courier.vehicleType === 'KEKE' ? 'Keke' : 'Van/Truck'}
                                    </span>
                                    <span>•</span>
                                    <span>Rating {courier.rating}</span>
                                    <span>•</span>
                                    <span>{courier.completedDeliveries} Jobs</span>
                                  </div>

                                  <div className="flex items-center justify-between text-xs text-ink-500 pt-1 border-t border-ink-100 dark:border-ink-800/80 mt-1">
                                    <span>{formatDistanceKm(distance)} · {score}% match</span>
                                    <span className="font-mono text-jade-500 font-semibold">{pickup} / {delivery}</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Courier preference is optional; GoodSale assigns after payment if skipped. */}
                  {!selectedPartnerId && (
                    <p className="text-xs font-semibold text-ink-500 flex items-center gap-1">
                      Optional: choose a preferred rider, or GoodSale will assign an available courier after payment.
                    </p>
                  )}

                  {/* MERCHANT PAYMENT CHANNELS SELECTOR */}
                  <div className="border-t border-ink-100 dark:border-ink-800 pt-5 mt-4 space-y-4">
                    <div>
                      <span className="text-xs font-bold text-ink-400 tracking-tight block mb-1">Select Checkout Payment Channel</span>
                      <p className="text-xs text-ink-400">The merchant has configured specific payment options for this item. Please select your preferred mode:</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {allowedCheckoutMethods.map((method: string) => {
                        const mLower = method.toLowerCase();
                        const isSelected = selectedPaymentMethod === mLower;
                        
                        let label = 'GoodSale Escrow';
                        let icon = <Shield className="w-4 h-4 text-jade-500" />;
                        let desc = 'Secure buyer lock';

                        if (mLower === 'card') {
                          label = 'Credit / Debit Card';
                          icon = <CreditCard className="w-4 h-4 text-jade-500" />;
                          desc = 'Pay with Card';
                        } else if (mLower === 'bank') {
                          label = 'Direct Bank Transfer';
                          icon = <ExternalLink className="w-4 h-4 text-jade-500" />;
                          desc = 'Instant transfer';
                        } else if (mLower === 'cod') {
                          label = 'Cash on Delivery';
                          icon = <Truck className="w-4 h-4 text-ink-500" />;
                          desc = 'Pay at door';
                        } else if (mLower === 'invoice') {
                          label = 'Business Invoice';
                          icon = <FileText className="w-4 h-4 text-jade-500" />;
                          desc = 'Net term billing';
                        } else if (mLower === 'partial') {
                          label = 'Partial Deposit';
                          icon = <Coins className="w-4 h-4 text-ink-500" />;
                          desc = `${currentCheckoutItem?.partialPercent || 30}% deposit payment`;
                        }

                        return (
                          <button
                            key={mLower}
                            type="button"
                            onClick={() => setSelectedPaymentMethod(mLower)}
                            className={`p-3 border rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between h-24 ${
                              isSelected
                                ? 'border-jade-500 bg-jade-500/5 ring-1 ring-jade-500'
                                : 'border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700 bg-white dark:bg-ink-900/45'
                            }`}
                          >
                            <div className="flex justify-between items-start w-full">
                              {icon}
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-jade-500 fill-white dark:fill-none" />}
                            </div>
                            <div>
                              <span className="block text-xs font-bold text-ink-800 dark:text-white leading-tight">
                                {label}
                              </span>
                              <span className="block text-xs text-ink-400 mt-0.5 leading-none">
                                {desc}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* DYNAMIC SUB-VIEWS BASED ON SELECTION */}
                    {selectedPaymentMethod === 'bank' && (
                      <div className="p-4 bg-jade-500/5 border border-jade-500/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-2.5">
                          <ExternalLink className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-jade-800 dark:text-jade-400">Direct Bank Transfer Instructions</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              Please transfer the exact checkout amount of <strong className="text-jade-700 dark:text-jade-300 font-mono">₦{totalDue.toLocaleString()}</strong> to the GoodSale Escrow settlement account:
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 bg-white dark:bg-ink-900 p-3 rounded-xl border border-jade-100 dark:border-jade-950 text-xs">
                          <div>
                            <span className="text-ink-400 block">Settlement Bank</span>
                            <span className="font-bold text-ink-800 dark:text-ink-200">Wema Bank (Alat Escrow Hub)</span>
                          </div>
                          <div>
                            <span className="text-ink-400 block">Account Number</span>
                            <span className="font-semibold text-ink-950 dark:text-white font-mono tracking-wider">1023847586</span>
                          </div>
                          <div className="col-span-2 border-t border-ink-100 dark:border-ink-800 pt-1.5 mt-0.5">
                            <span className="text-ink-400 block">Account Name</span>
                            <span className="font-bold text-ink-800 dark:text-ink-200">GoodSale Nigeria Marketplace Ltd (Escrow Account)</span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <label className="text-xs font-bold text-ink-500 dark:text-ink-400 tracking-tight block">
                            Upload Payment Transaction Screenshot Receipt (Mandatory for Review)
                          </label>
                          <div className="flex items-center gap-3">
                            <label
                              className={`px-4 py-2 bg-jade-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 hover:bg-jade-600 transition-all cursor-pointer ${
                                bankTransferUploading ? 'pointer-events-none opacity-50' : ''
                              }`}
                            >
                              {bankTransferUploading ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              {bankTransferReceipt ? 'Receipt Re-upload' : 'Upload Transaction Slip'}
                              <input
                                type="file"
                                accept="image/png,image/jpeg"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  setBankTransferUploading(true);
                                  try {
                                    const { uploadMedia } = await import('@/lib/upload');
                                    const url = await uploadMedia(file, 'product-images');
                                    setBankTransferReceipt(url);
                                    toast.success('Payment receipt uploaded.');
                                  } catch {
                                    toast.error('Receipt upload failed. Use a PNG or JPG under 5MB.');
                                  } finally {
                                    setBankTransferUploading(false);
                                  }
                                }}
                              />
                            </label>
                            {bankTransferReceipt ? (
                              <div className="flex items-center gap-1 text-xs font-semibold text-jade-500">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span className="truncate max-w-[150px]">Receipt attached</span>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-400">Allowed formats: PNG, JPG (Max 5MB)</span>
                            )}
                          </div>
                          {bankTransferReceipt && (
                            <p className="text-xs text-jade-600 font-medium">
                              Receipt attached successfully! The transaction will enter pending review status upon order submit.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedPaymentMethod === 'invoice' && (
                      <div className="p-4 bg-jade-500/5 border border-jade-500/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-2.5">
                          <FileText className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-jade-800 dark:text-jade-400">Business Net Term Invoice Checkout</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              This payment mode allows corporate business profiles to checkout immediately and get invoiced under neutral credit-payment agreements.
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-bold text-ink-500 tracking-tight block mb-1">Select Net Billing Terms</label>
                          <select
                            value={invoiceTerms}
                            onChange={(e) => setInvoiceTerms(e.target.value)}
                            className="px-3 py-1.5 text-xs bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg text-ink-800 dark:text-white focus:outline-none"
                          >
                            <option value="Net 15">Net 15 (Payment due in 15 days)</option>
                            <option value="Net 30">Net 30 (Payment due in 30 days)</option>
                            <option value="Net 60">Net 60 (Payment due in 60 days - Approved partners only)</option>
                          </select>
                        </div>

                        <div className="p-3 bg-white dark:bg-ink-900 rounded-xl border border-jade-100 dark:border-jade-950 text-xs space-y-1">
                          <p className="font-bold text-ink-700 dark:text-ink-200 text-xs mb-1">Corporate Ledger Preview</p>
                          <div className="flex justify-between">
                            <span className="text-ink-400">Billing Terms:</span>
                            <span className="font-semibold text-ink-800 dark:text-ink-200">{invoiceTerms}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-400">Invoice Sum Amount:</span>
                            <span className="font-bold text-ink-800 dark:text-ink-200">₦{totalDue.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-ink-400">Due Date grace:</span>
                            <span className="font-semibold text-ink-800 dark:text-ink-200">
                              {new Date(Date.now() + (invoiceTerms === 'Net 30' ? 30 : invoiceTerms === 'Net 60' ? 60 : 15) * 24 * 60 * 60 * 1000).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-ink-500 font-medium leading-relaxed pt-1.5 border-t border-ink-50 dark:border-ink-800 mt-1 font-sans">
                            Outstanding balances not settled on schedule accrue a 2% monthly late payment surcharge penalty.
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedPaymentMethod === 'card' && (
                      <div className="p-4 bg-jade-500/5 border border-jade-500/20 rounded-2xl space-y-3">
                        <div className="flex items-start gap-2.5">
                          <CreditCard className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-jade-800 dark:text-jade-400">Paystack Card Checkout</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              Card details are never collected on GoodSale. You will complete payment inside Paystack&apos;s PCI-compliant popup after the order is created.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedPaymentMethod === 'cod' && (
                      <div className="p-4 bg-ink-500/5 border border-ink-500/20 rounded-2xl space-y-2">
                        <div className="flex items-start gap-2.5">
                          <Truck className="w-5 h-5 text-ink-500 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <h5 className="font-bold text-ink-800 dark:text-ink-200">Cash on Delivery (COD) Agreement</h5>
                            <p className="text-ink-500 dark:text-ink-300 mt-1 leading-relaxed">
                              You will pay in cash or via point-of-sale transfer directly to the logistics handler upon verified package handover.
                            </p>
                            <p className="text-xs text-ink-500 font-medium leading-relaxed mt-1.5 font-sans">
                              Note: Delivery charge & protect premiums must still be authorized on order submit. Fraudulent refusals of handovers result in dynamic Trust Score deductions!
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* GOODSALE PROTECT BUYER PURCHASE PROTECTION */}
              <div className="p-5 border border-jade-500/20 bg-gradient-to-br from-jade-500/[0.02] to-ink-500/[0.01] dark:from-jade-950/10 dark:to-transparent rounded-3xl space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-jade-500 shrink-0" />
                    <div>
                      <span className="text-[10px] bg-ink-500/10 text-ink-600 font-mono font-semibold tracking-tight px-2 py-0.5 rounded-full">
                        RECOMMENDED PROTECTION
                      </span>
                      <h4 className="font-sans font-semibold text-xs text-ink-950 dark:text-white mt-1">
                        GoodSale Protect™ Premium Coverage
                      </h4>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasGoodSaleProtect}
                      onChange={(e) => setHasGoodSaleProtect(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-ink-200 dark:bg-ink-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-jade-500"></div>
                  </label>
                </div>

                <p className="text-xs text-ink-500 dark:text-ink-400 leading-relaxed">
                  Safeguard your transaction and logistics from end-to-end. Rest assured that your capital is completely backed and protected against any courier accidents, damages, or disputes.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-ink-100 dark:border-ink-800">
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Priority Support Ticket Queue</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Extended 14-day hold window</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Enhanced Dispute Arbitration</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                    <CheckCircle className="w-3.5 h-3.5 text-jade-500 shrink-0" />
                    <span>Complete Transit Cover Coverage</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 mt-1 border-t border-ink-100 dark:border-ink-800">
                  <span className="text-xs font-sans font-bold text-ink-700 dark:text-ink-300">Coverage Premium Fee</span>
                  <span className="text-xs font-mono font-semibold text-ink-900 dark:text-white">
                    +₦{(db.revenueSettings?.goodSaleProtectFee || 1500).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Escrow declaration checks */}
              <div className="p-4 bg-jade-50 dark:bg-jade-950/20 border border-jade-500/20 rounded-2xl flex items-start gap-3">
                <Shield className="w-5 h-5 text-jade-500 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <h4 className="font-sans font-bold text-jade-800 dark:text-jade-400">Payment Security Escrow Shield Promise</h4>
                  <ul className="list-disc list-inside space-y-1 mt-1.5 text-jade-700 dark:text-jade-300/80 leading-relaxed text-xs">
                    <li>We protect buyer capital inside neutral lock until package validates.</li>
                    <li>We dispatch secret 6-digit delivery confirmation PIN codes automatically.</li>
                    <li>Any merchant dispute is freeze-investigated by a neutral GoodSale Admin auditor.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Checkout Pricing checkout button sidebar */}
            <div className="lg:col-span-4 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-3xl p-6 shadow-sm space-y-4 font-sans">
              <h4 className="font-sans font-bold text-xs tracking-tight text-ink-500 dark:text-ink-400">Final Payout Ledger</h4>
              
              <div className="space-y-2 text-xs border-b border-ink-100 dark:border-ink-800 pb-3">
                <div className="flex justify-between">
                  <span className="text-ink-400">Item Cost</span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">
                    {platformFeeMeta.enabled && platformFeeMeta.percentage > 0
                      ? `Platform fee (${platformFeeMeta.percentage}%)`
                      : 'Platform fee — Free'}
                  </span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">₦{escrowFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-400">Delivery charge ({deliveryMethod === 'GOODSALE_PARTNER' ? serviceType : deliveryMethod === 'PICKUP' ? 'Pickup' : 'Courier'})</span>
                  <span className="font-bold text-ink-800 dark:text-ink-200">
                    {shippingLoading ? 'Calculating…' : requiresManualQuote ? 'Manual quote' : deliveryCharge === 0 ? 'Free' : `₦${deliveryCharge.toLocaleString()}`}
                  </span>
                </div>
                {!shippingLoading && shippingQuote?.groups.map((group) => {
                  const option = group.options.find((candidate) => candidate.method === deliveryMethod);
                  if (!option) return null;
                  return (
                    <div key={group.sellerId} className="flex justify-between pl-3 text-[10px] text-ink-400">
                      <span className="truncate pr-2">{group.sellerName}</span>
                      <span>{option.freeShipping ? 'Free shipping' : `₦${option.fee.toLocaleString()}`} · {option.etaMinDays}–{option.etaMaxDays}d</span>
                    </div>
                  );
                })}
                {shippingError ? <p className="text-[10px] text-ink-500 leading-snug">{shippingError}</p> : null}
                {requiresManualQuote && !shippingError ? <p className="text-[10px] text-amber-600 leading-snug">This route needs an administrator manual quotation before payment.</p> : null}
                {hasGoodSaleProtect && (
                  <div className="flex justify-between text-jade-600 dark:text-jade-400 font-semibold">
                    <span>GoodSale Protect™ Fee</span>
                    <span>₦{protectFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-sm text-ink-950 dark:text-white pt-2 border-t border-ink-50 dark:border-ink-800">
                  <span>Grand Total (₦)</span>
                  <span>₦{totalDue.toLocaleString()}</span>
                </div>

                {selectedPaymentMethod === 'partial' && (
                  <div className="space-y-1.5 p-3 bg-ink-500/[0.04] border border-ink-500/20 rounded-2xl text-xs mt-2">
                    <div className="flex justify-between text-ink-600 dark:text-ink-400 font-bold">
                      <span>Deposit Due Today ({currentCheckoutItem?.partialPercent || 30}%):</span>
                      <span>₦{Math.round(totalDue * ((currentCheckoutItem?.partialPercent || 30) / 100)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-ink-400 text-xs">
                      <span>Remaining Balance Due:</span>
                      <span>₦{(totalDue - Math.round(totalDue * ((currentCheckoutItem?.partialPercent || 30) / 100))).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-ink-500 leading-normal font-sans font-medium">
                      Settle the remaining balance within {currentCheckoutItem?.partialRemainingDays || 7} days of verified courier handover.
                    </p>
                  </div>
                )}
              </div>

              {selectedPaymentMethod === 'bank' && !bankTransferReceipt && (
                <p className="text-xs text-ink-500 font-medium leading-normal p-2.5 bg-ink-500/5 rounded-xl border border-ink-500/10">
                  Please upload your transfer screenshot receipt above to activate the submit button.
                </p>
              )}

              <button
                disabled={
                  shippingBlocked ||
                  (selectedPaymentMethod === 'bank' && !bankTransferReceipt)
                }
                onClick={() => {
                  void handlePayIntoEscrow(
                    selectedPaymentMethod === 'bank'
                      ? 'BANK'
                      : selectedPaymentMethod === 'invoice'
                        ? 'INVOICE'
                        : selectedPaymentMethod === 'cod'
                          ? 'COD'
                          : selectedPaymentMethod === 'partial'
                            ? 'partial'
                            : selectedPaymentMethod === 'card'
                              ? 'card'
                              : 'escrow'
                  );
                }}
                className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-sans font-semibold text-xs rounded-xl transition-all shadow-lg shadow-jade-500/20 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Shield className="w-4 h-4 text-ink-300" />
                {shippingLoading ? (
                  'Calculating delivery…'
                ) : requiresManualQuote ? (
                  'Manual quotation required'
                ) : shippingError ? (
                  'Delivery unavailable'
                ) : selectedPaymentMethod === 'bank' ? (
                  'Submit Transfer for Review'
                ) : selectedPaymentMethod === 'invoice' ? (
                  'Submit Business Invoice'
                ) : selectedPaymentMethod === 'cod' ? (
                  'Confirm COD Order'
                ) : selectedPaymentMethod === 'partial' ? (
                  `Pay ₦${Math.round(totalDue * ((currentCheckoutItem?.partialPercent || 30) / 100)).toLocaleString()} Deposit`
                ) : (
                  'Pay Securely into Escrow'
                )}
              </button>
            </div>

          </div>
        )}

        {/* STEP 3: buyer and seller order hub */}
        {activeStep === 'orders' && (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-[2rem] border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900">
              <div className="relative overflow-hidden bg-gradient-to-br from-jade-950 via-jade-900 to-jade-800 px-5 py-6 text-white sm:px-7 sm:py-7">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 88% 10%, rgba(212,175,55,0.5), transparent 42%), radial-gradient(circle at 8% 92%, rgba(255,255,255,0.14), transparent 45%)',
                  }}
                />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold-200">
                      <ShieldCheck className="h-3 w-3" /> Escrow protected
                    </span>
                    <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">My orders</h1>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-white/65 sm:text-sm">
                      See what you bought, where it is, and the next step. Every payment stays protected until delivery is confirmed.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:min-w-[280px]">
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Active</p>
                      <p className="mt-0.5 text-lg font-extrabold leading-none">{activeOrderCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">Delivered</p>
                      <p className="mt-0.5 text-lg font-extrabold leading-none">{deliveredOrderCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 backdrop-blur">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">In escrow</p>
                      <p className="mt-0.5 truncate text-[11px] font-extrabold leading-tight">₦{escrowProtectedValue.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {myOrders.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-t border-ink-100 bg-white px-3 py-3 dark:border-ink-800 dark:bg-ink-900 sm:px-4">
                  {orderFilters.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setOrderFilter(filter.id)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold transition-colors cursor-pointer ${
                        orderFilter === filter.id
                          ? 'bg-jade-600 text-white shadow-sm'
                          : 'border border-ink-200 bg-white text-ink-500 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-300'
                      }`}
                    >
                      {filter.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${orderFilter === filter.id ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'}`}>
                        {filter.count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {myOrders.length === 0 ? (
              <section className="rounded-[2rem] border border-dashed border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
                <EmptyState
                  state="empty-cart"
                  size="md"
                  icon={<ShoppingBag />}
                  title="No orders yet"
                  description="When you buy or sell something, it will appear here with its payment, delivery and escrow status in one place."
                  action={
                    <button
                      type="button"
                      onClick={onBack}
                      className="rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-jade-700 cursor-pointer"
                    >
                      Browse the marketplace
                    </button>
                  }
                />
              </section>
            ) : filteredOrders.length === 0 ? (
              <section className="rounded-[2rem] border border-ink-200 bg-white p-10 text-center dark:border-ink-800 dark:bg-ink-900">
                <Package className="mx-auto h-7 w-7 text-ink-300 dark:text-ink-600" />
                <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">No orders in this view</p>
                <p className="mt-1 text-xs text-ink-400">Try another filter to see the rest of your orders.</p>
                <button
                  type="button"
                  onClick={() => setOrderFilter('all')}
                  className="mt-4 rounded-xl border border-ink-200 px-4 py-2 text-xs font-bold text-ink-600 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:text-ink-300 cursor-pointer"
                >
                  Show all orders
                </button>
              </section>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const product = db.products.find(p => p.id === order.productId);
                  const isBuyer = order.buyerId === user.id;
                  const activeDispute = db.disputes.find(d => d.orderId === order.id);
                  const delivery = (db.deliveries || []).find(d => d.orderId === order.id);
                  const deliveryRider = delivery?.riderId
                    ? db.deliveryPartners.find(p => p.id === delivery.riderId)
                    : undefined;
                  const meta = orderStatusMeta(order.status);
                  const isDelivered = order.status === OrderStatus.DELIVERED_SUCCESS;
                  const isExpanded = expandedOrderId === order.id;
                  const canTrack = orderHasEscrowStarted(order.status);
                  const canReportIssue = isBuyer && [
                    OrderStatus.PENDING,
                    OrderStatus.PAID_ESCROW,
                    OrderStatus.SHIPPED,
                    OrderStatus.OUT_FOR_DELIVERY,
                  ].includes(order.status);
                  const seller = db.users.find((candidate) => candidate.id === order.sellerId);
                  const sellerBusiness = db.businesses.find((business) => business.ownerId === order.sellerId);
                  const sellerName = sellerBusiness?.name || seller?.fullName || 'GoodSale seller';
                  const buyer = db.users.find((candidate) => candidate.id === order.buyerId);
                  const trackingHref = `/track/${encodeURIComponent(delivery?.trackingId || order.orderNumber)}`;
                  const etaText = delivery?.estimatedDeliveryDate
                    ? new Date(`${delivery.estimatedDeliveryDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                    : order.estimatedDeliveryMinDays != null && order.estimatedDeliveryMaxDays != null
                      ? `${order.estimatedDeliveryMinDays}–${order.estimatedDeliveryMaxDays} days`
                      : 'Confirmed after dispatch';
                  const escrowState = isDelivered
                    ? 'Released to seller'
                    : order.status === OrderStatus.DISPUTED || order.status === OrderStatus.REFUND_REQUESTED
                      ? 'On hold'
                      : order.status === OrderStatus.REFUNDED
                        ? 'Refunded'
                        : ESCROW_ACTIVE_STATUSES.includes(order.status)
                          ? 'Protected in escrow'
                          : 'Not funded yet';

                  return (
                    <article
                      key={order.id}
                      className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition-colors dark:bg-ink-900 ${
                        isExpanded
                          ? 'border-jade-500/45 ring-1 ring-jade-500/10'
                          : 'border-ink-200 hover:border-jade-400/40 dark:border-ink-800'
                      }`}
                    >
                      <div className="p-4 sm:p-5">
                        <div className="flex gap-3 sm:gap-4">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-ink-100 dark:bg-ink-800 sm:h-20 sm:w-20">
                            <SmartImage
                              src={order.productImage || product?.images?.[0] || ''}
                              alt={order.productTitle || product?.title || 'Ordered item'}
                              seed={`order-${order.id}`}
                              className="h-full w-full"
                              imgClassName="object-cover"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold ${ORDER_TONE_CLASSES[meta.tone]}`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    {meta.label}
                                  </span>
                                  <span className="rounded-full border border-ink-200 px-2 py-0.5 text-[9px] font-semibold text-ink-400 dark:border-ink-700">
                                    {isBuyer ? 'Purchase' : 'Sale'}
                                  </span>
                                  {order.hasGoodSaleProtect && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-300/20 px-2 py-0.5 text-[9px] font-bold text-ink-600 dark:text-gold-200">
                                      <ShieldCheck className="h-2.5 w-2.5" /> Protected
                                    </span>
                                  )}
                                </div>
                                <h3 className="mt-1.5 line-clamp-2 font-display text-sm font-bold leading-snug text-ink-900 dark:text-white sm:text-base">
                                  {order.productTitle || product?.title || 'GoodSale order'}
                                </h3>
                                <p className="mt-1 text-[10px] text-ink-400">
                                  <span className="font-mono font-semibold text-ink-500 dark:text-ink-300">{order.orderNumber || `#${order.id}`}</span>
                                  <span className="mx-1.5">·</span>
                                  {new Date(order.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                                <p className="mt-0.5 truncate text-[10px] text-ink-400">
                                  {isBuyer ? `Sold by ${sellerName}` : `Order from ${buyer?.fullName || 'GoodSale buyer'}`}
                                </p>
                              </div>
                              <div className="shrink-0 text-left sm:text-right">
                                <p className="font-display text-base font-extrabold text-ink-900 dark:text-white">₦{order.totalAmount.toLocaleString()}</p>
                                <p className="mt-0.5 text-[9px] font-semibold text-ink-400">{escrowState}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="relative mt-4" aria-label={`Order progress: ${meta.label}`}>
                          <div className="absolute left-[12.5%] right-[12.5%] top-3 h-0.5 rounded-full bg-ink-200 dark:bg-ink-700" />
                          <div
                            className="absolute left-[12.5%] top-3 h-0.5 rounded-full bg-jade-500 transition-all duration-500"
                            style={{ width: `${(meta.progress / (ORDER_PROGRESS_STEPS.length - 1)) * 75}%` }}
                          />
                          <div className="relative grid grid-cols-4 gap-1">
                            {ORDER_PROGRESS_STEPS.map((step, index) => {
                              const complete = index <= meta.progress;
                              return (
                                <div key={step} className="flex flex-col items-center text-center">
                                  <span className={`relative z-10 grid h-6 w-6 place-items-center rounded-full border-2 text-[9px] font-black ${
                                    complete
                                      ? 'border-jade-500 bg-jade-500 text-white'
                                      : 'border-ink-200 bg-white text-ink-400 dark:border-ink-700 dark:bg-ink-900'
                                  }`}>
                                    {complete ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                                  </span>
                                  <span className={`mt-1 text-[9px] font-semibold ${complete ? 'text-jade-700 dark:text-jade-300' : 'text-ink-400'}`}>
                                    {step}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-ink-100 bg-ink-50/60 px-4 py-3 dark:border-ink-800 dark:bg-ink-950/30 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <p className="flex items-start gap-2 text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">
                          <Clock className="mt-0.5 h-3 w-3 shrink-0 text-jade-600" />
                          <span>{meta.hint}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {isBuyer && order.status === OrderStatus.PENDING && ['escrow', 'card', 'partial'].includes(order.paymentMethod) && (
                            <button
                              type="button"
                              onClick={() => handlePayPendingOrder(order)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-gold-300 px-3 py-2 text-[10px] font-black text-ink-900 transition-colors hover:bg-gold-200 sm:flex-none cursor-pointer"
                            >
                              <CreditCard className="h-3.5 w-3.5" /> Pay now
                            </button>
                          )}
                          {canTrack && (
                            <Link
                              href={trackingHref}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-jade-600 px-3 py-2 text-[10px] font-bold text-white transition-colors hover:bg-jade-700 sm:flex-none"
                            >
                              <Truck className="h-3.5 w-3.5" /> Track order <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                          {isDelivered && (
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptOrder(order)}
                              className="inline-flex items-center justify-center gap-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-[10px] font-bold text-ink-600 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 cursor-pointer"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" /> Receipt
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleOrderDetails(order.id)}
                            aria-expanded={isExpanded}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-[10px] font-bold text-ink-600 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 sm:flex-none cursor-pointer"
                          >
                            {isExpanded ? 'Hide details' : 'View details'}
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-ink-100 bg-ink-50/40 p-4 dark:border-ink-800 dark:bg-ink-950/20 sm:p-5">
                          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-ink-400"><MapPin className="h-3 w-3 text-jade-600" /> Delivery</p>
                              <p className="mt-1.5 text-[11px] font-semibold text-ink-800 dark:text-ink-200">{deliveryMethodLabel(order)}</p>
                              <p className="mt-1 line-clamp-2 text-[10px] text-ink-500 dark:text-ink-400">{order.deliveryAddress}, {order.deliveryCity} {order.deliveryState}</p>
                              <p className="mt-1 text-[10px] text-ink-400">Expected: <strong className="font-semibold text-ink-600 dark:text-ink-300">{etaText}</strong></p>
                            </div>
                            <div className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-ink-400"><CreditCard className="h-3 w-3 text-jade-600" /> Payment</p>
                              <p className="mt-1.5 text-[11px] font-semibold text-ink-800 dark:text-ink-200">{escrowState}</p>
                              <p className="mt-1 text-[10px] text-ink-500 dark:text-ink-400">Method: {order.paymentMethod?.replace(/_/g, ' ')}</p>
                              <p className="mt-1 text-[10px] text-ink-400">Total: <strong className="font-semibold text-ink-600 dark:text-ink-300">₦{order.totalAmount.toLocaleString()}</strong></p>
                            </div>
                          </div>

                          {/* Existing detailed delivery, PIN and dispute controls stay available when expanded. */}
                          <div className="space-y-4">

                        {/* Delivery PIN display / verification forms */}
                        {isBuyer ? (
                          <div className="rounded-2xl border border-jade-500/20 bg-jade-500/[0.04] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-jade-700 dark:text-jade-300">
                                  <KeyRound className="h-3.5 w-3.5" /> Delivery PIN
                                </p>
                                <p className="mt-1 text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">
                                  Reveal this only at handover, after you have inspected the item. Never share it online.
                                </p>
                              </div>
                              <ShieldCheck className="h-4 w-4 shrink-0 text-jade-600" />
                            </div>
                            {orderHasEscrowStarted(order.status) && !isDelivered && !orderIsIssue(order.status) ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-xl border border-ink-200 bg-white px-3 py-2 font-mono text-base font-bold tracking-[0.3em] text-ink-900 dark:border-ink-700 dark:bg-ink-950 dark:text-white">
                                  {visiblePinOrderId === order.id ? order.deliveryPin : '••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setVisiblePinOrderId((current) => (current === order.id ? null : order.id))}
                                  className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-[10px] font-bold text-ink-600 hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 cursor-pointer"
                                >
                                  {visiblePinOrderId === order.id ? 'Hide PIN' : 'Show PIN'}
                                </button>
                                {visiblePinOrderId === order.id && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard.writeText(order.deliveryPin)
                                        .then(() => toast.success('Delivery PIN copied.'))
                                        .catch(() => toast.error('Could not copy the PIN. Please read it from the screen.'));
                                    }}
                                    className="grid h-9 w-9 place-items-center rounded-xl border border-ink-200 bg-white text-ink-500 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 cursor-pointer"
                                    aria-label="Copy delivery PIN"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[10px] font-semibold text-ink-500 dark:bg-ink-950 dark:text-ink-400">
                                {isDelivered
                                  ? 'This order is complete. No delivery PIN is needed.'
                                  : orderIsIssue(order.status)
                                    ? 'The delivery PIN is paused while this order is under review.'
                                    : 'Your delivery PIN appears here once payment is secured.'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-300">
                              <KeyRound className="h-3.5 w-3.5 text-jade-600" /> Release seller payment
                            </p>
                            <p className="mt-1 text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">
                              Enter the buyer&apos;s 6-digit delivery PIN after a successful handover. This releases the escrow payment.
                            </p>
                            {isDelivered ? (
                              <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-jade-500/10 px-3 py-2.5 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Payment released successfully.
                              </p>
                            ) : orderHasEscrowStarted(order.status) && !orderIsIssue(order.status) ? (
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void handleVerifyDeliveryPin(order.id);
                                }}
                                className="mt-3 space-y-2"
                              >
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={enteredPin}
                                    onChange={(event) => setEnteredPin(event.target.value.replace(/\D/g, ''))}
                                    placeholder="6-digit PIN"
                                    className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-center font-mono text-sm font-bold tracking-widest text-ink-800 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                                  />
                                  <button
                                    type="submit"
                                    disabled={enteredPin.length < 4}
                                    className="rounded-xl bg-jade-600 px-3.5 py-2.5 text-[10px] font-bold text-white hover:bg-jade-700 disabled:opacity-40 cursor-pointer"
                                  >
                                    Release
                                  </button>
                                </div>
                                {pinError && <p className="text-[10px] font-bold text-red-600 dark:text-red-300">{pinError}</p>}
                                {pinSuccess && <p className="text-[10px] font-bold text-jade-600 dark:text-jade-300">{pinSuccess}</p>}
                              </form>
                            ) : (
                              <p className="mt-3 text-[10px] text-ink-400">
                                Payment can be released after the buyer has paid and the order is on its way.
                              </p>
                            )}
                          </div>
                        )}

                      {delivery && (
                        <DeliveryTrackingPanel
                          delivery={delivery}
                          events={db.deliveryEvents || []}
                          rider={deliveryRider}
                          orderNumber={order.orderNumber}
                          isBuyer={isBuyer}
                          onDispute={
                            canReportIssue
                              ? () => {
                                  setShowDisputeFormOrderId(order.id);
                                  setDisputeReason('');
                                }
                              : undefined
                          }
                        />
                      )}

                      {/* Escrow Dispute Status and File Dispute form */}
                      {order.status === OrderStatus.DISPUTED ? (
                        <div className="rounded-2xl border border-gold-400/30 bg-gold-300/10 p-4 text-xs">
                          <div className="flex items-center gap-2 font-bold text-ink-800 dark:text-gold-200">
                            <ShieldAlert className="h-4 w-4 shrink-0" />
                            Order under review
                          </div>
                          <p className="mt-1.5 leading-relaxed text-ink-600 dark:text-ink-300">
                            {activeDispute?.reason || 'You reported a problem with this order. GoodSale has paused the seller payment while the case is reviewed.'}
                          </p>
                          <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[10px] font-semibold text-ink-500 dark:bg-ink-950/40 dark:text-ink-400">
                            {activeDispute?.resolution && activeDispute.resolution !== 'PENDING'
                              ? `Status: ${activeDispute.resolution}.`
                              : 'Status: waiting for GoodSale support to review the case.'}
                          </p>
                        </div>
                      ) : (
                        canReportIssue && (
                          <div className="border-t border-ink-100 pt-3 dark:border-ink-800/60">
                            {showDisputeFormOrderId === order.id ? (
                              <div className="space-y-3 rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                                <div>
                                  <p className="text-xs font-bold text-ink-800 dark:text-ink-100">Tell us what went wrong</p>
                                  <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">
                                    This pauses the seller payment while GoodSale reviews your order. Include as much detail as you can.
                                  </p>
                                </div>
                                <textarea
                                  required
                                  rows={3}
                                  placeholder="For example: the item is damaged, the wrong item arrived, or the seller has not dispatched it."
                                  value={disputeReason}
                                  onChange={(e) => setDisputeReason(e.target.value)}
                                  className="w-full rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-800 focus:outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      void (async () => {
                                        if (!disputeReason.trim()) {
                                          toast.error('Please tell us what went wrong.');
                                          return;
                                        }
                                        const result = await dbOperations.openDispute(order.id, disputeReason);
                                        if (result && 'error' in result && result.error && !(result as { success?: boolean }).success) {
                                          toast.error(String(result.error));
                                          return;
                                        }
                                        setShowDisputeFormOrderId(null);
                                        setDisputeReason('');
                                        toast.success('Issue submitted. Escrow is on hold while GoodSale reviews it.');
                                      })();
                                    }}
                                    className="rounded-xl bg-jade-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-jade-700 cursor-pointer"
                                  >
                                    Submit issue
                                  </button>
                                  <button
                                    onClick={() => {
                                      setShowDisputeFormOrderId(null);
                                      setDisputeReason('');
                                    }}
                                    className="rounded-xl px-4 py-2 text-xs font-bold text-ink-500 hover:text-ink-700 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setShowDisputeFormOrderId(order.id);
                                  setDisputeReason('');
                                }}
                                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-ink-500 hover:text-jade-700 dark:text-ink-400 cursor-pointer"
                              >
                                <ShieldAlert className="h-3.5 w-3.5" /> Report a problem with this order
                              </button>
                            )}
                          </div>
                        )
                      )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {/* Printable Ledger PDF/HTML Receipt Drawer */}
            {selectedReceiptOrder && (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 backdrop-blur-sm sm:items-center sm:p-4">
                <div className="relative max-h-[calc(100dvh-1rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 pb-safe-bottom text-ink-900 shadow-2xl sm:rounded-3xl sm:p-6">
                  <div className="text-center border-b border-ink-100 pb-3">
                    <QrCode className="w-10 h-10 text-jade-500 mx-auto mb-1" />
                    <h3 className="font-sans font-semibold text-base tracking-tight text-ink-950">GoodSale order receipt</h3>
                    <p className="text-xs text-ink-400">Order {selectedReceiptOrder.orderNumber}</p>
                  </div>

                  <div className="text-xs space-y-2 font-sans text-ink-700">
                    <div className="flex justify-between gap-3 border-b border-ink-50 pb-1">
                      <span>Item:</span>
                      <span className="max-w-[220px] truncate text-right font-semibold">{selectedReceiptOrder.productTitle}</span>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-ink-50 pb-1">
                      <span>Buyer:</span>
                      <span className="font-bold">{db.users.find((candidate) => candidate.id === selectedReceiptOrder.buyerId)?.fullName || user.fullName}</span>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-ink-50 pb-1">
                      <span>Delivery address:</span>
                      <span className="max-w-[220px] text-right font-semibold">{selectedReceiptOrder.deliveryAddress}, {selectedReceiptOrder.deliveryCity}</span>
                    </div>
                    <div className="flex justify-between border-b border-ink-50 pb-1">
                      <span>Order total:</span>
                      <span className="font-mono font-semibold text-ink-950">₦{selectedReceiptOrder.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-1 text-sm font-bold text-ink-950">
                      <span>Status:</span>
                      <span className="text-jade-600">{orderStatusMeta(selectedReceiptOrder.status).label}</span>
                    </div>
                  </div>

                  <div className="pt-2 text-center text-xs leading-relaxed text-ink-400 border-t border-ink-100">
                    This receipt is generated from your GoodSale order record. Keep it for your records or share it with support if you need help.
                  </div>

                  <button
                    onClick={() => setSelectedReceiptOrder(null)}
                    className="w-full py-2 bg-jade-600 hover:bg-jade-700 text-white font-sans font-bold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Close receipt
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {showPaystackModal && pendingPayOrderIds[0] && (
          <PaystackPayment 
            email={user.email} 
            amount={pendingPayAmount || totalDue}
            orderId={pendingPayOrderIds[0]}
            orderIds={pendingPayOrderIds}
            onSuccess={() => {
              void handlePaystackSuccess();
            }} 
            onCancel={() => {
              setShowPaystackModal(false);
              setPayingExistingOrder(false);
              // Orders remain PENDING until paid
              setActiveStep('orders');
            }} 
          />
        )}

      </div>
    </div>
  );
}
