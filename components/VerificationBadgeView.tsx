// components/VerificationBadgeView.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle, ChevronRight, Upload, AlertCircle } from 'lucide-react';
import { getDBState, saveDBState, dbOperations, UserRole } from '../lib/store';

export default function VerificationBadgeView() {
  const [db, setDb] = useState(getDBState());
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [userRoleSelection, setUserRoleSelection] = useState<'SELLER' | 'BUSINESS'>('SELLER');
  const [documentType, setDocumentType] = useState('NIN_SLIP');
  const [bvnError, setBvnError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const user = db.currentUser;
  const isVerified = user?.role === UserRole.VERIFIED_SELLER || user?.role === UserRole.VERIFIED_BUSINESS;

  const handleSubmitVerification = (e: React.FormEvent) => {
    e.preventDefault();
    setBvnError(null);

    if (bvn.length !== 11 || isNaN(Number(bvn))) {
      setBvnError('Nigerian Bank Verification Number (BVN) must be exactly 11 digits');
      return;
    }

    if (nin.length !== 11 || isNaN(Number(nin))) {
      setBvnError('Nigerian National Identification Number (NIN) must be exactly 11 digits');
      return;
    }

    // Update user role to candidate requesting approval (e.g. standard seller/business role so they populate queue)
    if (user) {
      const targetRole = userRoleSelection === 'SELLER' ? UserRole.SELLER : UserRole.BUSINESS;
      dbOperations.updateCurrentUserRole(targetRole);
      setIsSubmitted(true);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-2xl mx-auto">
        
        {/* Main Badge Card */}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto mb-4 animate-bounce">
              <ShieldCheck className="w-8 h-8 fill-amber-500/10" />
            </div>
            <h1 className="font-sans font-extrabold text-xl sm:text-2xl tracking-tight text-slate-950 dark:text-white">
              GoodSale Gold Trust Badge Verification
            </h1>
            <p className="text-xs text-gray-500 dark:text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
              Verify your commercial credentials using Nigeria&apos;s secure national ID systems (BVN/NIN). Certified merchants receive gold trust badges and priority search placements.
            </p>
          </div>

          {isVerified ? (
            <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-center space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="font-sans font-bold text-sm text-slate-900 dark:text-white">You Are Certified!</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                Your profile has received the prestigious Gold Trust Badge. Shoppers can trade with 100% confidence. Thank you for keeping GoodSale safe!
              </p>
            </div>
          ) : isSubmitted ? (
            <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-center space-y-2">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto animate-pulse" />
              <h3 className="font-sans font-bold text-sm text-slate-900 dark:text-white">Application Under Review</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                Thank you! Your national BVN/NIN credentials have been submitted. GoodSale Admins will audit documentation inside the admin queue for immediate approval.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitVerification} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 block mb-1 font-bold">Apply as Merchant Type</label>
                  <select
                    value={userRoleSelection}
                    onChange={(e) => setUserRoleSelection(e.target.value as 'SELLER' | 'BUSINESS')}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white font-semibold"
                  >
                    <option value="SELLER">Verified Individual Seller</option>
                    <option value="BUSINESS">Verified Enterprise Store</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-bold">Document Upload Type</label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white font-semibold"
                  >
                    <option value="NIN_SLIP">National ID Card (NIN)</option>
                    <option value="INT_PASSPORT">Nigerian International Passport</option>
                    <option value="VOTER_CARD">Voter Identification Card</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-bold">Bank Verification Number (11-digit BVN)</label>
                  <input
                    type="password"
                    maxLength={11}
                    required
                    value={bvn}
                    onChange={(e) => setBvn(e.target.value)}
                    placeholder="e.g. 22233344455"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-bold">National ID Card (11-digit NIN)</label>
                  <input
                    type="text"
                    maxLength={11}
                    required
                    value={nin}
                    onChange={(e) => setNin(e.target.value)}
                    placeholder="e.g. 99988877766"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Upload Document Slot Mockup */}
              <div>
                <label className="text-slate-400 block mb-1 font-bold">Upload Government Photo ID Slip Document</label>
                <div className="p-6 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl text-center cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                  <span className="font-semibold block text-slate-700 dark:text-slate-300">Click to select files or drag-and-drop</span>
                  <span className="text-[10px] text-gray-400">PDF, PNG, JPG (Max size 5MB)</span>
                </div>
              </div>

              {bvnError && (
                <p className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 font-bold text-center">
                  {bvnError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-1"
              >
                Submit ID Verification Slip
                <ChevronRight className="w-4 h-4" />
              </button>

            </form>
          )}

        </div>

      </div>
    </div>
  );
}
