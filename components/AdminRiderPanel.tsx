'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, ChevronDown, ChevronUp, Clock,
  FileText, MapPin, Phone, Search, ShieldCheck, Truck, Wallet, XCircle,
} from 'lucide-react';
import type { DeliveryPartner, RiderEarningStatus } from '@/lib/types';
import { dbOperations, useDBState } from '@/lib/store';
import { toast } from '@/lib/feedback';
import { isDeliveryTerminal } from '@/lib/delivery';
import { deliveryStates } from '@/lib/serviceAreas';

const inputClass =
  'w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-800 outline-none focus:ring-1 focus:ring-jade-500 dark:border-ink-700 dark:bg-ink-950 dark:text-white';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-gold-100 text-gold-800 dark:bg-gold-400/15 dark:text-gold-300',
  APPROVED: 'bg-jade-100 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300',
  REJECTED: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

const EARNING_STYLE: Record<RiderEarningStatus, string> = {
  PENDING: 'bg-gold-100 text-gold-800 dark:bg-gold-400/15 dark:text-gold-300',
  APPROVED: 'bg-jade-100 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300',
  PAID: 'bg-ink-900 text-white dark:bg-white dark:text-ink-900',
  VOID: 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400',
};

export default function AdminRiderPanel() {
  const db = useDBState();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [commissions, setCommissions] = useState<Record<number, string>>({});
  const [serviceSelection, setServiceSelection] = useState<Record<number, string[]>>({});
  const [baseArea, setBaseArea] = useState<Record<number, { state: string; city: string }>>({});
  const [assignments, setAssignments] = useState<Record<number, string>>({});

  // Expire stale offers even when no rider opens the request feed.
  useEffect(() => {
    void dbOperations.expireRiderAssignments();
    const timer = window.setInterval(() => void dbOperations.expireRiderAssignments(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const riders = db.deliveryPartners;
  const states = useMemo(() => deliveryStates(), []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return riders
      .filter((rider) => {
        if (statusFilter !== 'ALL' && rider.status !== statusFilter) return false;
        if (availabilityFilter === 'ONLINE' && !rider.isAvailable) return false;
        if (availabilityFilter === 'OFFLINE' && rider.isAvailable) return false;
        if (!needle) return true;
        return [rider.fullName, rider.email, rider.phone, rider.city, rider.state, rider.vehicleType]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const rank = { PENDING: 0, SUSPENDED: 1, APPROVED: 2, REJECTED: 3 } as Record<string, number>;
        const diff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
        return diff !== 0 ? diff : b.createdAt.localeCompare(a.createdAt);
      });
  }, [riders, search, statusFilter, availabilityFilter]);

  const metrics = useMemo(
    () => ({
      pending: riders.filter((r) => r.status === 'PENDING').length,
      approved: riders.filter((r) => r.status === 'APPROVED').length,
      online: riders.filter((r) => r.status === 'APPROVED' && r.isAvailable).length,
      suspended: riders.filter((r) => r.status === 'SUSPENDED').length,
      pendingEarnings: db.riderEarnings
        .filter((e) => e.status === 'PENDING')
        .reduce((sum, e) => sum + e.netAmount, 0),
    }),
    [riders, db.riderEarnings]
  );

  const run = async (key: string, work: () => Promise<{ error?: string } | { success?: boolean }>, success: string) => {
    setBusy(key);
    setError(null);
    const result = await work();
    setBusy(null);
    if ('error' in result && result.error) {
      setError(result.error);
      toast.error(result.error);
      return false;
    }
    toast.success(success);
    return true;
  };

  const review = (rider: DeliveryPartner, status: 'APPROVED' | 'REJECTED' | 'SUSPENDED') => {
    const reason = (reasons[rider.id] || '').trim();
    if ((status === 'REJECTED' || status === 'SUSPENDED') && !reason) {
      setError('Add a reason before rejecting or suspending a rider.');
      return;
    }
    return run(
      `review-${rider.id}-${status}`,
      () => dbOperations.adminReviewRider(rider.id, status, reason),
      status === 'APPROVED' ? 'Rider approved' : status === 'REJECTED' ? 'Application rejected' : 'Rider suspended'
    );
  };

  const earningStatus = (earningId: number, status: RiderEarningStatus) => {
    let payoutReference = '';
    if (status === 'PAID') {
      const entered = window.prompt('Manual payout reference (required before marking paid):');
      if (!entered || !entered.trim()) {
        toast.error('A payout reference is required. No payment was marked.');
        return;
      }
      payoutReference = entered.trim();
    }
    return run(
      `earning-${earningId}-${status}`,
      () => dbOperations.adminSetRiderEarningStatus(earningId, status, payoutReference, ''),
      `Earning marked ${status.toLowerCase()}`
    );
  };

  const adjustEarning = (earningId: number) => {
    const raw = window.prompt('Adjustment amount in ₦ (use a negative number to deduct):');
    if (!raw) return;
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error('Enter a non-zero adjustment.');
      return;
    }
    const reason = window.prompt('Reason for this adjustment (stored in the audit log):');
    if (!reason || !reason.trim()) {
      toast.error('An adjustment reason is required.');
      return;
    }
    void run(
      `adjust-${earningId}`,
      () => dbOperations.adminAdjustRiderEarning(earningId, delta, reason.trim()),
      'Earning adjusted and audited'
    );
  };

  const saveCommission = (rider: DeliveryPartner) => {
    const raw = commissions[rider.id];
    const percentage = raw === '' || raw === undefined ? null : Number(raw);
    if (percentage != null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
      setError('Commission must be between 0 and 100.');
      return;
    }
    return run(
      `commission-${rider.id}`,
      () => dbOperations.adminSetRiderCommission(rider.id, percentage),
      'Commission rule saved'
    );
  };

  const saveServiceAreas = (rider: DeliveryPartner) => {
    const area = baseArea[rider.id] || { state: rider.state, city: rider.city };
    return run(
      `areas-${rider.id}`,
      () =>
        dbOperations.adminSetRiderServiceAreas(
          rider.id,
          serviceSelection[rider.id] ?? rider.serviceStates ?? [],
          area.state,
          area.city
        ),
      'Service area updated'
    );
  };

  const assign = (rider: DeliveryPartner) => {
    const raw = assignments[rider.id];
    if (!raw) {
      setError('Choose a ready delivery to assign.');
      return;
    }
    return run(
      `assign-${rider.id}`,
      () => dbOperations.assignDeliveryRider(Number(raw), rider.id),
      'Delivery offered to rider (30 minute acceptance window)'
    );
  };

  const availableDeliveries = db.deliveries.filter(
    (delivery) =>
      !delivery.riderId &&
      ['READY_FOR_PICKUP', 'AWAITING_RIDER'].includes(delivery.status) &&
      !isDeliveryTerminal(delivery.status)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: 'Pending review', value: metrics.pending, tone: 'text-gold-700 dark:text-gold-300' },
          { label: 'Approved riders', value: metrics.approved, tone: 'text-jade-700 dark:text-jade-300' },
          { label: 'Online now', value: metrics.online, tone: 'text-jade-700 dark:text-jade-300' },
          { label: 'Suspended', value: metrics.suspended, tone: 'text-red-600 dark:text-red-300' },
          { label: 'Pending earnings', value: `₦${Math.round(metrics.pendingEarnings).toLocaleString()}`, tone: 'text-ink-800 dark:text-white' },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-ink-400">{card.label}</span>
            <span className={`mt-1 block text-lg font-bold ${card.tone}`}>{card.value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search riders by name, phone, city or vehicle…"
            className={`${inputClass} pl-9`}
          />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} sm:w-40`}>
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select
          value={availabilityFilter}
          onChange={(event) => setAvailabilityFilter(event.target.value)}
          className={`${inputClass} sm:w-36`}
        >
          <option value="ALL">Any availability</option>
          <option value="ONLINE">Online</option>
          <option value="OFFLINE">Offline</option>
        </select>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 p-10 text-center dark:border-ink-700">
          <Truck className="mx-auto h-8 w-8 text-ink-300 dark:text-ink-600" />
          <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">No riders match these filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((rider) => {
            const expanded = expandedId === rider.id;
            const riderDeliveries = db.deliveries.filter((delivery) => delivery.riderId === rider.id);
            const current = riderDeliveries.filter((delivery) => !isDeliveryTerminal(delivery.status));
            const history = riderDeliveries.filter((delivery) => isDeliveryTerminal(delivery.status));
            const earnings = db.riderEarnings.filter((earning) => earning.riderId === rider.id);
            const audits = db.riderEarningAuditLogs.filter((log) => log.riderId === rider.id);
            const accountHistory = db.auditLogs
              .filter((log) => log.entityType === 'delivery_partners' && log.entityId === rider.id)
              .slice(0, 12);
            const docs = [
              rider.photoUrl ? { label: 'Profile photo', url: rider.photoUrl } : null,
              rider.selfieUrl ? { label: 'Selfie verification', url: rider.selfieUrl } : null,
              rider.licenseUrl ? { label: "Driver's licence", url: rider.licenseUrl } : null,
              ...(rider.documents ?? []).map((doc) => ({ label: doc.label, url: doc.url })),
            ].filter(Boolean) as { label: string; url: string }[];
            const selectedAreas = serviceSelection[rider.id] ?? rider.serviceStates ?? [];
            const area = baseArea[rider.id] ?? { state: rider.state, city: rider.city };

            return (
              <div key={rider.id} className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink-900 dark:text-white">{rider.fullName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[rider.status]}`}>
                        {rider.status}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          rider.isAvailable
                            ? 'bg-jade-100 text-jade-700 dark:bg-jade-500/15 dark:text-jade-300'
                            : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400'
                        }`}
                      >
                        {rider.isAvailable ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
                      <span>{rider.vehicleType}</span>
                      <span>· {[rider.city, rider.state].filter(Boolean).join(', ')}</span>
                      <span>· {rider.completedDeliveries} completed</span>
                      {rider.commissionPercentage != null && <span>· {rider.commissionPercentage}% commission</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400">
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {rider.phone}</span>
                      <span>{rider.email}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedId(expanded ? null : rider.id)}
                    className="inline-flex shrink-0 items-center gap-1 self-start rounded-xl border border-ink-200 px-3 py-2 text-[11px] font-bold text-ink-600 dark:border-ink-700 dark:text-ink-300"
                  >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expanded ? 'Close rider file' : 'Manage rider'}
                  </button>
                </div>

                {expanded && (
                  <div className="space-y-5 border-t border-ink-100 bg-ink-50/50 p-4 dark:border-ink-800 dark:bg-ink-950/30">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3 rounded-xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                        <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                          <ShieldCheck className="h-3.5 w-3.5 text-jade-500" /> Verification file
                        </h4>
                        <dl className="grid grid-cols-2 gap-2 text-[11px]">
                          {[
                            ['NIN', rider.nin || '—'],
                            ['Vehicle', `${rider.brand || ''} ${rider.model || ''}`.trim() || '—'],
                            ['Plate', rider.plateNumber || '—'],
                            ['Emergency', rider.emergencyContactName || '—'],
                            ['Emergency phone', rider.emergencyContactPhone || '—'],
                            ['Relationship', rider.emergencyContactRelation || '—'],
                            ['Applied', new Date(rider.createdAt).toLocaleDateString()],
                            ['Reviewed', rider.reviewedAt ? new Date(rider.reviewedAt).toLocaleDateString() : '—'],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt className="text-ink-400">{label}</dt>
                              <dd className="truncate font-semibold text-ink-800 dark:text-ink-200">{value}</dd>
                            </div>
                          ))}
                        </dl>
                        {rider.rejectionReason && (
                          <p className="rounded-lg bg-ink-100 p-2 text-[11px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                            Rejection: {rider.rejectionReason}
                          </p>
                        )}
                        {rider.suspensionReason && (
                          <p className="rounded-lg bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
                            Suspension: {rider.suspensionReason}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {docs.length === 0 ? (
                            <p className="col-span-2 text-[11px] text-ink-400">No files uploaded.</p>
                          ) : (
                            docs.map((doc, index) => (
                              <a
                                key={`${doc.label}-${index}`}
                                href={doc.url || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-2 py-1.5 text-[10px] font-semibold text-ink-600 dark:border-ink-700 dark:text-ink-300"
                              >
                                <FileText className="h-3.5 w-3.5 shrink-0 text-jade-500" />
                                <span className="truncate">{doc.label}</span>
                              </a>
                            ))
                          )}
                        </div>

                        {accountHistory.length > 0 && (
                          <details className="border-t border-ink-100 pt-3 dark:border-ink-800">
                            <summary className="cursor-pointer text-[10px] font-bold text-ink-500 dark:text-ink-400">
                              Account history ({accountHistory.length})
                            </summary>
                            <ul className="mt-1.5 space-y-1 text-[10px] text-ink-500 dark:text-ink-400">
                              {accountHistory.map((log) => (
                                <li key={log.id}>
                                  {new Date(log.createdAt).toLocaleString()} · {log.action.replaceAll('_', ' ')} · {log.details}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}

                        <div className="space-y-2 border-t border-ink-100 pt-3 dark:border-ink-800">
                          <input
                            value={reasons[rider.id] ?? ''}
                            onChange={(event) => setReasons((current) => ({ ...current, [rider.id]: event.target.value }))}
                            placeholder="Rejection / suspension reason"
                            className={inputClass}
                          />
                          <div className="flex flex-wrap gap-2">
                            {rider.status !== 'APPROVED' && (
                              <button
                                onClick={() => void review(rider, 'APPROVED')}
                                disabled={busy !== null}
                                className="inline-flex items-center gap-1 rounded-lg bg-jade-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> {rider.status === 'SUSPENDED' ? 'Reactivate' : 'Approve'}
                              </button>
                            )}
                            {rider.status === 'PENDING' && (
                              <button
                                onClick={() => void review(rider, 'REJECTED')}
                                disabled={busy !== null}
                                className="inline-flex items-center gap-1 rounded-lg border border-ink-300 px-3 py-2 text-[11px] font-bold text-ink-700 disabled:opacity-50 dark:border-ink-600 dark:text-ink-200"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Reject
                              </button>
                            )}
                            {rider.status === 'APPROVED' && (
                              <button
                                onClick={() => void review(rider, 'SUSPENDED')}
                                disabled={busy !== null}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-[11px] font-bold text-red-700 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300"
                              >
                                <Ban className="h-3.5 w-3.5" /> Suspend
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                        <div>
                          <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                            <MapPin className="h-3.5 w-3.5 text-jade-500" /> Service areas & commission
                          </h4>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <select
                              value={area.state}
                              onChange={(event) => {
                                const next = { ...area, state: event.target.value };
                                setBaseArea((current) => ({ ...current, [rider.id]: next }));
                              }}
                              className={inputClass}
                            >
                              {states.map((state) => <option key={state} value={state}>{state}</option>)}
                            </select>
                            <input
                              value={area.city}
                              onChange={(event) => {
                                const next = { ...area, city: event.target.value };
                                setBaseArea((current) => ({ ...current, [rider.id]: next }));
                              }}
                              placeholder="Base city"
                              className={inputClass}
                            />
                          </div>
                          <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                            {states.map((state) => {
                              const selected = selectedAreas.includes(state);
                              return (
                                <button
                                  key={state}
                                  onClick={() =>
                                    setServiceSelection((current) => {
                                      const list = current[rider.id] ?? rider.serviceStates ?? [];
                                      return {
                                        ...current,
                                        [rider.id]: list.includes(state)
                                          ? list.filter((item) => item !== state)
                                          : [...list, state],
                                      };
                                    })
                                  }
                                  className={`rounded-full border px-2 py-1 text-[9px] font-bold ${
                                    selected
                                      ? 'border-jade-500 bg-jade-500 text-white'
                                      : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'
                                  }`}
                                >
                                  {state.replace(' State', '')}
                                </button>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={commissions[rider.id] ?? (rider.commissionPercentage ?? '')}
                              onChange={(event) =>
                                setCommissions((current) => ({ ...current, [rider.id]: event.target.value }))
                              }
                              placeholder="Platform %"
                              className={inputClass}
                            />
                            <button
                              onClick={() => void saveCommission(rider)}
                              disabled={busy !== null}
                              className="shrink-0 rounded-lg bg-ink-900 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50 dark:bg-white dark:text-ink-900"
                            >
                              Save %
                            </button>
                          </div>
                          <button
                            onClick={() => void saveServiceAreas(rider)}
                            disabled={busy !== null}
                            className="mt-2 w-full rounded-lg border border-jade-500/40 bg-jade-50 px-3 py-2 text-[10px] font-bold text-jade-700 disabled:opacity-50 dark:bg-jade-500/10 dark:text-jade-300"
                          >
                            Save service area
                          </button>
                        </div>

                        <div className="border-t border-ink-100 pt-3 dark:border-ink-800">
                          <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                            <Truck className="h-3.5 w-3.5 text-jade-500" /> Assign a delivery
                          </h4>
                          <div className="mt-2 flex gap-2">
                            <select
                              value={assignments[rider.id] ?? ''}
                              onChange={(event) =>
                                setAssignments((current) => ({ ...current, [rider.id]: event.target.value }))
                              }
                              className={inputClass}
                            >
                              <option value="">Select ready delivery…</option>
                              {availableDeliveries.map((delivery) => (
                                <option key={delivery.id} value={delivery.id}>
                                  {delivery.deliveryNumber} · {delivery.deliveryCity || delivery.deliveryState}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => void assign(rider)}
                              disabled={busy !== null || availableDeliveries.length === 0}
                              className="shrink-0 rounded-lg bg-jade-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50"
                            >
                              Offer
                            </button>
                          </div>
                          <p className="mt-1 text-[10px] text-ink-400">
                            The rider has 30 minutes to accept before the offer expires.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Current deliveries</h4>
                        {current.length === 0 ? (
                          <p className="mt-2 text-[11px] text-ink-400">No deliveries assigned right now.</p>
                        ) : (
                          <ul className="mt-2 divide-y divide-ink-100 text-[11px] dark:divide-ink-800">
                            {current.map((delivery) => (
                              <li key={delivery.id} className="flex items-center justify-between gap-2 py-2">
                                <span className="min-w-0">
                                  <span className="block truncate font-bold text-ink-800 dark:text-ink-200">{delivery.deliveryNumber}</span>
                                  <span className="text-ink-400">
                                    {delivery.status.replaceAll('_', ' ')} · {delivery.assignmentStatus.toLowerCase()}
                                  </span>
                                </span>
                                <span className="shrink-0 font-mono text-ink-500">₦{delivery.deliveryFee.toLocaleString()}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="rounded-xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Completion history</h4>
                        {history.length === 0 ? (
                          <p className="mt-2 text-[11px] text-ink-400">No completed or failed deliveries yet.</p>
                        ) : (
                          <ul className="mt-2 max-h-48 divide-y divide-ink-100 overflow-y-auto text-[11px] dark:divide-ink-800">
                            {history.map((delivery) => (
                              <li key={delivery.id} className="flex items-center justify-between gap-2 py-2">
                                <span className="min-w-0">
                                  <span className="block truncate font-bold text-ink-800 dark:text-ink-200">{delivery.deliveryNumber}</span>
                                  <span className={delivery.status === 'DELIVERED' ? 'text-jade-600 dark:text-jade-400' : 'text-red-600 dark:text-red-300'}>
                                    {delivery.status.replaceAll('_', ' ')}
                                  </span>
                                  {delivery.failureReason && <span className="block text-ink-400">{delivery.failureReason}</span>}
                                </span>
                                <span className="shrink-0 text-ink-400">{new Date(delivery.updatedAt).toLocaleDateString()}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
                      <div className="flex items-center justify-between">
                        <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">
                          <Wallet className="h-3.5 w-3.5 text-jade-500" /> Earnings ledger
                        </h4>
                        <span className="text-[10px] text-ink-400">{earnings.length} entries</span>
                      </div>
                      {earnings.length === 0 ? (
                        <p className="mt-2 text-[11px] text-ink-400">No earnings recorded. A delivery creates an entry when completed.</p>
                      ) : (
                        <ul className="mt-2 divide-y divide-ink-100 text-[11px] dark:divide-ink-800">
                          {earnings.map((earning) => (
                            <li key={earning.id} className="py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-ink-800 dark:text-ink-200">Earning #{earning.id}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${EARNING_STYLE[earning.status]}`}>
                                    {earning.status}
                                  </span>
                                  <span className="text-ink-400">
                                    fee ₦{earning.grossAmount.toLocaleString()} · commission ₦{earning.platformCommission.toLocaleString()} · net{' '}
                                    <strong className="text-ink-700 dark:text-ink-200">₦{earning.netAmount.toLocaleString()}</strong>
                                  </span>
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {earning.status === 'PENDING' && (
                                    <button
                                      onClick={() => void earningStatus(earning.id, 'APPROVED')}
                                      disabled={busy !== null}
                                      className="rounded-lg bg-jade-600 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                  )}
                                  {earning.status !== 'PAID' && earning.status !== 'VOID' && (
                                    <>
                                      <button
                                        onClick={() => void earningStatus(earning.id, 'PAID')}
                                        disabled={busy !== null}
                                        className="rounded-lg bg-ink-900 px-2.5 py-1.5 text-[9px] font-bold text-white disabled:opacity-50 dark:bg-white dark:text-ink-900"
                                      >
                                        Record payout
                                      </button>
                                      <button
                                        onClick={() => void adjustEarning(earning.id)}
                                        disabled={busy !== null}
                                        className="rounded-lg border border-ink-300 px-2.5 py-1.5 text-[9px] font-bold text-ink-600 disabled:opacity-50 dark:border-ink-600 dark:text-ink-300"
                                      >
                                        Adjust
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              {earning.payoutReference && (
                                <p className="mt-1 font-mono text-[10px] text-ink-500 dark:text-ink-400">
                                  Payout ref: {earning.payoutReference}
                                  {earning.paidAt ? ` · ${new Date(earning.paidAt).toLocaleString()}` : ''}
                                </p>
                              )}
                              {earning.notes && <p className="mt-0.5 text-[10px] text-ink-400">{earning.notes}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {audits.length > 0 && (
                        <details className="mt-2 border-t border-ink-100 pt-2 dark:border-ink-800">
                          <summary className="cursor-pointer text-[10px] font-bold text-ink-500 dark:text-ink-400">
                            Earning audit log ({audits.length})
                          </summary>
                          <ul className="mt-1.5 space-y-1 text-[10px] text-ink-500 dark:text-ink-400">
                            {audits.map((log) => (
                              <li key={log.id}>
                                {new Date(log.createdAt).toLocaleString()} · {log.actorName || 'Admin'} · {log.action.replaceAll('_', ' ')} · ₦
                                {log.amountBefore.toLocaleString()} → ₦{log.amountAfter.toLocaleString()} · {log.details}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 rounded-xl border border-ink-200 bg-white p-3 text-[10px] leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
        <Clock className="mt-0.5 h-3 w-3 shrink-0" />
        Rider earnings are recorded when a delivery is confirmed. “Record payout” only records a manual payout reference; GoodSale
        does not transfer money automatically until a payout integration is connected.
      </p>
    </div>
  );
}
