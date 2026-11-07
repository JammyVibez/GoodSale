'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Ban, CalendarDays, CheckCircle2, ChevronDown, ChevronUp,
  Clock, MapPin, Package, Phone, RotateCcw, Search, ShieldCheck, Truck, UserCheck,
} from 'lucide-react';
import { dbOperations, useDBState } from '@/lib/store';
import { confirmDialog, toast } from '@/lib/feedback';
import type { Delivery, DeliveryStatus } from '@/lib/types';
import {
  DELIVERY_STATUSES, deliveryStatusLabel, isDeliveryDelayed, isDeliveryFailed,
  isDeliveryTerminal, nextDeliveryStatuses,
} from '@/lib/delivery';
import { DeliveryStatusBadge } from './DeliveryTimeline';
import AdminDeliverySettingsPanel from './AdminDeliverySettingsPanel';
import AdminDeliveryAnalyticsPanel from './AdminDeliveryAnalyticsPanel';
import AdminDeliveryFailurePanel from './AdminDeliveryFailurePanel';
import LiveDeliveryTracking from './LiveDeliveryTracking';

const card = 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-2xl shadow-sm';
const inp =
  'w-full bg-ink-50 dark:bg-ink-950 border border-ink-200 dark:border-ink-800 px-3 py-2 rounded-xl text-xs text-ink-800 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-jade-500';
const btn =
  'px-3 py-2 bg-jade-500 hover:bg-jade-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5';
const btnGhost =
  'px-3 py-2 bg-white dark:bg-ink-950 text-ink-600 dark:text-ink-300 border border-ink-200 dark:border-ink-800 font-bold text-xs rounded-xl transition-all cursor-pointer hover:bg-ink-500/5 inline-flex items-center gap-1.5 disabled:opacity-50';
const label = 'block text-[11px] font-bold text-ink-500 dark:text-ink-400 mb-1';
const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const dateText = (value?: string) =>
  value ? new Date(value.length <= 10 ? `${value}T00:00:00` : value).toLocaleDateString() : '—';
const timeText = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

export default function AdminDeliveryPanel() {
  const db = useDBState();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DeliveryStatus>('ALL');
  const [view, setView] = useState<'ALL' | 'FAILED' | 'DELAYED'>('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [courierFilter, setCourierFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [riderChoice, setRiderChoice] = useState<Record<number, string>>({});
  const [courier, setCourier] = useState({ name: '', tracking: '', eta: '', status: '' });
  const [reason, setReason] = useState('');
  const [codeInput, setCodeInput] = useState('');

  const deliveries = db.deliveries || [];
  const events = db.deliveryEvents || [];
  const audits = db.deliveryAuditLogs || [];
  const partners = (db.deliveryPartners || []).filter((p) => p.status === 'APPROVED');

  const orderFor = (delivery: Delivery) => db.orders.find((o) => o.id === delivery.orderId);
  const userFor = (id?: number) => (id != null ? db.users.find((u) => u.id === id) : undefined);
  const riderFor = (delivery: Delivery) =>
    delivery.riderId
      ? (db.deliveryPartners || []).find((p) => p.id === delivery.riderId)
      : undefined;

  const states = useMemo(
    () => Array.from(new Set(deliveries.map((d) => d.deliveryState).filter(Boolean))).sort(),
    [deliveries]
  );
  const couriers = useMemo(
    () => Array.from(new Set(deliveries.map((d) => d.courierName).filter(Boolean))).sort(),
    [deliveries]
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return deliveries
      .filter((delivery) => {
        if (statusFilter !== 'ALL' && delivery.status !== statusFilter) return false;
        if (stateFilter !== 'ALL' && delivery.deliveryState !== stateFilter) return false;
        if (courierFilter !== 'ALL' && delivery.courierName !== courierFilter) return false;

        const created = delivery.createdAt.slice(0, 10);
        if (dateFrom && created < dateFrom) return false;
        if (dateTo && created > dateTo) return false;

        if (view === 'FAILED' && !isDeliveryFailed(delivery)) return false;
        if (view === 'DELAYED' && !isDeliveryDelayed(delivery)) return false;

        if (!term) return true;
        const order = orderFor(delivery);
        const buyer = userFor(delivery.buyerId);
        const seller = userFor(delivery.sellerId);
        const rider = riderFor(delivery);
        return [
          delivery.deliveryNumber,
          delivery.trackingNumber,
          delivery.courierName,
          delivery.deliveryAddress,
          delivery.deliveryCity,
          delivery.deliveryState,
          order?.orderNumber,
          order?.productTitle,
          buyer?.fullName,
          seller?.fullName,
          rider?.fullName,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [deliveries, query, statusFilter, stateFilter, courierFilter, dateFrom, dateTo, view, db.orders, db.users, partners]);

  const stats = useMemo(() => {
    const active = deliveries.filter((d) => !isDeliveryTerminal(d.status));
    return {
      total: deliveries.length,
      active: active.length,
      delivered: deliveries.filter((d) => d.status === 'DELIVERED').length,
      failed: deliveries.filter((d) => isDeliveryFailed(d)).length,
      delayed: deliveries.filter((d) => isDeliveryDelayed(d)).length,
    };
  }, [deliveries]);

  const run = async (fn: () => Promise<{ error?: string; success?: boolean }>, successMessage: string) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result?.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(successMessage);
    return true;
  };

  const changeStatus = async (delivery: Delivery, status: DeliveryStatus) => {
    if (status === 'FAILED_DELIVERY' && !reason.trim()) {
      toast.error('Enter a failure reason before marking the delivery failed.');
      return;
    }
    if (status === 'CANCELLED') {
      if (!reason.trim()) {
        toast.error('Enter a cancellation reason.');
        return;
      }
      const ok = await confirmDialog(`Cancel ${delivery.deliveryNumber}?`);
      if (!ok) return;
    }
    await run(
      () =>
        dbOperations.advanceDelivery(delivery.id, status, {
          failureReason: status === 'FAILED_DELIVERY' ? reason.trim() : undefined,
          note: reason.trim() || undefined,
        }),
      `Delivery moved to ${deliveryStatusLabel(status)}.`
    );
  };

  const assignRider = async (delivery: Delivery) => {
    const value = riderChoice[delivery.id];
    if (!value) {
      toast.error('Select an approved rider first.');
      return;
    }
    await run(
      () => dbOperations.assignDeliveryRider(delivery.id, Number(value)),
      `Delivery offered to the rider. They have ${db.deliverySettings.offerTimeoutMinutes} minutes to accept before it can be reassigned.`
    );
  };

  const saveCourier = async (delivery: Delivery) => {
    if (!courier.name.trim() || !courier.tracking.trim()) {
      toast.error('Courier name and tracking number are required.');
      return;
    }
    const basic = await dbOperations.setDeliveryCourier(delivery.id, {
      courierName: courier.name.trim(),
      trackingNumber: courier.tracking.trim(),
      estimatedDeliveryDate: courier.eta || undefined,
    });
    if (basic.error) {
      toast.error(basic.error);
      return;
    }
    const manual = await dbOperations.adminCourierRequest({
      action: 'MANUAL',
      deliveryId: delivery.id,
      courierName: courier.name.trim(),
      trackingNumber: courier.tracking.trim(),
      status: courier.status || 'CREATED',
      note: 'Tracking recorded manually by an administrator',
    });
    if (manual.error) {
      toast.error(manual.error);
      return;
    }
    toast.success('Courier shipment and tracking recorded.');
  };

  const createCourierShipment = async (delivery: Delivery) => {
    const result = await dbOperations.adminCourierRequest({ action: 'CREATE', deliveryId: delivery.id });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success('Courier shipment created through the configured provider.');
  };

  const syncCourier = async (delivery: Delivery) => {
    const result = await dbOperations.adminCourierRequest({ action: 'SYNC', deliveryId: delivery.id });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const applied = Number((result.data as { applied?: number } | undefined)?.applied || 0);
    toast.success(`Courier tracking synced · ${applied} new event${applied === 1 ? '' : 's'}.`);
  };

  const confirmWithCode = async (delivery: Delivery) => {
    if (!/^\d{4,8}$/.test(codeInput.trim())) {
      toast.error('Enter the buyer’s numeric confirmation code.');
      return;
    }
    await run(
      () => dbOperations.confirmDeliveryWithCode(delivery.id, codeInput.trim()),
      'Delivery confirmed. Escrow remains held for the buyer to release.'
    );
    setCodeInput('');
  };

  const cancelOrReturn = async (delivery: Delivery, action: 'CANCEL' | 'RETURN') => {
    if (!reason.trim()) {
      toast.error(action === 'RETURN' ? 'A return reason is required.' : 'A cancellation reason is required.');
      return;
    }
    const ok = await confirmDialog(
      action === 'RETURN'
        ? `Initiate a return to seller for ${delivery.deliveryNumber}?`
        : `Cancel ${delivery.deliveryNumber}?`
    );
    if (!ok) return;
    await run(
      () =>
        action === 'RETURN'
          ? dbOperations.initiateDeliveryReturn(delivery.id, reason.trim())
          : dbOperations.cancelDelivery(delivery.id, reason.trim()),
      action === 'RETURN' ? 'Return to seller initiated.' : 'Delivery cancelled.'
    );
  };

  return (
    <div className="space-y-5">
      <div className={`${card} p-5 bg-gradient-to-br from-jade-500/10 via-transparent to-transparent`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-xl text-ink-900 dark:text-white flex items-center gap-2">
              <Truck className="w-5 h-5 text-jade-500" /> Delivery Management
            </h2>
            <p className="text-xs text-ink-500 mt-1 max-w-2xl">
              Every order with a coordinated delivery has a delivery record. Fees come from the server-calculated shipping snapshot; statuses are validated on the backend and every action is audited.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          {[
            { label: 'Deliveries', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'Delivered', value: stats.delivered },
            { label: 'Failed / returned', value: stats.failed },
            { label: 'Delayed', value: stats.delayed },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/70 dark:bg-ink-950/60 border border-ink-200/70 dark:border-ink-800 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">{item.label}</p>
              <p className="font-display font-bold text-lg text-ink-900 dark:text-white mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <AdminDeliverySettingsPanel />
      <AdminDeliveryAnalyticsPanel />
      <AdminDeliveryFailurePanel />

      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-col lg:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search delivery, order, buyer, seller, rider or tracking number"
              className={`${inp} pl-9`}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ['ALL', 'All'],
              ['FAILED', 'Failed'],
              ['DELAYED', 'Delayed'],
            ] as const).map(([id, text]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  view === id ? 'bg-jade-500 text-white' : 'bg-ink-100 dark:bg-ink-950 text-ink-600 dark:text-ink-400'
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
          <div>
            <label className={label}>Status</label>
            <select className={inp} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | DeliveryStatus)}>
              <option value="ALL">All statuses</option>
              {DELIVERY_STATUSES.map((status) => (
                <option key={status} value={status}>{deliveryStatusLabel(status)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>State / location</label>
            <select className={inp} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="ALL">All states</option>
              {states.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Courier</label>
            <select className={inp} value={courierFilter} onChange={(e) => setCourierFilter(e.target.value)}>
              <option value="ALL">All couriers</option>
              {couriers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Created from</label>
            <input type="date" className={inp} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className={label}>Created to</label>
            <input type="date" className={inp} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-ink-400">
          Showing {filtered.length} of {deliveries.length} delivery records. PICKUP-only orders have no delivery record by design.
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <Truck className="w-10 h-10 text-ink-300 dark:text-ink-700 mx-auto mb-2" />
          <p className="text-sm font-bold text-ink-600 dark:text-ink-300">No deliveries match these filters</p>
          <p className="text-xs text-ink-400 mt-1">Clear the filters, or create an order that uses coordinated delivery.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((delivery) => {
            const order = orderFor(delivery);
            const buyer = userFor(delivery.buyerId);
            const seller = userFor(delivery.sellerId);
            const rider = riderFor(delivery);
            const open = expanded === delivery.id;
            const delayed = isDeliveryDelayed(delivery);
            const deliveryEvents = events
              .filter((event) => event.deliveryId === delivery.id)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const deliveryAudits = audits.filter((entry) => entry.deliveryId === delivery.id);
            const transitions = nextDeliveryStatuses(delivery, 'ADMIN');

            return (
              <div key={delivery.id} className={`${card} overflow-hidden`}>
                <button
                  onClick={() => {
                    setExpanded(open ? null : delivery.id);
                    setReason('');
                    setCodeInput('');
                    setCourier({
                      name: delivery.courierName || '',
                      tracking: delivery.trackingNumber || '',
                      eta: delivery.estimatedDeliveryDate || '',
                      status: delivery.courierStatus || 'CREATED',
                    });
                  }}
                  className="w-full text-left p-4 flex flex-col lg:flex-row lg:items-center gap-3 cursor-pointer hover:bg-ink-500/[0.02]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-jade-600 dark:text-jade-400">{delivery.deliveryNumber}</span>
                      <DeliveryStatusBadge status={delivery.status} />
                      {delayed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gold-500/15 text-gold-700 dark:text-gold-400">
                          <AlertTriangle className="w-3 h-3" /> Delayed
                        </span>
                      )}
                      {isDeliveryFailed(delivery) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink-500/10 text-ink-600 dark:text-ink-300">Needs action</span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-ink-900 dark:text-white mt-1 truncate">
                      {order?.productTitle || `Order #${delivery.orderId}`}
                    </p>
                    <p className="text-[11px] text-ink-500 mt-0.5">
                      {order?.orderNumber || `Order ${delivery.orderId}`} · {buyer?.fullName || 'Buyer'} → {seller?.fullName || 'Seller'}
                    </p>
                    <p className="text-[11px] text-ink-400 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[delivery.pickupCity, delivery.pickupState].filter(Boolean).join(', ') || 'Pickup not set'}
                      <ArrowRight className="w-3 h-3" />
                      {[delivery.deliveryCity, delivery.deliveryState].filter(Boolean).join(', ') || 'Destination not set'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 text-[11px] shrink-0">
                    <div>
                      <span className="text-ink-400 block">Fee</span>
                      <span className="font-mono font-bold text-ink-800 dark:text-ink-200">{money(delivery.deliveryFee)}</span>
                    </div>
                    <div>
                      <span className="text-ink-400 block">Rider / courier</span>
                      <span className="font-semibold text-ink-700 dark:text-ink-300">{rider?.fullName || delivery.courierName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-ink-400 block">Tracking</span>
                      <span className="font-mono text-ink-700 dark:text-ink-300">{delivery.trackingNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="text-ink-400 block">Created</span>
                      <span className="text-ink-700 dark:text-ink-300">{dateText(delivery.createdAt)}</span>
                    </div>
                  </div>
                  <span className="text-ink-400 shrink-0">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
                </button>

                {open && (
                  <div className="border-t border-ink-100 dark:border-ink-800 p-4 space-y-4 bg-ink-50/40 dark:bg-ink-950/30">
                    <div className="grid lg:grid-cols-3 gap-4">
                      <div className="space-y-2 text-xs">
                        <h4 className="font-bold text-ink-800 dark:text-ink-100 text-[11px] uppercase tracking-wide">Delivery details</h4>
                        <p><span className="text-ink-400">Pickup:</span> {delivery.pickupAddress || '—'}, {[delivery.pickupCity, delivery.pickupState].filter(Boolean).join(', ')}</p>
                        <p><span className="text-ink-400">Destination:</span> {delivery.deliveryAddress || '—'}, {[delivery.deliveryCity, delivery.deliveryState].filter(Boolean).join(', ')}</p>
                        <p><span className="text-ink-400">Method:</span> {delivery.deliveryMethod} · {delivery.serviceType}</p>
                        <p><span className="text-ink-400">Instructions:</span> {delivery.deliveryInstructions || 'None'}</p>
                        <p><span className="text-ink-400">Estimated date:</span> {dateText(delivery.estimatedDeliveryDate)}</p>
                        <p><span className="text-ink-400">Picked up:</span> {timeText(delivery.pickedUpAt)}</p>
                        <p><span className="text-ink-400">Delivered / confirmed:</span> {timeText(delivery.deliveredAt)} · {timeText(delivery.confirmedAt)}</p>
                        {delivery.failureReason && <p className="text-ink-600 dark:text-ink-300"><span className="text-ink-400">Failure:</span> {delivery.failureReason}</p>}
                        {delivery.cancellationReason && <p className="text-ink-600 dark:text-ink-300"><span className="text-ink-400">Cancellation:</span> {delivery.cancellationReason}</p>}
                        {order && (
                          <p className="text-ink-500">
                            <span className="text-ink-400">Order total:</span> {money(order.totalAmount)} · order status <strong>{order.status}</strong>
                          </p>
                        )}
                      </div>

                      <div className="space-y-2 text-xs">
                        <h4 className="font-bold text-ink-800 dark:text-ink-100 text-[11px] uppercase tracking-wide">Fee snapshot</h4>
                        {delivery.feeSnapshot ? (
                          <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-3 space-y-1">
                            {[
                              ['Base', delivery.feeSnapshot.baseFee],
                              ['Distance', delivery.feeSnapshot.distanceFee],
                              ['Weight', delivery.feeSnapshot.weightFee],
                              ['Size', delivery.feeSnapshot.sizeFee],
                              ['Remote area', delivery.feeSnapshot.remoteFee],
                              ['Handling', delivery.feeSnapshot.handlingFee],
                              ['Platform', delivery.feeSnapshot.platformFee],
                              ['Zone', delivery.feeSnapshot.zoneFee],
                              ['Discount', -delivery.feeSnapshot.discount],
                            ].map(([name, value]) => (
                              <div key={String(name)} className="flex justify-between">
                                <span className="text-ink-400">{name}</span>
                                <span className="font-mono text-ink-600 dark:text-ink-300">{money(Number(value) || 0)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between border-t border-ink-100 dark:border-ink-800 pt-1 font-bold">
                              <span>Captured fee</span>
                              <span className="font-mono text-jade-600 dark:text-jade-400">{money(delivery.feeSnapshot.total)}</span>
                            </div>
                            <p className="text-[10px] text-ink-400 pt-1">
                              {delivery.feeSnapshot.ruleName || 'Standard pricing'}
                              {delivery.feeSnapshot.zoneName ? ` · ${delivery.feeSnapshot.zoneName}` : ''}
                              {delivery.feeSnapshot.courierName ? ` · ${delivery.feeSnapshot.courierName}` : ''}
                              {delivery.feeSnapshot.freeShipping ? ' · free shipping' : ''}
                            </p>
                          </div>
                        ) : (
                          <p className="text-ink-400">No snapshot (legacy order). Charged fee {money(delivery.deliveryFee)}.</p>
                        )}
                        <p className="text-[10px] text-ink-400">
                          Historical orders keep this snapshot; changing shipping prices never re-prices a paid delivery.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <h4 className="font-bold text-ink-800 dark:text-ink-100 text-[11px] uppercase tracking-wide mb-2">Assign rider</h4>
                          <div className="flex gap-2">
                            <select
                              className={inp}
                              value={riderChoice[delivery.id] || (delivery.riderId ? String(delivery.riderId) : '')}
                              onChange={(e) => setRiderChoice((prev) => ({ ...prev, [delivery.id]: e.target.value }))}
                              disabled={isDeliveryTerminal(delivery.status)}
                            >
                              <option value="">Select approved rider…</option>
                              {partners.map((partner) => (
                                <option key={partner.id} value={partner.id}>
                                  {partner.fullName} · {partner.city || partner.state} · {partner.vehicleType}
                                </option>
                              ))}
                            </select>
                            <button className={btn} disabled={busy || isDeliveryTerminal(delivery.status)} onClick={() => void assignRider(delivery)}>
                              <UserCheck className="w-3.5 h-3.5" /> {delivery.riderId ? 'Change' : 'Assign'}
                            </button>
                          </div>
                          <button
                            className={`${btnGhost} mt-2 w-full justify-center`}
                            disabled={busy || isDeliveryTerminal(delivery.status) || Boolean(delivery.riderId)}
                            onClick={() => void run(() => dbOperations.autoAssignDelivery(delivery.id), 'Automated matching ran for this delivery.')}
                          >
                            <Truck className="w-3.5 h-3.5" /> Auto-match best rider
                          </button>
                          {rider?.phone && <p className="text-[10px] text-ink-400 mt-1 flex items-center gap-1"><Phone className="w-3 h-3" /> {rider.phone}</p>}
                          {delivery.riderId && (
                            <p className="mt-1 text-[10px] font-semibold text-ink-500 dark:text-ink-400">
                              Assignment: {delivery.assignmentStatus.toLowerCase()} · {delivery.assignmentMode.toLowerCase()}
                              {delivery.assignmentExpiresAt && delivery.assignmentStatus === 'OFFERED'
                                ? ` · expires ${new Date(delivery.assignmentExpiresAt).toLocaleString()}`
                                : ''}
                              {delivery.autoOfferRound > 0 ? ` · round ${delivery.autoOfferRound}` : ''}
                            </p>
                          )}
                        </div>

                        <div>
                          <h4 className="font-bold text-ink-800 dark:text-ink-100 text-[11px] uppercase tracking-wide mb-2">External courier</h4>
                          <div className="space-y-2">
                            <input className={inp} placeholder="Courier name" value={courier.name} onChange={(e) => setCourier((prev) => ({ ...prev, name: e.target.value }))} disabled={isDeliveryTerminal(delivery.status)} />
                            <input className={inp} placeholder="Tracking number" value={courier.tracking} onChange={(e) => setCourier((prev) => ({ ...prev, tracking: e.target.value }))} disabled={isDeliveryTerminal(delivery.status)} />
                            <input className={inp} type="date" value={courier.eta} onChange={(e) => setCourier((prev) => ({ ...prev, eta: e.target.value }))} disabled={isDeliveryTerminal(delivery.status)} />
                            <select className={inp} value={courier.status} onChange={(e) => setCourier((prev) => ({ ...prev, status: e.target.value }))} disabled={isDeliveryTerminal(delivery.status)}>
                              <option value="CREATED">Created</option>
                              <option value="PICKED_UP">Picked up</option>
                              <option value="IN_TRANSIT">In transit</option>
                              <option value="OUT_FOR_DELIVERY">Out for delivery</option>
                              <option value="DELAYED">Delayed</option>
                              <option value="DELIVERED">Delivered (buyer code still required)</option>
                              <option value="FAILED">Failed</option>
                              <option value="RETURNED">Returned</option>
                            </select>
                            <button className={`${btnGhost} w-full justify-center`} disabled={busy || isDeliveryTerminal(delivery.status)} onClick={() => void saveCourier(delivery)}>
                              <Truck className="w-3.5 h-3.5" /> Save manual courier update
                            </button>
                            <div className="flex gap-2">
                              <button className={`${btnGhost} flex-1 justify-center`} disabled={busy || isDeliveryTerminal(delivery.status)} onClick={() => void createCourierShipment(delivery)}>
                                Create via API
                              </button>
                              <button className={`${btnGhost} flex-1 justify-center`} disabled={busy || isDeliveryTerminal(delivery.status)} onClick={() => void syncCourier(delivery)}>
                                Sync tracking
                              </button>
                            </div>
                            {(delivery.courierStatus || delivery.courierProvider) && (
                              <p className="text-[10px] font-semibold text-ink-500 dark:text-ink-400">
                                {delivery.courierProvider || 'manual'} · {delivery.courierStatus || 'CREATED'}
                                {delivery.courierLastSyncedAt ? ` · synced ${new Date(delivery.courierLastSyncedAt).toLocaleString()}` : ''}
                              </p>
                            )}
                            {delivery.courierLastError && (
                              <p className="text-[10px] text-ink-500 dark:text-ink-400">Last API error: {delivery.courierLastError}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {!isDeliveryTerminal(delivery.status) && (
                      <div className="pt-3 border-t border-ink-200/70 dark:border-ink-800 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-ink-500 uppercase tracking-wide">Update status</span>
                          {transitions.length === 0 && <span className="text-[11px] text-ink-400">No manual transitions from this status.</span>}
                          {transitions.map((status) => (
                            <button
                              key={status}
                              disabled={busy}
                              onClick={() => void changeStatus(delivery, status)}
                              className={status === 'FAILED_DELIVERY' || status === 'CANCELLED' ? `${btnGhost} !text-ink-600` : btn}
                            >
                              {deliveryStatusLabel(status)}
                            </button>
                          ))}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <input
                            className={inp}
                            placeholder="Reason (required for failed / cancelled / return)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button className={btnGhost} disabled={busy} onClick={() => void cancelOrReturn(delivery, 'CANCEL')}>
                              <Ban className="w-3.5 h-3.5" /> Cancel delivery
                            </button>
                            <button className={btnGhost} disabled={busy} onClick={() => void cancelOrReturn(delivery, 'RETURN')}>
                              <RotateCcw className="w-3.5 h-3.5" /> Return to seller
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[200px]">
                            <label className={label}>Buyer&apos;s confirmation code (operator handover)</label>
                            <input
                              className={`${inp} font-mono tracking-widest`}
                              placeholder="6-digit code"
                              maxLength={8}
                              value={codeInput}
                              onChange={(e) => setCodeInput(e.target.value)}
                            />
                          </div>
                          <button className={btn} disabled={busy} onClick={() => void confirmWithCode(delivery)}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm delivery
                          </button>
                          <p className="text-[10px] text-ink-400 flex items-center gap-1 w-full">
                            <ShieldCheck className="w-3 h-3 text-jade-500" />
                            Confirming delivery never releases escrow — the buyer releases funds separately.
                          </p>
                        </div>
                      </div>
                    )}

                    <LiveDeliveryTracking delivery={delivery} />

                    <div className="grid lg:grid-cols-2 gap-4 pt-3 border-t border-ink-200/70 dark:border-ink-800">
                      <div>
                        <h4 className="font-bold text-ink-800 dark:text-ink-100 text-[11px] uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-jade-500" /> Delivery history
                        </h4>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {deliveryEvents.length === 0 && <p className="text-[11px] text-ink-400">No events yet.</p>}
                          {deliveryEvents.map((event) => (
                            <div key={event.id} className="text-[11px] border-l-2 border-jade-500/30 pl-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-ink-700 dark:text-ink-200">{deliveryStatusLabel(event.status)}</span>
                                <span className="text-ink-400 font-mono text-[10px]">{new Date(event.createdAt).toLocaleString()}</span>
                                <span className="text-ink-400 uppercase text-[9px]">{event.actorRole}</span>
                              </div>
                              {event.note && <p className="text-ink-500 dark:text-ink-400">{event.note}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-bold text-ink-800 dark:text-ink-100 text-[11px] uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Package className="w-3 h-3 text-jade-500" /> Admin audit log
                        </h4>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {deliveryAudits.length === 0 && <p className="text-[11px] text-ink-400">No admin actions recorded yet.</p>}
                          {deliveryAudits.map((entry) => (
                            <div key={entry.id} className="text-[11px] border-l-2 border-ink-300 dark:border-ink-700 pl-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono font-bold text-ink-700 dark:text-ink-200">{entry.action}</span>
                                <span className="text-ink-400 font-mono text-[10px]">{new Date(entry.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="text-ink-500 dark:text-ink-400">
                                {entry.actorName || 'System'} ({entry.actorRole || 'SYSTEM'})
                                {entry.previousStatus ? ` · ${entry.previousStatus} → ${entry.newStatus}` : ''}
                              </p>
                              {entry.details && <p className="text-ink-400">{entry.details}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={`${card} p-4 text-[11px] text-ink-500 flex items-start gap-2`}>
        <CalendarDays className="w-4 h-4 text-jade-500 shrink-0 mt-0.5" />
        <p>
          Delayed means the genuine shipping ETA date has passed, or the delivery has had no update for over five days. No GPS or ETA values are invented here — live rider positions come only from the existing dispatch tracking.
        </p>
      </div>
    </div>
  );
}
