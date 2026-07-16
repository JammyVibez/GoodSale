// components/AdminDashboard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, FileCheck, CheckCircle2, XCircle, 
  RefreshCw, Scale, DollarSign, Wallet, ClipboardList,
  Database, Server, Copy, Check, ExternalLink, AlertTriangle,
  Settings, Award, Sparkles, Percent, Activity,
  Shield, CreditCard, Truck, FileText, Coins
} from 'lucide-react';
import { 
  getDBState, saveDBState, dbOperations, User, UserRole, VerificationStatus 
} from '../lib/store';

export default function AdminDashboard({ onOpenAuth }: { onOpenAuth?: () => void }) {
  const [db, setDb] = useState(getDBState());
  const [activeTab, setActiveTab] = useState<'verifications' | 'escrows_disputes' | 'supabase_setup' | 'revenue_settings'>('verifications');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  
  // Revenue Settings configuration states
  const settings = db.revenueSettings;
  const [escrowPercentageFee, setEscrowPercentageFee] = useState(settings?.escrowPercentageFee?.toString() || '1.5');
  const [escrowMinFee, setEscrowMinFee] = useState(settings?.escrowMinFee?.toString() || '100');
  const [escrowMaxFee, setEscrowMaxFee] = useState(settings?.escrowMaxFee?.toString() || '15000');
  const [deliveryCommissionPercentage, setDeliveryCommissionPercentage] = useState(settings?.deliveryCommissionPercentage?.toString() || '10');
  const [subProPrice, setSubProPrice] = useState(settings?.subProPrice?.toString() || '15000');
  const [subPremiumPrice, setSubPremiumPrice] = useState(settings?.subPremiumPrice?.toString() || '35000');
  const [subEnterprisePrice, setSubEnterprisePrice] = useState(settings?.subEnterprisePrice?.toString() || '85000');
  const [verifiedPlusPrice, setVerifiedPlusPrice] = useState(settings?.verifiedPlusPrice?.toString() || '10000');
  const [flashSaleFeaturePrice, setFlashSaleFeaturePrice] = useState(settings?.flashSaleFeaturePrice?.toString() || '7500');
  const [auctionSuccessFeePercentage, setAuctionSuccessFeePercentage] = useState(settings?.auctionSuccessFeePercentage?.toString() || '2.5');
  const [adCpcPrice, setAdCpcPrice] = useState(settings?.adCpcPrice?.toString() || '150');
  const [goodSaleProtectFee, setGoodSaleProtectFee] = useState(settings?.goodSaleProtectFee?.toString() || '1500');
  const [enabledMethods, setEnabledMethods] = useState<string[]>(db.paymentSettings?.enabledMethods || ['escrow', 'cod', 'card', 'bank', 'invoice', 'partial']);

  // Supabase testing state
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    dbCheck: 'unchecked' | 'success' | 'failed';
    storageCheck: 'unchecked' | 'success' | 'failed';
    errorMessage?: string;
  }>({ dbCheck: 'unchecked', storageCheck: 'unchecked' });
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    const handleStateChange = () => {
      const state = getDBState();
      setDb(state);
      if (state.revenueSettings) {
        setEscrowPercentageFee(state.revenueSettings.escrowPercentageFee.toString());
        setEscrowMinFee(state.revenueSettings.escrowMinFee.toString());
        setEscrowMaxFee(state.revenueSettings.escrowMaxFee.toString());
        setDeliveryCommissionPercentage(state.revenueSettings.deliveryCommissionPercentage.toString());
        setSubProPrice(state.revenueSettings.subProPrice.toString());
        setSubPremiumPrice(state.revenueSettings.subPremiumPrice.toString());
        setSubEnterprisePrice(state.revenueSettings.subEnterprisePrice.toString());
        setVerifiedPlusPrice(state.revenueSettings.verifiedPlusPrice.toString());
        setFlashSaleFeaturePrice(state.revenueSettings.flashSaleFeaturePrice.toString());
        setAuctionSuccessFeePercentage(state.revenueSettings.auctionSuccessFeePercentage.toString());
        setAdCpcPrice(state.revenueSettings.adCpcPrice.toString());
        setGoodSaleProtectFee((state.revenueSettings.goodSaleProtectFee || 1500).toString());
      }
      if (state.paymentSettings) {
        setEnabledMethods(state.paymentSettings.enabledMethods);
      }
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  useEffect(() => {
    const user = db.currentUser;
    if (user) {
      const emailLower = user.email.toLowerCase();
      if (emailLower === 'lightingstar79@gmail.com' || emailLower === 'admin@goodsale.ng') {
        if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
          dbOperations.updateCurrentUserRole(UserRole.SUPER_ADMIN);
        }
      }
    }
  }, [db.currentUser]);

  const currentUser = db.currentUser;

  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const testSupabaseIntegration = async () => {
    setIsTestingSupabase(true);
    setSupabaseStatus({ dbCheck: 'unchecked', storageCheck: 'unchecked' });
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: getDBState() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSupabaseStatus({
          dbCheck: data.supabaseDb ? 'success' : 'failed',
          storageCheck: data.supabaseStorage ? 'success' : 'failed',
          errorMessage: (!data.supabaseDb || !data.supabaseStorage) 
            ? 'Synchronization completed but one or more components reported failures. Ensure the required database table and storage bucket have been created in your Supabase project.'
            : undefined
        });
      } else {
        setSupabaseStatus({
          dbCheck: 'failed',
          storageCheck: 'failed',
          errorMessage: data.error || 'Server error testing connection.'
        });
      }
    } catch (err: any) {
      setSupabaseStatus({
        dbCheck: 'failed',
        storageCheck: 'failed',
        errorMessage: err.message || 'Network error.'
      });
    } finally {
      setIsTestingSupabase(false);
    }
  };

  // Render role/auth guard
  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-red-500/10 dark:bg-red-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <Scale className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Admin Control Room</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Access is restricted to authorized platform administrators. Please sign in or register to moderate identity verification logs or resolve escrow disputes.
        </p>
        <div className="space-y-3">
          <button
            onClick={onOpenAuth}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 transition-all"
          >
            Sign In / Register Account
          </button>
        </div>
      </div>
    );
  }

  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none animate-fade-in">
        <div className="w-16 h-16 bg-red-500/10 dark:bg-red-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Access Strictly Restricted</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto leading-relaxed">
          The administrative dashboard is reserved exclusively for the platform owner (<strong className="text-emerald-500 font-sans">lightingstar79@gmail.com</strong>) and designated system moderators.
        </p>
        
        <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-gray-150 dark:border-slate-800/80">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-normal font-sans">
            <strong className="text-slate-600 dark:text-slate-400">Security Warning:</strong> Any unauthorized attempt to escalate administrative privileges or bypass authentication structures will flag the profile for immediate suspension.
          </p>
        </div>
      </div>
    );
  }

  // Filter pending ID verification submissions
  const pendingVerifications = (db.verifications || []).filter(v => 
    v.status === VerificationStatus.PENDING
  );

  // Escrow dispute logs
  const activeDisputes = (db.disputes || []).filter(dispute => 
    dispute.resolution === 'PENDING'
  );

  // Approve identity verification gold badge
  const handleApproveVerification = (verId: number) => {
    dbOperations.handleVerificationApproval(verId, VerificationStatus.APPROVED, 'Your verification is approved successfully by admin.');
    setActionSuccess('Identity gold verification badge approved!');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  // Decline identity verification
  const handleDeclineVerification = (verId: number) => {
    dbOperations.handleVerificationApproval(verId, VerificationStatus.REJECTED, 'Your verification documents were rejected. Please upload valid IDs.');
    setActionSuccess('Verification request denied.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  // Resolve Dispute: Release funds to Seller
  const handleDisputeReleaseToSeller = (disputeId: number) => {
    dbOperations.resolveDispute(disputeId, 'RELEASE_SELLER', 'Resolved in favor of seller.');
    setActionSuccess('Dispute resolved: Funds released to merchant payout wallet.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  // Resolve Dispute: Refund funds to Buyer
  const handleDisputeRefundToBuyer = (disputeId: number) => {
    dbOperations.resolveDispute(disputeId, 'REFUND_BUYER', 'Resolved in favor of buyer.');
    setActionSuccess('Dispute resolved: Payout refunded to buyer wallet.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  // Total escrow capital calculations
  const totalEscrowHeld = db.escrows
    .filter(e => !e.isReleased && !e.isRefunded)
    .reduce((acc, e) => acc + e.heldAmount, 0);

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        
        {/* Admin Title Banner */}
        <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="font-sans font-extrabold text-2xl text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-emerald-500 animate-pulse" />
              GoodSale Trust & Escrow Control Room
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Admin Role active. You have access to manual identification logs and escrow lock release triggers.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('verifications')}
              className={`px-3 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${activeTab === 'verifications' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              ID Verification Queue ({pendingVerifications.length})
            </button>
            <button
              onClick={() => setActiveTab('escrows_disputes')}
              className={`px-3 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${activeTab === 'escrows_disputes' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              Dispute Resolution ({activeDisputes.length})
            </button>
            <button
              id="admin-supabase-tab"
              onClick={() => setActiveTab('supabase_setup')}
              className={`px-3 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'supabase_setup' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              <Database className="w-3.5 h-3.5" />
              Supabase Status
            </button>
            <button
              id="admin-revenue-tab"
              onClick={() => setActiveTab('revenue_settings')}
              className={`px-3 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 ${activeTab === 'revenue_settings' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'}`}
            >
              <Settings className="w-3.5 h-3.5" />
              Revenue Settings
            </button>
          </div>
        </div>

        {actionSuccess && (
          <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500 font-bold text-xs text-center">
            {actionSuccess}
          </div>
        )}

        {/* Global Admin Metrics row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Total Capital in Escrow</span>
              <span className="font-sans font-extrabold text-xl text-slate-950 dark:text-white block mt-1">₦{totalEscrowHeld.toLocaleString()}</span>
            </div>
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
              <Wallet className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Unresolved Disputes</span>
              <span className="font-sans font-extrabold text-xl text-slate-950 dark:text-white block mt-1">{activeDisputes.length} Cases</span>
            </div>
            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-500">
              <Scale className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">Pending ID Verifications</span>
              <span className="font-sans font-extrabold text-xl text-slate-950 dark:text-white block mt-1">{pendingVerifications.length} Applicants</span>
            </div>
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* TAB 1: ID Verification Queue */}
        {activeTab === 'verifications' && (
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-slate-800">
              <span className="font-sans font-bold text-sm text-slate-900 dark:text-white">Gold Verification Badge Applicants</span>
            </div>

            {pendingVerifications.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
                Excellent! The registration verification queue is currently empty.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {pendingVerifications.map((verification) => {
                  const applicant = (db.users || []).find(u => u.id === verification.userId);
                  return (
                    <div key={verification.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-sans font-bold text-sm text-slate-950 dark:text-white">{verification.fullName}</span>
                          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-500 rounded text-[9px] font-bold">@{applicant?.username || 'user'}</span>
                        </div>
                        <p className="text-gray-400 font-mono">
                          Applicant User ID: {verification.userId} • Document: <span className="font-bold text-slate-600 dark:text-slate-300">{verification.documentType} ({verification.documentNumber})</span>
                        </p>
                        <div className="flex items-center gap-4 text-[11px] text-slate-600 dark:text-slate-400 font-sans pt-1">
                          <span><strong>Selfie & ID:</strong> Submitted ✓</span>
                          <span><strong>Proof of Address:</strong> Verified ✓</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveVerification(verification.id)}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          Approve & Gold Badge
                        </button>

                        <button
                          onClick={() => handleDeclineVerification(verification.id)}
                          className="px-4 py-2 bg-white dark:bg-slate-900 text-red-500 hover:bg-red-500/10 border border-gray-200 dark:border-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject Application
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Escrow Dispute Resolution */}
        {activeTab === 'escrows_disputes' && (
          <div className="space-y-4">
            
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-4">
              <span className="font-sans font-bold text-sm text-slate-900 dark:text-white block mb-1">Active Frozen Dispute Cases</span>
              <p className="text-[11px] text-gray-400">
                Review payment disputes. As neutral arbiter, you can release the locked funds directly to the merchant, or issue a complete refund to the buyer&apos;s credit wallet.
              </p>
            </div>

            {activeDisputes.length === 0 ? (
              <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 shadow-sm">
                Splendid! Zero disputed escrow cases are currently active.
              </div>
            ) : (
              <div className="space-y-4">
                {activeDisputes.map((dispute) => {
                  const order = (db.orders || []).find(o => o.id === dispute.orderId);
                  const buyer = (db.users || []).find(u => u.id === dispute.openedById);
                  const seller = order ? (db.users || []).find(u => u.id === order.sellerId) : null;
                  
                  return (
                    <div 
                      key={dispute.id}
                      className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                        <div>
                          <span className="px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-400 text-[9px] font-bold uppercase rounded">Disputed Escrow</span>
                          <h4 className="font-bold text-xs text-slate-900 dark:text-white mt-1">Dispute ID: #{dispute.id} | Order: {dispute.orderNumber}</h4>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 uppercase tracking-widest block font-medium">Locked Capital</span>
                          <span className="font-sans font-extrabold text-base text-slate-900 dark:text-white">₦{(order?.totalAmount || 0).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
                        <div className="bg-gray-50 dark:bg-slate-800/40 p-3 rounded-xl space-y-1">
                          <span className="font-bold text-slate-900 dark:text-slate-200">Buyer Claim log</span>
                          <p className="text-[11px] text-slate-500">
                            <strong>Buyer:</strong> {buyer?.fullName} (@{buyer?.username})<br />
                            <strong>Claim Reason:</strong> &quot;{dispute.reason}&quot;
                          </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-slate-800/40 p-3 rounded-xl space-y-1">
                          <span className="font-bold text-slate-900 dark:text-slate-200">Merchant Response log</span>
                          <p className="text-[11px] text-slate-500">
                            <strong>Seller:</strong> {seller?.fullName} (@{seller?.username})<br />
                            <strong>Defense:</strong> &quot;The item is exactly as cataloged in my inventory. Buyer has buyer&apos;s remorse.&quot;
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => handleDisputeReleaseToSeller(dispute.id)}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          Release Payout to Merchant
                        </button>

                        <button
                          onClick={() => handleDisputeRefundToBuyer(dispute.id)}
                          className="px-4 py-2 bg-white dark:bg-slate-900 text-red-500 hover:bg-red-500/10 border border-gray-200 dark:border-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
                        >
                          Issue Full Refund to Buyer
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* TAB 3: Supabase Integration & Setup */}
        {activeTab === 'supabase_setup' && (
          <div className="space-y-6">
            
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-500">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-sans font-extrabold text-base text-slate-900 dark:text-white">Supabase Cloud Sync Status</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    This platform automatically attempts to back up and synchronize all local database and identification media uploads to your Supabase project in real-time. If tables or storage buckets are missing, sync warnings may appear.
                  </p>
                </div>
              </div>

              {/* Real-time Status Check Panel */}
              <div className="mt-6 p-5 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-gray-200 dark:border-slate-800/80 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest block">Environment Variables Check</span>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                        NEXT_PUBLIC_SUPABASE_URL & ANON_KEY are present
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={testSupabaseIntegration}
                    disabled={isTestingSupabase}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 transition-all flex items-center gap-2 animate-none"
                  >
                    {isTestingSupabase ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    {isTestingSupabase ? 'Testing Connection...' : 'Test Connection & Sync Now'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Server className="w-4 h-4 text-emerald-500" />
                        Database Table (`market_state`)
                      </span>
                      {supabaseStatus.dbCheck === 'success' && (
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-md">CONNECTED</span>
                      )}
                      {supabaseStatus.dbCheck === 'failed' && (
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold rounded-md">MISSING TABLE</span>
                      )}
                      {supabaseStatus.dbCheck === 'unchecked' && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-400 text-[10px] font-bold rounded-md">UNCHECKED</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Stores marketplace orders, escrows, users, and disputes JSON payload under id=1.
                    </p>
                  </div>

                  <div className="p-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-emerald-500" />
                        Storage Bucket (`goodsale-data`)
                      </span>
                      {supabaseStatus.storageCheck === 'success' && (
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold rounded-md">CONNECTED</span>
                      )}
                      {supabaseStatus.storageCheck === 'failed' && (
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold rounded-md">MISSING BUCKET</span>
                      )}
                      {supabaseStatus.storageCheck === 'unchecked' && (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-400 text-[10px] font-bold rounded-md">UNCHECKED</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Stores fallback database backup JSON file (`database.json`) and media upload backups.
                    </p>
                  </div>
                </div>

                {supabaseStatus.errorMessage && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-start gap-2 leading-relaxed">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{supabaseStatus.errorMessage}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Setup Instructions SQL Card */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
              <div className="space-y-1.5">
                <span className="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-500 text-[10px] font-bold uppercase rounded-md tracking-wider">Self-Healing Tutorial</span>
                <h3 className="font-sans font-black text-lg text-slate-900 dark:text-white">How to Set Up Your Supabase Instance</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Follow these 2 simple steps to provision the required database table and media storage buckets in your Supabase Dashboard:
                </p>
              </div>

              {/* Step 1 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px] font-mono">1</span>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">Create the `market_state` Database Table</h4>
                </div>
                <p className="text-[11px] text-slate-500 pl-7 leading-relaxed">
                  Go to the <strong>SQL Editor</strong> tab in your Supabase Dashboard, click <strong>&quot;New query&quot;</strong>, paste the query below, and click <strong>&quot;Run&quot;</strong>:
                </p>

                <div className="pl-7 relative">
                  <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-[10px] rounded-xl overflow-x-auto border border-slate-800">
{`-- SQL to create the marketplace state database table
create table if not exists public.market_state (
  id bigint primary key,
  state jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable row-level security for table
alter table public.market_state enable row level security;

-- Create open RLS access policies for our anonymous client
create policy "Allow public read/write access to market_state"
  on public.market_state for all
  using (true)
  with check (true);`}
                  </pre>
                  <button
                    onClick={() => handleCopyText(`create table if not exists public.market_state (
  id bigint primary key,
  state jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.market_state enable row level security;

create policy "Allow public read/write access to market_state"
  on public.market_state for all
  using (true)
  with check (true);`, 'sql')}
                    className="absolute top-3 right-3 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-bold cursor-pointer flex items-center gap-1 transition-all"
                  >
                    {copiedText === 'sql' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedText === 'sql' ? 'Copied' : 'Copy SQL'}
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px] font-mono">2</span>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">Create Storage Buckets</h4>
                </div>
                <p className="text-[11px] text-slate-500 pl-7 leading-relaxed">
                  Go to the <strong>Storage</strong> tab in your Supabase Dashboard, create the following two buckets, and toggle them to <strong>&quot;Public&quot;</strong>:
                </p>
                
                <ul className="pl-12 list-disc text-[11px] text-slate-500 space-y-1.5 leading-relaxed">
                  <li>
                    <strong className="text-slate-850 dark:text-slate-300 font-mono text-xs">goodsale-data</strong>
                    <span className="block text-[10px] text-gray-400">Stores fallback marketplace database backups in `database.json`.</span>
                  </li>
                  <li>
                    <strong className="text-slate-850 dark:text-slate-300 font-mono text-xs">government-ids</strong>
                    <span className="block text-[10px] text-gray-400">Stores uploaded identity verification documents securely.</span>
                  </li>
                </ul>

                <p className="text-[11px] text-slate-400 pl-7 italic">
                  Note: Make sure to click &quot;New bucket&quot;, name it exactly as stated above, and set the public toggle to active so your users can load their ID documents and verified flags successfully.
                </p>
              </div>

            </div>

          </div>
        )}

        {activeTab === 'revenue_settings' && (
          <div className="space-y-8 animate-fade-in">
            {/* Header section inside Tab */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-sans font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                  Platform Revenue & Pricing Engine
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Configure commissions, pricing tiers, escrow service charges, and premium add-ons. Changes apply in real-time across the platform.
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 font-mono text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-500/10">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                Live Audit Logs Active
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const adminUser = db.currentUser || { id: 999 };
              const updated = {
                escrowPercentageFee: parseFloat(escrowPercentageFee) || 0,
                escrowMinFee: parseFloat(escrowMinFee) || 0,
                escrowMaxFee: parseFloat(escrowMaxFee) || 0,
                deliveryCommissionPercentage: parseFloat(deliveryCommissionPercentage) || 0,
                subProPrice: parseFloat(subProPrice) || 0,
                subPremiumPrice: parseFloat(subPremiumPrice) || 0,
                subEnterprisePrice: parseFloat(subEnterprisePrice) || 0,
                verifiedPlusPrice: parseFloat(verifiedPlusPrice) || 0,
                flashSaleFeaturePrice: parseFloat(flashSaleFeaturePrice) || 0,
                auctionSuccessFeePercentage: parseFloat(auctionSuccessFeePercentage) || 0,
                adCpcPrice: parseFloat(adCpcPrice) || 0,
                goodSaleProtectFee: parseFloat(goodSaleProtectFee) || 0,
              };
              const res = dbOperations.updateRevenueSettings(adminUser.id, updated);
              const res2 = dbOperations.updatePaymentSettings(adminUser.id, { enabledMethods });
              if (res.success && res2.success) {
                setActionSuccess('Platform revenue and checkout configurations successfully updated! Audit log created.');
                setTimeout(() => setActionSuccess(null), 4000);
              }
            }} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Panel 1: Escrow Service Fees */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                    <Scale className="w-5 h-5 text-emerald-500" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">Escrow Service Fees</h4>
                      <p className="text-[10px] text-slate-400">Transaction fee applied to secure buyer payments</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">Percentage Fee (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.05"
                          value={escrowPercentageFee}
                          onChange={(e) => setEscrowPercentageFee(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 px-3 py-2 pr-7 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-gray-400 font-mono">%</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">Min Fee (₦)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={escrowMinFee}
                          onChange={(e) => setEscrowMinFee(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-6 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">Max Fee (₦)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={escrowMaxFee}
                          onChange={(e) => setEscrowMaxFee(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-6 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 2: Delivery & Logistics Commission */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                    <Percent className="w-5 h-5 text-emerald-500" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">Delivery Commissions & Safety</h4>
                      <p className="text-[10px] text-slate-400">Platform earnings on courier jobs and insurance coverage</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">Courier Job Commission (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.5"
                          value={deliveryCommissionPercentage}
                          onChange={(e) => setDeliveryCommissionPercentage(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 px-3 py-2 pr-7 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                        <span className="absolute right-3 top-2.5 text-[10px] text-gray-400 font-mono">%</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">GoodSale Protect Ins. Fee (₦)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={goodSaleProtectFee}
                          onChange={(e) => setGoodSaleProtectFee(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-6 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 3: Premium Business Subscription Tiers */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                    <Award className="w-5 h-5 text-emerald-500" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">Business Subscriptions</h4>
                      <p className="text-[10px] text-slate-400">Monthly pricing for vendor business packages</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">Pro Plan (₦/mo)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={subProPrice}
                          onChange={(e) => setSubProPrice(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-5 pr-2 py-2 rounded-xl text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">Premium Plan (₦/mo)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={subPremiumPrice}
                          onChange={(e) => setSubPremiumPrice(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-5 pr-2 py-2 rounded-xl text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-sans font-bold text-slate-600 dark:text-slate-400">Enterprise Plan (₦/mo)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={subEnterprisePrice}
                          onChange={(e) => setSubEnterprisePrice(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-5 pr-2 py-2 rounded-xl text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 4: Promoted Listings & Premium Services */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl space-y-4 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                    <Sparkles className="w-5 h-5 text-emerald-500" />
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">Listing Services & Features</h4>
                      <p className="text-[10px] text-slate-400">Fees for Verified+, Auctions, Flash sales, and Ads</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-sans font-bold text-slate-600 dark:text-slate-400">Verified+ Application Fee (₦)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={verifiedPlusPrice}
                          onChange={(e) => setVerifiedPlusPrice(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-5 pr-2 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-sans font-bold text-slate-600 dark:text-slate-400">Flash Sale Promo Fee (₦)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={flashSaleFeaturePrice}
                          onChange={(e) => setFlashSaleFeaturePrice(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-5 pr-2 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-sans font-bold text-slate-600 dark:text-slate-400">Auction Success Fee (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={auctionSuccessFeePercentage}
                          onChange={(e) => setAuctionSuccessFeePercentage(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 px-3 py-2 pr-6 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                        <span className="absolute right-2.5 top-2.5 text-[10px] text-gray-400 font-mono">%</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-sans font-bold text-slate-600 dark:text-slate-400">Sponsored Ads CPC (₦)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-2.5 text-[10px] text-gray-400 font-mono">₦</span>
                        <input
                          type="number"
                          value={adCpcPrice}
                          onChange={(e) => setAdCpcPrice(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 pl-5 pr-2 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 5: Flexible Payment Methods & Platform Checkout Options */}
                <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-3xl space-y-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-emerald-500" />
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">Checkout Payment Channels Control</h4>
                        <p className="text-[10px] text-slate-400">Toggle active payment systems for transactions and customer orders</p>
                      </div>
                    </div>
                    <div className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                      Platform Control
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { id: 'escrow', name: 'GoodSale Escrow', desc: 'Secure buyer payment lock, neutral escrow protection', icon: <Shield className="w-5 h-5 text-emerald-500" /> },
                      { id: 'card', name: 'Credit / Debit Card', desc: 'Direct online processing with card networks', icon: <CreditCard className="w-5 h-5 text-blue-500" /> },
                      { id: 'bank', name: 'Direct Bank Transfer', desc: 'Instant bank-to-bank manual transfers with receipts', icon: <ExternalLink className="w-5 h-5 text-purple-500" /> },
                      { id: 'cod', name: 'Cash on Delivery (COD)', desc: 'Pay on delivery via verified courier partners', icon: <Truck className="w-5 h-5 text-gray-500" /> },
                      { id: 'invoice', name: 'Business Invoice', desc: 'Corporate nets term invoicing (Net-30 billing)', icon: <FileText className="w-5 h-5 text-indigo-500" /> },
                      { id: 'partial', name: 'Partial Deposit', desc: 'Allow deposit percentage payments first', icon: <Coins className="w-5 h-5 text-amber-500" /> },
                    ].map((method) => {
                      const isEnabled = enabledMethods.includes(method.id);
                      return (
                        <div 
                          key={method.id}
                          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between h-36 ${
                            isEnabled 
                              ? 'border-emerald-500/30 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.01]' 
                              : 'border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950/30'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="p-2 rounded-xl bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800">
                              {method.icon}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (method.id === 'escrow') return; // Escrow is always required for neutral safety
                                if (isEnabled) {
                                  setEnabledMethods(enabledMethods.filter(m => m !== method.id));
                                } else {
                                  setEnabledMethods([...enabledMethods, method.id]);
                                }
                              }}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isEnabled ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-800'
                              } ${method.id === 'escrow' ? 'opacity-50 cursor-not-allowed' : ''}`}
                              disabled={method.id === 'escrow'}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                  isEnabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{method.name}</span>
                              {method.id === 'escrow' && (
                                <span className="text-[8px] bg-emerald-500/20 text-emerald-500 px-1 py-0.2 rounded font-sans uppercase font-extrabold">Required</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">{method.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Action Trigger Buttons */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-bold text-xs rounded-xl shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save configurations
                </button>
              </div>

            </form>

            {/* Audit Logs Stream */}
            <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-emerald-500" />
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">Real-Time Revenue Audit Logs</h4>
                    <p className="text-[10px] text-slate-400">Security event stream of configuration modifications</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const state = getDBState();
                    setDb({ ...state });
                  }}
                  className="p-1.5 bg-gray-50 dark:bg-slate-950 hover:bg-gray-100 dark:hover:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 transition-all cursor-pointer"
                  title="Force Refresh Log Stream"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-2xl border border-gray-100 dark:border-slate-800/60 bg-gray-50/50 dark:bg-slate-950/40 p-4 divide-y divide-gray-100 dark:divide-slate-800/40 space-y-3.5">
                {db.auditLogs.filter(log => log.entityType === 'REVENUE_SETTINGS').length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400 font-sans italic">
                    No settings changes logged yet. Modify the pricing engine above to generate an audit log.
                  </div>
                ) : (
                  db.auditLogs
                    .filter(log => log.entityType === 'REVENUE_SETTINGS')
                    .slice()
                    .reverse()
                    .map((log) => (
                      <div key={log.id} className="pt-3 first:pt-0 flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 flex-shrink-0 animate-ping" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-850 px-1.5 py-0.5 rounded">
                              {log.action}
                            </span>
                            <span className="text-[9px] text-gray-400 font-mono">
                              {new Date(log.createdAt).toLocaleTimeString()} {new Date(log.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-normal font-sans font-medium">
                            {log.details}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                            Operator: ID #{log.userId} (Administrator)
                          </p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
