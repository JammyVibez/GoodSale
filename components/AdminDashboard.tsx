// components/AdminDashboard.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert, ShieldCheck, FileCheck, CheckCircle2, XCircle, Scale, DollarSign,
  Wallet, ClipboardList, Settings, Award, Sparkles, Percent, Activity, Shield,
  CreditCard, Truck, FileText, Coins, Users, Package, Search, Ban, RotateCcw,
  ExternalLink, AlertTriangle,
} from 'lucide-react';
import {
  dbOperations, UserRole, VerificationStatus, OrderStatus, useDBState,
} from '../lib/store';
import { createClient } from '@/lib/supabase/client';

type Tab = 'verifications' | 'users' | 'products' | 'orders_escrow' | 'disputes' | 'dispatch' | 'settings';

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
  'w-full bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 px-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono';
const btnOk =
  'px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';
const btnNo =
  'px-3 py-1.5 bg-white dark:bg-slate-900 text-red-500 hover:bg-red-500/10 border border-gray-200 dark:border-slate-800 font-bold text-xs rounded-lg transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1';
const card = 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 mb-1">{label}</label>
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

  // Admin access is decided by the database role (granted by another admin),
  // never auto-elevated from the browser.

  useEffect(() => {
    if (!rs) return;
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

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <Scale className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Admin Control Room</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">Sign in as an authorized administrator to continue.</p>
        <button onClick={onOpenAuth} className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer">
          Sign In / Register Account
        </button>
      </div>
    );
  }

  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Access Strictly Restricted</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Reserved for platform administrators only.</p>
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
    { id: 'settings', label: 'Settings' },
  ];

  const metrics = [
    { label: 'Users', value: String((db.users || []).length), Icon: Users, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Products', value: String((db.products || []).length), Icon: Package, color: 'text-sky-500 bg-sky-500/10' },
    { label: 'Open Escrow Held', value: `₦${openEscrowHeld.toLocaleString()}`, Icon: Wallet, color: 'text-emerald-500 bg-emerald-500/10' },
    { label: 'Pending Verifications', value: String(pendingVerifications.length), Icon: ClipboardList, color: 'text-amber-500 bg-amber-500/10' },
    { label: 'Open Disputes', value: String(openDisputes.length), Icon: Scale, color: 'text-red-500 bg-red-500/10' },
    { label: 'Pending Partners', value: String(pendingPartners.length), Icon: Truck, color: 'text-violet-500 bg-violet-500/10' },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 'bg-amber-500/10 text-amber-600',
      APPROVED: 'bg-emerald-500/10 text-emerald-600',
      REJECTED: 'bg-red-500/10 text-red-500',
      RELEASED: 'bg-emerald-500/10 text-emerald-600',
      REFUNDED: 'bg-red-500/10 text-red-500',
    };
    return map[status] || 'bg-gray-100 dark:bg-slate-800 text-slate-500';
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-screen py-8 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="font-sans font-extrabold text-2xl text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-emerald-500" /> GoodSale Admin Control Room
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Signed in as {currentUser.fullName} · {currentUser.role}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 bg-gray-100 dark:bg-slate-900 p-1 rounded-xl">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-2 rounded-lg text-xs font-sans font-bold transition-all cursor-pointer ${
                  activeTab === t.id ? 'bg-emerald-500 text-white shadow' : 'text-slate-700 dark:text-slate-400 hover:text-white'
                }`}
              >
                {t.label}{typeof t.count === 'number' ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>
        </div>

        {actionSuccess && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500 font-bold text-xs text-center">{actionSuccess}</div>
        )}
        {actionError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 font-bold text-xs text-center">{actionError}</div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {metrics.map((m) => (
            <div key={m.label} className={`${card} p-4 flex items-center justify-between gap-2`}>
              <div className="min-w-0">
                <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider block truncate">{m.label}</span>
                <span className="font-sans font-extrabold text-sm sm:text-base text-slate-950 dark:text-white block mt-0.5 truncate">{m.value}</span>
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
            <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="font-sans font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-500" /> Identity Verifications
              </span>
              <div className="flex gap-1">
                {(['ALL', VerificationStatus.PENDING, VerificationStatus.APPROVED, VerificationStatus.REJECTED] as const).map((f) => (
                  <button key={f} onClick={() => setVerFilter(f)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${verFilter === f ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-slate-800 text-slate-500'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {filteredVerifications.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">No verifications in this filter.</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
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
                          <span className="font-bold text-sm text-slate-950 dark:text-white">{v.fullName}</span>
                          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-500 rounded text-[9px] font-bold">@{applicant?.username || 'user'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge(v.status)}`}>{v.status}</span>
                        </div>
                        <p className="text-gray-400 font-mono">#{v.id} · User {v.userId} · {v.documentType} ({v.documentNumber})</p>
                        {v.documentImageUrl ? (
                          <a href={v.documentImageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-500 font-bold hover:underline">
                            <ExternalLink className="w-3 h-3" /> View document
                          </a>
                        ) : <span className="text-slate-400">No document image</span>}
                        {v.adminNotes && <p className="text-slate-500 italic">Notes: {v.adminNotes}</p>}
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
            <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between">
              <span className="font-sans font-bold text-sm text-slate-900 dark:text-white">Users ({filteredUsers.length})</span>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search name, email, phone…" className={`${inp} pl-8 w-64`} />
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-[70vh] overflow-y-auto">
              {filteredUsers.map((u) => {
                const isSelf = u.id === currentUser.id;
                const onlyAdminSelf = isSelf && adminCount <= 1 && (u.role === UserRole.ADMIN || u.role === UserRole.SUPER_ADMIN);
                return (
                  <div key={u.id} className="p-4 flex flex-col sm:flex-row gap-3 justify-between text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-950 dark:text-white">{u.fullName}</span>
                        <span className="text-slate-400">@{u.username}</span>
                        {u.isSuspended && <span className="px-1.5 py-0.5 bg-red-500/10 text-red-500 rounded text-[9px] font-bold">SUSPENDED</span>}
                        {isSelf && <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 rounded text-[9px] font-bold">YOU</span>}
                      </div>
                      <p className="text-slate-500 font-mono truncate">{u.email} · {u.phoneNumber || '—'} · Trust {u.trustScore} · {u.role}</p>
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
            <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between">
              <span className="font-sans font-bold text-sm text-slate-900 dark:text-white">Products ({filteredProducts.length})</span>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products…" className={`${inp} pl-8 w-64`} />
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-[70vh] overflow-y-auto">
              {filteredProducts.length === 0 && <div className="p-12 text-center text-xs text-slate-400">No products found.</div>}
              {filteredProducts.map((p) => {
                const draft = productDrafts[p.id] ?? { price: String(p.price), stockStatus: p.stockStatus };
                return (
                  <div key={p.id} className="p-4 flex flex-col lg:flex-row gap-3 justify-between text-xs">
                    <div className="min-w-0">
                      <span className="font-bold text-sm text-slate-950 dark:text-white block truncate">{p.title}</span>
                      <p className="text-slate-400 font-mono mt-0.5">#{p.id} · {p.category} · Seller {p.sellerId} · Qty {p.quantity}</p>
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
                      <button disabled={busy} className={btnNo} onClick={() => {
                        if (!confirm(`Delete product “${p.title}”?`)) return;
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
              <div className={`${card} p-12 text-center text-xs text-slate-400`}>No orders yet.</div>
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
                        <span className="font-bold text-sm text-slate-900 dark:text-white">{order.orderNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge(order.status)}`}>{order.status}</span>
                        {escrow?.isReleased && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge('RELEASED')}`}>RELEASED</span>}
                        {escrow?.isRefunded && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge('REFUNDED')}`}>REFUNDED</span>}
                      </div>
                      <p className="text-slate-400 mt-1 font-mono">{order.productTitle} · ₦{order.totalAmount.toLocaleString()} · Held ₦{held.toLocaleString()}</p>
                      <p className="text-amber-600 dark:text-amber-400 font-mono font-bold mt-1">Delivery PIN: {order.deliveryPin}</p>
                    </div>
                    <div className="text-right text-slate-400 font-mono">Buyer #{order.buyerId} · Seller #{order.sellerId}</div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input placeholder="Notes for force actions" value={notes} onChange={(e) => setEscrowNotes((s) => ({ ...s, [order.id]: e.target.value }))} className={`${inp} flex-1`} />
                    <div className="flex flex-wrap gap-2">
                      <button disabled={busy} className={btnOk} onClick={() => run(async () => { await dbOperations.adminUpdateOrderStatus(order.id, OrderStatus.SHIPPED); }, 'Marked as shipped')}>Ship</button>
                      <button disabled={busy} className={btnOk} onClick={() => run(async () => { await dbOperations.adminUpdateOrderStatus(order.id, OrderStatus.OUT_FOR_DELIVERY); }, 'Out for delivery')}>Out for delivery</button>
                      <button disabled={busy || closed} className={btnOk} onClick={() => {
                        if (!confirm('Force release funds to seller?')) return;
                        void run(async () => {
                          const res = await dbOperations.adminForceEscrowAction(order.id, 'RELEASE_SELLER', notes || 'Admin force release to seller');
                          if (res && 'error' in res && res.error) throw new Error(res.error);
                        }, 'Escrow released to seller');
                      }}>Force Release</button>
                      <button disabled={busy || closed} className={btnNo} onClick={() => {
                        if (!confirm('Force refund to buyer?')) return;
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
              <div className={`${card} p-12 text-center text-xs text-slate-400`}>No disputes.</div>
            ) : (db.disputes || []).map((d) => {
              const order = (db.orders || []).find((o) => o.id === d.orderId);
              const buyer = (db.users || []).find((u) => u.id === d.openedById);
              const notes = disputeNotes[d.id] ?? '';
              const pending = d.resolution === 'PENDING';
              return (
                <div key={d.id} className={`${card} p-4 space-y-3 text-xs`}>
                  <div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${pending ? 'bg-red-500/10 text-red-500' : 'bg-slate-500/10 text-slate-500'}`}>
                      {pending ? 'PENDING' : d.resolution}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-1">Dispute #{d.id} · {d.orderNumber}</h4>
                    <p className="text-slate-500 mt-1">Buyer: {buyer?.fullName || d.openedById} · Locked ₦{(order?.totalAmount || 0).toLocaleString()}</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">&quot;{d.reason}&quot;</p>
                    {d.adminNotes && <p className="text-slate-400 italic mt-1">Admin: {d.adminNotes}</p>}
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
            <div className="p-4 border-b border-gray-200 dark:border-slate-800">
              <span className="font-sans font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-500" /> Delivery Partners
              </span>
            </div>
            {(db.deliveryPartners || []).length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">No delivery partners.</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {(db.deliveryPartners || []).map((p) => (
                  <div key={p.id} className="p-4 flex flex-col sm:flex-row justify-between gap-3 text-xs">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-950 dark:text-white">{p.fullName}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge(p.status)}`}>{p.status}</span>
                      </div>
                      <p className="text-slate-400 font-mono mt-1">{p.email} · {p.phone} · {p.vehicleType} · {p.city}, {p.state}</p>
                    </div>
                    {p.status === 'PENDING' && (
                      <div className="flex gap-2 items-start">
                        <button disabled={busy} className={btnOk} onClick={() => run(async () => {
                          dbOperations.approveDeliveryPartner(p.id);
                          const client = createClient();
                          if (!client) throw new Error('Supabase is not configured.');
                          const { error } = await client
                            .from('delivery_partners')
                            .update({ status: 'APPROVED', is_available: true })
                            .eq('id', p.id);
                          if (error) throw new Error(error.message);
                        }, 'Partner approved')}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button disabled={busy} className={btnNo} onClick={() => run(async () => {
                          const res = await dbOperations.adminRejectDeliveryPartner(p.id);
                          if (res && 'error' in res && res.error) throw new Error(res.error);
                        }, 'Partner rejected')}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className={`${card} p-4 flex items-start gap-3`}>
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <strong className="text-slate-700 dark:text-slate-300">System:</strong> Cloud sync and production ops — see{' '}
                <code className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">PRODUCTION.md</code>.
              </p>
            </div>

            <div className={`${card} p-5 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
              <div>
                <h3 className="font-sans font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-500" /> Revenue & Payment Settings
                </h3>
                <p className="text-xs text-slate-500 mt-1">Commissions, tiers, escrow fees, and checkout channels.</p>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 font-mono text-[11px] px-2.5 py-1.5 rounded-lg">
                <Activity className="w-3.5 h-3.5" /> Live
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => {
                  const num = (k: keyof typeof fees) => parseFloat(fees[k]) || 0;
                  const res = dbOperations.updateRevenueSettings(currentUser.id, {
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
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-2">
                    <Scale className="w-4 h-4 text-emerald-500" /><h4 className="font-bold text-sm text-slate-900 dark:text-white">Escrow Fees</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Fee %"><input type="number" step="0.05" value={fees.escrowPercentageFee} onChange={(e) => setFee('escrowPercentageFee', e.target.value)} className={inp} required /></Field>
                    <Field label="Min ₦"><input type="number" value={fees.escrowMinFee} onChange={(e) => setFee('escrowMinFee', e.target.value)} className={inp} required /></Field>
                    <Field label="Max ₦"><input type="number" value={fees.escrowMaxFee} onChange={(e) => setFee('escrowMaxFee', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3`}>
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-2">
                    <Percent className="w-4 h-4 text-emerald-500" /><h4 className="font-bold text-sm text-slate-900 dark:text-white">Delivery & Protect</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Courier %"><input type="number" step="0.5" value={fees.deliveryCommissionPercentage} onChange={(e) => setFee('deliveryCommissionPercentage', e.target.value)} className={inp} required /></Field>
                    <Field label="Protect ₦"><input type="number" value={fees.goodSaleProtectFee} onChange={(e) => setFee('goodSaleProtectFee', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3`}>
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-2">
                    <Award className="w-4 h-4 text-emerald-500" /><h4 className="font-bold text-sm text-slate-900 dark:text-white">Subscriptions ₦/mo</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Pro"><input type="number" value={fees.subProPrice} onChange={(e) => setFee('subProPrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Premium"><input type="number" value={fees.subPremiumPrice} onChange={(e) => setFee('subPremiumPrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Enterprise"><input type="number" value={fees.subEnterprisePrice} onChange={(e) => setFee('subEnterprisePrice', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3`}>
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" /><h4 className="font-bold text-sm text-slate-900 dark:text-white">Listing Features</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Verified+ ₦"><input type="number" value={fees.verifiedPlusPrice} onChange={(e) => setFee('verifiedPlusPrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Flash Sale ₦"><input type="number" value={fees.flashSaleFeaturePrice} onChange={(e) => setFee('flashSaleFeaturePrice', e.target.value)} className={inp} required /></Field>
                    <Field label="Auction %"><input type="number" step="0.1" value={fees.auctionSuccessFeePercentage} onChange={(e) => setFee('auctionSuccessFeePercentage', e.target.value)} className={inp} required /></Field>
                    <Field label="Ads CPC ₦"><input type="number" value={fees.adCpcPrice} onChange={(e) => setFee('adCpcPrice', e.target.value)} className={inp} required /></Field>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3 md:col-span-2`}>
                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-2">
                    <Shield className="w-4 h-4 text-emerald-500" /><h4 className="font-bold text-sm text-slate-900 dark:text-white">Checkout Channels</h4>
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
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 ${on ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : 'border-gray-200 dark:border-slate-800'}`}
                        >
                          <m.Icon className="w-4 h-4 text-emerald-500 mb-1" />
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-200">{m.name}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">{on ? 'On' : 'Off'}</div>
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
