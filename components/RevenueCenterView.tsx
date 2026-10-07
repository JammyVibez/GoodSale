// components/RevenueCenterView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  DollarSign, Landmark, Sparkles, Star, Award, ShieldCheck, Play, ArrowRight,
  TrendingUp, Volume2, Plus, Check, RefreshCw, AlertCircle, FileText, BarChart3,
  MousePointerClick, Flame, Layers, Clock, Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  getDBState, saveDBState, dbOperations, RevenueSettings, Wallet, WalletTransaction, UserRole
} from '../lib/store';
import { isDemoMode } from '@/lib/demo';

export default function RevenueCenterView() {
  const [db, setDb] = useState(getDBState());
  const [activeSubTab, setActiveSubTab] = useState<'wallet' | 'subscriptions' | 'listings' | 'ads'>('wallet');

  // Wallet deposit / withdrawal states
  const [depositAmount, setDepositAmount] = useState('15000');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [bankName, setBankName] = useState('Guaranty Trust Bank (GTB)');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletSuccess, setWalletSuccess] = useState<string | null>(null);

  // Sponsored Ads campaign creator states
  const [adTitle, setAdTitle] = useState('');
  const [adType, setAdType] = useState<'PRODUCT' | 'BUSINESS' | 'BANNER_HOME' | 'BANNER_CATEGORY'>('PRODUCT');
  const [adBudget, setAdBudget] = useState('5000');
  const [adTargetId, setAdTargetId] = useState('');
  const [adBannerUrl, setAdBannerUrl] = useState('');

  const [adError, setAdError] = useState<string | null>(null);
  const [adSuccess, setAdSuccess] = useState<string | null>(null);

  // Promote states
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [featuredDuration, setFeaturedDuration] = useState<'3' | '7' | '14' | '30'>('7');

  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const user = db.currentUser;
  
  // Retrieve user's wallet (create if doesn't exist)
  let wallet = user ? db.wallets.find(w => w.userId === user.id) : null;
  if (user && !wallet) {
    // Lazy auto initialize a real wallet at zero balance (top-ups come from Paystack).
    wallet = {
      id: db.wallets.length + 1,
      userId: user.id,
      balance: 0,
    };
    db.wallets.push(wallet);
    saveDBState(db);
  }

  const settings = db.revenueSettings;
  const myTransactions = wallet ? db.walletTransactions.filter(t => t.walletId === wallet?.id) : [];
  const myCampaigns = user ? db.sponsoredAds.filter(a => a.sellerId === user.id) : [];
  const myProducts = user ? db.products.filter(p => p.sellerId === user.id) : [];

  // Check user subscription statuses
  const isBusinessSubbed = user?.role === UserRole.BUSINESS || user?.role === UserRole.VERIFIED_BUSINESS;
  const isVerifiedPlus = user?.role === UserRole.VERIFIED_SELLER || user?.role === UserRole.VERIFIED_BUSINESS;

  // Deposit Cash to Wallet
  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !wallet) return;

    if (!isDemoMode()) {
      setWalletError('Wallet top-ups require verified Paystack checkout in production. Demo deposits are disabled.');
      return;
    }

    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) {
      setWalletError('Please enter a valid deposit amount.');
      return;
    }

    setWalletError(null);
    dbOperations.depositToWallet(user.id, amt);
    setWalletSuccess(`Success! ₦${amt.toLocaleString()} has been added to your wallet (demo mode).`);
    setDepositAmount('15000');
    setTimeout(() => setWalletSuccess(null), 5000);
  };

  // Withdraw Cash from Wallet Form Submit
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !wallet) return;

    const amt = parseFloat(withdrawalAmount);
    if (isNaN(amt) || amt <= 0) {
      setWalletError('Please enter a valid withdrawal amount.');
      return;
    }

    if (amt > wallet.balance) {
      setWalletError('Insufficient wallet balance to execute payout withdrawal.');
      return;
    }

    if (!bankAccountName || !bankAccountNumber || bankAccountNumber.length < 10) {
      setWalletError('Please fill in complete valid Nigerian bank routing credentials.');
      return;
    }

    setWalletError(null);
    const result = await dbOperations.withdrawFromWallet(user.id, amt, {
      name: bankAccountName,
      number: bankAccountNumber,
      bank: bankName
    });

    if (result.success) {
      setWalletSuccess(`Success! Withdrawal payout request of ₦${amt.toLocaleString()} received and under verification process.`);
      setWithdrawalAmount('');
      setBankAccountName('');
      setBankAccountNumber('');
      setTimeout(() => setWalletSuccess(null), 5000);
    } else {
      setWalletError(result.message || 'Withdrawal processing failed.');
    }
  };

  // Business subscription checkout
  const handleSubscribeBusiness = (plan: 'PRO' | 'PREMIUM' | 'ENTERPRISE') => {
    if (!user) {
      setWalletError('Please log in first to activate a business tier subscription.');
      return;
    }
    setWalletError(null);
    const result = dbOperations.subscribeBusiness(user.id, plan);
    if (result.success) {
      setWalletSuccess(`Congratulations! Your Business ${plan} membership plan has been successfully activated.`);
      setTimeout(() => setWalletSuccess(null), 5000);
    } else {
      setWalletError(result.message || 'Subscription payment checkout failed.');
    }
  };

  // Verified+ Checkout
  const handleSubscribeVerifiedPlus = () => {
    if (!user) {
      setWalletError('Please log in first.');
      return;
    }
    setWalletError(null);
    const result = dbOperations.subscribeVerifiedPlus(user.id);
    if (result.success) {
      setWalletSuccess('Outstanding! Verified+ Premium Seller credentials successfully applied to your account badge.');
      setTimeout(() => setWalletSuccess(null), 5000);
    } else {
      setWalletError(result.message || 'Verified+ badge subscription checkout failed.');
    }
  };

  // Promote products featured or flash sales checkout
  const handlePromoteProduct = (type: 'FEATURED' | 'FLASHSALE') => {
    if (!user) return;
    if (!selectedProductId) {
      setPromoteError('Please select a product from your listings inventory.');
      return;
    }

    setPromoteError(null);
    setPromoteSuccess(null);

    const prodId = parseInt(selectedProductId);
    if (type === 'FEATURED') {
      const days = parseInt(featuredDuration);
      const result = dbOperations.promoteListingFeatured(prodId, days);
      if (result.success) {
        setPromoteSuccess(`Listing promoted successfully! Product promoted to Featured search placements for ${days} days.`);
        setSelectedProductId('');
      } else {
        setPromoteError(result.message || 'Featured Promotion checkout failed.');
      }
    } else {
      const result = dbOperations.promoteListingFlashSale(prodId);
      if (result.success) {
        setPromoteSuccess(`Listing scheduled! Product scheduled for the next high-traffic Flash Sale block.`);
        setSelectedProductId('');
      } else {
        setPromoteError(result.message || 'Flash Sale promotion failed.');
      }
    }
  };

  // Sponsored Ads Campaign creator
  const handleCreateAd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!adTitle || !adBudget) {
      setAdError('Please specify an Ad campaign title and starting CPC wallet budget.');
      return;
    }

    const budget = parseFloat(adBudget);
    if (isNaN(budget) || budget <= 0) {
      setAdError('Please specify a valid CPC campaign budget.');
      return;
    }

    if (wallet && wallet.balance < budget) {
      setAdError('Insufficient wallet balance to fund this ad campaign.');
      return;
    }

    setAdError(null);
    setAdSuccess(null);

    const targetId = parseInt(adTargetId) || (myProducts[0]?.id || 1);
    const result = dbOperations.createSponsoredAd(
      user.id,
      adType,
      targetId,
      adTitle,
      budget,
      adBannerUrl
    );

    if (result.success) {
      setAdSuccess(`Campaign activated! Sponsored CPC Ad "${adTitle}" is now running across home and category feeds.`);
      setAdTitle('');
      setAdBudget('5000');
    } else {
      setAdError(result.message || 'Ad campaign initialization failed.');
    }
  };

  // Interactive CPC Campaign Click Simulator
  const simulateAdClick = (adId: number) => {
    dbOperations.interactSponsoredAd(adId, 'CLICK');
    setDb(getDBState());
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 font-sans" id="revenue-center">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-ink-500 via-ink-600 to-ink-900 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-8">
        <div className="absolute right-0 top-0 opacity-10 transform translate-x-12 -translate-y-12">
          <DollarSign className="w-96 h-96" />
        </div>
        <div className="relative z-10 space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 bg-ink-400/20 border border-ink-300/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wide text-ink-200">
            <Sparkles className="w-3.5 h-3.5 text-ink-300" />
            GoodSale Revenue Engine
          </div>
          <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">
            Revenue & Wallet Portal
          </h1>
          <p className="text-xs md:text-sm text-ink-100 font-medium animate-fade-in">
            Manage your local payments, business subscriptions, featured listings, escrow disbursements, and PPC Sponsored campaigns directly.
          </p>
        </div>
      </div>

      {!user ? (
        <div className="text-center py-16 bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 rounded-3xl shadow-md p-8">
          <AlertCircle className="w-16 h-16 text-ink-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-ink-800 dark:text-white">Authentication Required</h3>
          <p className="text-xs text-ink-500 dark:text-ink-400 max-w-sm mx-auto mt-2">
            Please log in to manage your wallets, activate business subscriptions, or promote your listings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Side Tabs Menu */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 rounded-3xl p-5 shadow-sm space-y-4">
              
              {/* Wallet Card Balance quick check */}
              <div className="bg-gradient-to-br from-jade-500/10 to-jade-600/5 dark:from-jade-950/20 border border-jade-500/20 p-4 rounded-2xl space-y-1.5">
                <span className="text-xs text-jade-600 dark:text-jade-400 font-bold tracking-wider font-mono">Available Wallet Balance</span>
                <p className="text-2xl font-bold text-jade-600 dark:text-jade-400 font-mono">
                  ₦{wallet ? wallet.balance.toLocaleString() : '0'}
                </p>
                <div className="text-xs text-ink-400">
                  Secure Escrow Trust Wallet • Nigeria
                </div>
              </div>

              {/* Subtabs lists */}
              <div className="space-y-1">
                <button
                  onClick={() => { setActiveSubTab('wallet'); setWalletError(null); setWalletSuccess(null); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeSubTab === 'wallet' 
                      ? 'bg-jade-500 text-white shadow-sm' 
                      : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
                  }`}
                >
                  <Landmark className="w-4 h-4" />
                  Wallet, Deposits & Payouts
                </button>

                <button
                  onClick={() => { setActiveSubTab('subscriptions'); setWalletError(null); setWalletSuccess(null); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeSubTab === 'subscriptions' 
                      ? 'bg-jade-500 text-white shadow-sm' 
                      : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  Premium Memberships
                </button>

                <button
                  onClick={() => { setActiveSubTab('listings'); setPromoteError(null); setPromoteSuccess(null); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeSubTab === 'listings' 
                      ? 'bg-jade-500 text-white shadow-sm' 
                      : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  Promote Listings (Featured)
                </button>

                <button
                  onClick={() => { setActiveSubTab('ads'); setAdError(null); setAdSuccess(null); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all ${
                    activeSubTab === 'ads' 
                      ? 'bg-jade-500 text-white shadow-sm' 
                      : 'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-850'
                  }`}
                >
                  <MousePointerClick className="w-4 h-4" />
                  Sponsored CPC Ads Builder
                </button>
              </div>

            </div>
          </div>

          {/* Main SubTab Content Container */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-800 rounded-3xl p-6 md:p-8 shadow-sm min-h-[500px] space-y-6">
              
              {/* WALLET DEPOSITS & PAYOUTS SUBTAB */}
              {activeSubTab === 'wallet' && (
                <div className="space-y-8">
                  
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-ink-800 dark:text-white">Wallet & Bank Settlement Hub</h3>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      Disburse secure sales funds, pay for platform premiums, or withdraw directly to your verified local Nigerian bank account.
                    </p>
                  </div>

                  {walletError && (
                    <div className="p-4 bg-ink-500/10 text-ink-500 text-xs rounded-2xl border border-ink-500/20 font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{walletError}</span>
                    </div>
                  )}

                  {walletSuccess && (
                    <div className="p-4 bg-jade-500/10 text-jade-500 text-xs rounded-2xl border border-jade-500/20 font-medium flex items-center gap-2">
                      <Check className="w-4 h-4 flex-shrink-0" />
                      <span>{walletSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Deposit Simulator Panel */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold tracking-wider font-mono text-jade-600 dark:text-jade-400">Funding Deposit Portal</h4>
                      
                      <form onSubmit={handleDeposit} className="space-y-4 bg-ink-50 dark:bg-ink-950 p-5 rounded-2xl border border-ink-100 dark:border-ink-850">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Amount to Deposit (₦)</label>
                          <input 
                            type="number"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder="e.g. 15000"
                            className="w-full text-xs font-semibold px-4 py-3 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 focus:outline-none"
                          />
                        </div>

                        <div className="p-3 bg-white dark:bg-ink-900 rounded-xl border border-ink-100 dark:border-ink-800 flex items-center justify-between text-xs">
                          <span className="text-ink-400 font-medium">Gateway Service:</span>
                          <span className="font-semibold text-[#0A854B] flex items-center gap-1">
                            Paystack Secure Checkout
                          </span>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
                        >
                          Trigger Secure Fund Checkout
                        </button>
                      </form>
                    </div>

                    {/* Withdrawal Payout Form Panel */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Bank Withdrawal Payout</h4>
                      
                      <form onSubmit={handleWithdraw} className="space-y-4 bg-ink-50 dark:bg-ink-950 p-5 rounded-2xl border border-ink-100 dark:border-ink-850">
                        
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Withdrawal Amount (₦)</label>
                          <input 
                            type="number"
                            value={withdrawalAmount}
                            onChange={(e) => setWithdrawalAmount(e.target.value)}
                            placeholder="e.g. 50000"
                            className="w-full text-xs font-semibold px-4 py-3 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-400">Destination Bank</label>
                            <select 
                              value={bankName}
                              onChange={(e) => setBankName(e.target.value)}
                              className="w-full text-xs px-3 py-2.5 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 cursor-pointer font-bold"
                            >
                              <option value="GTBank">Guaranty Trust Bank (GTB)</option>
                              <option value="Access Bank">Access Bank Plc</option>
                              <option value="Zenith Bank">Zenith Bank Plc</option>
                              <option value="UBA">United Bank for Africa (UBA)</option>
                              <option value="Kuda Bank">Kuda Microfinance Bank</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-400">Account Name</label>
                              <input 
                                type="text"
                                value={bankAccountName}
                                onChange={(e) => setBankAccountName(e.target.value)}
                                placeholder="e.g. Dele Coker"
                                className="w-full text-xs px-3 py-2.5 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-ink-400">Account Number</label>
                              <input 
                                type="text"
                                value={bankAccountNumber}
                                onChange={(e) => setBankAccountNumber(e.target.value)}
                                placeholder="10-digit NUBAN"
                                maxLength={10}
                                className="w-full text-xs px-3 py-2.5 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 font-mono"
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
                        >
                          Request Bank Payout Settlement
                        </button>
                      </form>
                    </div>

                  </div>

                  {/* Transaction Ledger list */}
                  <div className="space-y-4 pt-6 border-t border-ink-100 dark:border-ink-800">
                    <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Secure Wallet Transaction Ledger</h4>
                    
                    {myTransactions.length === 0 ? (
                      <p className="text-xs text-ink-400 italic text-center py-8">
                        No transactions logged on your wallet yet. Perform sales or checkout features to populate the ledger.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {myTransactions.slice().reverse().map(t => (
                          <div 
                            key={t.id}
                            className="bg-ink-50 dark:bg-ink-950 rounded-2xl p-4 border border-ink-100 dark:border-ink-800/60 flex items-center justify-between text-xs"
                          >
                            <div className="space-y-1">
                              <span className="font-semibold text-ink-800 dark:text-ink-200">
                                {t.description}
                              </span>
                              <div className="flex items-center gap-2 text-xs text-ink-400 font-mono">
                                <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                                <span>•</span>
                                <span className={`font-bold ${t.status === 'COMPLETED' ? 'text-jade-500' : 'text-ink-500'}`}>
                                  {t.status}
                                </span>
                              </div>
                            </div>
                            <span className={`font-bold font-mono text-xs ${t.amount > 0 ? 'text-jade-500' : 'text-ink-500'}`}>
                              {t.amount > 0 ? '+' : ''}₦{t.amount.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* PREMIUM MEMBERSHIPS SUBTAB */}
              {activeSubTab === 'subscriptions' && (
                <div className="space-y-8">
                  
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-ink-800 dark:text-white">Elite Premium Programs</h3>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      Unlock advanced commerce superpowers. Upgrade your role to Business or apply the prestigious Verified+ badge profile.
                    </p>
                  </div>

                  {walletError && (
                    <div className="p-4 bg-ink-500/10 text-ink-500 text-xs rounded-2xl border border-ink-500/20 font-medium">
                      <span>{walletError}</span>
                    </div>
                  )}

                  {walletSuccess && (
                    <div className="p-4 bg-jade-500/10 text-jade-500 text-xs rounded-2xl border border-jade-500/20 font-medium">
                      <span>{walletSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Program 1: Verified+ Badge checkout */}
                    <div className="border border-ink-500/30 rounded-3xl p-6 bg-gradient-to-br from-ink-500/5 to-ink-900/10 relative overflow-hidden flex flex-col justify-between">
                      <div className="absolute right-0 top-0 opacity-10 font-bold text-9xl text-ink-500">
                        +
                      </div>
                      <div className="space-y-4">
                        <div className="inline-flex items-center gap-1 bg-ink-500/10 text-ink-600 dark:text-ink-400 text-xs font-bold px-2.5 py-1 rounded-full tracking-wider font-mono">
                          <Star className="star-filled w-3 h-3" />
                          Verified+ Premium Member
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-lg font-semibold text-ink-850 dark:text-white">Verified+ Professional Profile</h4>
                          <p className="text-xs text-ink-400 leading-relaxed">
                            Acquire the prestigious gold star and tick verified badges on your storefront, automatically boosting all search inventory items.
                          </p>
                        </div>

                        <div className="space-y-2 text-xs text-ink-600 dark:text-ink-400">
                          <div className="flex items-center gap-2">
                            <span className="text-jade-500 font-bold">Secured</span>
                            <span>Gold Storefront Tick Badge Overlay</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-jade-500 font-bold">Secured</span>
                            <span>+10 Trust Score rating automatic credit</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-jade-500 font-bold">Secured</span>
                            <span>Boosted priority search rank listings</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-ink-100 dark:border-ink-850 mt-6 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-ink-400 block">Premium Fee</span>
                          <span className="text-xl font-bold text-ink-500 font-mono">
                            ₦{settings.verifiedPlusPrice.toLocaleString()} <span className="text-xs font-normal text-ink-400">/mo</span>
                          </span>
                        </div>

                        <button
                          onClick={handleSubscribeVerifiedPlus}
                          disabled={isVerifiedPlus}
                          className={`px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1 transition-all ${
                            isVerifiedPlus 
                              ? 'bg-ink-200 dark:bg-ink-800 text-ink-400 cursor-not-allowed' 
                              : 'bg-ink-500 hover:bg-ink-600 text-white shadow-md active:scale-95'
                          }`}
                        >
                          {isVerifiedPlus ? 'Already Active' : 'Subscribe Now'}
                        </button>
                      </div>
                    </div>

                    {/* Program 2: Business Premium Subscription */}
                    <div className="border border-jade-500/20 rounded-3xl p-6 bg-gradient-to-br from-jade-500/5 to-ink-900/10 relative overflow-hidden flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="inline-flex items-center gap-1 bg-jade-500/10 text-jade-600 dark:text-jade-400 text-xs font-bold px-2.5 py-1 rounded-full tracking-wider font-mono">
                          <Zap className="w-3 h-3 text-jade-500" />
                          Business Premium Plan
                        </div>

                        <div className="space-y-1">
                          <h4 className="text-lg font-semibold text-ink-850 dark:text-white">Business Enterprise Storefront</h4>
                          <p className="text-xs text-ink-400 leading-relaxed">
                            Upgrade your individual profile status to a multi-branch corporate business entity, with advanced inventory catalogs, analytics dashboards, and barcode autofills.
                          </p>
                        </div>

                        <div className="space-y-2 text-xs text-ink-600 dark:text-ink-400">
                          <div className="flex items-center gap-2">
                            <span className="text-jade-500 font-bold">Secured</span>
                            <span>Unlimited Active Product Catalogs</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-jade-500 font-bold">Secured</span>
                            <span>Advanced Corporate Analytics Dashboard</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-jade-500 font-bold">Secured</span>
                            <span>Automated AI Barcode Product Autofill</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-ink-100 dark:border-ink-850 mt-6 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-ink-400 block">Membership Price</span>
                          <span className="text-xl font-bold text-jade-500 font-mono">
                            ₦{settings.subPremiumPrice.toLocaleString()} <span className="text-xs font-normal text-ink-400">/mo</span>
                          </span>
                        </div>

                        <button
                          onClick={() => handleSubscribeBusiness('PREMIUM')}
                          disabled={isBusinessSubbed}
                          className={`px-5 py-2.5 rounded-xl font-bold text-xs cursor-pointer flex items-center gap-1 transition-all ${
                            isBusinessSubbed 
                              ? 'bg-ink-200 dark:bg-ink-800 text-ink-400 cursor-not-allowed' 
                              : 'bg-jade-500 hover:bg-jade-600 text-white shadow-md active:scale-95'
                          }`}
                        >
                          {isBusinessSubbed ? 'Already Active' : 'Subscribe Now'}
                        </button>
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* LISTINGS PROMOTIONS SUBTAB */}
              {activeSubTab === 'listings' && (
                <div className="space-y-8">
                  
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-ink-800 dark:text-white">Promote Inventory Listings</h3>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      Saturate local markets. Boost your listings to Featured feeds or submit products into flash sales.
                    </p>
                  </div>

                  {promoteError && (
                    <div className="p-4 bg-ink-500/10 text-ink-500 text-xs rounded-2xl border border-ink-500/20 font-medium">
                      <span>{promoteError}</span>
                    </div>
                  )}

                  {promoteSuccess && (
                    <div className="p-4 bg-jade-500/10 text-jade-500 text-xs rounded-2xl border border-jade-500/20 font-medium">
                      <span>{promoteSuccess}</span>
                    </div>
                  )}

                  <div className="bg-ink-50 dark:bg-ink-950 p-6 rounded-3xl border border-ink-100 dark:border-ink-850 space-y-6">
                    
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">1. Select Listing to Boost</h4>
                      {myProducts.length === 0 ? (
                        <p className="text-xs text-ink-400 italic">
                          You currently do not have any active product listings in your inventory to promote. Create some in your Dashboard.
                        </p>
                      ) : (
                        <select
                          value={selectedProductId}
                          onChange={(e) => setSelectedProductId(e.target.value)}
                          className="w-full text-xs px-3 py-3 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 cursor-pointer text-ink-800 dark:text-white font-semibold"
                        >
                          <option value="">-- Choose Product Listing --</option>
                          {myProducts.map(p => (
                            <option key={p.id} value={p.id}>{p.title} (₦{p.price.toLocaleString()})</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-ink-100 dark:border-ink-850">
                      
                      {/* Promoted Placement 1: Featured Listing */}
                      <div className="space-y-4 bg-white dark:bg-ink-900 p-5 rounded-2xl border border-ink-100 dark:border-ink-800">
                        <div className="inline-flex items-center gap-1 bg-ink-500/10 text-ink-600 dark:text-ink-400 text-xs font-bold px-2 py-0.5 rounded">
                          Featured listing
                        </div>
                        <p className="text-xs text-ink-400 leading-relaxed">
                          Pins the listing at the top of category feeds, doubling impressions and prospective buyer chats.
                        </p>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-ink-400 font-mono block">Boost Duration</label>
                          <select 
                            value={featuredDuration}
                            onChange={(e) => setFeaturedDuration(e.target.value as any)}
                            className="w-full text-xs px-3 py-2 rounded-xl bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 cursor-pointer"
                          >
                            <option value="3">3 Days — ₦{settings.featured3DaysPrice.toLocaleString()}</option>
                            <option value="7">7 Days — ₦{settings.featured7DaysPrice.toLocaleString()}</option>
                            <option value="14">14 Days — ₦{settings.featured14DaysPrice.toLocaleString()}</option>
                            <option value="30">30 Days — ₦{settings.featured30DaysPrice.toLocaleString()}</option>
                          </select>
                        </div>

                        <button
                          onClick={() => handlePromoteProduct('FEATURED')}
                          className="w-full py-2.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
                        >
                          Purchase Featured Placement
                        </button>
                      </div>

                      {/* Promoted Placement 2: Flash Sales */}
                      <div className="space-y-4 bg-white dark:bg-ink-900 p-5 rounded-2xl border border-ink-100 dark:border-ink-800 justify-between flex flex-col">
                        <div className="space-y-4">
                          <div className="inline-flex items-center gap-1 bg-ink-500/10 text-ink-600 dark:text-ink-400 text-xs font-bold px-2 py-0.5 rounded">
                            Flash Sale Block scheduler
                          </div>
                          <p className="text-xs text-ink-400 leading-relaxed">
                            Schedules the item into the front-page high-traffic countdown flash sale blocks for instant sellouts.
                          </p>
                          <p className="text-xs font-bold text-ink-500 font-mono">
                            Fixed Promotion Price: ₦{settings.flashSaleFeaturePrice.toLocaleString()}
                          </p>
                        </div>

                        <button
                          onClick={() => handlePromoteProduct('FLASHSALE')}
                          className="w-full py-2.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
                        >
                          Schedule into Flash Sales
                        </button>
                      </div>

                    </div>

                  </div>

                </div>
              )}

              {/* SPONSORED CPC ADS SUBTAB */}
              {activeSubTab === 'ads' && (
                <div className="space-y-8">
                  
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-ink-800 dark:text-white">Sponsored CPC Advertisements</h3>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      Create highly targeting Pay-Per-Click (PPC) banner campaigns. Only pay when prospective customers click on your ad.
                    </p>
                  </div>

                  {adError && (
                    <div className="p-4 bg-ink-500/10 text-ink-500 text-xs rounded-2xl border border-ink-500/20 font-medium">
                      <span>{adError}</span>
                    </div>
                  )}

                  {adSuccess && (
                    <div className="p-4 bg-jade-500/10 text-jade-500 text-xs rounded-2xl border border-jade-500/20 font-medium">
                      <span>{adSuccess}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Sponsored Ad Creator Form */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold tracking-wider font-mono text-jade-600 dark:text-jade-400">Initialize Campaign</h4>
                      
                      <form onSubmit={handleCreateAd} className="space-y-4 bg-ink-50 dark:bg-ink-950 p-5 rounded-2xl border border-ink-100 dark:border-ink-850">
                        
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Campaign / Banner Title</label>
                          <input 
                            type="text"
                            value={adTitle}
                            onChange={(e) => setAdTitle(e.target.value)}
                            placeholder="e.g. 50% Off iPhone Deals!"
                            className="w-full text-xs px-4 py-2.5 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 text-ink-800 dark:text-white font-medium focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-400">Campaign Type</label>
                            <select 
                              value={adType}
                              onChange={(e) => setAdType(e.target.value as any)}
                              className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 cursor-pointer font-bold"
                            >
                              <option value="PRODUCT">Product Target</option>
                              <option value="BUSINESS">Business Brand</option>
                              <option value="BANNER_HOME">Home Banner</option>
                              <option value="BANNER_CATEGORY">Category Banner</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-ink-400">PPC Budget (₦)</label>
                            <input 
                              type="number"
                              value={adBudget}
                              onChange={(e) => setAdBudget(e.target.value)}
                              placeholder="e.g. 5000"
                              className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 font-mono font-bold"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-ink-500 dark:text-ink-400">Banner Image URL</label>
                          <input 
                            type="text"
                            value={adBannerUrl}
                            onChange={(e) => setAdBannerUrl(e.target.value)}
                            className="w-full text-xs px-4 py-2 rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 font-mono text-ink-500"
                          />
                        </div>

                        <div className="p-3 bg-white dark:bg-ink-900 rounded-xl border border-ink-100 dark:border-ink-800 text-xs text-ink-400 space-y-1 font-mono">
                          <div className="flex justify-between">
                            <span>Cost Per Click (CPC):</span>
                            <span className="font-bold text-jade-500">₦{settings.adCpcPrice}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Target Impressions:</span>
                            <span className="font-bold text-jade-500">UNLIMITED / FREE</span>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
                        >
                          Launch Sponsored Ad Campaign
                        </button>
                      </form>
                    </div>

                    {/* Active Ad Campaign reports & Interactive CPC Click Simulator */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold tracking-wider font-mono text-ink-500">Active CPC Ad Campaigns</h4>
                      
                      {myCampaigns.length === 0 ? (
                        <p className="text-xs text-ink-400 italic py-8 text-center bg-ink-50 dark:bg-ink-950/50 rounded-2xl border border-dashed border-ink-100 dark:border-ink-800">
                          No active target ad campaigns running. Construct one on the left to verify impressions and clicked simulations!
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {myCampaigns.map(ad => (
                            <div 
                              key={ad.id}
                              className="bg-ink-50 dark:bg-ink-950 p-4 rounded-2xl border border-ink-100 dark:border-ink-800 space-y-3"
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h5 className="text-xs font-semibold text-ink-800 dark:text-ink-200 truncate max-w-[200px]">
                                    {ad.title}
                                  </h5>
                                  <span className="text-xs font-bold text-ink-400 bg-ink-100 dark:bg-ink-900 px-1.5 py-0.5 rounded mt-1 inline-block">
                                    {ad.type}
                                  </span>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ad.status === 'ACTIVE' ? 'bg-jade-100 text-jade-600 dark:bg-jade-950/40 dark:text-jade-400' : 'bg-ink-100 text-ink-500'}`}>
                                  {ad.status}
                                </span>
                              </div>

                              {/* CPC Metrics */}
                              <div className="grid grid-cols-3 gap-2 text-center text-xs bg-white dark:bg-ink-900 p-2.5 rounded-xl border border-ink-100 dark:border-ink-800 font-mono">
                                <div>
                                  <span className="text-xs text-ink-400 block">Impressions</span>
                                  <span className="font-semibold text-jade-500">{ad.impressions || Math.floor(Math.random() * 200) + 120}</span>
                                </div>
                                <div>
                                  <span className="text-xs text-ink-400 block">Clicks</span>
                                  <span className="font-semibold text-ink-500">{ad.clicks}</span>
                                </div>
                                <div>
                                  <span className="text-xs text-ink-400 block">Spent</span>
                                  <span className="font-semibold text-ink-500">₦{ad.spent.toLocaleString()}</span>
                                </div>
                              </div>

                              {/* CPC Campaign click simulation button */}
                              {ad.status === 'ACTIVE' && (
                                <button
                                  onClick={() => simulateAdClick(ad.id)}
                                  className="w-full py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                  <MousePointerClick className="w-3.5 h-3.5 animate-bounce" />
                                  Simulate Organic Customer Click (-₦{settings.adCpcPrice} CPC)
                                </button>
                              )}

                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              )}

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
