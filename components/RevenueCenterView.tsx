// components/RevenueCenterView.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Award,
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crown,
  Eye,
  Flame,
  Gauge,
  Landmark,
  Layers3,
  Loader2,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Wallet as WalletIcon,
  Zap,
} from 'lucide-react';
import { computeEscrowFee } from '@/lib/payments/helpers';
import { toast } from '@/lib/feedback';
import { dbOperations, reloadFromSupabase, useDBState } from '../lib/store';
import {
  AD_PLACEMENTS,
  type AdPlacement,
  type MembershipPlanBenefit,
  type PremiumCreditLedgerEntry,
} from '../lib/types';
import AddFundsDialog from './wallet/AddFundsDialog';
import WithdrawReviewDialog from './wallet/WithdrawReviewDialog';
import SubscriptionCheckoutDialog, {
  type PremiumCheckoutProduct,
} from './premium/SubscriptionCheckoutDialog';
import Button from './ui/Button';
import SegmentedControl from './ui/SegmentedControl';

type RevenueTab = 'wallet' | 'memberships' | 'promotions' | 'ads';
type TxFilter = 'all' | 'credit' | 'debit';
type BusinessPlan = 'PRO' | 'PREMIUM' | 'ENTERPRISE';

interface RevenueCenterViewProps {
  onNavigate?: (view: string, payload?: unknown) => void;
}

type WalletStatus = {
  fundingAvailable: boolean;
  payoutsAvailable: boolean;
  provider: {
    fundingEnabled: boolean;
    payoutsEnabled: boolean;
    webhookConfigured: boolean;
  };
  limits: {
    funding_min: number;
    funding_max: number;
    withdrawal_min: number;
    withdrawal_max: number;
    withdrawal_fee: number;
    daily_withdrawal_limit: number;
  };
};

type Feedback = { tone: 'success' | 'error'; message: string } | null;

type PremiumPayment = {
  reference: string;
  product: 'VERIFIED_PLUS' | 'BUSINESS';
  planCode: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
};

type SubscriptionCheckout = {
  product: PremiumCheckoutProduct;
  planCode?: string;
  title: string;
  price: number;
};

const NIGERIAN_BANKS = [
  'Access Bank',
  'Ecobank Nigeria',
  'Fidelity Bank',
  'First Bank of Nigeria',
  'First City Monument Bank',
  'Guaranty Trust Bank',
  'Kuda Microfinance Bank',
  'Moniepoint Microfinance Bank',
  'Opay Digital Services',
  'Palmpay',
  'Polaris Bank',
  'Stanbic IBTC Bank',
  'Sterling Bank',
  'Union Bank of Nigeria',
  'United Bank for Africa',
  'Wema Bank',
  'Zenith Bank',
];

const naira = (value: number) => `₦${Math.round(value).toLocaleString('en-NG')}`;

const compactNumber = (value: number) =>
  Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const dateLabel = (value: string, options?: Intl.DateTimeFormatOptions) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(
    'en-NG',
    options || { day: 'numeric', month: 'short', year: 'numeric' }
  );
};

const activeSubscription = (
  subscription: { expiresAt: string } | undefined
) => !!subscription && new Date(subscription.expiresAt).getTime() > Date.now();

function StatusPill({
  available,
  label,
}: {
  available: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
        available
          ? 'border-jade-500/20 bg-jade-500/10 text-jade-700 dark:border-jade-400/25 dark:text-jade-300'
          : 'border-ink-200 bg-ink-100 text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-jade-500' : 'bg-ink-400'}`}
      />
      {label}
    </span>
  );
}

function SectionHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-jade-700 dark:text-jade-300">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-500 dark:text-ink-400 sm:text-sm">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default function RevenueCenterView({ onNavigate }: RevenueCenterViewProps) {
  const db = useDBState();
  const user = db.currentUser;

  const [activeTab, setActiveTab] = useState<RevenueTab>('wallet');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submittingPayout, setSubmittingPayout] = useState(false);

  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  const [businessPlan, setBusinessPlan] = useState<BusinessPlan>('PREMIUM');
  const [subscriptionCheckout, setSubscriptionCheckout] =
    useState<SubscriptionCheckout | null>(null);
  const [premiumPayments, setPremiumPayments] = useState<PremiumPayment[]>([]);
  const [premiumProvider, setPremiumProvider] = useState<{
    loading: boolean;
    available: boolean;
    message: string | null;
  }>({ loading: true, available: false, message: null });
  const [selectedProductId, setSelectedProductId] = useState('');
  const [featuredDuration, setFeaturedDuration] = useState<'3' | '7' | '14'>('7');
  const [purchasingPromotion, setPurchasingPromotion] = useState(false);
  const [usePromoCredits, setUsePromoCredits] = useState(true);
  const [flashSalePrice, setFlashSalePrice] = useState('');
  const [flashStartsAt, setFlashStartsAt] = useState('');
  const [flashQuantity, setFlashQuantity] = useState('');
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditLedger, setCreditLedger] = useState<PremiumCreditLedgerEntry[]>([]);
  const [planBenefits, setPlanBenefits] = useState<MembershipPlanBenefit[]>([]);

  const [adTitle, setAdTitle] = useState('');
  const [adType, setAdType] = useState<'PRODUCT' | 'BUSINESS' | 'BANNER_HOME' | 'BANNER_CATEGORY'>(
    'PRODUCT'
  );
  const [adBudget, setAdBudget] = useState('5000');
  const [creatingAd, setCreatingAd] = useState(false);
  const [adTargetId, setAdTargetId] = useState('');
  const [adBannerUrl, setAdBannerUrl] = useState('');
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>(['HOME']);
  const [adStartsAt, setAdStartsAt] = useState('');
  const [adEndsAt, setAdEndsAt] = useState('');
  const [adDailyBudget, setAdDailyBudget] = useState('');
  const [adCpcBid, setAdCpcBid] = useState('');
  const [adTargetState, setAdTargetState] = useState('');
  const [adTargetCity, setAdTargetCity] = useState('');
  const [adTargetCategory, setAdTargetCategory] = useState('');

  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [showAllTx, setShowAllTx] = useState(false);

  const settings = db.revenueSettings;

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

  const campaigns = useMemo(
    () => (user ? db.sponsoredAds.filter((ad) => ad.sellerId === user.id) : []),
    [db.sponsoredAds, user]
  );

  const products = useMemo(
    () => (user ? db.products.filter((product) => product.sellerId === user.id) : []),
    [db.products, user]
  );

  const businesses = useMemo(
    () => (user ? db.businessSubscriptions.filter((entry) => entry.userId === user.id) : []),
    [db.businessSubscriptions, user]
  );

  const currentBusiness = businesses
    .slice()
    .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];

  const currentVerifiedPlus = useMemo(
    () =>
      user
        ? db.verifiedPlusSubscriptions
            .filter((entry) => entry.userId === user.id)
            .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0]
        : undefined,
    [db.verifiedPlusSubscriptions, user]
  );

  const featuredListings = useMemo(
    () =>
      user
        ? db.featuredListings.filter(
            (entry) =>
              entry.sellerId === user.id &&
              entry.status === 'ACTIVE' &&
              new Date(entry.expiresAt).getTime() > Date.now()
          )
        : [],
    [db.featuredListings, user]
  );

  const myPromotions = useMemo(
    () =>
      user
        ? db.featuredListings
            .filter((entry) => entry.sellerId === user.id)
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        : [],
    [db.featuredListings, user]
  );

  const payouts = user
    ? db.withdrawalRequests.filter((entry) => entry.userId === user.id)
    : [];

  const pendingPayouts = payouts
    .filter((entry) => entry.status === 'PENDING' || entry.status === 'PROCESSING')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const escrowSummary = useMemo(() => {
    if (!user) return { seller: 0, buyer: 0, pendingEarnings: 0 };
    let seller = 0;
    let buyer = 0;
    let pendingEarnings = 0;
    db.escrows.forEach((entry) => {
      if (entry.isReleased || entry.isRefunded) return;
      const order = db.orders.find((item) => item.id === entry.orderId);
      if (!order) return;
      if (order.sellerId === user.id) {
        seller += entry.heldAmount;
        pendingEarnings += computeEscrowFee(entry.heldAmount, {
          pct: settings?.escrowPercentageFee ?? 1.5,
          min: settings?.escrowMinFee ?? 100,
          max: settings?.escrowMaxFee ?? 15000,
          deliveryFee: order.deliveryFee || 0,
        }).payout;
      } else if (order.buyerId === user.id) {
        buyer += entry.heldAmount;
      }
    });
    return { seller, buyer, pendingEarnings };
  }, [db.escrows, db.orders, settings, user]);

  const monthEarnings = useMemo(() => {
    const now = new Date();
    return transactions
      .filter((entry) => {
        const created = new Date(entry.createdAt);
        return (
          entry.status === 'COMPLETED' &&
          entry.amount > 0 &&
          created.getMonth() === now.getMonth() &&
          created.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [transactions]);

  const activeCampaigns = campaigns.filter((ad) => ad.status === 'ACTIVE');
  const adSpend = campaigns.reduce((sum, ad) => sum + ad.spent, 0);
  const adBudgetTotal = campaigns.reduce((sum, ad) => sum + ad.budget, 0);
  const balance = wallet?.balance ?? 0;
  const premiumDurationDays = Math.max(1, Number(settings.premiumDurationDays) || 30);

  // Paid membership is derived only from a server-written, unexpired
  // subscription. Roles and identity verification never imply Verified+.
  const isBusinessSubbed =
    !!currentBusiness &&
    currentBusiness.plan !== 'FREE' &&
    activeSubscription(currentBusiness);
  const isVerifiedPlus = activeSubscription(currentVerifiedPlus);
  const isCurrentBusinessPlan =
    isBusinessSubbed &&
    !!currentBusiness &&
    activeSubscription(currentBusiness) &&
    currentBusiness.plan === businessPlan;

  const fundingAvailable = !!walletStatus?.fundingAvailable;
  const payoutsAvailable = !!walletStatus?.payoutsAvailable;
  const fundingMin = walletStatus?.limits.funding_min ?? 1000;
  const fundingMax = walletStatus?.limits.funding_max ?? 500000;
  const withdrawalMin = walletStatus?.limits.withdrawal_min ?? 1000;
  const withdrawalMax = walletStatus?.limits.withdrawal_max ?? 1000000;
  const withdrawalFee = walletStatus?.limits.withdrawal_fee ?? 0;

  const userId = user?.id;
  const refreshWalletStatus = useCallback(async () => {
    if (!userId) {
      setWalletStatus(null);
      return;
    }
    setStatusLoading(true);
    try {
      const res = await fetch('/api/wallet/status', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (payload?.success) setWalletStatus(payload as WalletStatus);
    } catch {
      // The ledger stays usable when capability lookup is unavailable.
    } finally {
      setStatusLoading(false);
    }
  }, [userId]);

  const loadPremiumAccount = useCallback(async () => {
    if (!userId) {
      setPremiumPayments([]);
      setPremiumProvider({ loading: false, available: false, message: 'Sign in to view memberships.' });
      return;
    }
    setPremiumProvider((current) => ({ ...current, loading: true }));
    try {
      const res = await fetch('/api/premium/subscriptions', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        setPremiumProvider({
          loading: false,
          available: false,
          message: payload?.error || 'Membership status could not be loaded.',
        });
        return;
      }
      const available =
        Boolean(payload.provider?.fundingEnabled) && payload.schemaReady !== false;
      setPremiumProvider({
        loading: false,
        available,
        message: available
          ? null
          : 'Membership checkout needs Paystack keys and the premium database migration.',
      });
      setPremiumPayments(Array.isArray(payload.payments) ? payload.payments : []);
    } catch {
      setPremiumProvider({
        loading: false,
        available: false,
        message: 'Membership status could not be loaded. Try again.',
      });
    }
  }, [userId]);

  const loadPremiumExtras = useCallback(async () => {
    if (!userId) {
      setCreditBalance(0);
      setCreditLedger([]);
      setPlanBenefits([]);
      return;
    }
    try {
      const [creditsRes, benefitsRes] = await Promise.all([
        fetch('/api/premium/credits', { cache: 'no-store' }),
        fetch('/api/premium/benefits', { cache: 'no-store' }),
      ]);
      const credits = await creditsRes.json().catch(() => null);
      const benefits = await benefitsRes.json().catch(() => null);
      if (creditsRes.ok && credits?.success) {
        setCreditBalance(Number(credits.balance) || 0);
        setCreditLedger(Array.isArray(credits.ledger) ? credits.ledger : []);
      }
      if (benefitsRes.ok && benefits?.success) {
        setPlanBenefits(Array.isArray(benefits.benefits) ? benefits.benefits : []);
      }
    } catch {
      // Membership remains usable even if the extra summaries are unavailable.
    }
  }, [userId]);

  useEffect(() => {
    void refreshWalletStatus();
    void loadPremiumAccount();
    void loadPremiumExtras();
  }, [refreshWalletStatus, loadPremiumAccount, loadPremiumExtras]);

  useEffect(() => {
    if (!wallet) return;
    setBankName((previous) => previous || wallet.bankName || '');
    setBankAccountName((previous) => previous || wallet.bankAccountName || '');
    setBankAccountNumber((previous) => previous || wallet.bankAccountNumber || '');
  }, [wallet]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 6500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const selectTab = (tab: RevenueTab) => {
    setActiveTab(tab);
    setFeedback(null);
  };

  const parsedWithdrawal = Number(withdrawalAmount);
  const withdrawalError =
    withdrawalAmount.trim().length === 0
      ? null
      : !Number.isFinite(parsedWithdrawal) || parsedWithdrawal <= 0
        ? 'Enter a valid payout amount.'
        : parsedWithdrawal < withdrawalMin
          ? `Minimum payout is ${naira(withdrawalMin)}.`
          : parsedWithdrawal > withdrawalMax
            ? `Maximum payout is ${naira(withdrawalMax)}.`
            : parsedWithdrawal > balance
              ? 'Payout exceeds your available balance.'
              : null;

  const bankAccountValid = /^\d{10}$/.test(bankAccountNumber.trim());
  const canWithdraw =
    !!user &&
    !submittingPayout &&
    !!withdrawalAmount.trim() &&
    !withdrawalError &&
    parsedWithdrawal >= withdrawalMin &&
    parsedWithdrawal <= withdrawalMax &&
    parsedWithdrawal <= balance &&
    bankName.trim().length > 1 &&
    bankAccountName.trim().length > 1 &&
    bankAccountValid;

  const handleFunded = async () => {
    await reloadFromSupabase();
    await refreshWalletStatus();
    toast.success('Paystack confirmed your payment and your balance is ready.', 'Wallet funded');
  };

  const handleWithdrawSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!canWithdraw) {
      setFeedback({
        tone: 'error',
        message:
          withdrawalError ||
          'Complete your payout amount and bank details before continuing.',
      });
      return;
    }
    if (!payoutsAvailable) {
      setFeedback({
        tone: 'error',
        message:
          'Bank payouts are unavailable until Paystack transfers are configured for this deployment.',
      });
      return;
    }
    setFeedback(null);
    setReviewOpen(true);
  };

  const submitWithdrawal = async () => {
    if (!user || !canWithdraw || !payoutsAvailable) return;
    setSubmittingPayout(true);
    try {
      const result = await dbOperations.withdrawFromWallet(user.id, parsedWithdrawal, {
        bank: bankName.trim(),
        name: bankAccountName.trim(),
        number: bankAccountNumber.trim(),
      });
      if (result.success) {
        setReviewOpen(false);
        setWithdrawalAmount('');
        toast.success(
          `${naira(parsedWithdrawal)} is reserved for ${bankName.trim()} ••••${bankAccountNumber.slice(-4)}.`,
          'Payout requested'
        );
        await refreshWalletStatus();
      } else {
        toast.error(result.message || 'Payout could not be requested.', 'Payout failed');
      }
    } finally {
      setSubmittingPayout(false);
    }
  };

  const openVerifiedPlusCheckout = () => {
    if (!premiumProvider.available) {
      setFeedback({
        tone: 'error',
        message:
          premiumProvider.message ||
          'Membership checkout is unavailable until Paystack is configured.',
      });
      return;
    }
    setSubscriptionCheckout({
      product: 'VERIFIED_PLUS',
      title: 'Verified+',
      price: settings.verifiedPlusPrice,
    });
  };

  const openBusinessCheckout = () => {
    if (!premiumProvider.available) {
      setFeedback({
        tone: 'error',
        message:
          premiumProvider.message ||
          'Membership checkout is unavailable until Paystack is configured.',
      });
      return;
    }
    setSubscriptionCheckout({
      product: 'BUSINESS',
      planCode: businessPlan,
      title: `Business ${businessPlan}`,
      price:
        businessPlan === 'PRO'
          ? settings.subProPrice
          : businessPlan === 'PREMIUM'
            ? settings.subPremiumPrice
            : settings.subEnterprisePrice,
    });
  };

  const handlePremiumActivated = async () => {
    await reloadFromSupabase();
    await loadPremiumAccount();
    setFeedback({
      tone: 'success',
      message:
        'Payment was verified by the server and your membership is active. Benefits are separate from identity or business verification.',
    });
    toast.success('Membership activated after server verification.', 'Membership active');
  };

  const handlePromoteProduct = async (type: 'FEATURED' | 'FLASH_SALE') => {
    if (!user || purchasingPromotion) return;
    if (!selectedProductId) {
      setFeedback({
        tone: 'error',
        message: 'Choose a listing from your inventory before starting a promotion.',
      });
      return;
    }
    if (type === 'FLASH_SALE') {
      const price = Number(flashSalePrice);
      if (!Number.isFinite(price) || price <= 0) {
        setFeedback({ tone: 'error', message: 'Enter the discounted Flash Sale price.' });
        return;
      }
      if (selectedProduct && price >= selectedProduct.price) {
        setFeedback({ tone: 'error', message: 'The Flash Sale price must be lower than the listing price.' });
        return;
      }
    }

    setPurchasingPromotion(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/promotions/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: Number(selectedProductId),
          featureType: type,
          durationDays: type === 'FEATURED' ? Number(featuredDuration) : 1,
          useCredits: usePromoCredits,
          salePrice: type === 'FLASH_SALE' ? Number(flashSalePrice) : undefined,
          startsAt: type === 'FLASH_SALE' && flashStartsAt ? new Date(flashStartsAt).toISOString() : undefined,
          quantityLimit: type === 'FLASH_SALE' && flashQuantity ? Number(flashQuantity) : undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setFeedback({
          tone: 'error',
          message: payload.error || 'Promotion checkout failed.',
        });
        return;
      }

      await reloadFromSupabase();
      setFeedback({
        tone: 'success',
        message:
          type === 'FEATURED'
            ? `Your listing is featured for ${featuredDuration} days. ${Number(payload.promotion?.creditsApplied) > 0 ? `${naira(Number(payload.promotion.creditsApplied))} in promotional credits were applied.` : 'The promotion was charged to your wallet.'}`
            : `Your Flash Sale is awaiting moderation. It will run for 24 hours from the approved start time, with a real ₦${Number(flashSalePrice).toLocaleString()} sale price and a ${Number(flashQuantity) || selectedProduct?.quantity || 0}-unit limit.`,
      });
      toast.success('Promotion purchase recorded on the server.', 'Promotion updated');
      setSelectedProductId('');
      setFlashSalePrice('');
      setFlashStartsAt('');
      setFlashQuantity('');
      await Promise.all([loadPremiumExtras(), refreshWalletStatus()]);
    } catch {
      setFeedback({
        tone: 'error',
        message: 'Promotion checkout could not be completed. No charge was recorded.',
      });
    } finally {
      setPurchasingPromotion(false);
    }
  };

  const handleCreateAd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || creatingAd) return;
    const budget = Number(adBudget);
    if (!adTitle.trim()) {
      setFeedback({ tone: 'error', message: 'Add a title for the ad campaign.' });
      return;
    }
    if (!Number.isFinite(budget) || budget < settings.adCpcPrice) {
      setFeedback({
        tone: 'error',
        message: `Fund at least one click (${naira(settings.adCpcPrice)}) to launch this campaign.`,
      });
      return;
    }
    if (balance < budget) {
      setFeedback({
        tone: 'error',
        message: 'Your wallet balance does not cover this campaign budget.',
      });
      return;
    }
    if (adType === 'PRODUCT' && !adTargetId) {
      setFeedback({ tone: 'error', message: 'Choose the product this campaign should promote.' });
      return;
    }
    if (!adPlacements.length) {
      setFeedback({ tone: 'error', message: 'Choose at least one ad placement.' });
      return;
    }
    if (adDailyBudget && Number(adDailyBudget) > budget) {
      setFeedback({ tone: 'error', message: 'Daily budget cannot exceed the total campaign budget.' });
      return;
    }

    setCreatingAd(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/ads/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: adType,
          targetId: adType === 'PRODUCT' ? Number(adTargetId) : 0,
          title: adTitle.trim(),
          budget,
          bannerUrl: adBannerUrl.trim() || undefined,
          placements: adPlacements,
          startsAt: adStartsAt ? new Date(adStartsAt).toISOString() : undefined,
          endsAt: adEndsAt ? new Date(adEndsAt).toISOString() : undefined,
          dailyBudget: adDailyBudget ? Number(adDailyBudget) : undefined,
          cpcBid: adCpcBid ? Number(adCpcBid) : undefined,
          targetState: adTargetState.trim() || undefined,
          targetCity: adTargetCity.trim() || undefined,
          targetCategory: adTargetCategory.trim() || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setFeedback({
          tone: 'error',
          message: payload.error || 'Ad campaign could not be submitted.',
        });
        return;
      }

      await reloadFromSupabase();
      setFeedback({
        tone: 'success',
        message: `"${adTitle.trim()}" is awaiting moderation. Its budget is reserved and no ad serves until an admin approves it.`,
      });
      toast.success('Campaign submitted for admin review.', 'Campaign pending');
      setAdTitle('');
      setAdBudget('5000');
      setAdTargetId('');
      setAdBannerUrl('');
      setAdPlacements(['HOME']);
      setAdStartsAt('');
      setAdEndsAt('');
      setAdDailyBudget('');
      setAdCpcBid('');
      setAdTargetState('');
      setAdTargetCity('');
      setAdTargetCategory('');
    } catch {
      setFeedback({
        tone: 'error',
        message: 'Campaign submission could not be completed. No charge was recorded.',
      });
    } finally {
      setCreatingAd(false);
    }
  };

  const filteredTransactions = transactions.filter((entry) => {
    if (txFilter === 'credit') return entry.amount > 0;
    if (txFilter === 'debit') return entry.amount < 0;
    return true;
  });
  const visibleTransactions = showAllTx ? filteredTransactions : filteredTransactions.slice(0, 7);

  const featuredPrice = {
    '3': settings.featured3DaysPrice,
    '7': settings.featured7DaysPrice,
    '14': settings.featured14DaysPrice,
  }[featuredDuration];
  const selectedProduct = products.find((product) => product.id === Number(selectedProductId));
  const benefitsForPlan = (code: MembershipPlanBenefit['planCode']) =>
    planBenefits.filter((benefit) => benefit.planCode === code && benefit.included).map((benefit) => benefit.label);

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-16">
        <div className="w-full overflow-hidden rounded-[2rem] border border-ink-200 bg-white text-center shadow-xl shadow-ink-950/5 dark:border-ink-800 dark:bg-ink-900">
          <div className="h-1.5 bg-gradient-to-r from-jade-500 via-jade-300 to-gold-300" />
          <div className="p-8 sm:p-10">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-jade-500/10 text-jade-700 dark:text-jade-300">
              <WalletIcon className="h-8 w-8" />
            </span>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-jade-700 dark:text-jade-300">
              Revenue hub
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-950 dark:text-white">
              Sign in to grow your money
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Track escrow earnings, top up your wallet, withdraw to your bank, and launch
              promotions from one place.
            </p>
            <Button className="mt-6 w-full sm:w-auto" onClick={() => onNavigate?.('marketplace')}>
              Explore GoodSale
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const streams: Array<{
    id: RevenueTab;
    title: string;
    value: string;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
    status: string;
    ready: boolean;
  }> = [
    {
      id: 'wallet',
      title: 'Wallet & payouts',
      value: naira(balance),
      hint: pendingPayouts > 0 ? `${naira(pendingPayouts)} in transit` : 'Ready to withdraw',
      icon: Landmark,
      status: statusLoading
        ? 'Checking'
        : fundingAvailable
          ? 'Funding ready'
          : 'Funding offline',
      ready: fundingAvailable,
    },
    {
      id: 'memberships',
      title: 'Memberships',
      value: isVerifiedPlus ? 'Verified+' : isBusinessSubbed ? 'Business' : 'Free',
      hint: isVerifiedPlus
        ? 'Trust badge & search boost'
        : isBusinessSubbed
          ? 'Business growth tools'
          : 'Upgrade your storefront',
      icon: Crown,
      status: isVerifiedPlus || isBusinessSubbed ? 'Active' : 'Available',
      ready: isVerifiedPlus || isBusinessSubbed,
    },
    {
      id: 'promotions',
      title: 'Listing boosts',
      value: String(featuredListings.length),
      hint:
        featuredListings.length > 0
          ? `${products.length} listing${products.length === 1 ? '' : 's'} in inventory`
          : 'Reach more buyers',
      icon: Flame,
      status: featuredListings.length > 0 ? 'Live' : 'Ready',
      ready: featuredListings.length > 0,
    },
    {
      id: 'ads',
      title: 'Sponsored ads',
      value: String(activeCampaigns.length),
      hint: adSpend > 0 ? `${naira(adSpend)} spent` : 'Budget-funded clicks',
      icon: Megaphone,
      status: activeCampaigns.length > 0 ? 'Running' : 'Paused',
      ready: activeCampaigns.length > 0,
    },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-ink-50 pb-28 transition-colors sm:pb-12 dark:bg-ink-950">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-jade-700 dark:text-jade-300">
              <TrendingUp className="h-3.5 w-3.5" />
              Money &amp; growth
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-[2.2rem]">
              Revenue hub
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Your escrow earnings, wallet, memberships and paid growth tools — organised around
              what you want to do next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill available={fundingAvailable} label={`Funding ${fundingAvailable ? 'ready' : 'offline'}`} />
            <StatusPill available={payoutsAvailable} label={`Payouts ${payoutsAvailable ? 'ready' : 'offline'}`} />
            <button
              type="button"
              onClick={() => void refreshWalletStatus()}
              disabled={statusLoading}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 text-[11px] font-bold text-ink-600 transition-colors hover:border-jade-400 hover:text-jade-700 disabled:opacity-50 dark:border-ink-800 dark:bg-ink-900 dark:text-white/65"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-jade-950 via-jade-900 to-ink-950 text-white shadow-2xl shadow-jade-950/15">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full bg-jade-400/20 blur-3xl" />
            <div className="absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-gold-300/10 blur-3xl" />
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-jade-300/50 to-transparent" />
            <div className="absolute right-5 top-4 font-display text-[11rem] font-black leading-none text-white/[0.035] sm:text-[15rem]">
              ₦
            </div>
          </div>

          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center lg:p-10">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-300/25 bg-gold-300/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-200">
                <Rocket className="h-3.5 w-3.5" />
                Revenue command centre
              </span>
              <h2 className="mt-5 max-w-xl font-display text-3xl font-extrabold leading-[1.06] tracking-tight sm:text-[2.6rem]">
                Every naira earned.
                <span className="block bg-gradient-to-r from-jade-200 via-gold-200 to-gold-300 bg-clip-text text-transparent">
                  Every next move.
                </span>
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
                Escrow-protected sales settle here. Keep your balance ready for payouts, then
                invest in visibility when you want more demand.
              </p>

              <div className="mt-7 flex flex-wrap items-end gap-x-5 gap-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
                    Available balance
                  </p>
                  <p className="mt-1 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
                    {naira(balance)}
                  </p>
                </div>
                <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-jade-100/80">
                  <ShieldCheck className="h-3 w-3" /> Escrow protected
                </span>
              </div>

              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (!fundingAvailable) {
                      toast.info('Add funds becomes available when Paystack is configured.');
                      return;
                    }
                    setAddFundsOpen(true);
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gold-300 px-5 text-sm font-bold text-jade-950 shadow-lg shadow-black/10 transition-all press-scale hover:bg-gold-200"
                >
                  <Plus className="h-4 w-4" /> Add funds
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectTab('wallet');
                    document.getElementById('revenue-workspace')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                    window.setTimeout(
                      () => document.getElementById('withdraw-amount')?.focus(),
                      350
                    );
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-bold text-ink-950 shadow-lg shadow-black/10 transition-all press-scale hover:bg-jade-50"
                >
                  <ArrowDownToLine className="h-4 w-4" /> Withdraw
                </button>
                <button
                  type="button"
                  onClick={() => {
                    selectTab('promotions');
                    document.getElementById('revenue-workspace')?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 text-sm font-bold text-white transition-colors hover:bg-white/10"
                >
                  <Flame className="h-4 w-4" /> Boost a listing
                </button>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                  Money at a glance
                </p>
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/[0.07] text-gold-200">
                  <Gauge className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-white/45">Seller escrow</p>
                    <p className="mt-0.5 font-display text-xl font-bold text-white">
                      {naira(escrowSummary.seller)}
                    </p>
                  </div>
                  <span className="text-[10px] text-jade-200/65">Releases after delivery</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-white/45">Pending payouts</p>
                    <p className="mt-0.5 font-display text-xl font-bold text-white">
                      {naira(pendingPayouts)}
                    </p>
                  </div>
                  <span className="text-[10px] text-gold-200/65">Awaiting confirmation</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] text-white/45">This month</p>
                    <p className="mt-0.5 font-display text-xl font-bold text-white">
                      {naira(monthEarnings)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-jade-200">
                    <TrendingUp className="h-3 w-3" /> Sales income
                  </span>
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-ink-950/30 px-3.5 py-3 text-[10px] leading-relaxed text-white/45">
                GoodSale separates promotional coins from naira. Revenue here is real wallet
                money, not reward points.
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Revenue streams" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {streams.map((stream) => {
            const Icon = stream.icon;
            const active = activeTab === stream.id;
            return (
              <button
                key={stream.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  selectTab(stream.id);
                  document.getElementById('revenue-workspace')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }}
                className={`group min-w-0 rounded-2xl border p-4 text-left transition-all press-scale sm:p-5 ${
                  active
                    ? 'border-jade-500/35 bg-white shadow-lg shadow-jade-950/5 ring-1 ring-jade-500/15 dark:border-jade-400/30 dark:bg-ink-900'
                    : 'border-ink-200 bg-white hover:border-jade-400/50 dark:border-ink-800 dark:bg-ink-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-xl ${
                      active
                        ? 'bg-jade-500 text-white'
                        : 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      stream.ready
                        ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                        : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                    }`}
                  >
                    {stream.status}
                  </span>
                </div>
                <p className="mt-4 truncate font-display text-lg font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-xl">
                  {stream.value}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-bold text-ink-600 dark:text-ink-300">
                  {stream.title}
                </p>
                <p className="mt-1 line-clamp-1 text-[10px] text-ink-400">{stream.hint}</p>
              </button>
            );
          })}
        </section>

        {feedback && (
          <div
            role="status"
            className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3.5 text-xs leading-relaxed ${
              feedback.tone === 'success'
                ? 'border-jade-500/25 bg-jade-500/10 text-jade-800 dark:text-jade-200'
                : 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            }`}
          >
            {feedback.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 break-words">{feedback.message}</span>
          </div>
        )}

        <section
          id="revenue-workspace"
          className="scroll-mt-24 overflow-hidden rounded-[2rem] border border-ink-200 bg-white shadow-xl shadow-ink-950/5 dark:border-ink-800 dark:bg-ink-900"
        >
          <div className="border-b border-ink-150 bg-ink-50/70 p-2 dark:border-ink-800 dark:bg-ink-950/30 sm:p-3">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {[
                { id: 'wallet' as const, label: 'Wallet', Icon: Landmark },
                { id: 'memberships' as const, label: 'Memberships', Icon: Award },
                { id: 'promotions' as const, label: 'Promotions', Icon: Flame },
                { id: 'ads' as const, label: 'Sponsored ads', Icon: MousePointerClick },
              ].map(({ id, label, Icon }) => {
                const selected = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-pressed={selected}
                    className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-[11px] font-bold transition-all sm:text-xs ${
                      selected
                        ? 'bg-white text-jade-700 shadow-sm dark:bg-ink-800 dark:text-jade-300'
                        : 'text-ink-500 hover:bg-white/60 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-800/60 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5 sm:p-7 lg:p-8">
            {activeTab === 'wallet' && (
              <div className="space-y-7">
                <SectionHead
                  eyebrow="Cash flow"
                  title="Wallet & bank settlement"
                  description="Fund your wallet through Paystack, keep earnings ready, and request a reviewed bank payout."
                  action={
                    <div className="flex flex-wrap gap-1.5">
                      <StatusPill available={fundingAvailable} label="Funding" />
                      <StatusPill available={payoutsAvailable} label="Payouts" />
                    </div>
                  }
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="relative overflow-hidden rounded-3xl border border-jade-500/20 bg-gradient-to-br from-jade-500/[0.08] via-white to-white p-5 dark:from-jade-500/10 dark:via-ink-900 dark:to-ink-900 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-jade-500 text-white shadow-lg shadow-jade-500/20">
                        <Plus className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                        Paystack
                      </span>
                    </div>
                    <h3 className="mt-5 font-display text-lg font-bold text-ink-950 dark:text-white">
                      Add money to your wallet
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      Use a card, bank transfer or USSD in Paystack&apos;s secure checkout. Your
                      balance changes only after the server verifies payment.
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-ink-150 bg-white/70 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-ink-400">
                          Minimum
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-ink-900 dark:text-white">
                          {naira(fundingMin)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-ink-150 bg-white/70 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-ink-400">
                          Maximum
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-ink-900 dark:text-white">
                          {naira(fundingMax)}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="mt-5 w-full"
                      onClick={() => setAddFundsOpen(true)}
                      disabled={!fundingAvailable || statusLoading}
                    >
                      {statusLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <WalletIcon className="h-4 w-4" />
                      )}
                      {fundingAvailable ? 'Add funds securely' : 'Funding unavailable'}
                    </Button>
                    {!fundingAvailable && !statusLoading && (
                      <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
                        Paystack funding keys are not configured for this deployment.
                      </p>
                    )}
                  </div>

                  <form
                    onSubmit={handleWithdrawSubmit}
                    className="rounded-3xl border border-ink-200 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-950/40 sm:p-6"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink-950 text-white dark:bg-white dark:text-ink-950">
                        <ArrowDownToLine className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                        Reviewed payout
                      </span>
                    </div>
                    <h3 className="mt-5 font-display text-lg font-bold text-ink-950 dark:text-white">
                      Withdraw to your bank
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      Request a payout to your verified Nigerian bank account. Processing continues
                      until admin review and Paystack confirm the transfer.
                    </p>

                    <div className="mt-4 space-y-3">
                      <div>
                        <label
                          htmlFor="withdraw-amount"
                          className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                        >
                          Amount
                        </label>
                        <div className="relative mt-1.5">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-400">
                            ₦
                          </span>
                          <input
                            id="withdraw-amount"
                            inputMode="numeric"
                            value={withdrawalAmount}
                            onChange={(event) =>
                              setWithdrawalAmount(event.target.value.replace(/[^\d]/g, ''))
                            }
                            placeholder="0"
                            className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-8 pr-3 text-sm font-bold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </div>
                        {withdrawalError && (
                          <p className="mt-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            {withdrawalError}
                          </p>
                        )}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="withdraw-bank"
                            className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                          >
                            Bank
                          </label>
                          <select
                            id="withdraw-bank"
                            value={bankName}
                            onChange={(event) => setBankName(event.target.value)}
                            className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          >
                            <option value="">Choose bank</option>
                            {NIGERIAN_BANKS.map((bank) => (
                              <option key={bank} value={bank}>
                                {bank}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="withdraw-account-number"
                            className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                          >
                            Account number
                          </label>
                          <input
                            id="withdraw-account-number"
                            inputMode="numeric"
                            maxLength={10}
                            value={bankAccountNumber}
                            onChange={(event) =>
                              setBankAccountNumber(event.target.value.replace(/[^\d]/g, ''))
                            }
                            placeholder="10-digit NUBAN"
                            className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="withdraw-account-name"
                          className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                        >
                          Account name
                        </label>
                        <input
                          id="withdraw-account-name"
                          value={bankAccountName}
                          onChange={(event) => setBankAccountName(event.target.value)}
                          placeholder="Name on the bank account"
                          className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-ink-400">
                      <span>
                        Fee {naira(withdrawalFee)} · Min {naira(withdrawalMin)}
                      </span>
                      <span className="font-bold text-ink-600 dark:text-ink-300">
                        Available {naira(balance)}
                      </span>
                    </div>

                    <Button
                      type="submit"
                      variant="secondary"
                      className="mt-4 w-full"
                      disabled={!canWithdraw}
                    >
                      <Banknote className="h-4 w-4" />
                      Review payout
                    </Button>
                    {!payoutsAvailable && !statusLoading && (
                      <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
                        Bank payouts are unavailable until Paystack transfers are enabled.
                      </p>
                    )}
                  </form>
                </div>

                <div className="rounded-3xl border border-ink-200 dark:border-ink-800">
                  <div className="flex flex-col gap-3 border-b border-ink-150 p-4 dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div>
                      <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink-950 dark:text-white">
                        <Layers3 className="h-4 w-4 text-jade-600 dark:text-jade-400" />
                        Wallet ledger
                      </h3>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        Every credit, platform fee and payout in one audit trail.
                      </p>
                    </div>
                    <SegmentedControl
                      aria-label="Filter wallet transactions"
                      className="w-full sm:w-64"
                      value={txFilter}
                      onChange={(value) => setTxFilter(value as TxFilter)}
                      options={[
                        { value: 'all', label: 'All' },
                        { value: 'credit', label: 'In' },
                        { value: 'debit', label: 'Out' },
                      ]}
                    />
                  </div>

                  {visibleTransactions.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">
                        <Layers3 className="h-5 w-5" />
                      </span>
                      <p className="mt-3 text-sm font-bold text-ink-800 dark:text-white/80">
                        No wallet activity yet
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        Sales, refunds, promotions and payouts will appear here.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                      {visibleTransactions.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                                entry.amount > 0
                                  ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                                  : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
                              }`}
                            >
                              {entry.amount > 0 ? (
                                <ArrowDownLeft className="h-4 w-4" />
                              ) : (
                                <ArrowUpRight className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-ink-800 dark:text-white/85">
                                {entry.description}
                              </p>
                              <p className="mt-0.5 truncate text-[10px] text-ink-400">
                                {dateLabel(entry.createdAt)} · {entry.type.replace(/_/g, ' ')}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`text-xs font-bold ${
                                entry.amount > 0
                                  ? 'text-jade-700 dark:text-jade-300'
                                  : 'text-ink-800 dark:text-white/80'
                              }`}
                            >
                              {entry.amount > 0 ? '+' : '-'}
                              {naira(Math.abs(entry.amount))}
                            </p>
                            <p className="mt-0.5 text-[9px] text-ink-400">{entry.status}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {filteredTransactions.length > 7 && (
                    <button
                      type="button"
                      onClick={() => setShowAllTx((previous) => !previous)}
                      className="flex w-full items-center justify-center gap-1.5 border-t border-ink-150 py-3 text-[11px] font-bold text-jade-700 transition-colors hover:bg-jade-500/5 dark:border-ink-800 dark:text-jade-300"
                    >
                      {showAllTx ? 'Show recent activity' : `View all ${filteredTransactions.length} transactions`}
                      <ChevronRight
                        className={`h-3.5 w-3.5 transition-transform ${showAllTx ? '-rotate-90' : ''}`}
                      />
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'memberships' && (
              <div className="space-y-7">
                <SectionHead
                  eyebrow="Storefront status"
                  title="Memberships that compound"
                  description="Paid visibility and seller tools, activated only after Paystack payment is verified by the server. Membership never replaces identity or business verification."
                  action={
                    <div className="flex flex-wrap gap-1.5">
                      <StatusPill available={isVerifiedPlus} label="Verified+" />
                      <StatusPill available={isBusinessSubbed} label="Business" />
                    </div>
                  }
                />

                <div className="rounded-3xl border border-jade-500/25 bg-white p-4 dark:border-jade-500/20 dark:bg-ink-900 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Promotional credits</p>
                      <p className="mt-1 font-display text-2xl font-extrabold text-ink-950 dark:text-white">{naira(creditBalance)}</p>
                      <p className="mt-1 text-[10px] text-ink-400">Spend on Featured or Flash Sale placements. Credits expire on their own schedule and are never cash.</p>
                    </div>
                    <span className="rounded-full bg-jade-500/10 px-3 py-1 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                      Applied automatically when you opt in
                    </span>
                  </div>
                  {creditLedger.length > 0 && (
                    <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100 pt-2 dark:divide-ink-800 dark:border-ink-800">
                      {creditLedger.slice(0, 4).map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-[11px]">
                          <span className="min-w-0 truncate text-ink-500 dark:text-ink-300">{entry.description || entry.type.replace(/_/g, ' ')}</span>
                          <span className={entry.amount >= 0 ? 'font-bold text-jade-700 dark:text-jade-300' : 'font-bold text-ink-600 dark:text-ink-300'}>
                            {entry.amount >= 0 ? '+' : '-'}{naira(Math.abs(entry.amount))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="relative overflow-hidden rounded-3xl border border-gold-400/30 bg-gradient-to-br from-gold-50 via-white to-white p-5 dark:border-gold-300/20 dark:from-gold-300/10 dark:via-ink-900 dark:to-ink-900 sm:p-6">
                    <div className="absolute -right-5 -top-8 text-[10rem] font-black leading-none text-gold-400/[0.08]">
                      +
                    </div>
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gold-300 text-ink-950 shadow-lg shadow-gold-400/20">
                          <Star className="h-5 w-5 fill-current" />
                        </span>
                        <span className="rounded-full bg-gold-400/15 px-2.5 py-1 text-[10px] font-bold text-gold-700 dark:text-gold-200">
                          Seller membership
                        </span>
                      </div>
                      <h3 className="mt-5 font-display text-xl font-extrabold text-ink-950 dark:text-white">
                        Verified+
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                        A gold Verified+ member badge, configurable discovery boost and seller tooling.
                        It is not identity verification and does not alter your trust score.
                      </p>
                      <ul className="mt-4 space-y-2">
                        {(benefitsForPlan('VERIFIED_PLUS').length
                          ? benefitsForPlan('VERIFIED_PLUS')
                          : [
                              'Gold Verified+ member badge',
                              'Configurable visibility for eligible listings',
                              'Seller analytics access',
                              'No automatic trust-score change',
                            ]
                        ).map((item) => (
                          <li key={item} className="flex items-start gap-2 text-xs text-ink-600 dark:text-ink-300">
                            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-6 flex flex-col gap-3 border-t border-gold-400/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                            Per {premiumDurationDays} days · manual renewal
                          </p>
                          <p className="font-display text-2xl font-extrabold text-ink-950 dark:text-white">
                            {naira(settings.verifiedPlusPrice)}
                          </p>
                          {isVerifiedPlus && currentVerifiedPlus ? (
                            <p className="mt-1 text-[10px] text-ink-400">
                              Active until {dateLabel(currentVerifiedPlus.expiresAt)}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          onClick={openVerifiedPlusCheckout}
                          disabled={premiumProvider.loading}
                          className="w-full sm:w-auto"
                        >
                          {isVerifiedPlus ? (
                            <>
                              <RefreshCw className="h-4 w-4" /> Renew
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" /> Activate
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl border border-jade-500/25 bg-gradient-to-br from-jade-950 via-jade-900 to-ink-950 p-5 text-white shadow-xl shadow-jade-950/15 sm:p-6">
                    <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-jade-400/20 blur-3xl" />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-jade-800 shadow-lg">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold text-jade-100">
                          Business growth
                        </span>
                      </div>
                      <h3 className="mt-5 font-display text-xl font-extrabold">Business</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-white/60">
                        Business storefront and seller operations, with paid visibility and growth
                        tools. Business verification remains a separate review.
                      </p>
                      <ul className="mt-4 space-y-2">
                        {(benefitsForPlan(`BUSINESS_${businessPlan}` as MembershipPlanBenefit['planCode']).length
                          ? benefitsForPlan(`BUSINESS_${businessPlan}` as MembershipPlanBenefit['planCode'])
                          : [
                              'Business storefront and catalog operations',
                              'Advanced seller analytics',
                              'Bulk inventory tools',
                              'No automatic business verification',
                            ]
                        ).map((item) => (
                          <li key={item} className="flex items-start gap-2 text-xs text-white/70">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-jade-300" />
                            {item}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-5 grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-ink-950/25 p-1.5">
                        {[
                          { id: 'PRO' as const, label: 'Pro', price: settings.subProPrice },
                          { id: 'PREMIUM' as const, label: 'Premium', price: settings.subPremiumPrice },
                          {
                            id: 'ENTERPRISE' as const,
                            label: 'Enterprise',
                            price: settings.subEnterprisePrice,
                          },
                        ].map((plan) => (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => setBusinessPlan(plan.id)}
                            aria-pressed={businessPlan === plan.id}
                            className={`rounded-xl px-1.5 py-2 text-center transition-colors ${
                              businessPlan === plan.id
                                ? 'bg-white text-jade-900 shadow-sm'
                                : 'text-white/60 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <span className="block text-[10px] font-bold">{plan.label}</span>
                            <span className="mt-0.5 block text-[9px] opacity-70">
                              {naira(plan.price)}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-white/40">
                            Selected plan · per {premiumDurationDays} days
                          </p>
                          <p className="font-display text-2xl font-extrabold">
                            {naira(
                              businessPlan === 'PRO'
                                ? settings.subProPrice
                                : businessPlan === 'PREMIUM'
                                  ? settings.subPremiumPrice
                                  : settings.subEnterprisePrice
                            )}
                          </p>
                          {isBusinessSubbed && currentBusiness ? (
                            <p className="mt-1 text-[10px] text-white/45">
                              {currentBusiness.plan} active until {dateLabel(currentBusiness.expiresAt)}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          onClick={openBusinessCheckout}
                          disabled={premiumProvider.loading}
                          className="w-full bg-white text-jade-900 shadow-lg shadow-black/10 hover:bg-jade-50 sm:w-auto"
                        >
                          {isCurrentBusinessPlan ? (
                            <>
                              <RefreshCw className="h-4 w-4" /> Renew
                            </>
                          ) : (
                            <>
                              <Rocket className="h-4 w-4" /> Continue
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-3.5 text-[11px] leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-jade-600 dark:text-jade-400" />
                  Paystack charges this checkout once. GoodSale has no automatic recurring charge, so
                  renewal stays manual. Identity Verified, Business Verified and Verified+ Member are
                  separate labels.
                </div>

                {premiumProvider.message && (
                  <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {premiumProvider.message}
                  </div>
                )}

                <div className="rounded-3xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-ink-950 dark:text-white">
                        Membership payment history
                      </h3>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        Server-recorded Paystack checkouts and their activation status.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadPremiumAccount()}
                      disabled={premiumProvider.loading}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-[10px] font-bold text-ink-600 disabled:opacity-50 dark:border-ink-700 dark:text-ink-300"
                    >
                      <RefreshCw className={`h-3 w-3 ${premiumProvider.loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                  {premiumPayments.length === 0 ? (
                    <p className="mt-4 rounded-2xl bg-ink-50 px-4 py-5 text-center text-[11px] text-ink-400 dark:bg-ink-950/40">
                      No membership payments yet. Checkout records appear here after the server
                      creates a secure Paystack intent.
                    </p>
                  ) : (
                    <ul className="mt-3 divide-y divide-ink-150 dark:divide-ink-800">
                      {premiumPayments.slice(0, 8).map((payment) => (
                        <li
                          key={payment.reference}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[11px]"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-ink-800 dark:text-ink-100">
                              {payment.product === 'VERIFIED_PLUS'
                                ? 'Verified+'
                                : `Business ${payment.planCode}`}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-[9px] text-ink-400">
                              {payment.reference} · {dateLabel(payment.createdAt)}
                            </p>
                          </div>
                          <div className="ml-auto text-right">
                            <p className="font-bold text-ink-800 dark:text-ink-100">
                              {naira(payment.amount)}
                            </p>
                            <p
                              className={`text-[9px] font-bold uppercase ${
                                payment.status === 'SUCCESS'
                                  ? 'text-jade-600 dark:text-jade-300'
                                  : payment.status === 'PENDING'
                                    ? 'text-gold-600 dark:text-gold-300'
                                    : 'text-ink-400'
                              }`}
                            >
                              {payment.status}
                              {payment.expiresAt ? ` · ends ${dateLabel(payment.expiresAt)}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'promotions' && (
              <div className="space-y-7">
                <SectionHead
                  eyebrow="Get discovered"
                  title="Promote a listing"
                  description="Put the right product in front of more buyers. Choose a listing, then buy a featured placement or schedule it for a Flash Sale."
                  action={
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-500/10 px-3 py-1.5 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                      <Zap className="h-3 w-3" /> {featuredListings.length} active
                    </span>
                  }
                />

                <div className="rounded-3xl border border-ink-200 bg-ink-50/60 p-4 dark:border-ink-800 dark:bg-ink-950/40 sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="min-w-0">
                      <label
                        htmlFor="promotion-product"
                        className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                      >
                        Listing to promote
                      </label>
                      <select
                        id="promotion-product"
                        value={selectedProductId}
                        onChange={(event) => setSelectedProductId(event.target.value)}
                        disabled={products.length === 0}
                        className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 focus-ring disabled:opacity-60 dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                      >
                        <option value="">
                          {products.length ? 'Choose a listing' : 'No listings available'}
                        </option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.title} — {naira(product.price)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {products.length === 0 && (
                      <button
                        type="button"
                        onClick={() => onNavigate?.('dashboard')}
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 text-xs font-bold text-ink-700 transition-colors hover:border-jade-400 dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add a listing
                      </button>
                    )}
                    {selectedProduct && (
                      <span className="max-w-full truncate text-[10px] text-ink-400 sm:max-w-[14rem]">
                        {selectedProduct.title}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-3xl border border-ink-200 p-5 dark:border-ink-800 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-jade-500/10 text-jade-700 dark:text-jade-300">
                        <Flame className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-jade-500/10 px-2.5 py-1 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                        Featured placement
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-lg font-bold text-ink-950 dark:text-white">
                      Stay at the top of search
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      Give one listing priority placement in category and search feeds for a fixed
                      number of days.
                    </p>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {(['3', '7', '14'] as const).map((duration) => {
                        const price =
                          duration === '3'
                            ? settings.featured3DaysPrice
                            : duration === '7'
                              ? settings.featured7DaysPrice
                              : settings.featured14DaysPrice;
                        return (
                          <button
                            key={duration}
                            type="button"
                            onClick={() => setFeaturedDuration(duration)}
                            aria-pressed={featuredDuration === duration}
                            className={`rounded-2xl border px-2 py-3 text-center transition-all ${
                              featuredDuration === duration
                                ? 'border-jade-500 bg-jade-500/10 text-jade-800 dark:border-jade-400 dark:text-jade-200'
                                : 'border-ink-200 text-ink-600 hover:border-jade-400/60 dark:border-ink-800 dark:text-ink-400'
                            }`}
                          >
                            <span className="block text-xs font-extrabold">{duration} days</span>
                            <span className="mt-0.5 block text-[10px] opacity-75">{naira(price)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <label className="mt-4 flex items-start gap-2 rounded-xl border border-jade-500/20 bg-jade-500/5 p-3 text-[11px] text-ink-600 dark:text-ink-300">
                      <input
                        type="checkbox"
                        checked={usePromoCredits}
                        onChange={(event) => setUsePromoCredits(event.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-jade-600"
                      />
                      <span>
                        Apply promotional credits first ({naira(creditBalance)} available). Any remainder is charged to your wallet.
                      </span>
                    </label>
                    <div className="mt-5 flex flex-col gap-2.5 border-t border-ink-150 pt-4 dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                          Total today
                        </p>
                        <p className="font-display text-xl font-extrabold text-ink-950 dark:text-white">
                          {naira(featuredPrice)}
                        </p>
                      </div>
                      <Button
                        onClick={() => void handlePromoteProduct('FEATURED')}
                        disabled={purchasingPromotion || !selectedProductId}
                        className="w-full sm:w-auto"
                      >
                        {purchasingPromotion ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        {purchasingPromotion ? 'Purchasing…' : 'Feature listing'}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-ink-200 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-950/40 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gold-400/15 text-gold-700 dark:text-gold-300">
                        <Clock3 className="h-5 w-5" />
                      </span>
                      <span className="rounded-full bg-gold-400/15 px-2.5 py-1 text-[10px] font-bold text-gold-700 dark:text-gold-200">
                        Flash Sale
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-lg font-bold text-ink-950 dark:text-white">
                      Flash Sale placement
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      Schedule a real 24-hour discount with a moderated sale price and optional unit
                      limit. Buyers only see it while the approved window is live.
                    </p>
                    <div className="mt-4 space-y-3">
                      <label className="block text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                        Sale price (₦)
                        <input
                          type="number"
                          min={1}
                          max={selectedProduct ? Math.max(1, selectedProduct.price - 1) : undefined}
                          value={flashSalePrice}
                          onChange={(event) => setFlashSalePrice(event.target.value)}
                          placeholder={selectedProduct ? `Below ${naira(selectedProduct.price)}` : 'Choose a listing first'}
                          className="mt-1 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                          Starts at
                          <input
                            type="datetime-local"
                            value={flashStartsAt}
                            onChange={(event) => setFlashStartsAt(event.target.value)}
                            className="mt-1 h-10 w-full rounded-xl border border-ink-200 bg-white px-2 text-[10px] font-semibold text-ink-900 dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </label>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                          Unit limit
                          <input
                            type="number"
                            min={1}
                            value={flashQuantity}
                            onChange={(event) => setFlashQuantity(event.target.value)}
                            placeholder={selectedProduct ? String(selectedProduct.quantity) : 'Optional'}
                            className="mt-1 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </label>
                      </div>
                      <p className="text-[10px] leading-relaxed text-ink-400">
                        Starts immediately when left blank. Every Flash Sale is reviewed before it can go live; rejected purchases are refunded.
                      </p>
                    </div>
                    <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-ink-500 dark:text-ink-400">Fixed price</span>
                        <span className="font-bold text-ink-900 dark:text-white">
                          {naira(settings.flashSaleFeaturePrice)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="text-ink-500 dark:text-ink-400">Placement</span>
                        <span className="font-bold text-jade-700 dark:text-jade-300">
                          24 hours
                        </span>
                      </div>
                    </div>
                    <label className="mt-3 flex items-start gap-2 rounded-xl border border-jade-500/20 bg-jade-500/5 p-3 text-[11px] text-ink-600 dark:text-ink-300">
                      <input
                        type="checkbox"
                        checked={usePromoCredits}
                        onChange={(event) => setUsePromoCredits(event.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-jade-600"
                      />
                      <span>Apply {naira(creditBalance)} promotional credits first.</span>
                    </label>
                    <Button
                      variant="secondary"
                      onClick={() => void handlePromoteProduct('FLASH_SALE')}
                      disabled={purchasingPromotion || !selectedProductId || !flashSalePrice}
                      className="mt-4 w-full"
                    >
                      {purchasingPromotion ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Clock3 className="h-4 w-4" />
                      )}
                      {purchasingPromotion ? 'Purchasing…' : 'Add Flash Sale placement'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-3xl border border-ink-200 dark:border-ink-800">
                  <div className="flex items-center justify-between gap-3 border-b border-ink-150 p-4 dark:border-ink-800 sm:p-5">
                    <div>
                      <h3 className="font-display text-base font-bold text-ink-950 dark:text-white">
                        Your promotions
                      </h3>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        Pending review, scheduled, live and completed placements.
                      </p>
                    </div>
                    <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                      {featuredListings.length} live
                    </span>
                  </div>
                  {myPromotions.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <Flame className="mx-auto h-6 w-6 text-ink-300" />
                      <p className="mt-2 text-xs font-bold text-ink-700 dark:text-white/80">
                        No active promotions
                      </p>
                      <p className="mt-1 text-[10px] text-ink-400">
                        Choose a listing above to put it in front of more buyers.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                      {myPromotions.map((entry) => {
                        const product = products.find((item) => item.id === entry.productId);
                        const daysLeft = Math.max(
                          0,
                          Math.ceil(
                            (new Date(entry.expiresAt).getTime() - Date.now()) / 86_400_000
                          )
                        );
                        return (
                          <li
                            key={entry.id}
                            className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-gold-700 dark:text-gold-300">
                                <Flame className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-ink-800 dark:text-white/85">
                                  {product?.title || `Listing #${entry.productId}`}
                                </p>
                                <p className="mt-0.5 text-[10px] text-ink-400">
                                  {entry.featureType === 'FLASH_SALE' ? 'Flash Sale' : 'Featured'} · {entry.status.replace(/_/g, ' ')} · Ends{' '}
                                  {dateLabel(entry.expiresAt)}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                                entry.status === 'ACTIVE'
                                  ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                                  : entry.status === 'PENDING_REVIEW'
                                    ? 'bg-gold-400/15 text-gold-700 dark:text-gold-200'
                                    : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                              }`}
                            >
                              {entry.status === 'ACTIVE'
                                ? `${daysLeft} days left`
                                : entry.status === 'PENDING_REVIEW'
                                  ? 'Awaiting review'
                                  : entry.status.replace(/_/g, ' ')}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'ads' && (
              <div className="space-y-7">
                <SectionHead
                  eyebrow="Paid reach"
                  title="Sponsored ads"
                  description="Submit a pay-per-click campaign for admin review. The budget is reserved from your wallet at submission, and the campaign serves only after approval. Rejected campaigns are refunded."
                  action={
                    <div className="flex flex-wrap gap-1.5">
                      <StatusPill available={activeCampaigns.length > 0} label={`${activeCampaigns.length} live`} />
                      <StatusPill available={adSpend > 0} label={`${naira(adSpend)} spent`} />
                    </div>
                  }
                />

                <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                  <form
                    onSubmit={handleCreateAd}
                    className="rounded-3xl border border-ink-200 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-950/40 sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-bold text-ink-950 dark:text-white">
                        Launch a campaign
                      </h3>
                      <span className="rounded-full bg-jade-500/10 px-2.5 py-1 text-[10px] font-bold text-jade-700 dark:text-jade-300">
                        CPC {naira(settings.adCpcPrice)}
                      </span>
                    </div>

                    <div className="mt-5 space-y-3.5">
                      <div>
                        <label
                          htmlFor="ad-title"
                          className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                        >
                          Campaign title
                        </label>
                        <input
                          id="ad-title"
                          value={adTitle}
                          onChange={(event) => setAdTitle(event.target.value)}
                          placeholder="e.g. Weekend phone deals"
                          className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label
                            htmlFor="ad-type"
                            className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                          >
                            Placement
                          </label>
                          <select
                            id="ad-type"
                            value={adType}
                            onChange={(event) =>
                              setAdType(event.target.value as typeof adType)
                            }
                            className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          >
                            <option value="PRODUCT">Product</option>
                            <option value="BUSINESS">Business</option>
                            <option value="BANNER_HOME">Home banner</option>
                            <option value="BANNER_CATEGORY">Category banner</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="ad-budget"
                            className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                          >
                            Budget
                          </label>
                          <div className="relative mt-1.5">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-400">
                              ₦
                            </span>
                            <input
                              id="ad-budget"
                              inputMode="numeric"
                              value={adBudget}
                              onChange={(event) =>
                                setAdBudget(event.target.value.replace(/[^\d]/g, ''))
                              }
                              className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-7 pr-2 text-xs font-bold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                            />
                          </div>
                        </div>
                      </div>

                      {adType === 'PRODUCT' && (
                        <div>
                          <label
                            htmlFor="ad-target"
                            className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                          >
                            Product to promote
                          </label>
                          <select
                            id="ad-target"
                            value={adTargetId}
                            onChange={(event) => setAdTargetId(event.target.value)}
                            className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-2.5 text-xs font-semibold text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          >
                            <option value="">Choose a listing</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label
                          htmlFor="ad-banner"
                          className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400"
                        >
                          Banner image URL <span className="font-medium normal-case">(optional)</span>
                        </label>
                        <input
                          id="ad-banner"
                          value={adBannerUrl}
                          onChange={(event) => setAdBannerUrl(event.target.value)}
                          placeholder="https://…"
                          className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-[11px] text-ink-900 focus-ring dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                          Delivery placements
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {AD_PLACEMENTS.map((placement) => {
                            const selected = adPlacements.includes(placement);
                            return (
                              <button
                                key={placement}
                                type="button"
                                onClick={() =>
                                  setAdPlacements((current) =>
                                    selected
                                      ? current.filter((item) => item !== placement)
                                      : [...current, placement]
                                  )
                                }
                                aria-pressed={selected}
                                className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-bold tracking-wide ${
                                  selected
                                    ? 'border-jade-500 bg-jade-500/10 text-jade-700 dark:text-jade-300'
                                    : 'border-ink-200 text-ink-400 dark:border-ink-800'
                                }`}
                              >
                                {placement}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                          Starts
                          <input
                            type="datetime-local"
                            value={adStartsAt}
                            onChange={(event) => setAdStartsAt(event.target.value)}
                            className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-2 text-[10px] font-semibold dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </label>
                        <label className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                          Ends
                          <input
                            type="datetime-local"
                            value={adEndsAt}
                            onChange={(event) => setAdEndsAt(event.target.value)}
                            className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-2 text-[10px] font-semibold dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                          Daily budget (₦)
                          <input
                            type="number"
                            min={1}
                            value={adDailyBudget}
                            onChange={(event) => setAdDailyBudget(event.target.value)}
                            placeholder="No daily cap"
                            className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </label>
                        <label className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                          Max CPC bid (₦)
                          <input
                            type="number"
                            min={settings.adCpcPrice}
                            value={adCpcBid}
                            onChange={(event) => setAdCpcBid(event.target.value)}
                            placeholder={String(settings.adCpcPrice)}
                            className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-xs font-semibold dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={adTargetState}
                          onChange={(event) => setAdTargetState(event.target.value)}
                          placeholder="State"
                          aria-label="Target state"
                          className="h-10 w-full rounded-xl border border-ink-200 bg-white px-2 text-[10px] font-semibold dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                        />
                        <input
                          value={adTargetCity}
                          onChange={(event) => setAdTargetCity(event.target.value)}
                          placeholder="City"
                          aria-label="Target city"
                          className="h-10 w-full rounded-xl border border-ink-200 bg-white px-2 text-[10px] font-semibold dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                        />
                        <input
                          value={adTargetCategory}
                          onChange={(event) => setAdTargetCategory(event.target.value)}
                          placeholder="Category"
                          aria-label="Target category"
                          className="h-10 w-full rounded-xl border border-ink-200 bg-white px-2 text-[10px] font-semibold dark:border-ink-800 dark:bg-ink-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-ink-200 bg-white px-3.5 py-3 text-[10px] dark:border-ink-800 dark:bg-ink-900">
                      <span className="text-ink-400">Estimated clicks</span>
                      <span className="font-bold text-ink-800 dark:text-white">
                        {Number(adBudget) > 0
                          ? Math.floor(Number(adBudget) / Math.max(1, Number(adCpcBid) || settings.adCpcPrice))
                          : 0}{' '}
                        clicks
                      </span>
                    </div>

                    <Button
                      type="submit"
                      className="mt-4 w-full"
                      disabled={creatingAd || !adTitle.trim() || !adBudget || balance <= 0}
                    >
                      {creatingAd ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Megaphone className="h-4 w-4" />
                      )}
                      {creatingAd ? 'Submitting…' : 'Submit campaign for review'}
                    </Button>
                    {balance <= 0 && (
                      <p className="mt-2 text-[10px] leading-relaxed text-ink-400">
                        Add funds to your wallet before launching a paid campaign.
                      </p>
                    )}
                  </form>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-ink-200 p-5 dark:border-ink-800 sm:p-6">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-display text-base font-bold text-ink-950 dark:text-white">
                            Campaign performance
                          </h3>
                          <p className="mt-0.5 text-[10px] text-ink-400">
                            Live delivery and click-through across your ads.
                          </p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-jade-600 dark:text-jade-400" />
                      </div>

                      {campaigns.length === 0 ? (
                        <div className="mt-5 rounded-2xl border border-dashed border-ink-200 px-4 py-10 text-center dark:border-ink-700">
                          <Target className="mx-auto h-6 w-6 text-ink-300" />
                          <p className="mt-2 text-xs font-bold text-ink-700 dark:text-white/80">
                            No campaigns yet
                          </p>
                          <p className="mt-1 text-[10px] text-ink-400">
                            Launch your first campaign to start tracking impressions and clicks.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {campaigns.map((ad) => {
                            const ctr = ad.impressions
                              ? (ad.clicks / ad.impressions) * 100
                              : 0;
                            const progress =
                              ad.budget > 0
                                ? Math.min(100, (ad.spent / ad.budget) * 100)
                                : 0;
                            return (
                              <div
                                key={ad.id}
                                className="rounded-2xl border border-ink-150 bg-ink-50/70 p-3.5 dark:border-ink-800 dark:bg-ink-950/40"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-bold text-ink-900 dark:text-white">
                                      {ad.title}
                                    </p>
                                    <p className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-400">
                                      {ad.type.replace(/_/g, ' ')}
                                    </p>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                      ad.status === 'ACTIVE'
                                        ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                                        : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                                    }`}
                                  >
                                    {ad.status.replace(/_/g, ' ')}
                                  </span>
                                </div>
                                <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                                  <div>
                                    <p className="text-xs font-extrabold text-ink-900 dark:text-white">
                                      {compactNumber(ad.impressions)}
                                    </p>
                                    <p className="text-[9px] text-ink-400">Impressions</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-extrabold text-ink-900 dark:text-white">
                                      {compactNumber(ad.clicks)}
                                    </p>
                                    <p className="text-[9px] text-ink-400">Clicks</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-extrabold text-ink-900 dark:text-white">
                                      {ctr.toFixed(1)}%
                                    </p>
                                    <p className="text-[9px] text-ink-400">CTR</p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-extrabold text-ink-900 dark:text-white">
                                      {compactNumber(ad.conversions || 0)}
                                    </p>
                                    <p className="text-[9px] text-ink-400">Sales</p>
                                  </div>
                                </div>
                                {(ad.conversionValue || 0) > 0 && (
                                  <p className="mt-2 text-[9px] font-bold text-jade-600 dark:text-jade-300">
                                    {naira(Number(ad.conversionValue))} attributed order value
                                  </p>
                                )}
                                <div className="mt-3">
                                  <div className="flex items-center justify-between text-[9px] text-ink-400">
                                    <span>{naira(ad.spent)} spent</span>
                                    <span>{naira(ad.budget)} budget</span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-jade-500 to-jade-300 transition-all"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-ink-200 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-950/40 sm:p-6">
                      <div className="flex items-start gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-gold-700 dark:text-gold-300">
                          <Eye className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="font-display text-sm font-bold text-ink-950 dark:text-white">
                            How CPC works
                          </h3>
                          <p className="mt-1 text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">
                            Your campaign budget is reserved at launch. Impressions are free;
                            delivery consumes the CPC rate only when someone clicks your ad.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-white p-3 dark:bg-ink-900">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-ink-400">
                            Wallet budget
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-ink-900 dark:text-white">
                            {naira(Number(adBudget) || 0)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3 dark:bg-ink-900">
                          <p className="text-[9px] font-bold uppercase tracking-wide text-ink-400">
                            Total allocated
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-ink-900 dark:text-white">
                            {naira(adBudgetTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="flex items-center justify-center gap-2 pb-4 text-center text-[10px] text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Wallet balances, escrow releases and payout decisions are verified by GoodSale&apos;s servers.
        </div>
      </div>

      <AddFundsDialog
        open={addFundsOpen}
        onClose={() => setAddFundsOpen(false)}
        onFunded={handleFunded}
        email={typeof user.email === 'string' ? user.email : ''}
        min={fundingMin}
        max={fundingMax}
        enabled={fundingAvailable}
      />

      <WithdrawReviewDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={() => void submitWithdrawal()}
        submitting={submittingPayout}
        amount={parsedWithdrawal}
        availableBalance={balance}
        fee={withdrawalFee}
        bank={bankName}
        accountName={bankAccountName}
        accountNumber={bankAccountNumber}
      />

      {subscriptionCheckout && (
        <SubscriptionCheckoutDialog
          open={Boolean(subscriptionCheckout)}
          onClose={() => setSubscriptionCheckout(null)}
          email={typeof user.email === 'string' ? user.email : ''}
          product={subscriptionCheckout.product}
          planCode={subscriptionCheckout.planCode}
          title={subscriptionCheckout.title}
          price={subscriptionCheckout.price}
          onActivated={handlePremiumActivated}
        />
      )}
    </div>
  );
}
