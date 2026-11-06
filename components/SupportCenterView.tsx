// components/SupportCenterView.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  LifeBuoy, ArrowLeft, Plus, Send, ChevronRight, Clock, ShieldCheck,
  CreditCard, Truck, UserCog, RotateCcw, Scale, MessageSquare, CheckCircle2,
  AlertCircle, Loader2, Package, ArrowRight, Inbox,
} from 'lucide-react';
import { useDBState, dbOperations } from '../lib/store';
import { useTrustCenter, createSupportTicket, replyToTicket, isAdminUser } from '../lib/trustCenter';
import { OrderStatus, type SupportTicket, type SupportTicketCategory, type Order } from '../lib/types';
import { toast } from '../lib/feedback';

interface SupportCenterViewProps {
  onBack?: () => void;
  onNavigate?: (view: string, payload?: unknown) => void;
  onOpenAuth?: () => void;
}

const CATEGORIES: Array<{ key: SupportTicketCategory; label: string; hint: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'PAYMENT', label: 'Payment complaint', hint: 'Charged twice, payment not confirmed', Icon: CreditCard },
  { key: 'DELIVERY', label: 'Delivery issue', hint: 'Late, damaged or missing parcel', Icon: Truck },
  { key: 'REFUND', label: 'Refund request', hint: 'Money back for an order', Icon: RotateCcw },
  { key: 'SELLER_DISPUTE', label: 'Seller dispute', hint: 'Item not as described', Icon: Scale },
  { key: 'ACCOUNT', label: 'Account issue', hint: 'Login, verification or settings', Icon: UserCog },
  { key: 'OTHER', label: 'Something else', hint: 'Anything not covered above', Icon: MessageSquare },
];

const STATUS_META: Record<SupportTicket['status'], { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-gold-400/15 text-gold-700 dark:text-gold-300' },
  IN_REVIEW: { label: 'In review', className: 'bg-jade-500/10 text-jade-700 dark:text-jade-300' },
  WAITING_USER: { label: 'Waiting on you', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-300' },
  RESOLVED: { label: 'Resolved', className: 'bg-jade-500/15 text-jade-700 dark:text-jade-300' },
  CLOSED: { label: 'Closed', className: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400' },
};

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<SupportTicketCategory, string>;

const CANCELLABLE: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PENDING_BANK_TRANSFER, OrderStatus.PAID_ESCROW, OrderStatus.PARTIAL_DEPOSIT_PAID];
const REFUNDABLE: OrderStatus[] = [OrderStatus.PAID_ESCROW, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.PARTIAL_DEPOSIT_PAID];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function SupportCenterView({ onBack, onNavigate, onOpenAuth }: SupportCenterViewProps) {
  const db = useDBState();
  const me = db.currentUser;
  const { tickets } = useTrustCenter();
  const [tab, setTab] = useState<'tickets' | 'new' | 'orders'>('tickets');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [category, setCategory] = useState<SupportTicketCategory>('PAYMENT');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [orderId, setOrderId] = useState<string>('');
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderBusy, setOrderBusy] = useState<number | null>(null);

  const myOrders = useMemo(
    () => (me ? db.orders.filter((o) => o.buyerId === me.id || o.sellerId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []),
    [db.orders, me]
  );
  const visibleTickets = useMemo(
    () => (isAdminUser() ? tickets : tickets.filter((t) => t.userId === me?.id)),
    [tickets, me]
  );
  const selected = visibleTickets.find((t) => t.id === selectedId) ?? null;

  const submitTicket = () => {
    setSubmitting(true);
    const res = createSupportTicket({
      category,
      subject,
      description,
      orderId: orderId ? Number(orderId) : undefined,
    });
    setSubmitting(false);
    if (res.error || !res.ticket) {
      toast.error(res.error || 'Could not create ticket');
      return;
    }
    toast.success(`Ticket ${res.ticket.reference} created`);
    setSelectedId(res.ticket.id);
    setSubject('');
    setDescription('');
    setOrderId('');
    setTab('tickets');
  };

  const sendReply = () => {
    if (!selected) return;
    const res = replyToTicket(selected.id, reply);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setReply('');
  };

  const handleCancel = async (order: Order) => {
    setOrderBusy(order.id);
    const res = await dbOperations.cancelOrder(order.id, 'Cancelled by buyer from support centre');
    setOrderBusy(null);
    if (res?.error) toast.error(res.error);
    else toast.success(res?.refunded ? 'Order cancelled — escrow refund queued' : 'Order cancelled');
  };

  const handleRefund = async (order: Order) => {
    const reason = window.prompt('What went wrong with this order?') || '';
    if (!reason.trim()) return;
    setOrderBusy(order.id);
    const res = await dbOperations.requestRefund(order.id, reason);
    setOrderBusy(null);
    if (res?.error) toast.error(res.error);
    else toast.success('Refund request submitted — funds stay protected while we review it');
  };

  if (!me) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-3xl border border-ink-200 bg-white p-8 text-center dark:border-ink-800 dark:bg-ink-900">
          <LifeBuoy className="mx-auto h-8 w-8 text-jade-600 dark:text-jade-400" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900 dark:text-white">Sign in for support</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            Tickets are tied to your GoodSale account and order history so the team can act quickly.
          </p>
          <button onClick={onOpenAuth} className="mt-5 rounded-2xl bg-jade-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-jade-700 cursor-pointer">
            Sign in or create an account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-ink-500 hover:text-jade-700 dark:text-ink-400 dark:hover:text-jade-300 cursor-pointer">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-jade-600 dark:text-jade-400">
            <LifeBuoy className="h-3.5 w-3.5" /> GoodSale Support Centre
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900 dark:text-white">How can we help?</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-500 dark:text-ink-400">
            Payment, delivery, refund and account issues. Every ticket gets a reference number and a tracked thread with the trust team.
          </p>
        </div>
        <button
          onClick={() => { setTab('new'); setSelectedId(null); }}
          className="inline-flex items-center gap-2 rounded-2xl bg-jade-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-jade-700 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> New ticket
        </button>
      </div>

      <div className="mt-6 flex gap-1 rounded-2xl border border-ink-200 bg-white p-1 dark:border-ink-800 dark:bg-ink-900">
        {[
          { key: 'tickets' as const, label: `My tickets (${visibleTickets.length})` },
          { key: 'new' as const, label: 'Open a ticket' },
          { key: 'orders' as const, label: 'Orders & refunds' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key !== 'tickets') setSelectedId(null); }}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
              tab === t.key ? 'bg-jade-500 text-white' : 'text-ink-500 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0">
          {tab === 'new' && (
            <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900 sm:p-6">
              <h2 className="text-base font-bold text-ink-900 dark:text-white">Tell us what happened</h2>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Choose the closest category — this routes your ticket to the right queue.</p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                      category === c.key
                        ? 'border-jade-500/60 bg-jade-500/[0.06]'
                        : 'border-ink-200 hover:border-jade-500/30 dark:border-ink-800'
                    }`}
                  >
                    <c.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${category === c.key ? 'text-jade-600 dark:text-jade-400' : 'text-ink-400'}`} />
                    <span>
                      <span className="block text-xs font-bold text-ink-800 dark:text-ink-100">{c.label}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-400">{c.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <label className="mt-4 block text-xs font-semibold text-ink-700 dark:text-ink-200">
                Related order <span className="font-normal text-ink-400">(optional)</span>
                <select
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                >
                  <option value="">No specific order</option>
                  {myOrders.slice(0, 20).map((o) => (
                    <option key={o.id} value={o.id}>{o.orderNumber} · {o.productTitle} · {naira(o.totalAmount)}</option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block text-xs font-semibold text-ink-700 dark:text-ink-200">
                Subject
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Payment deducted but order still pending"
                  className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none placeholder:text-ink-400 focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                />
              </label>

              <label className="mt-4 block text-xs font-semibold text-ink-700 dark:text-ink-200">
                Details
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="Include what you expected, what happened and any reference you have."
                  className="mt-1.5 w-full resize-y rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 outline-none placeholder:text-ink-400 focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                />
              </label>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[11px] text-ink-400">Typical first response: under 24 hours.</p>
                <button
                  onClick={submitTicket}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-2xl bg-jade-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-jade-700 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit ticket
                </button>
              </div>
            </div>
          )}

          {tab === 'tickets' && !selected && (
            <div className="space-y-3">
              {visibleTickets.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-ink-200 bg-white p-10 text-center dark:border-ink-800 dark:bg-ink-900">
                  <Inbox className="mx-auto h-8 w-8 text-ink-300" />
                  <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">No tickets yet</p>
                  <p className="mt-1 text-xs text-ink-400">When you contact support, your threads and references appear here.</p>
                  <button onClick={() => setTab('new')} className="mt-4 rounded-xl bg-jade-600 px-4 py-2 text-xs font-bold text-white hover:bg-jade-700 cursor-pointer">
                    Open your first ticket
                  </button>
                </div>
              ) : (
                visibleTickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="flex w-full items-start gap-3 rounded-3xl border border-ink-200 bg-white p-4 text-left transition-all hover:border-jade-500/40 hover:shadow-sm dark:border-ink-800 dark:bg-ink-900 cursor-pointer"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink-900 dark:text-white">{t.subject}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_META[t.status].className}`}>{STATUS_META[t.status].label}</span>
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-400">
                        {t.reference} · {CATEGORY_LABEL[t.category]} · updated {formatDate(t.updatedAt)}
                      </span>
                      <span className="mt-1.5 line-clamp-1 block text-xs text-ink-500 dark:text-ink-400">
                        {t.messages[t.messages.length - 1]?.body}
                      </span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-300" />
                  </button>
                ))
              )}
            </div>
          )}

          {tab === 'tickets' && selected && (
            <div className="rounded-3xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
              <div className="flex items-start justify-between gap-3 border-b border-ink-100 p-5 dark:border-ink-800">
                <div>
                  <button onClick={() => setSelectedId(null)} className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-400 hover:text-jade-600 dark:hover:text-jade-400 cursor-pointer">
                    <ArrowLeft className="h-3 w-3" /> All tickets
                  </button>
                  <h2 className="text-base font-bold text-ink-900 dark:text-white">{selected.subject}</h2>
                  <p className="mt-1 text-[11px] text-ink-400">
                    {selected.reference} · {CATEGORY_LABEL[selected.category]} · opened {formatDate(selected.createdAt)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_META[selected.status].className}`}>
                  {STATUS_META[selected.status].label}
                </span>
              </div>

              <div className="max-h-[26rem] space-y-3 overflow-y-auto p-5">
                {selected.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.authorRole === 'ADMIN' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      m.authorRole === 'ADMIN'
                        ? 'bg-jade-500/10 text-ink-800 dark:text-ink-100'
                        : 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100'
                    }`}>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                        {m.authorName}{m.authorRole === 'ADMIN' ? ' · GoodSale Trust' : ''}
                      </p>
                      {m.body}
                      <p className="mt-1 text-[10px] text-ink-400">{formatDate(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {selected.status !== 'RESOLVED' && selected.status !== 'CLOSED' ? (
                <div className="border-t border-ink-100 p-4 dark:border-ink-800">
                  <div className="flex gap-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendReply(); }}
                      placeholder="Add a reply…"
                      className="flex-1 rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                    />
                    <button onClick={sendReply} className="rounded-xl bg-jade-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-jade-700 cursor-pointer">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 border-t border-ink-100 p-4 text-xs text-jade-700 dark:border-ink-800 dark:text-jade-300">
                  <CheckCircle2 className="h-4 w-4" /> This ticket is closed. Open a new ticket if the issue returns.
                </div>
              )}
            </div>
          )}

          {tab === 'orders' && (
            <div className="space-y-3">
              {myOrders.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-ink-200 bg-white p-10 text-center dark:border-ink-800 dark:bg-ink-900">
                  <Package className="mx-auto h-8 w-8 text-ink-300" />
                  <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">No escrow orders yet</p>
                </div>
              ) : (
                myOrders.slice(0, 15).map((o) => {
                  const isBuyer = o.buyerId === me.id;
                  return (
                    <div key={o.id} className="rounded-3xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-ink-900 dark:text-white">{o.productTitle}</p>
                          <p className="mt-0.5 text-[11px] text-ink-400">{o.orderNumber} · {naira(o.totalAmount)} · {isBuyer ? 'You are buying' : 'You are selling'}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                          {o.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {isBuyer && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {CANCELLABLE.includes(o.status) && (
                            <button
                              onClick={() => handleCancel(o)}
                              disabled={orderBusy === o.id}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-1.5 text-[11px] font-bold text-ink-700 hover:border-jade-500/40 dark:border-ink-700 dark:text-ink-200 cursor-pointer"
                            >
                              {orderBusy === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Cancel order
                            </button>
                          )}
                          {REFUNDABLE.includes(o.status) && (
                            <button
                              onClick={() => handleRefund(o)}
                              disabled={orderBusy === o.id}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-jade-500/10 px-3 py-1.5 text-[11px] font-bold text-jade-700 hover:bg-jade-500/15 dark:text-jade-300 cursor-pointer"
                            >
                              <CreditCard className="h-3 w-3" /> Request refund
                            </button>
                          )}
                          {o.status !== OrderStatus.DELIVERED_SUCCESS && o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REFUNDED && (
                            <button
                              onClick={async () => {
                                const reason = window.prompt('Describe the problem for the dispute record:') || '';
                                if (!reason.trim()) return;
                                setOrderBusy(o.id);
                                const res = await dbOperations.openDispute(o.id, reason);
                                setOrderBusy(null);
                                if (res?.error && !res?.success) toast.error(res.error);
                                else toast.success('Dispute opened — escrow frozen until a decision');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-1.5 text-[11px] font-bold text-ink-700 dark:border-ink-700 dark:text-ink-200 cursor-pointer"
                            >
                              <Scale className="h-3 w-3" /> Open dispute
                            </button>
                          )}
                          <button
                            onClick={() => onNavigate?.('buyer-profile')}
                            className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-jade-700 dark:text-jade-300 cursor-pointer"
                          >
                            Order details <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="rounded-3xl border border-jade-500/25 bg-jade-500/[0.06] p-5 dark:border-jade-500/20 dark:bg-jade-500/10">
            <ShieldCheck className="h-5 w-5 text-jade-600 dark:text-jade-400" />
            <h3 className="mt-2.5 text-sm font-bold text-ink-900 dark:text-white">Your money is still protected</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              Opening a ticket or dispute never releases escrow. Funds only move when you confirm delivery or an admin rules on the case.
            </p>
            <button onClick={() => onNavigate?.('trust-safety')} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-jade-700 hover:text-jade-600 dark:text-jade-300 cursor-pointer">
              Read the Trust &amp; Safety Centre <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <h3 className="text-sm font-bold text-ink-900 dark:text-white">Response times</h3>
            <ul className="mt-3 space-y-3 text-xs text-ink-500 dark:text-ink-400">
              {[
                { label: 'Payment & refund', time: 'Under 24 hours', Icon: CreditCard },
                { label: 'Delivery', time: 'Under 24 hours', Icon: Truck },
                { label: 'Account & verification', time: '1–2 business days', Icon: UserCog },
                { label: 'Disputes', time: 'Decision within 2 days', Icon: Scale },
              ].map((r) => (
                <li key={r.label} className="flex items-start gap-2.5">
                  <r.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                  <span className="flex-1">{r.label}</span>
                  <span className="font-semibold text-ink-700 dark:text-ink-200">{r.time}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-ink-400" />
              <h3 className="text-sm font-bold text-ink-900 dark:text-white">Before you open a ticket</h3>
            </div>
            <ul className="mt-3 space-y-2 text-xs text-ink-500 dark:text-ink-400">
              <li className="flex gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" /> Have your order number ready.</li>
              <li className="flex gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" /> For damaged items, attach photos in the thread.</li>
              <li className="flex gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" /> Never share your delivery PIN with a seller.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
