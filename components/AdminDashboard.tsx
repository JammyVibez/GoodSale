// components/AdminDashboard.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert, ShieldCheck, FileCheck, CheckCircle2, XCircle, Scale, DollarSign,
  Wallet, ClipboardList, Settings, Award, Sparkles, Percent, Activity, Shield,
  CreditCard, Truck, FileText, Coins, Users, Package, Search, Ban, RotateCcw,
  ExternalLink, AlertTriangle, Flag, MapPin, Plus, Trash2, ChevronDown, ChevronUp,
  Building2, Image as ImageIcon, MapPinned,
} from 'lucide-react';
import {
  dbOperations, UserRole, VerificationStatus, OrderStatus, useDBState, ReportStatus,
} from '../lib/store';
import { createClient } from '@/lib/supabase/client';
import { confirmDialog } from '@/lib/feedback';
import AdStudio from './AdStudio';
import AnnouncementStudio from './AnnouncementStudio';

type Tab =
  | 'verifications'
  | 'users'
  | 'products'
  | 'orders_escrow'
  | 'disputes'
  | 'dispatch'
  | 'reports'
  | 'coverage'
  | 'settings';

const REPORT_STATUSES: ReportStatus[] = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'];

/** Nigerian states offered when an admin adds a new coverage area. */
const NG_STATES = [
  'Abia State', 'Adamawa State', 'Akwa Ibom State', 'Anambra State', 'Bauchi State',
  'Bayelsa State', 'Benue State', 'Borno State', 'Cross River State', 'Delta State',
  'Ebonyi State', 'Edo State', 'Ekiti State', 'Enugu State', 'FCT Abuja',
  'Gombe State', 'Imo State', 'Jigawa State', 'Kaduna State', 'Kano State',
  'Katsina State', 'Kebbi State', 'Kogi State', 'Kwara State', 'Lagos State',
  'Nasarawa State', 'Niger State', 'Ogun State', 'Ondo State', 'Osun State',
  'Oyo State', 'Plateau State', 'Rivers State', 'Sokoto State', 'Taraba State',
  'Yobe State', 'Zamfara State',
];

const ALL_ROLES = Object.values(UserRole);
const PAY_METHODS = [
  { id: 'escrow', name: 'Escrow', locked: true, Icon: Shield },
  { id: 'card', name: 'Card', Icon: CreditCard },
  { id: 'bank', name: 'Bank', Icon: ExternalLink },
  { id: 'cod', name: 'COD', Icon: Truck },
  { id: 'invoice', name: 'Invoice', Icon: FileText },
  { id: 'partial', name: 'Partial', Icon: Coins },
] as const;

const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500 font-mono';
const btnOk =
  'px-3 py-1.5 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';
const btnNo =
  'px-3 py-1.5 bg-white dark:bg-ink-900 text-ink-500 hover:bg-ink-500/10 border border-ink-200 dark:border-ink-800 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';
const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-ink-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function AdminDashboard({ onOpenAuth }: { onOpenAuth?: () => void }) {
  const db = useDBState();
  const [activeTab, setActiveTab] = useState<Tab>('verifications');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [verFilter, setVerFilter] = useState<'ALL' | VerificationStatus>('ALL');
  const [verNotes, setVerNotes] = useState<Record<number, string>>({});
  const [verTargetRole, setVerTargetRole] = useState<Record<number, UserRole>>({});
  const [userSearch, setUserSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productDrafts, setProductDrafts] = useState<Record<number, { price: string; stockStatus: string }>>({});

  // Document review (verification applications & rider files)
  const [expandedVer, setExpandedVer] = useState<number | null>(null);
  const [expandedPartner, setExpandedPartner] = useState<number | null>(null);
  const [partnerReasons, setPartnerReasons] = useState<Record<number, string>>({});

  // Reports
  const [reportFilter, setReportFilter] = useState<'ALL' | ReportStatus>('ALL');
  const [reportNotes, setReportNotes] = useState<Record<number, string>>({});

  // Coverage / service areas
  const [areaState, setAreaState] = useState(NG_STATES[NG_STATES.indexOf('Lagos State')]);
  const [areaCity, setAreaCity] = useState('');
  const [areaSales, setAreaSales] = useState(true);
  const [areaDelivery, setAreaDelivery] = useState(true);
  const [areaQuery, setAreaQuery] = useState('');
  const [escrowNotes, setEscrowNotes] = useState<Record<number, string>>({});
  const [disputeNotes, setDisputeNotes] = useState<Record<number, string>>({});

  const rs = db.revenueSettings;
  const [fees, setFees] = useState({
    escrowPercentageFee: '1.5', escrowMinFee: '100', escrowMaxFee: '15000',
    deliveryCommissionPercentage: '10', subProPrice: '15000', subPremiumPrice: '35000',
    subEnterprisePrice: '85000', verifiedPlusPrice: '10000', flashSaleFeaturePrice: '7500',
    auctionSuccessFeePercentage: '2.5', adCpcPrice: '150', goodSaleProtectFee: '1500',
  });
  const [enabledMethods, setEnabledMethods] = useState<string[]>(['escrow', 'cod', 'card', 'bank', 'invoice', 'partial']);
  const [platformFeeEnabled, setPlatformFeeEnabled] = useState(false);

  // Admin access is decided by the database role (granted by another admin),
  // never auto-elevated from the browser.

  useEffect(() => {
    if (!rs) return;
    setPlatformFeeEnabled(Boolean(rs.platformFeeEnabled));
    setFees({
      escrowPercentageFee: String(rs.escrowPercentageFee ?? 1.5),
      escrowMinFee: String(rs.escrowMinFee ?? 100),
      escrowMaxFee: String(rs.escrowMaxFee ?? 15000),
      deliveryCommissionPercentage: String(rs.deliveryCommissionPercentage ?? 10),
      subProPrice: String(rs.subProPrice ?? 15000),
      subPremiumPrice: String(rs.subPremiumPrice ?? 35000),
      subEnterprisePrice: String(rs.subEnterprisePrice ?? 85000),
      verifiedPlusPrice: String(rs.verifiedPlusPrice ?? 10000),
      flashSaleFeaturePrice: String(rs.flashSaleFeaturePrice ?? 7500),
      auctionSuccessFeePercentage: String(rs.auctionSuccessFeePercentage ?? 2.5),
      adCpcPrice: String(rs.adCpcPrice ?? 150),
      goodSaleProtectFee: String(rs.goodSaleProtectFee ?? 1500),
    });
  }, [rs]);

  useEffect(() => {
    if (db.paymentSettings?.enabledMethods) setEnabledMethods(db.paymentSettings.enabledMethods);
  }, [db.paymentSettings]);

  const toast = (ok?: string, err?: string) => {
    setActionSuccess(ok || null);
    setActionError(err || null);
    window.setTimeout(() => { setActionSuccess(null); setActionError(null); }, 3500);
  };

  const run = async (fn: () => Promise<void> | void, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(okMsg);
    } catch (e: unknown) {
      toast(undefined, e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const setFee = (key: keyof typeof fees, val: string) => setFees((f) => ({ ...f, [key]: val }));
  const currentUser = db.currentUser;
  const adminCount = useMemo(
    () => (db.users || []).filter((u) => u.role === UserRole.ADMIN || u.role === UserRole.SUPER_ADMIN).length,
    [db.users]
  );

  const pendingVerifications = (db.verifications || []).filter((v) => v.status === VerificationStatus.PENDING);
  const openDisputes = (db.disputes || []).filter((d) => d.resolution === 'PENDING');
  const pendingPartners = (db.deliveryPartners || []).filter((p) => p.status === 'PENDING');
  const openEscrowHeld = (db.escrows || [])
    .filter((e) => !e.isReleased && !e.isRefunded)
    .reduce((acc, e) => acc + e.heldAmount, 0);

  const filteredVerifications = (db.verifications || []).filter(
    (v) => verFilter === 'ALL' || v.status === verFilter
  );
  const filteredUsers = (db.users || []).filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return [u.fullName, u.email, u.username, u.phoneNumber || ''].some((s) => s.toLowerCase().includes(q));
  });
  const filteredProducts = (db.products || []).filter((p) => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || String(p.id).includes(q);
  });

  const openReports = (db.reports || []).filter((r) => r.status === 'OPEN' || r.status === 'REVIEWING');
  const filteredReports = (db.reports || [])
    .filter((r) => reportFilter === 'ALL' || r.status === reportFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const serviceAreas = [...(db.serviceAreas || [])].sort(
    (a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city)
  );
  const filteredAreas = serviceAreas.filter((a) => {
    const q = areaQuery.trim().toLowerCase();
    if (!q) return true;
    return a.state.toLowerCase().includes(q) || a.city.toLowerCase().includes(q);
  });
  const salesAreaCount = serviceAreas.filter((a) => a.salesEnabled).length;
  const deliveryAreaCount = serviceAreas.filter((a) => a.deliveryEnabled).length;

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-ink-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-ink-500/20">
          <Scale className="w-8 h-8 text-ink-500" />
        </div>
        <h2 className="font-display font-bold text-2xl text-ink-900 dark:text-white mb-2">Admin Control Room</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400 mb-8">Sign in as an authorized administrator to continue.</p>
        <button onClick={onOpenAuth} className="w-full py-3 bg-gradient-to-r from-jade-500 to-jade-600 text-white font-bold text-xs tracking-wider rounded-xl cursor-pointer">
          Sign In / Register Account
        </button>
      </div>
    );
  }

  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-ink-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-ink-500/20">
          <ShieldAlert className="w-8 h-8 text-ink-500" />
        </div>
        <h2 className="font-display font-bold text-2xl text-ink-900 dark:text-white mb-2">Access Strictly Restricted</h2>
        <p className="text-sm text-ink-500 dark:text-ink-400">Reserved for platform administrators only.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'verifications', label: 'Verifications', count: pendingVerifications.length },
    { id: 'users', label: 'Users' },
    { id: 'products', label: 'Products' },
    { id: 'orders_escrow', label: 'Orders / Escrow' },
    { id: 'disputes', label: 'Disputes', count: openDisputes.length },
    { id: 'dispatch', label: 'Dispatch', count: pendingPartners.length },
    { id: 'reports', label: 'Reports', count: openReports.length },
    { id: 'coverage', label: 'Coverage' },
    { id: 'settings', label: 'Settings' },
  ];

  const metrics = [
    { label: 'Users', value: String((db.users || []).length), Icon: Users, color: 'text-jade-500 bg-jade-500/10' },
    { label: 'Products', value: String((db.products || []).length), Icon: Package, color: 'text-jade-500 bg-jade-500/10' },
    { label: 'Open Escrow Held', value: `₦${openEscrowHeld.toLocaleString()}`, Icon: Wallet, color: 'text-jade-500 bg-jade-500/10' },
    { label: 'Pending Verifications', value: String(pendingVerifications.length), Icon: ClipboardList, color: 'text-ink-500 bg-ink-500/10' },
    { label: 'Open Disputes', value: String(openDisputes.length), Icon: Scale, color: 'text-ink-500 bg-ink-500/10' },
    { label: 'Pending Partners', value: String(pendingPartners.length), Icon: Truck, color: 'text-jade-500 bg-jade-500/10' },
    { label: 'Open Reports', value: String(openReports.length), Icon: Flag, color: 'text-ink-500 bg-ink-500/10' },
    { label: 'Active Areas', value: `${salesAreaCount} / ${serviceAreas.length}`, Icon: MapPinned, color: 'text-jade-500 bg-jade-500/10' },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 'bg-ink-500/10 text-ink-600',
      APPROVED: 'bg-jade-500/10 text-jade-600',
      REJECTED: 'bg-ink-500/10 text-ink-500',
      RELEASED: 'bg-jade-500/10 text-jade-600',
      REFUNDED: 'bg-ink-500/10 text-ink-500',
    };
    return map[status] || 'bg-ink-100 dark:bg-ink-800 text-ink-500';
  };

  return (
    <div className="bg-ink-50 dark:bg-ink-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-4 border-b border-ink-200 dark:border-ink-800 pb-4">
          <div>
            <h1 className="font-sans font-semibold text-2xl text-ink-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-jade-500" /> GoodSale Admin Control Room
            </h1>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
              Signed in as {currentUser.fullName} · {currentUser.role}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 bg-ink-100 dark:bg-ink-900 p-1 rounded-xl">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
                  activeTab === t.id ? 'bg-jade-500 text-white shadow' : 'text-ink-700 dark:text-ink-400 hover:text-white'
                }`}
              >
                {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>
        </div>

        {actionSuccess && (
          <div className="mb-4 p-3 bg-jade-500/10 border border-jade-500/20 rounded-xl text-jade-500 font-bold text-xs text-center">{actionSuccess}</div>
        )}
        {actionError && (
          <div className="mb-4 p-3 bg-ink-500/10 border border-ink-500/20 rounded-xl text-ink-500 font-bold text-xs text-center">{actionError}</div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {metrics.map((m) => (
            <div key={m.label} className={`${card} p-4 flex items-center justify-between gap-2`}>
              <div className="min-w-0">
                <span className="text-xs text-ink-400 font-bold tracking-wider block truncate">{m.label}</span>
                <span className="font-sans font-semibold text-sm sm:text-base text-ink-950 dark:text-white block mt-0.5 truncate">{m.value}</span>
              </div>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${m.color}`}>
                <m.Icon className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>

        {/* Verifications */}
        {activeTab === 'verifications' && (
          <div className={`${card} overflow-hidden`}>
            <div className="p-4 border-b border-ink-200 dark:border-ink-800 flex flex-wrap items-center justify-between gap-3">
              <span className="font-sans font-bold text-sm text-ink-900 dark:text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-jade-500" /> Identity Verifications
              </span>
              <div className="flex gap-1">
                {(['ALL', VerificationStatus.PENDING, VerificationStatus.APPROVED, VerificationStatus.REJECTED] as const).map((f) => (
                  <button key={f} onClick={() => setVerFilter(f)} className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${verFilter === f ? 'bg-jade-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {filteredVerifications.length === 0 ? (
              <div className="p-12 text-center text-xs text-ink-400">No verifications in this filter.</div>
            ) : (
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {filteredVerifications.map((v) => {
                  const applicant = (db.users || []).find((u) => u.id === v.userId);
                  const notes = verNotes[v.id] ?? '';
                  const target = verTargetRole[v.id] ?? (
                    applicant?.role === UserRole.BUSINESS || applicant?.role === UserRole.VERIFIED_BUSINESS
                      ? UserRole.VERIFIED_BUSINESS
                      : UserRole.VERIFIED_SELLER
                  );
                  return (
                    <div key={v.id} className="p-4 flex flex-col lg:flex-row gap-4 justify-between text-xs">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm text-ink-950 dark:text-white">{v.fullName}</span>
                          <span className="px-1.5 py-0.5 bg-ink-100 dark:bg-ink-800 text-ink-500 rounded text-xs font-bold">@{applicant?.username || 'user'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${statusBadge(v.status)}`}>{v.status}</span>
                        </div>
                        <p className="text-ink-400 font-mono">#{v.id} · {v.documentType} ({v.documentNumber})</p>

                        {v.applicationKind && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-jade-500/10 px-1.5 py-0.5 text-xs font-bold text-jade-600 dark:text-jade-400">
                            {v.applicationKind === 'BUSINESS' ? <Building2 className="w-3 h-3" /> : <FileCheck className="w-3 h-3" />}
                            {v.applicationKind} application
                          </span>
                        )}

                        <button
                          onClick={() => setExpandedVer(expandedVer === v.id ? null : v.id)}
                          className="flex items-center gap-1 text-xs font-bold text-jade-500 hover:underline cursor-pointer"
                        >
                          {expandedVer === v.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {expandedVer === v.id ? 'Hide full file' : 'View full file & documents'}
                        </button>

                        {expandedVer === v.id && (
                          <div className="mt-2 space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/40">
                            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {[
                                ['Applicant', applicant?.fullName || `User ${v.userId}`],
                                ['Email', applicant?.email || '—'],
                                ['Phone', applicant?.phoneNumber || '—'],
                                ['Current role', applicant?.role || '—'],
                                ['Legal name', v.fullName],
                                ['Document', `${v.documentType} · ${v.documentNumber}`],
                                ...(v.businessName ? [['Business name', v.businessName]] : []),
                                ...(v.businessAddress ? [['Business address', v.businessAddress]] : []),
                                ['Submitted', new Date(v.createdAt).toLocaleString()],
                                ...(v.reviewedAt
                                  ? [['Reviewed', `${new Date(v.reviewedAt).toLocaleString()} by admin #${v.reviewedBy ?? '—'}`]]
                                  : []),
                              ].map(([label, value]) => (
                                <div key={label} className="min-w-0">
                                  <dt className="text-xs font-bold text-ink-400">{label}</dt>
                                  <dd className="truncate text-xs text-ink-800 dark:text-ink-200">{String(value)}</dd>
                                </div>
                              ))}
                            </dl>

                            {/* Every uploaded file, previewable before approval */}
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-ink-500">Uploaded documents</p>
                              {(() => {
                                const docs = [
                                  ...(v.documentImageUrl ? [{ label: `${v.documentType} document`, url: v.documentImageUrl }] : []),
                                  ...(v.selfieImageUrl ? [{ label: 'Selfie / passport photo', url: v.selfieImageUrl }] : []),
                                  ...(v.proofOfAddressUrl ? [{ label: 'Proof of address', url: v.proofOfAddressUrl }] : []),
                                  ...(v.documents || []),
                                ];
                                return docs.length === 0 ? (
                                  <p className="text-xs text-ink-400">No files were uploaded with this application.</p>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {docs.map((doc, i) => (
                                      <a
                                        key={`${doc.label}-${i}`}
                                        href={doc.url || undefined}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="group overflow-hidden rounded-lg border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900"
                                      >
                                        {doc.url ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={doc.url} alt={doc.label} className="h-24 w-full object-cover transition-transform group-hover:scale-105" />
                                        ) : (
                                          <div className="grid h-24 place-items-center bg-ink-100 text-ink-400 dark:bg-ink-800">
                                            <ImageIcon className="w-5 h-5" />
                                          </div>
                                        )}
                                        <span className="block truncate px-2 py-1.5 text-xs font-semibold text-ink-600 dark:text-ink-300">
                                          {doc.label}
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>

                            {v.adminNotes && <p className="text-xs italic text-ink-500">Prev. notes: {v.adminNotes}</p>}
                            {v.rejectionReason && (
                              <p className="text-xs italic text-ink-500">Rejection reason: {v.rejectionReason}</p>
                            )}
                          </div>
                        )}
                      </div>
                      {v.status === VerificationStatus.PENDING && (
                        <div className="flex flex-col gap-2 min-w-[220px]">
                          <select value={target} onChange={(e) => setVerTargetRole((s) => ({ ...s, [v.id]: e.target.value as UserRole }))} className={inp}>
                            <option value={UserRole.VERIFIED_SELLER}>VERIFIED_SELLER</option>
                            <option value={UserRole.VERIFIED_BUSINESS}>VERIFIED_BUSINESS</option>
                          </select>
                          <input placeholder="Optional admin notes" value={notes} onChange={(e) => setVerNotes((s) => ({ ...s, [v.id]: e.target.value }))} className={inp} />
                          <div className="flex gap-2">
                            <button disabled={busy} className={btnOk} onClick={() => run(async () => {
                              await dbOperations.handleVerificationApproval(
                                v.id,
                                VerificationStatus.APPROVED,
                                notes || 'Your verification is approved successfully by admin.',
                                target
                              );
                            }, 'Verification approved')}>
                              <ShieldCheck className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button disabled={busy} className={btnNo} onClick={() => run(async () => {
                              await dbOperations.handleVerificationApproval(v.id, VerificationStatus.REJECTED, notes || 'Documents rejected. Please re-upload valid IDs.');
                            }, 'Verification rejected')}>
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Users */}
        {activeTab === 'users' && (
          <div className={`${card} overflow-hidden`}>
            <div className="p-4 border-b border-ink-200 dark:border-ink-800 flex flex-wrap gap-3 items-center justify-between">
              <span className="font-sans font-bold text-sm text-ink-900 dark:text-white">Users ({filteredUsers.length})</span>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-ink-400" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search name, email, phone…" className={`${inp} pl-8 w-64`} />
              </div>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-800 max-h-[70vh] overflow-y-auto">
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUser.id;
                const onlyAdminSelf = isSelf && adminCount <= 1 && (u.role === UserRole.ADMIN || u.role === UserRole.SUPER_ADMIN);
                return (
                  <div key={u.id} className="p-4 flex flex-col sm:flex-row gap-3 justify-between text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-sm text-ink-950 dark:text-white">{u.fullName}</span>
                        <span className="text-ink-400">@{u.username}</span>
                        {u.isSuspended && <span className="px-1.5 py-0.5 bg-ink-500/10 text-ink-500 rounded text-xs font-bold">SUSPENDED</span>}
                        {isSelf && <span className="px-1.5 py-0.5 bg-jade-500/10 text-jade-600 rounded text-xs font-bold">YOU</span>}
                      </div>
                      <p className="text-ink-500 font-mono truncate">{u.email} · {u.phoneNumber || '—'} · Trust {u.trustScore} · {u.role}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={u.role} disabled={busy} className={`${inp} w-auto`} onChange={(e) => {
                        const role = e.target.value as UserRole;
                        if (onlyAdminSelf && role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
                          toast(undefined, 'Cannot demote yourself — you are the only admin.');
                          return;
                        }
                        void run(async () => {
                          const res = await dbOperations.adminSetUserRole(u.id, role);
                          if (res && 'error' in res && res.error) throw new Error(res.error);
                        }, `Role updated to ${role}`);
                      }}>
                        {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button disabled={busy} className={u.isSuspended ? btnOk : btnNo} onClick={() => run(async () => {
                        const res = await dbOperations.adminSuspendUser(u.id, !u.isSuspended);
                        if (res && 'error' in res && res.error) throw new Error(res.error);
                      }, u.isSuspended ? 'User reinstated' : 'User suspended')}>
                        {u.isSuspended ? <><RotateCcw className="w-3 h-3" /> Reinstate</> : <><Ban className="w-3 h-3" /> Suspend</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Products */}
        {activeTab === 'products' && (
          <div className={`${card} overflow-hidden`}>
            <div className="p-4 border-b border-ink-200 dark:border-ink-800 flex flex-wrap gap-3 items-center justify-between">
              <span className="font-sans font-bold text-sm text-ink-900 dark:text-white">Products ({filteredProducts.length})</span>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-ink-400" />
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products…" className={`${inp} pl-8 w-64`} />
              </div>
            </div>
            <div className="divide-y divide-ink-100 dark:divide-ink-800 max-h-[70vh] overflow-y-auto">
              {filteredProducts.length === 0 && <div className="p-12 text-center text-xs text-ink-400">No products found.</div>}
              {filteredProducts.map((p) => {
                const draft = productDrafts[p.id] ?? { price: String(p.price), stockStatus: p.stockStatus };
                return (
                  <div key={p.id} className="p-4 flex flex-col lg:flex-row gap-3 justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-ink-950 dark:text-white block truncate">{p.title}</span>
                      <p className="text-ink-400 font-mono mt-0.5">#{p.id} · {p.category} · Seller {p.sellerId} · Qty {p.quantity}</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Price ₦">
                        <input type="number" value={draft.price} onChange={(e) => setProductDrafts((s) => ({ ...s, [p.id]: { ...draft, price: e.target.value } }))} className={`${inp} w-28`} />
                      </Field>
                      <Field label="Stock">
                        <select value={draft.stockStatus} onChange={(e) => setProductDrafts((s) => ({ ...s, [p.id]: { ...draft, stockStatus: e.target.value } }))} className={`${inp} w-36`}>
                          <option value="IN_STOCK">IN_STOCK</option>
                          <option value="LOW_STOCK">LOW_STOCK</option>
                          <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
                        </select>
                      </Field>
                      <button disabled={busy} className={btnOk} onClick={() => run(async () => {
                        const res = await dbOperations.adminUpdateProduct(p.id, {
                          price: parseFloat(draft.price) || 0,
                          stockStatus: draft.stockStatus as 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK',
                        });
                        if (res && 'error' in res && res.error) throw new Error(res.error);
                        setProductDrafts((s) => { const n = { ...s }; delete n[p.id]; return n; });
                      }, 'Product updated')}>Save</button>
                      <button disabled={busy} className={btnNo} onClick={async () => {
                        if (!(await confirmDialog({ title: 'Delete product', message: `Delete product “${p.title}”? This cannot be undone.`, confirmText: 'Delete', danger: true }))) return;
                        void run(async () => {
                          const res = await dbOperations.adminDeleteProduct(p.id);
                          if (res && 'error' in res && res.error) throw new Error(res.error);
                        }, 'Product deleted');
                      }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orders / Escrow */}
        {activeTab === 'orders_escrow' && (
          <div className="space-y-3">
            {(db.orders || []).length === 0 ? (
              <div className={`${card} p-12 text-center text-xs text-ink-400`}>No orders yet.</div>
            ) : (db.orders || []).map((order) => {
              const escrow = (db.escrows || []).find((e) => e.orderId === order.id);
              const notes = escrowNotes[order.id] ?? '';
              const held = escrow && !escrow.isReleased && !escrow.isRefunded ? escrow.heldAmount : 0;
              const closed = !escrow || !!escrow.isReleased || !!escrow.isRefunded;
              return (
                <div key={order.id} className={`${card} p-4 space-y-3 text-xs`}>
                  <div className="flex flex-col sm:flex-row justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-sm text-ink-900 dark:text-white">{order.orderNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${statusBadge(order.status)}`}>{order.status}</span>
                        {escrow?.isReleased && <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${statusBadge('RELEASED')}`}>RELEASED</span>}
                        {escrow?.isRefunded && <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${statusBadge('REFUNDED')}`}>REFUNDED</span>}
                      </div>
                      <p className="text-ink-400 mt-1 font-mono">{order.productTitle} · ₦{order.totalAmount.toLocaleString()} · Held ₦{held.toLocaleString()}</p>
                      <p className="text-ink-600 dark:text-ink-400 font-mono font-bold mt-1">Delivery PIN: {order.deliveryPin}</p>
                    </div>
                    <div className="text-right text-ink-400 font-mono">Buyer #{order.buyerId} · Seller #{order.sellerId}</div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input placeholder="Notes for force actions" value={notes} onChange={(e) => setEscrowNotes((s) => ({ ...s, [order.id]: e.target.value }))} className={`${inp} flex-1`} />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy} className={btnOk} onClick={() => run(async () => { await dbOperations.adminUpdateOrderStatus(order.id, OrderStatus.SHIPPED); }, 'Marked as shipped')}>Ship</button>
                      <button disabled={busy} className={btnOk} onClick={() => run(async () => { await dbOperations.adminUpdateOrderStatus(order.id, OrderStatus.OUT_FOR_DELIVERY); }, 'Out for delivery')}>Out for delivery</button>
                      <button disabled={busy || closed} className={btnOk} onClick={async () => {
                        if (!(await confirmDialog({ title: 'Force release', message: 'Force release funds to the seller? This cannot be undone.', confirmText: 'Release funds' }))) return;
                        void run(async () => {
                          const res = await dbOperations.adminForceEscrowAction(order.id, 'RELEASE_SELLER', notes || 'Admin force release to seller');
                          if (res && 'error' in res && res.error) throw new Error(res.error);
                        }, 'Escrow released to seller');
                      }}>Force Release</button>
                      <button disabled={busy || closed} className={btnNo} onClick={async () => {
                        if (!(await confirmDialog({ title: 'Force refund', message: 'Force refund the buyer? This cannot be undone.', confirmText: 'Refund buyer', danger: true }))) return;
                        void run(async () => {
                          const res = await dbOperations.adminForceEscrowAction(order.id, 'REFUND_BUYER', notes || 'Admin force refund to buyer');
                          if (res && 'error' in res && res.error) throw new Error(res.error);
                        }, 'Escrow refunded to buyer');
                      }}>Force Refund</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Disputes */}
        {activeTab === 'disputes' && (
          <div className="space-y-3">
            {(db.disputes || []).length === 0 ? (
              <div className={`${card} p-12 text-center text-xs text-ink-400`}>No disputes.</div>
            ) : (db.disputes || []).map((d) => {
              const order = (db.orders || []).find((o) => o.id === d.orderId);
              const buyer = (db.users || []).find((u) => u.id === d.openedById);
              const notes = disputeNotes[d.id] ?? '';
              const pending = d.resolution === 'PENDING';
              return (
                <div key={d.id} className={`${card} p-4 space-y-3 text-xs`}>
                  <div>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${pending ? 'bg-ink-500/10 text-ink-500' : 'bg-ink-500/10 text-ink-500'}`}>
                      {pending ? 'PENDING' : d.resolution}
                    </span>
                    <h4 className="font-bold text-sm text-ink-900 dark:text-white mt-1">Dispute #{d.id} · {d.orderNumber}</h4>
                    <p className="text-ink-500 mt-1">Buyer: {buyer?.fullName || d.openedById} · Locked ₦{(order?.totalAmount || 0).toLocaleString()}</p>
                    <p className="text-ink-600 dark:text-ink-400 mt-1">&quot;{d.reason}&quot;</p>
                    {d.adminNotes && <p className="text-ink-400 italic mt-1">Admin: {d.adminNotes}</p>}
                  </div>
                  {pending && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input placeholder="Resolution notes" value={notes} onChange={(e) => setDisputeNotes((s) => ({ ...s, [d.id]: e.target.value }))} className={`${inp} flex-1`} />
                      <button disabled={busy} className={btnOk} onClick={() => run(async () => { await dbOperations.resolveDispute(d.id, 'RELEASE_SELLER', notes || 'Resolved in favor of seller.'); }, 'Released to seller')}>Release seller</button>
                      <button disabled={busy} className={btnNo} onClick={() => run(async () => { await dbOperations.resolveDispute(d.id, 'REFUND_BUYER', notes || 'Resolved in favor of buyer.'); }, 'Refunded to buyer')}>Refund buyer</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Dispatch */}
        {activeTab === 'dispatch' && (
          <div className={`${card} overflow-hidden`}>
            <div className="p-4 border-b border-ink-200 dark:border-ink-800">
              <span className="font-sans font-bold text-sm text-ink-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-jade-500" /> Delivery Partners
              </span>
            </div>
            {(db.deliveryPartners || []).length === 0 ? (
              <div className="p-12 text-center text-xs text-ink-400">No delivery partners.</div>
            ) : (
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {(db.deliveryPartners || []).map((p) => (
                  <div key={p.id} className="flex flex-col gap-3 p-4 text-xs">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm text-ink-950 dark:text-white">{p.fullName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${statusBadge(p.status)}`}>{p.status}</span>
                        </div>
                        <p className="text-ink-400 font-mono mt-1">{p.email} · {p.phone} · {p.vehicleType} · {p.city}, {p.state}</p>
                        <button
                          onClick={() => setExpandedPartner(expandedPartner === p.id ? null : p.id)}
                          className="mt-1.5 flex items-center gap-1 text-xs font-bold text-jade-500 hover:underline cursor-pointer"
                        >
                          {expandedPartner === p.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {expandedPartner === p.id ? 'Hide rider file' : 'View rider file & documents'}
                        </button>
                      </div>
                      {p.status === 'PENDING' && (
                        <div className="flex flex-col gap-2 sm:min-w-[220px]">
                          <input
                            placeholder="Rejection reason (optional)"
                            value={partnerReasons[p.id] ?? ''}
                            onChange={(e) => setPartnerReasons((s) => ({ ...s, [p.id]: e.target.value }))}
                            className={inp}
                          />
                          <div className="flex items-start gap-2">
                            <button disabled={busy} className={btnOk} onClick={() => run(async () => {
                              const res = await dbOperations.approveDeliveryPartner(p.id);
                              if (!res) throw new Error('Partner not found');
                            }, 'Partner approved')}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button disabled={busy} className={btnNo} onClick={() => run(async () => {
                              const res = await dbOperations.adminRejectDeliveryPartner(p.id, partnerReasons[p.id]);
                              if (res && 'error' in res && res.error) throw new Error(res.error);
                            }, 'Partner rejected')}>Reject</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {expandedPartner === p.id && (
                      <div className="space-y-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/40">
                        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {[
                            ['Legal name', p.fullName],
                            ['Email', p.email],
                            ['Phone', p.phone],
                            ['NIN', p.nin || '—'],
                            ['Vehicle', `${p.brand || '—'} ${p.model || ''} · ${p.vehicleType}`],
                            ['Plate number', p.plateNumber || '—'],
                            ['Colour / year', `${p.color || '—'} · ${p.year || '—'}`],
                            ['Capacity', p.capacity || '—'],
                            ['Address', p.address || '—'],
                            ['City / state', `${p.city}, ${p.state}`],
                            ['Trust score', `${p.trustScore}%`],
                            ['Deliveries', String(p.completedDeliveries)],
                            ['Applied', new Date(p.createdAt).toLocaleString()],
                            ...(p.reviewedAt
                              ? [['Reviewed', `${new Date(p.reviewedAt).toLocaleString()} by admin #${p.reviewedBy ?? '—'}`]]
                              : []),
                          ].map(([label, value]) => (
                            <div key={label} className="min-w-0">
                              <dt className="text-xs font-bold text-ink-400">{label}</dt>
                              <dd className="truncate text-xs text-ink-800 dark:text-ink-200">{String(value)}</dd>
                            </div>
                          ))}
                        </dl>

                        <div className="space-y-2">
                          <p className="text-xs font-bold text-ink-500">Uploaded documents</p>
                          {(() => {
                            const docs = [
                              ...(p.photoUrl ? [{ label: 'Profile photo', url: p.photoUrl }] : []),
                              ...(p.selfieUrl ? [{ label: 'Selfie verification', url: p.selfieUrl }] : []),
                              ...(p.licenseUrl ? [{ label: "Driver's licence", url: p.licenseUrl }] : []),
                              ...(p.documents || []),
                            ];
                            return docs.length === 0 ? (
                              <p className="text-xs text-ink-400">No files were uploaded with this application.</p>
                            ) : (
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {docs.map((doc: any, i: number) => (
                                  <a
                                    key={`${doc.label}-${i}`}
                                    href={doc.url || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group overflow-hidden rounded-lg border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900"
                                  >
                                    {doc.url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={doc.url} alt={doc.label} className="h-24 w-full object-cover transition-transform group-hover:scale-105" />
                                    ) : (
                                      <div className="grid h-24 place-items-center bg-ink-100 text-ink-400 dark:bg-ink-800">
                                        <ImageIcon className="w-5 h-5" />
                                      </div>
                                    )}
                                    <span className="block truncate px-2 py-1.5 text-xs font-semibold text-ink-600 dark:text-ink-300">
                                      {doc.label}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {p.rejectionReason && (
                          <p className="text-xs italic text-ink-500">Rejection reason: {p.rejectionReason}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reports — user-submitted flags on users, listings, messages, orders */}
        {activeTab === 'reports' && (
          <div className={`${card} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 p-4 dark:border-ink-800">
              <span className="flex items-center gap-2 font-sans font-bold text-sm text-ink-900 dark:text-white">
                <Flag className="w-4 h-4 text-jade-500" /> Reports ({filteredReports.length})
              </span>
              <div className="flex flex-wrap gap-1">
                {(['ALL', ...REPORT_STATUSES] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setReportFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                      reportFilter === f ? 'bg-jade-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <div className="p-12 text-center text-xs text-ink-400">No reports in this filter.</div>
            ) : (
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {filteredReports.map((r) => {
                  const reporter = (db.users || []).find((u) => u.id === r.reporterId);
                  const notes = reportNotes[r.id] ?? r.adminNotes ?? '';
                  return (
                    <div key={r.id} className="flex flex-col justify-between gap-4 p-4 text-xs lg:flex-row">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-600 text-xs font-bold dark:bg-ink-800 dark:text-ink-300">
                            {r.targetType}
                          </span>
                          <span className="font-bold text-sm text-ink-950 dark:text-white">{r.reason}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${statusBadge(r.status)}`}>{r.status}</span>
                        </div>
                        <p className="break-words text-ink-600 dark:text-ink-300">
                          <strong className="text-ink-700 dark:text-ink-200">Target:</strong> {r.targetLabel || `#${r.targetId}`}
                        </p>
                        {r.details && (
                          <p className="max-w-2xl whitespace-pre-wrap text-ink-500">{r.details}</p>
                        )}
                        <p className="text-ink-400">
                          Filed by {reporter?.fullName || `User ${r.reporterId ?? '—'}`} ·{' '}
                          {new Date(r.createdAt).toLocaleString()}
                          {r.resolvedAt ? ` · Resolved ${new Date(r.resolvedAt).toLocaleString()}` : ''}
                        </p>
                        {r.evidenceUrl && (
                          <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-jade-500 hover:underline">
                            <ExternalLink className="w-3 h-3" /> View evidence
                          </a>
                        )}
                      </div>

                      <div className="flex min-w-[240px] flex-col gap-2">
                        <input
                          placeholder="Admin notes"
                          value={notes}
                          onChange={(e) => setReportNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                          className={inp}
                        />
                        <div className="flex flex-wrap gap-2">
                          {REPORT_STATUSES.filter((s) => s !== r.status).map((s) => (
                            <button
                              key={s}
                              disabled={busy}
                              className={s === 'DISMISSED' ? btnNo : btnOk}
                              onClick={() => run(async () => {
                                const res = await dbOperations.adminUpdateReport(r.id, { status: s, adminNotes: notes });
                                if (res && 'error' in res && res.error) throw new Error(res.error);
                              }, `Report marked ${s}`)}
                            >
                              Mark {s}
                            </button>
                          ))}
                          <button
                            disabled={busy}
                            className={btnNo}
                            onClick={() => run(async () => {
                              const ok = await confirmDialog({
                                title: 'Delete report',
                                message: 'Remove this report permanently?',
                                confirmText: 'Delete',
                                danger: true,
                              });
                              if (!ok) return;
                              const res = await dbOperations.adminDeleteReport(r.id);
                              if (res && 'error' in res && res.error) throw new Error(res.error);
                            }, 'Report deleted')}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Coverage — the states & cities GoodSale sells in and delivers to */}
        {activeTab === 'coverage' && (
          <div className="space-y-6">
            <div className={`${card} p-5`}>
              <h3 className="flex items-center gap-2 font-sans font-bold text-lg text-ink-900 dark:text-white">
                <MapPinned className="w-5 h-5 text-jade-500" /> Service coverage
              </h3>
              <p className="mt-1 text-xs text-ink-500">
                Choose where GoodSale is active. Sellers can only list in sales areas, riders only
                accept deliveries in delivery areas, and the whole app reads these lists for its
                state and city pickers. {salesAreaCount} of {serviceAreas.length} areas are open for
                sales and {deliveryAreaCount} for delivery.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-ink-500">State</label>
                  <select value={areaState} onChange={(e) => { setAreaState(e.target.value); setAreaCity(''); }} className={inp}>
                    {NG_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-ink-500">City / area</label>
                  <input
                    value={areaCity}
                    onChange={(e) => setAreaCity(e.target.value)}
                    list="goodsale-known-cities"
                    placeholder="e.g. Lekki"
                    className={inp}
                  />
                  <datalist id="goodsale-known-cities">
                    {dbOperations.serviceCities(areaState).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="flex items-end">
                  <button
                    disabled={busy || !areaCity.trim()}
                    className={`${btnOk} w-full justify-center py-2.5`}
                    onClick={() => run(async () => {
                      const res = await dbOperations.adminUpsertServiceArea({
                        state: areaState,
                        city: areaCity.trim(),
                        salesEnabled: areaSales,
                        deliveryEnabled: areaDelivery,
                      });
                      if (res && 'error' in res && res.error) throw new Error(res.error);
                      setAreaCity('');
                    }, 'Coverage saved')}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add / update
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-600 dark:text-ink-300">
                  <input type="checkbox" checked={areaSales} onChange={(e) => setAreaSales(e.target.checked)} className="h-4 w-4 accent-jade-500" />
                  Selling allowed here
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-600 dark:text-ink-300">
                  <input type="checkbox" checked={areaDelivery} onChange={(e) => setAreaDelivery(e.target.checked)} className="h-4 w-4 accent-jade-500" />
                  Delivery accepted here
                </label>
              </div>
            </div>

            <div className={`${card} overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 p-4 dark:border-ink-800">
                <span className="flex items-center gap-2 font-sans font-bold text-sm text-ink-900 dark:text-white">
                  <MapPin className="w-4 h-4 text-jade-500" /> Areas ({filteredAreas.length})
                </span>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-ink-400" />
                  <input
                    value={areaQuery}
                    onChange={(e) => setAreaQuery(e.target.value)}
                    placeholder="Search state or city…"
                    className={`${inp} w-56 pl-8`}
                  />
                </div>
              </div>

              {filteredAreas.length === 0 ? (
                <div className="p-12 text-center text-xs text-ink-400">No coverage areas yet.</div>
              ) : (
                <div className="divide-y divide-ink-100 dark:divide-ink-800">
                  {filteredAreas.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-ink-950 dark:text-white">{a.city}</p>
                        <p className="text-ink-400">{a.state}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          disabled={busy}
                          onClick={() => run(async () => {
                            const res = await dbOperations.adminToggleServiceArea(a.id, { salesEnabled: !a.salesEnabled });
                            if (res && 'error' in res && res.error) throw new Error(res.error);
                          }, 'Coverage updated')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            a.salesEnabled ? 'bg-jade-500/15 text-jade-700 dark:text-jade-300' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                          }`}
                          title="Toggle selling in this city"
                        >
                          {a.salesEnabled ? 'Selling on' : 'Selling off'}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => run(async () => {
                            const res = await dbOperations.adminToggleServiceArea(a.id, { deliveryEnabled: !a.deliveryEnabled });
                            if (res && 'error' in res && res.error) throw new Error(res.error);
                          }, 'Coverage updated')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            a.deliveryEnabled ? 'bg-jade-500/15 text-jade-700 dark:text-jade-300' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                          }`}
                          title="Toggle delivery in this city"
                        >
                          {a.deliveryEnabled ? 'Delivery on' : 'Delivery off'}
                        </button>
                        <button
                          disabled={busy}
                          className={btnNo}
                          onClick={() => run(async () => {
                            const ok = await confirmDialog({
                              title: 'Remove area',
                              message: `Stop operating in ${a.city}, ${a.state}?`,
                              confirmText: 'Remove',
                              danger: true,
                            });
                            if (!ok) return;
                            const res = await dbOperations.adminDeleteServiceArea(a.id);
                            if (res && 'error' in res && res.error) throw new Error(res.error);
                          }, 'Area removed')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className={`${card} p-4 flex items-start gap-3`}>
              <AlertTriangle className="w-4 h-4 text-ink-500 mt-0.5 shrink-0" />
              <p className="text-xs text-ink-500 dark:text-ink-400 leading-relaxed">
                <strong className="text-ink-700 dark:text-ink-300">System:</strong> Cloud sync and production ops — see{' '}
                <code className="font-mono text-xs text-jade-600 dark:text-jade-400">PRODUCTION.md</code>.
              </p>
            </div>

            {currentUser && <AnnouncementStudio />}

            {currentUser && <AdStudio currentUser={currentUser} />}

            <div className={`${card} p-5 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
              <div>
                <h3 className="font-sans font-bold text-lg text-ink-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-jade-500" /> Revenue & Payment Settings
                </h3>
                <p className="text-xs text-ink-500 mt-1">Commissions, tiers, escrow fees, and checkout channels.</p>
              </div>
              <div className="flex items-center gap-1.5 bg-jade-500/10 text-jade-500 font-mono text-xs px-2.5 py-1.5 rounded-lg">
                <Activity className="w-3.5 h-3.5" /> Live
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => {
                  const num = (k: keyof typeof fees) => parseFloat(fees[k]) || 0;
                  const res = dbOperations.updateRevenueSettings(currentUser.id, {
                    platformFeeEnabled,
                    escrowPercentageFee: num('escrowPercentageFee'),
                    escrowMinFee: num('escrowMinFee'),
                    escrowMaxFee: num('escrowMaxFee'),
                    deliveryCommissionPercentage: num('deliveryCommissionPercentage'),
                    subProPrice: num('subProPrice'),
                    subPremiumPrice: num('subPremiumPrice'),
                    subEnterprisePrice: num('subEnterprisePrice'),
                    verifiedPlusPrice: num('verifiedPlusPrice'),
                    flashSaleFeaturePrice: num('flashSaleFeaturePrice'),
                    auctionSuccessFeePercentage: num('auctionSuccessFeePercentage'),
                    adCpcPrice: num('adCpcPrice'),
                    goodSaleProtectFee: num('goodSaleProtectFee'),
                  });
                  const res2 = dbOperations.updatePaymentSettings(currentUser.id, { enabledMethods });
                  if (!res.success || !res2.success) throw new Error('Failed to save settings');
                }, 'Settings saved');
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${card} p-5 space-y-3`}>
                  <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800 pb-2">
                    <Scale className="w-4 h-4 text-jade-500" /><h4 className="font-bold text-sm text-ink-900 dark:text-white">Platform Fee (per item)</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPlatformFeeEnabled((v) => !v)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${platformFeeEnabled ? 'border-jade-500/40 bg-jade-500/[0.04]' : 'border-ink-200 dark:border-ink-800'}`}
                  >
                    <div>
                      <div className="font-bold text-xs text-ink-800 dark:text-ink-200">
                        {platformFeeEnabled ? 'Charging platform fee' : 'Fees off — buyers pay 0%'}
                      </div>
                      <div className="text-xs text-ink-400 mt-0.5">
                        {platformFeeEnabled
                          ? `Buyers pay ${fees.escrowPercentageFee || 0}% per item (clamped to min/max below).`
                          : 'Launch mode: everything is free except delivery. Turn on to start charging.'}
                      </div>
                    </div>
                    <span
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${platformFeeEnabled ? 'bg-jade-500' : 'bg-ink-300 dark:bg-ink-700'}`}
                      aria-hidden="true"
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${platformFeeEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                  </button>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Fee % per item"><input type="number" step="0.05" min="0" value={fees.escrowPercentageFee} onChange={(e) => setFee('escrowPercentageFee', e.target.value)} className={inp} required /></Field>
                    <Field label="Min ₦"><input type="number" value={fees.escrowMinFee} onChange={(e) => setFee('escrowMinFee', e.target.value)} className={inp} required /></Field>
                    <Field label="Max ₦"><input type="number" value={fees.escrowMaxFee} onChange={(e) => setFee('escrowMaxFee', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3`}>
                  <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800 pb-2">
                    <Percent className="w-4 h-4 text-jade-500" /><h4 className="font-bold text-sm text-ink-900 dark:text-white">Delivery & Protect</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Courier %"><input type="number" step="0.5" value={fees.deliveryCommissionPercentage} onChange={(e) => setFee('deliveryCommissionPercentage', e.target.value)} className={inp} required /></Field>
                    <Field label="Protect ₦"><input type="number" value={fees.goodSaleProtectFee} onChange={(e) => setFee('goodSaleProtectFee', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3`}>
                  <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800 pb-2">
                    <Award className="w-4 h-4 text-jade-500" /><h4 className="font-bold text-sm text-ink-900 dark:text-white">Subscriptions ₦/mo</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Pro"><input type="number" value={fees.subProPrice} onChange={(e) => setFee('subProPrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Premium"><input type="number" value={fees.subPremiumPrice} onChange={(e) => setFee('subPremiumPrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Enterprise"><input type="number" value={fees.subEnterprisePrice} onChange={(e) => setFee('subEnterprisePrice', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3`}>
                  <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800 pb-2">
                    <Sparkles className="w-4 h-4 text-jade-500" /><h4 className="font-bold text-sm text-ink-900 dark:text-white">Listing Features</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Verified+ ₦"><input type="number" value={fees.verifiedPlusPrice} onChange={(e) => setFee('verifiedPlusPrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Flash Sale ₦"><input type="number" value={fees.flashSaleFeaturePrice} onChange={(e) => setFee('flashSaleFeaturePrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Auction %"><input type="number" step="0.1" value={fees.auctionSuccessFeePercentage} onChange={(e) => setFee('auctionSuccessFeePercentage', e.target.value)} className={inp} required /></Field>
                    <Field label="Ads CPC ₦"><input type="number" value={fees.adCpcPrice} onChange={(e) => setFee('adCpcPrice', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3 md:col-span-2`}>
                  <div className="flex items-center gap-2 border-b border-ink-100 dark:border-ink-800 pb-2">
                    <Shield className="w-4 h-4 text-jade-500" /><h4 className="font-bold text-sm text-ink-900 dark:text-white">Checkout Channels</h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {PAY_METHODS.map((m) => {
                      const on = enabledMethods.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={'locked' in m && m.locked}
                          onClick={() => {
                            if ('locked' in m && m.locked) return;
                            setEnabledMethods(on ? enabledMethods.filter((x) => x !== m.id) : [...enabledMethods, m.id]);
                          }}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 ${on ? 'border-jade-500/40 bg-jade-500/[0.04]' : 'border-ink-200 dark:border-ink-800'}`}
                        >
                          <m.Icon className="w-4 h-4 text-jade-500 mb-1" />
                          <div className="font-bold text-xs text-ink-800 dark:text-ink-200">{m.name}</div>
                          <div className="text-xs text-ink-400 mt-0.5">{on ? 'On' : 'Off'}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={busy} className={`${btnOk} px-5 py-2.5`}>
                  <Settings className="w-4 h-4" /> Save configurations
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
