// components/AdminTrustSafetyPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  ShieldAlert, LifeBuoy, Flag, RotateCcw, Scale, Megaphone, UserX, Check,
  X, Send, Loader2, ExternalLink, AlertTriangle, BadgeCheck, Search, Ban,
  CircleDollarSign, Gavel, Inbox,
} from 'lucide-react';
import { useDBState, dbOperations } from '../lib/store';
import { useTrustCenter, replyToTicket, updateTicket, resolveProductAppeal } from '../lib/trustCenter';
import { computeAccountRisk, computeSellerTrust } from '../lib/trust';
import { OrderStatus, UserRole, type SupportTicket, type SupportTicketStatus } from '../lib/types';
import { toast } from '../lib/feedback';

type Tab = 'tickets' | 'appeals' | 'listings' | 'refunds' | 'accounts' | 'promotions';

const TABS: Array<{ key: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'tickets', label: 'Support tickets', Icon: LifeBuoy },
  { key: 'appeals', label: 'Listing appeals', Icon: BadgeCheck },
  { key: 'listings', label: 'Reported listings', Icon: Flag },
  { key: 'refunds', label: 'Refunds', Icon: RotateCcw },
  { key: 'accounts', label: 'Suspicious accounts', Icon: ShieldAlert },
  { key: 'promotions', label: 'Promotions', Icon: Megaphone },
];

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
  IN_REVIEW: 'bg-jade-500/10 text-jade-700 dark:text-jade-300',
  WAITING_USER: 'bg-orange-500/10 text-orange-600 dark:text-orange-300',
  RESOLVED: 'bg-jade-500/15 text-jade-700 dark:text-jade-300',
  CLOSED: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
  PENDING: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
  APPROVED: 'bg-jade-500/15 text-jade-700 dark:text-jade-300',
  REJECTED: 'bg-red-500/10 text-red-600 dark:text-red-300',
  HIGH: 'bg-red-500/10 text-red-600 dark:text-red-300',
  MEDIUM: 'bg-orange-500/10 text-orange-600 dark:text-orange-300',
  LOW: 'bg-gold-400/15 text-gold-700 dark:text-gold-300',
};

const CATEGORY_LABEL: Record<string, string> = {
  PAYMENT: 'Payment',
  DELIVERY: 'Delivery',
  ACCOUNT: 'Account',
  REFUND: 'Refund',
  SELLER_DISPUTE: 'Seller dispute',
  OTHER: 'Other',
};

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

function Pill({ value }: { value: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[value] || 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'}`}>{value.replace(/_/g, ' ')}</span>;
}

export default function AdminTrustSafetyPanel() {
  const db = useDBState();
  const { tickets, appeals } = useTrustCenter();
  const [tab, setTab] = useState<Tab>('tickets');
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [appealDraft, setAppealDraft] = useState<Record<number, string>>({});

  const openTickets = tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED');
  const pendingRefunds = db.refunds.filter((r) => r.status === 'PENDING');
  const openReports = db.reports.filter((r) => r.status === 'OPEN' || r.status === 'REVIEWING');
  const pendingAppeals = appeals.filter((a) => a.status === 'PENDING');

  const riskyAccounts = useMemo(
    () =>
      db.users
        .filter((u) => u.role !== UserRole.ADMIN && u.role !== UserRole.SUPER_ADMIN && u.role !== UserRole.BUYER)
        .map((u) => ({ user: u, risk: computeAccountRisk(db, u.id) }))
        .filter((r) => r.risk.level !== 'NONE')
        .sort((a, b) => b.risk.points - a.risk.points)
        .slice(0, 25),
    [db]
  );

  const sellerPerformance = useMemo(() => {
    return db.users
      .filter((u) => [UserRole.SELLER, UserRole.VERIFIED_SELLER, UserRole.BUSINESS, UserRole.VERIFIED_BUSINESS].includes(u.role))
      .map((u) => {
        const orders = db.orders.filter((o) => o.sellerId === u.id && o.status === OrderStatus.DELIVERED_SUCCESS);
        const trust = computeSellerTrust(db, u.id);
        return { user: u, delivered: orders.length, revenue: orders.reduce((s, o) => s + o.totalAmount, 0), trust };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [db]);

  const promotions = useMemo(() => {
    return [...db.sponsoredAds]
      .map((ad) => ({
        ...ad,
        sellerName: db.users.find((u) => u.id === ad.sellerId)?.fullName || `Seller #${ad.sellerId}`,
        ctr: ad.impressions ? (ad.clicks / ad.impressions) * 100 : 0,
      }))
      .sort((a, b) => b.spent - a.spent);
  }, [db.sponsoredAds, db.users]);

  const filteredTickets = tickets.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return t.reference.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.userName.toLowerCase().includes(q);
  });

  const selectedTicket = tickets.find((t) => t.id === openTicketId) ?? null;

  const sendAdminReply = () => {
    if (!selectedTicket || !reply.trim()) return;
    const res = replyToTicket(selectedTicket.id, reply);
    if (res.error) toast.error(res.error);
    else {
      setReply('');
      toast.success('Reply sent — buyer notified in the thread');
    }
  };

  const setStatus = (ticket: SupportTicket, status: SupportTicketStatus) => {
    const res = updateTicket(ticket.id, { status });
    if (res.error) toast.error(res.error);
    else toast.success(`Ticket ${ticket.reference} marked ${status.replace(/_/g, ' ').toLowerCase()}`);
  };

  const decideAppeal = async (appealId: number, productId: number, sellerId: number, approve: boolean) => {
    setBusy(`appeal-${appealId}`);
    const res = resolveProductAppeal(appealId, approve ? 'APPROVED' : 'REJECTED', appealDraft[appealId]);
    if (!res.error) {
      const product = db.products.find((p) => p.id === productId);
      if (product) {
        await dbOperations.adminUpdateProduct(productId, {
          moderationStatus: approve ? 'APPROVED' : 'REJECTED',
          rejectionReason: approve ? undefined : appealDraft[appealId],
          ...(approve
            ? { stockStatus: product.quantity > 0 ? (product.quantity <= 5 ? 'LOW_STOCK' as const : 'IN_STOCK' as const) : 'SOLD' as const }
            : {}),
        });
      }
      dbOperations.createCustomNotification(
        sellerId,
        approve ? 'Listing appeal approved' : 'Listing appeal declined',
        approve
          ? `Your listing is live again after review. Keep descriptions and photos accurate to stay compliant.`
          : `Your appeal was declined. ${appealDraft[appealId] || 'Review the listing standards before resubmitting.'}`,
        'VERIFICATION'
      );
      toast.success(approve ? 'Listing restored' : 'Appeal rejected');
    } else {
      toast.error(res.error);
    }
    setBusy(null);
  };

  const decideRefund = async (refundId: number, decision: 'APPROVED' | 'REJECTED') => {
    setBusy(`refund-${refundId}`);
    const res = await dbOperations.reviewRefund(refundId, decision);
    setBusy(null);
    if (res && 'error' in res && res.error) toast.error(String(res.error));
    else if (decision === 'APPROVED' && res && 'serverApplied' in res && res.serverApplied) {
      toast.success('Refund approved and written to the escrow ledger');
    } else toast.success(`Refund ${decision.toLowerCase()} on this device`);
  };

  const removeListing = async (productId: number) => {
    if (!window.confirm('Remove this listing from the marketplace?')) return;
    setBusy(`product-${productId}`);
    const res = await dbOperations.deleteProduct(productId);
    setBusy(null);
    if (res && 'error' in res && res.error) toast.error(String(res.error));
    else toast.success('Listing removed');
  };

  const suspend = async (userId: number, suspended: boolean) => {
    setBusy(`user-${userId}`);
    const res = await dbOperations.adminSuspendUser(userId, suspended);
    setBusy(null);
    if (res && 'error' in res && res.error) toast.error(String(res.error));
    else toast.success(suspended ? 'Account suspended' : 'Account reinstated');
  };

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'Open tickets', value: openTickets.length, Icon: LifeBuoy, tone: 'text-jade-600 dark:text-jade-400' },
          { label: 'Listing appeals', value: pendingAppeals.length, Icon: BadgeCheck, tone: 'text-gold-600 dark:text-gold-400' },
          { label: 'Reports to review', value: openReports.length, Icon: Flag, tone: 'text-orange-600 dark:text-orange-400' },
          { label: 'Refunds pending', value: pendingRefunds.length, Icon: RotateCcw, tone: 'text-jade-600 dark:text-jade-400' },
          { label: 'At-risk sellers', value: riskyAccounts.length, Icon: ShieldAlert, tone: 'text-red-600 dark:text-red-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{s.label}</p>
              <s.Icon className={`h-3.5 w-3.5 ${s.tone}`} />
            </div>
            <p className="mt-1.5 font-display text-xl font-bold text-ink-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-ink-200 bg-white p-1 dark:border-ink-800 dark:bg-ink-900">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setOpenTicketId(null); }}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-colors cursor-pointer ${
              tab === t.key ? 'bg-jade-500 text-white' : 'text-ink-500 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800'
            }`}
          >
            <t.Icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tickets */}
      {tab === 'tickets' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
            <div className="border-b border-ink-100 p-4 dark:border-ink-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search reference, subject or buyer"
                  className="w-full rounded-xl border border-ink-200 bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                />
              </div>
            </div>
            <ul className="max-h-[30rem] divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
              {filteredTickets.length === 0 && (
                <li className="p-8 text-center text-xs text-ink-400"><Inbox className="mx-auto mb-2 h-6 w-6 text-ink-300" /> No tickets in this queue.</li>
              )}
              {filteredTickets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setOpenTicketId(t.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-ink-50 dark:hover:bg-ink-950 cursor-pointer ${openTicketId === t.id ? 'bg-jade-500/[0.06]' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-bold text-ink-900 dark:text-white">{t.subject}</span>
                      <Pill value={t.status} />
                    </div>
                    <p className="mt-1 text-[10px] text-ink-400">
                      {t.reference} · {CATEGORY_LABEL[t.category]} · {t.userName}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
            {!selectedTicket ? (
              <div className="grid h-full min-h-[20rem] place-items-center p-8 text-center">
                <div>
                  <LifeBuoy className="mx-auto h-7 w-7 text-ink-300" />
                  <p className="mt-2 text-xs font-semibold text-ink-500 dark:text-ink-400">Select a ticket to read the thread and respond.</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full max-h-[34rem] flex-col">
                <div className="border-b border-ink-100 p-4 dark:border-ink-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill value={selectedTicket.status} />
                    <Pill value={selectedTicket.priority} />
                    <span className="text-[10px] text-ink-400">{selectedTicket.reference}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-ink-900 dark:text-white">{selectedTicket.subject}</h3>
                  <p className="mt-1 text-[11px] text-ink-400">
                    {selectedTicket.userName} · {CATEGORY_LABEL[selectedTicket.category]}
                    {selectedTicket.orderId ? ` · Order #${selectedTicket.orderId}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(['IN_REVIEW', 'WAITING_USER', 'RESOLVED', 'CLOSED'] as SupportTicketStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(selectedTicket, s)}
                        className="rounded-lg border border-ink-200 px-2 py-1 text-[10px] font-bold text-ink-600 hover:border-jade-500/50 hover:text-jade-700 dark:border-ink-700 dark:text-ink-300 cursor-pointer"
                      >
                        {s.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                  {selectedTicket.messages.map((m) => (
                    <div key={m.id} className={`rounded-2xl px-3 py-2 text-xs ${m.authorRole === 'ADMIN' ? 'bg-jade-500/10' : 'bg-ink-50 dark:bg-ink-950'}`}>
                      <p className="mb-0.5 text-[10px] font-bold uppercase text-ink-400">{m.authorName} · {m.authorRole}</p>
                      <p className="text-ink-700 dark:text-ink-200">{m.body}</p>
                      <p className="mt-0.5 text-[10px] text-ink-400">{new Date(m.createdAt).toLocaleString('en-NG')}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-ink-100 p-3 dark:border-ink-800">
                  <div className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendAdminReply(); }}
                      placeholder="Reply as GoodSale Trust…"
                      className="flex-1 rounded-xl border border-ink-200 px-3 py-2 text-xs outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                    />
                    <button onClick={sendAdminReply} className="rounded-xl bg-jade-600 px-3 py-2 text-white hover:bg-jade-700 cursor-pointer">
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Appeals */}
      {tab === 'appeals' && (
        <div className="space-y-3">
          {pendingAppeals.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink-200 bg-white p-10 text-center dark:border-ink-800 dark:bg-ink-900">
              <BadgeCheck className="mx-auto h-7 w-7 text-ink-300" />
              <p className="mt-2 text-xs font-semibold text-ink-500 dark:text-ink-400">No listing appeals waiting.</p>
            </div>
          ) : (
            pendingAppeals.map((a) => {
              const product = db.products.find((p) => p.id === a.productId);
              const seller = db.users.find((u) => u.id === a.sellerId);
              return (
                <div key={a.id} className="rounded-3xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink-900 dark:text-white">{product?.title || `Listing #${a.productId}`}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {a.reference} · {seller?.fullName || 'Seller'} · {new Date(a.createdAt).toLocaleDateString('en-NG')}
                      </p>
                    </div>
                    <Pill value="PENDING" />
                  </div>
                  <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">{a.reason}</p>
                  <input
                    value={appealDraft[a.id] || ''}
                    onChange={(e) => setAppealDraft((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    placeholder="Decision note (sent to the seller on rejection)"
                    className="mt-2 w-full rounded-xl border border-ink-200 px-3 py-2 text-xs outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => decideAppeal(a.id, a.productId, a.sellerId, true)}
                      disabled={busy === `appeal-${a.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-jade-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-jade-700 cursor-pointer"
                    >
                      <Check className="h-3 w-3" /> Restore listing
                    </button>
                    <button
                      onClick={() => decideAppeal(a.id, a.productId, a.sellerId, false)}
                      disabled={busy === `appeal-${a.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-1.5 text-[11px] font-bold text-ink-700 hover:border-red-400 hover:text-red-600 dark:border-ink-700 dark:text-ink-200 cursor-pointer"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Reported listings */}
      {tab === 'listings' && (
        <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Open reports</h3>
            <p className="mt-0.5 text-[11px] text-ink-400">Buyer-submitted reports on listings, sellers, messages and orders.</p>
          </div>
          {openReports.length === 0 ? (
            <div className="p-10 text-center text-xs text-ink-400"><Flag className="mx-auto mb-2 h-6 w-6 text-ink-300" /> Nothing to review.</div>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {openReports.map((r) => {
                const product = r.targetType === 'PRODUCT' ? db.products.find((p) => p.id === r.targetId) : undefined;
                return (
                  <li key={r.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-ink-900 dark:text-white">
                          {r.targetType} · {r.targetLabel}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">{r.reason}{r.details ? ` — ${r.details}` : ''}</p>
                        <p className="mt-1 text-[10px] text-ink-400">{new Date(r.createdAt).toLocaleString('en-NG')}</p>
                      </div>
                      <Pill value={r.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {product && (
                        <>
                          <button
                            onClick={() => {
                              const reason = window.prompt('Rejection reason shown to the seller:') || '';
                              if (!reason.trim()) return;
                              void dbOperations.adminUpdateProduct(product.id, {
                                moderationStatus: 'REJECTED',
                                rejectionReason: reason.trim(),
                                stockStatus: 'UNAVAILABLE',
                              });
                              dbOperations.createCustomNotification(
                                product.sellerId,
                                'Listing rejected by moderation',
                                `"${product.title}" was rejected: ${reason.trim()}. You can submit an appeal from your inventory.`,
                                'VERIFICATION'
                              );
                              toast.success('Listing rejected — seller can appeal');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gold-400/15 px-3 py-1.5 text-[11px] font-bold text-gold-700 hover:bg-gold-400/25 dark:text-gold-300 cursor-pointer"
                          >
                            <AlertTriangle className="h-3 w-3" /> Reject with reason
                          </button>
                          <button
                            onClick={() => removeListing(product.id)}
                            disabled={busy === `product-${product.id}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500/15 dark:text-red-300 cursor-pointer"
                          >
                            <Ban className="h-3 w-3" /> Remove listing
                          </button>
                        </>
                      )}
                      <button
                        onClick={async () => {
                          const res = await dbOperations.adminUpdateReport(r.id, { status: 'RESOLVED', adminNotes: 'Reviewed by trust team' });
                          if (res && 'error' in res && res.error) toast.error(String(res.error));
                          else toast.success('Report resolved');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-1.5 text-[11px] font-bold text-ink-700 dark:border-ink-700 dark:text-ink-200 cursor-pointer"
                      >
                        <Check className="h-3 w-3" /> Mark resolved
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Refunds */}
      {tab === 'refunds' && (
        <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Refund requests</h3>
            <p className="mt-0.5 text-[11px] text-ink-400">Approving marks escrow refunded and notifies the buyer. Provider payouts are processed by Paystack.</p>
          </div>
          {db.refunds.length === 0 ? (
            <div className="p-10 text-center text-xs text-ink-400"><RotateCcw className="mx-auto mb-2 h-6 w-6 text-ink-300" /> No refund requests.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-ink-50 text-[10px] uppercase tracking-wider text-ink-400 dark:bg-ink-950">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Refund</th>
                  <th className="px-4 py-2.5 font-bold">Order</th>
                  <th className="px-4 py-2.5 font-bold">Amount</th>
                  <th className="px-4 py-2.5 font-bold">Reason</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 text-right font-bold">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {db.refunds.map((r) => {
                  const order = db.orders.find((o) => o.id === r.orderId);
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-semibold text-ink-800 dark:text-ink-100">{r.refundNumber}</td>
                      <td className="px-4 py-3 text-ink-500 dark:text-ink-400">{order?.orderNumber || `#${r.orderId}`}</td>
                      <td className="px-4 py-3 font-bold text-ink-800 dark:text-ink-100">{naira(r.amount)}</td>
                      <td className="max-w-[220px] px-4 py-3 text-ink-500 dark:text-ink-400"><span className="line-clamp-2">{r.reason}</span></td>
                      <td className="px-4 py-3"><Pill value={r.status} /></td>
                      <td className="px-4 py-3">
                        {r.status === 'PENDING' ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => decideRefund(r.id, 'APPROVED')}
                              disabled={busy === `refund-${r.id}`}
                              className="rounded-lg bg-jade-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-jade-700 cursor-pointer"
                            >
                              {busy === `refund-${r.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve'}
                            </button>
                            <button
                              onClick={() => decideRefund(r.id, 'REJECTED')}
                              disabled={busy === `refund-${r.id}`}
                              className="rounded-lg border border-ink-200 px-2.5 py-1 text-[10px] font-bold text-ink-600 dark:border-ink-700 dark:text-ink-300 cursor-pointer"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          <p className="text-right text-[10px] text-ink-400">Decided</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Accounts */}
      {tab === 'accounts' && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
            <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800">
              <h3 className="text-sm font-bold text-ink-900 dark:text-white">Seller performance</h3>
              <p className="mt-0.5 text-[11px] text-ink-400">Delivered escrow revenue and live trust score by store.</p>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-ink-50 text-[10px] uppercase tracking-wider text-ink-400 dark:bg-ink-950">
                <tr>
                  <th className="px-4 py-2 font-bold">Store</th>
                  <th className="px-4 py-2 text-right font-bold">Delivered</th>
                  <th className="px-4 py-2 text-right font-bold">Revenue</th>
                  <th className="px-4 py-2 text-right font-bold">Trust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {sellerPerformance.map((s) => (
                  <tr key={s.user.id}>
                    <td className="px-4 py-2.5 font-semibold text-ink-800 dark:text-ink-100">{s.user.fullName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-500 dark:text-ink-400">{s.delivered}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-500 dark:text-ink-400">{naira(s.revenue)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink-800 dark:text-ink-100">{s.trust.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {riskyAccounts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink-200 bg-white p-10 text-center dark:border-ink-800 dark:bg-ink-900">
              <ShieldAlert className="mx-auto h-7 w-7 text-ink-300" />
              <p className="mt-2 text-xs font-semibold text-ink-500 dark:text-ink-400">No elevated risk signals right now.</p>
            </div>
          ) : (
            riskyAccounts.map(({ user, risk }) => {
              const trust = computeSellerTrust(db, user.id);
              return (
                <div key={user.id} className="rounded-3xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink-900 dark:text-white">{user.fullName}</p>
                      <p className="mt-0.5 text-[11px] text-ink-400">@{user.username} · Trust {trust.score}/100 · {user.isSuspended ? 'Suspended' : user.role.replace(/_/g, ' ')}</p>
                    </div>
                    <Pill value={risk.level} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {risk.signals.map((s) => (
                      <span key={s} className="rounded-full bg-red-500/[0.07] px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-300">{s}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => suspend(user.id, !user.isSuspended)}
                      disabled={busy === `user-${user.id}`}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold cursor-pointer ${
                        user.isSuspended
                          ? 'bg-jade-600 text-white hover:bg-jade-700'
                          : 'bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-300'
                      }`}
                    >
                      {busy === `user-${user.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : user.isSuspended ? <Check className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                      {user.isSuspended ? 'Reinstate account' : 'Suspend account'}
                    </button>
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-1.5 text-[11px] font-semibold text-ink-500 dark:border-ink-700 dark:text-ink-400">
                      <AlertTriangle className="h-3 w-3" /> {risk.openReports} reports · {risk.disputes} disputes
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Promotions */}
      {tab === 'promotions' && (
        <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Promotion performance</h3>
            <p className="mt-0.5 text-[11px] text-ink-400">Sponsored campaigns across the marketplace. Paused campaigns with unspent budget are eligible for seller credit.</p>
          </div>
          {promotions.length === 0 ? (
            <div className="p-10 text-center text-xs text-ink-400"><Megaphone className="mx-auto mb-2 h-6 w-6 text-ink-300" /> No campaigns yet.</div>
          ) : (
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-ink-50 text-[10px] uppercase tracking-wider text-ink-400 dark:bg-ink-950">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Campaign</th>
                  <th className="px-4 py-2.5 font-bold">Seller</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 text-right font-bold">Impr.</th>
                  <th className="px-4 py-2.5 text-right font-bold">Clicks</th>
                  <th className="px-4 py-2.5 text-right font-bold">CTR</th>
                  <th className="px-4 py-2.5 text-right font-bold">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {promotions.map((ad) => (
                  <tr key={ad.id}>
                    <td className="max-w-[200px] truncate px-4 py-3 font-semibold text-ink-800 dark:text-ink-100">{ad.title}</td>
                    <td className="px-4 py-3 text-ink-500 dark:text-ink-400">{ad.sellerName}</td>
                    <td className="px-4 py-3"><Pill value={ad.status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-500 dark:text-ink-400">{ad.impressions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-500 dark:text-ink-400">{ad.clicks.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-500 dark:text-ink-400">{ad.ctr.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-800 dark:text-ink-100">{naira(ad.spent)} <span className="font-normal text-ink-400">/ {naira(ad.budget)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
