// components/AdminDashboard.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, FileCheck, CheckCircle2, XCircle, 
  RefreshCw, Scale, DollarSign, Wallet, ClipboardList 
} from 'lucide-react';
import { 
  getDBState, saveDBState, dbOperations, User, UserRole, VerificationStatus 
} from '../lib/store';

export default function AdminDashboard({ onOpenAuth }: { onOpenAuth?: () => void }) {
  const [db, setDb] = useState(getDBState());
  const [activeTab, setActiveTab] = useState<'verifications' | 'escrows_disputes'>('verifications');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const currentUser = db.currentUser;

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
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
          <ShieldAlert className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Administrative Credentials Required</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Your current active role is <strong className="font-bold text-slate-900 dark:text-white uppercase font-mono">{currentUser.role}</strong>. Only administrators can process escrow arbitration or approve NIN/Passport documents.
        </p>
        <div className="space-y-3">
          <button
            onClick={() => {
              dbOperations.updateCurrentUserRole(UserRole.ADMIN);
              setActionSuccess('Elevated to Platform Administrator role for testing!');
            }}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-indigo-600/10 transition-all"
          >
            Switch to Admin Role (Testing Simulation)
          </button>
        </div>
      </div>
    );
  }

  // Filter pending ID verification submissions
  const pendingVerifications = db.verifications.filter(v => 
    v.status === VerificationStatus.PENDING
  );

  // Escrow dispute logs
  const activeDisputes = db.disputes.filter(dispute => 
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

          <div className="flex gap-2 bg-gray-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('verifications')}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeTab === 'verifications' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950'}`}
            >
              ID Verification Queue ({pendingVerifications.length})
            </button>
            <button
              onClick={() => setActiveTab('escrows_disputes')}
              className={`px-4 py-2 rounded-lg text-xs font-sans font-bold transition-all ${activeTab === 'escrows_disputes' ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-slate-950'}`}
            >
              Dispute Resolution ({activeDisputes.length})
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
                  const applicant = db.users.find(u => u.id === verification.userId);
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
                  const order = db.orders.find(o => o.id === dispute.orderId);
                  const buyer = db.users.find(u => u.id === dispute.openedById);
                  const seller = order ? db.users.find(u => u.id === order.sellerId) : null;
                  
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

      </div>
    </div>
  );
}
