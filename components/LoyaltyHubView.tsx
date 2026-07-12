// components/LoyaltyHubView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Award, Gift, Sparkles, Share2, Clipboard, HeartHandshake, CheckCircle2 } from 'lucide-react';
import { getDBState, saveDBState, dbOperations } from '../lib/store';

export default function LoyaltyHubView() {
  const [db, setDb] = useState(getDBState());
  const [copied, setCopied] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const user = db.currentUser;
  if (!user) return <div className="p-8 text-center text-xs">Please login to access Loyalty Hub.</div>;

  const handleClaimDailyReward = () => {
    setClaimSuccess(null);
    const result = dbOperations.claimDailyReward();
    if (result && 'error' in result) {
      setClaimSuccess(`⚠️ ${result.error}`);
    } else {
      setClaimSuccess('🎉 Congratulations! 10 GoodPoints (GP) claimed successfully.');
      setTimeout(() => setClaimSuccess(null), 4000);
    }
  };

  const handleRedeemItem = (cost: number, label: string) => {
    setClaimSuccess(null);
    if (user.goodPoints < cost) {
      setClaimSuccess('⚠️ Insufficient GoodPoints balance to redeem this voucher.');
      return;
    }
    
    dbOperations.subtractUserPoints(cost);
    setClaimSuccess(`🎉 Voucher Redeemed: 1x "${label}"! Code sent to your notifications tray.`);
    setTimeout(() => setClaimSuccess(null), 5000);
  };

  const handleCopyLink = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Hub Title Block */}
        <div className="bg-gradient-to-r from-slate-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-lg">
          <div className="absolute right-0 bottom-0 text-emerald-500/10 text-9xl font-bold translate-x-10 translate-y-10 pointer-events-none select-none">GP</div>
          
          <div className="relative z-10 space-y-4">
            <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-xs font-semibold text-amber-400 inline-flex items-center gap-1">
              <Award className="w-3.5 h-3.5" />
              GoodSale Loyal Elite Club
            </span>
            <h1 className="font-sans font-extrabold text-2xl sm:text-3xl tracking-tight leading-snug">
              Earn Rewards. <br />
              Grow Your Trust Merchant Status.
            </h1>
            <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
              Every checkout purchase and secure escrow closing earns you GoodPoints (GP). Claim your daily log reward, redeem point vouchers, and refer friends to expand the secure trust community.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Your Loyalty Points</span>
                <span className="font-sans font-extrabold text-2xl text-amber-400">{user.goodPoints.toLocaleString()} GP</span>
              </div>

              <button
                onClick={handleClaimDailyReward}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
              >
                Claim Daily 10 GP Reward
              </button>
            </div>
          </div>
        </div>

        {claimSuccess && (
          <div className="p-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl text-center font-bold text-xs text-slate-800 dark:text-slate-200 shadow-sm">
            {claimSuccess}
          </div>
        )}

        {/* Catalog of redeemable vouchers & Referrals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* Rewards Catalog */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-sans font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-500" />
              Redeem Point Vouchers
            </h3>

            <div className="space-y-3">
              {[
                { label: '₦5,000 Escrow Checkout Coupon', cost: 500, detail: 'Reduces escrow checkout fees by up to 100%' },
                { label: 'Priority Search Listing Booster', cost: 1200, detail: 'Keeps merchant items pinned on top catalog grids for 7 days' },
                { label: 'Seller Commission Payout Waiver', cost: 2500, detail: 'Zero transaction commission fees on your next 3 escrow sales' },
              ].map((item, idx) => (
                <div 
                  key={idx}
                  className="p-3.5 bg-gray-50 dark:bg-slate-800/40 border border-gray-100 dark:border-slate-800 rounded-2xl flex justify-between items-center gap-3"
                >
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 dark:text-slate-200 block">{item.label}</span>
                    <span className="text-[10px] text-gray-400 mt-0.5 block leading-relaxed">{item.detail}</span>
                    <span className="text-[10px] font-bold text-amber-500 font-mono mt-1 block">Cost: {item.cost} GP</span>
                  </div>

                  <button
                    onClick={() => handleRedeemItem(item.cost, item.label)}
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Redeem
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Referral Link copy portal */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="font-sans font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emerald-500" />
              Refer Merchants & Buyers
            </h3>

            <p className="text-xs text-gray-500 leading-relaxed">
              Grow the Nigeria secure trading circle! Earn <strong>150 GP</strong> instantly when any referred friend registers an account and closes their first escrow delivery validation checkout.
            </p>

            <div className="p-4 bg-gray-50 dark:bg-slate-800/40 rounded-2xl space-y-3 text-xs">
              <div>
                <span className="text-gray-400 block text-[10px] uppercase font-bold mb-1">Your Referral Invite Code</span>
                <div className="flex gap-2">
                  <span className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 font-mono font-bold text-slate-800 dark:text-slate-300 rounded-xl flex items-center">
                    GOOD-{user.username.toUpperCase()}-REF
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 cursor-pointer flex items-center justify-center transition-colors shrink-0"
                    title="Copy Code"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {copied && (
                <span className="text-[10px] font-semibold text-emerald-500 block text-center">
                  Invite Link Code copied to clipboard!
                </span>
              )}
            </div>

            <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <HeartHandshake className="w-5 h-5 text-emerald-500 shrink-0" />
              <span>referred friends are tracked via browser state. No limit!</span>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
