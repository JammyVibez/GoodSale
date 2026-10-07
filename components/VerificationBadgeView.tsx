// components/VerificationBadgeView.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, CheckCircle, ChevronRight, Upload, Loader2, FileText,
  Sparkles, Award, Info, Building2, Camera, MapPin, IdCard,
} from 'lucide-react';
import { getDBState, dbOperations, UserRole, DocumentType, VerificationKind } from '../lib/store';
import { isDemoMode } from '@/lib/demo';
import { toast } from '@/lib/feedback';
import { salesStates, salesCitiesFor } from '@/lib/serviceAreas';

type SlotKey = 'id' | 'selfie' | 'address' | 'registration';

interface SlotDef {
  key: SlotKey;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const SLOTS: SlotDef[] = [
  { key: 'id', label: 'Government photo ID', hint: 'NIN slip, passport, voter or driver’s licence', Icon: FileText },
  { key: 'selfie', label: 'Selfie holding your ID', hint: 'Face and document clearly visible', Icon: Camera },
  { key: 'address', label: 'Proof of address', hint: 'Utility bill or bank statement (last 3 months)', Icon: MapPin },
  { key: 'registration', label: 'Business registration (CAC)', hint: 'Required for enterprise stores only', Icon: Building2 },
];

/** One upload tile: click or drop a file, preview it, and replace it again. */
function UploadSlot({
  slot,
  value,
  uploading,
  onPick,
}: {
  slot: SlotDef;
  value?: { url: string; name: string };
  uploading: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
        value
          ? 'border-jade-500/40 bg-jade-500/[0.06]'
          : 'border-dashed border-ink-200 bg-ink-50/50 hover:border-jade-500/50 dark:border-ink-800 dark:bg-ink-950/20'
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-ink-400 dark:bg-ink-900">
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-jade-500" />
        ) : value && /\.(png|jpe?g|webp)$/i.test(value.url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.url} alt="" className="h-full w-full object-cover" />
        ) : value ? (
          <CheckCircle className="h-5 w-5 text-jade-500" />
        ) : (
          <slot.Icon className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-ink-800 dark:text-ink-100">{slot.label}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-400">
          {uploading ? 'Uploading securely…' : value ? 'Uploaded — click to replace' : slot.hint}
        </span>
      </span>
    </button>
  );
}

export default function VerificationBadgeView() {
  const [db, setDb] = useState(getDBState());
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessState, setBusinessState] = useState('');
  const [businessCity, setBusinessCity] = useState('');
  const [userRoleSelection, setUserRoleSelection] = useState<'SELLER' | 'BUSINESS'>('SELLER');
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.NIN);
  const [bvnError, setBvnError] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<SlotKey | null>(null);
  const [docs, setDocs] = useState<Partial<Record<SlotKey, { url: string; name: string }>>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSlotRef = useRef<SlotKey>('id');

  useEffect(() => {
    const handleStateChange = () => setDb(getDBState());
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  const user = db.currentUser;
  const isVerified = user?.role === UserRole.VERIFIED_SELLER || user?.role === UserRole.VERIFIED_BUSINESS;

  useEffect(() => {
    if (user && !fullName) setFullName(user.fullName || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const pickSlot = (slot: SlotKey) => {
    activeSlotRef.current = slot;
    fileInputRef.current?.click();
  };

  /** Upload one document to secure storage (with a local preview fallback). */
  const processAndUploadFile = async (selectedFile: File, slot: SlotKey) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setBvnError('Unsupported file format. Please upload JPG, PNG, or PDF.');
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setBvnError('File is too large. Maximum size allowed is 5MB.');
      return;
    }

    setBvnError(null);
    setUploadingSlot(slot);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (user) formData.append('userId', user.id.toString());

      const res = await fetch('/api/upload-id', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.success || !data.url) throw new Error(data.error || 'Upload failed');
      setDocs((prev) => ({ ...prev, [slot]: { url: data.url, name: selectedFile.name } }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setBvnError(`Upload failed: ${message}`);
      setDocs((prev) => ({
        ...prev,
        [slot]: { url: URL.createObjectURL(selectedFile), name: selectedFile.name },
      }));
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) await processAndUploadFile(selectedFile, activeSlotRef.current);
    e.target.value = '';
  };

  const handleSubmitVerification = (e: React.FormEvent) => {
    e.preventDefault();
    setBvnError(null);

    if (!user) {
      setBvnError('Please sign in before applying for verification.');
      return;
    }
    if (!fullName.trim()) {
      setBvnError('Enter your full legal name exactly as it appears on your ID.');
      return;
    }
    if (nin.length !== 11 || isNaN(Number(nin))) {
      setBvnError('Nigerian National Identification Number (NIN) must be exactly 11 digits');
      return;
    }
    if (bvn && (bvn.length !== 11 || isNaN(Number(bvn)))) {
      setBvnError('Bank Verification Number (BVN) must be exactly 11 digits');
      return;
    }
    if (!docs.id?.url) {
      setBvnError('Upload your government photo ID first.');
      return;
    }
    if (userRoleSelection === 'BUSINESS') {
      if (!businessName.trim() || !businessAddress.trim()) {
        setBvnError('Enter your registered business name and address.');
        return;
      }
      if (!docs.registration?.url) {
        setBvnError('Upload your CAC business registration document.');
        return;
      }
    }

    const documents = Object.entries(docs)
      .filter(([, value]) => Boolean(value?.url))
      .map(([key, value]) => ({
        label: SLOTS.find((s) => s.key === key)?.label || key,
        url: value!.url,
        kind: key === 'selfie' ? ('SELFIE' as const)
          : key === 'address' ? ('ADDRESS' as const)
          : key === 'registration' ? ('CAC' as const)
          : ('IDENTITY' as const),
        note: key === 'id' ? `${documentType} · ${nin}` : undefined,
      }));

    void (async () => {
      const res = await dbOperations.submitVerificationApplication({
        kind: userRoleSelection === 'BUSINESS' ? VerificationKind.BUSINESS : VerificationKind.SELLER,
        fullName: fullName.trim(),
        documentType,
        documentNumber: nin,
        documentImageUrl: docs.id?.url || '',
        selfieImageUrl: docs.selfie?.url || '',
        proofOfAddressUrl: docs.address?.url || '',
        documents,
        businessName: businessName.trim(),
        businessAddress: [businessAddress.trim(), businessCity, businessState].filter(Boolean).join(', '),
      });

      if (res && 'error' in res && res.error) {
        setBvnError(res.error);
        return;
      }

      // Instant verify is demo-only; production always waits for admin review.
      if (isDemoMode()) {
        const targetRole =
          userRoleSelection === 'SELLER' ? UserRole.VERIFIED_SELLER : UserRole.VERIFIED_BUSINESS;
        dbOperations.verifyUserImmediately(user.id, targetRole);
      }
      toast.success('Application submitted. Our team reviews every document before approving.', 'Under review');
      setIsSubmitted(true);
    })();
  };

  const requiredSlots = userRoleSelection === 'BUSINESS' ? SLOTS : SLOTS.filter((s) => s.key !== 'registration');

  return (
    <div className="min-h-screen bg-ink-50 px-4 py-10 transition-colors duration-300 dark:bg-ink-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="space-y-6 rounded-3xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900 sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-jade-500/10 text-jade-500">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-950 dark:text-white sm:text-2xl">
              GoodSale Seller &amp; Business Verification
            </h1>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-400">
              Verified sellers earn the gold trust badge, rank higher in search and convert more
              buyers. Upload every document once — our review team checks each file before approval.
            </p>
          </div>

          {isVerified || isSubmitted ? (
            <div className="relative space-y-3 overflow-hidden rounded-3xl border border-jade-500/20 bg-jade-500/5 p-8 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-jade-500" />
              <h3 className="flex items-center justify-center gap-1.5 font-display text-base font-bold text-ink-900 dark:text-white">
                <Sparkles className="h-4 w-4 text-jade-500" />
                {isVerified ? 'Profile status: verified merchant' : 'Application received'}
              </h3>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                {isVerified
                  ? 'Your gold trust badge is live. Listings are boosted in ranking and buyers see your verification badge across the marketplace.'
                  : 'Thank you. Our trust & safety team is reviewing your documents. You will be notified in-app as soon as a decision is made.'}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <span className="flex items-center gap-1 rounded-lg bg-ink-500/10 px-3 py-1 text-xs font-semibold text-ink-600 dark:text-ink-400">
                  <Award className="h-3.5 w-3.5" /> Gold trust badge
                </span>
                <span className="flex items-center gap-1 rounded-lg bg-jade-500/10 px-3 py-1 text-xs font-semibold text-jade-700 dark:text-jade-400">
                  +200 GoodPoints granted
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitVerification} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">Apply as</label>
                  <select
                    value={userRoleSelection}
                    onChange={(e) => setUserRoleSelection(e.target.value as 'SELLER' | 'BUSINESS')}
                    className="w-full cursor-pointer rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 font-semibold text-ink-800 outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
                  >
                    <option value="SELLER">Verified individual seller</option>
                    <option value="BUSINESS">Verified enterprise store</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">Government ID type</label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                    className="w-full cursor-pointer rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 font-semibold text-ink-800 outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
                  >
                    <option value={DocumentType.NIN}>National ID card (NIN slip)</option>
                    <option value={DocumentType.PASSPORT}>Nigerian international passport</option>
                    <option value={DocumentType.VOTERS_CARD}>Voter&apos;s card (INEC)</option>
                    <option value={DocumentType.DRIVERS_LICENSE}>Driver&apos;s licence (FRSC)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">Full legal name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Exactly as printed on your ID"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 font-semibold text-ink-800 outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">National ID number (11-digit NIN)</label>
                  <input
                    type="text"
                    maxLength={11}
                    required
                    value={nin}
                    onChange={(e) => setNin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 99988877766"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-ink-800 tracking-widest outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">
                    Bank verification number (optional)
                  </label>
                  <input
                    type="password"
                    maxLength={11}
                    value={bvn}
                    onChange={(e) => setBvn(e.target.value.replace(/\D/g, ''))}
                    placeholder="11-digit BVN"
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 font-mono text-ink-800 tracking-widest outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
                  />
                </div>
              </div>

              {userRoleSelection === 'BUSINESS' && (
                <div className="space-y-4 rounded-2xl border border-jade-500/20 bg-jade-500/[0.04] p-4">
                  <p className="flex items-center gap-1.5 font-semibold text-jade-700 dark:text-jade-300">
                    <Building2 className="h-4 w-4" /> Business details
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">Registered business name</label>
                      <input
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="e.g. Bright Electronics Ltd"
                        className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-semibold text-ink-800 outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">Business address</label>
                      <input
                        type="text"
                        value={businessAddress}
                        onChange={(e) => setBusinessAddress(e.target.value)}
                        placeholder="Street address"
                        className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-semibold text-ink-800 outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">State</label>
                      <select
                        value={businessState}
                        onChange={(e) => {
                          setBusinessState(e.target.value);
                          const cities = salesCitiesFor(e.target.value);
                          setBusinessCity(cities[0] || '');
                        }}
                        className="w-full cursor-pointer rounded-xl border border-ink-200 bg-white px-3 py-2 font-semibold text-ink-800 outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
                      >
                        <option value="">Select state</option>
                        {salesStates().map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-ink-500 dark:text-ink-400">City</label>
                      <input
                        type="text"
                        value={businessCity}
                        onChange={(e) => setBusinessCity(e.target.value)}
                        placeholder="City / area"
                        className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-semibold text-ink-800 outline-none transition-colors focus:border-jade-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Document slots — every uploaded file is visible to the reviewer */}
              <div className="space-y-2">
                <label className="block font-semibold text-ink-500 dark:text-ink-400">
                  Documents for review
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,application/pdf"
                  className="hidden"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {requiredSlots.map((slot) => (
                    <UploadSlot
                      key={slot.key}
                      slot={slot}
                      value={docs[slot.key]}
                      uploading={uploadingSlot === slot.key}
                      onPick={() => pickSlot(slot.key)}
                    />
                  ))}
                </div>
              </div>

              {(docs.id || docs.selfie || docs.address || docs.registration) && (
                <div className="flex items-start gap-2.5 rounded-xl border border-jade-500/10 bg-jade-500/5 p-3">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-jade-500" />
                  <p className="text-xs leading-relaxed text-jade-700 dark:text-jade-300">
                    <strong>Private by design.</strong> Your documents are stored in isolated,
                    access-controlled storage. Only the GoodSale review team can open them, and they
                    are never shown on your public profile.
                  </p>
                </div>
              )}

              {bvnError && (
                <p className="rounded-xl border border-ink-500/20 bg-ink-500/10 p-3 text-center font-semibold text-ink-600 dark:text-ink-300">
                  {bvnError}
                </p>
              )}

              <button
                type="submit"
                disabled={uploadingSlot !== null}
                className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-xl bg-jade-500 py-3 font-display text-sm font-semibold text-white shadow-md shadow-jade-500/10 transition-all hover:bg-jade-600 disabled:opacity-50"
              >
                Submit application for review
                <ChevronRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
