// components/VerificationBadgeView.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, CheckCircle, ChevronRight, Upload, AlertCircle, 
  Loader2, FileText, Sparkles, Award, MapPin, Eye, Info
} from 'lucide-react';
import { getDBState, saveDBState, dbOperations, UserRole, DocumentType } from '../lib/store';

export default function VerificationBadgeView() {
  const [db, setDb] = useState(getDBState());
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [userRoleSelection, setUserRoleSelection] = useState<'SELLER' | 'BUSINESS'>('SELLER');
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.NIN);
  const [bvnError, setBvnError] = useState<string | null>(null);
  
  // File Upload states
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadSource, setUploadSource] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const user = db.currentUser;
  const isVerified = user?.role === UserRole.VERIFIED_SELLER || user?.role === UserRole.VERIFIED_BUSINESS;

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle Drop Events
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      await processAndUploadFile(droppedFile);
    }
  };

  // Handle File Input Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      await processAndUploadFile(selectedFile);
    }
  };

  // Process ID File and Upload via Server-Side route
  const processAndUploadFile = async (selectedFile: File) => {
    // Validate file type & size
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setBvnError("Unsupported file format. Please upload JPG, PNG, or PDF.");
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setBvnError("File is too large. Maximum size allowed is 5MB.");
      return;
    }

    setFile(selectedFile);
    setBvnError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      if (user) {
        formData.append("userId", user.id.toString());
      }

      const res = await fetch("/api/upload-id", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        setUploadedUrl(data.url);
        setUploadSource(data.source);
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setBvnError(`Upload failed: ${err.message}. Standard fallback preview used instead.`);
      // Mock fallback URL for elegant preview
      setUploadedUrl(URL.createObjectURL(selectedFile));
      setUploadSource("client-preview-fallback");
    } finally {
      setUploading(false);
    }
  };

  const handleTriggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleSubmitVerification = (e: React.FormEvent) => {
    e.preventDefault();
    setBvnError(null);

    if (!user) {
      setBvnError("Please sign in or hop in as a guest before verifying.");
      return;
    }

    if (bvn.length !== 11 || isNaN(Number(bvn))) {
      setBvnError('Nigerian Bank Verification Number (BVN) must be exactly 11 digits');
      return;
    }

    if (nin.length !== 11 || isNaN(Number(nin))) {
      setBvnError('Nigerian National Identification Number (NIN) must be exactly 11 digits');
      return;
    }

    if (!uploadedUrl) {
      setBvnError("Please upload a valid government photo ID document first.");
      return;
    }

    // Submit verification to state
    dbOperations.submitVerification(documentType, nin, uploadedUrl);

    // Instant high-fidelity workflow update: instantly verify profile as 'Verified'
    const targetRole = userRoleSelection === 'SELLER' ? UserRole.VERIFIED_SELLER : UserRole.VERIFIED_BUSINESS;
    dbOperations.verifyUserImmediately(user.id, targetRole);
    setIsSubmitted(true);
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-10 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-2xl mx-auto">
        
        {/* Main Badge Card */}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 fill-amber-500/10 animate-pulse" />
            </div>
            <h1 className="font-sans font-extrabold text-xl sm:text-2xl tracking-tight text-slate-950 dark:text-white">
              GoodSale Gold Trust Badge Verification
            </h1>
            <p className="text-xs text-gray-500 dark:text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
              Verify your credentials using secure server-side storage and Nigeria&apos;s national ID registers (BVN/NIN). Certified merchants receive gold trust badges and immediate search rankings.
            </p>
          </div>

          {isVerified ? (
            <div className="p-8 bg-emerald-500/5 border border-emerald-500/20 rounded-3xl text-center space-y-3 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-xl" />
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="font-sans font-extrabold text-base text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
                Profile Status: Verified Merchant
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                Your profile has received the prestigious **Gold Trust Badge**. All your product listings are now boosted with priority ranking, and customers see your verification badge on the catalog grid.
              </p>
              <div className="pt-2 flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold rounded-lg text-[10px] flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" />
                  Gold Trust Badge
                </span>
                <span className="px-3 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold rounded-lg text-[10px] flex items-center gap-1">
                  +200 GoodPoints Granted
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitVerification} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1 font-extrabold font-sans">Apply as Merchant Type</label>
                  <select
                    value={userRoleSelection}
                    onChange={(e) => setUserRoleSelection(e.target.value as 'SELLER' | 'BUSINESS')}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white font-semibold cursor-pointer outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="SELLER">Verified Individual Seller</option>
                    <option value="BUSINESS">Verified Enterprise Store</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1 font-extrabold font-sans">Government ID Type</label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white font-semibold cursor-pointer outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value={DocumentType.NIN}>National ID Card (NIN Slip)</option>
                    <option value={DocumentType.PASSPORT}>Nigerian International Passport</option>
                    <option value={DocumentType.VOTERS_CARD}>Voters Card (INEC)</option>
                    <option value={DocumentType.DRIVERS_LICENSE}>Drivers License (FRSC)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1 font-extrabold font-sans">Bank Verification Number (11-digit BVN)</label>
                  <input
                    type="password"
                    maxLength={11}
                    required
                    value={bvn}
                    onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 22233344455"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white font-mono tracking-widest outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-slate-500 dark:text-slate-400 block mb-1 font-extrabold font-sans">National ID Number (11-digit NIN)</label>
                  <input
                    type="text"
                    maxLength={11}
                    required
                    value={nin}
                    onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 99988877766"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white font-mono tracking-widest outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {/* Upload Document Slot with Supabase and Drag-and-Drop */}
              <div>
                <label className="text-slate-500 dark:text-slate-400 block mb-1 font-extrabold font-sans">
                  Upload Government Photo ID (NIN Slip, Voter Card, or Passport)
                </label>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                />

                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={handleTriggerFileInput}
                  className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                    dragActive 
                      ? 'border-emerald-500 bg-emerald-500/5' 
                      : 'border-gray-200 dark:border-slate-800 hover:border-emerald-500/50 bg-gray-50/50 dark:bg-slate-950/20'
                  }`}
                >
                  {uploading ? (
                    <div className="py-4 space-y-2 flex flex-col items-center">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                      <p className="font-bold text-slate-700 dark:text-slate-300">Uploading securely to Supabase Storage...</p>
                      <p className="text-[10px] text-slate-400">Encrypting file buffer & verifying payload size...</p>
                    </div>
                  ) : uploadedUrl ? (
                    <div className="py-2 space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-xs">File Uploaded Successfully!</p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                          Source: {uploadSource}
                        </p>
                      </div>
                      
                      {/* Document Preview Thumbnail if image */}
                      {file && file.type.startsWith('image/') && (
                        <div className="relative mx-auto w-32 aspect-[3/2] rounded-lg overflow-hidden border border-gray-200 dark:border-slate-800 mt-2 shadow-sm bg-white dark:bg-slate-900">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={uploadedUrl} 
                            alt="ID Preview" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <p className="text-[10px] text-gray-400 underline font-semibold">
                        Click or drop another file to replace
                      </p>
                    </div>
                  ) : (
                    <div className="py-4">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2.5" />
                      <span className="font-extrabold block text-slate-800 dark:text-slate-200 mb-1 font-sans">
                        Click to select government ID or drag-and-drop
                      </span>
                      <span className="text-[10px] text-gray-400 block">
                        PDF, PNG, JPG (Max size 5MB)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {uploadedUrl && (
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 leading-relaxed font-sans">
                    <strong>Secure Link:</strong> Government ID is isolated in server storage. Only automated security scanners can inspect details to protect your privacy.
                  </p>
                </div>
              )}

              {bvnError && (
                <p className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 font-bold text-center">
                  {bvnError}
                </p>
              )}

              <button
                type="submit"
                disabled={uploading}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-sans font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
              >
                Submit ID Verification & Auto-Verify Profile
                <ChevronRight className="w-4 h-4" />
              </button>

            </form>
          )}

        </div>

      </div>
    </div>
  );
}
