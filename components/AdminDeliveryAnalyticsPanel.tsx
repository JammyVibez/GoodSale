'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, Clock3, RefreshCw, Route, TriangleAlert } from 'lucide-react';
import type { DeliveryAnalytics } from '@/lib/types';
import { dbOperations } from '@/lib/store';

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

export default function AdminDeliveryAnalyticsPanel() {
  const [data, setData] = useState<DeliveryAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const result = await dbOperations.fetchDeliveryAnalytics();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setData(result.data || null);
  };

  useEffect(() => {
    void load();
    // Load once when the admin opens the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = data?.totals;

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-ink-900 dark:text-white">
            <BarChart3 className="h-4 w-4 text-jade-500" /> Delivery analytics
          </h3>
          <p className="mt-1 text-[11px] text-ink-500 dark:text-ink-400">
            Actual delivery records, captured fees and the rider earnings ledger. Route distance is marked separately when it is an estimate.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-2 text-xs font-bold text-ink-600 disabled:opacity-50 dark:border-ink-700 dark:text-ink-300"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-ink-500/20 bg-ink-500/5 p-3 text-[11px] text-ink-600 dark:text-ink-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {totals && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ['Total', totals.total],
              ['Completed', totals.completed],
              ['Failed / returned', totals.failed],
              ['Delayed', totals.delayed],
              ['Active', totals.active],
              ['Success rate', totals.successfulDeliveryPercentage == null ? '—' : `${totals.successfulDeliveryPercentage}%`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-ink-200 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/50">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</p>
                <p className="mt-1 font-display text-lg font-bold text-ink-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-ink-200 p-3 text-xs dark:border-ink-800">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-ink-400">
                <Clock3 className="h-3 w-3" /> Avg delivery
              </span>
              <p className="mt-1 font-mono font-bold text-ink-800 dark:text-ink-200">
                {totals.avgDeliveryHours ? `${totals.avgDeliveryHours.toFixed(1)} h` : 'No completed data'}
              </p>
              <p className="text-[10px] text-ink-400">Actual completed duration</p>
            </div>
            <div className="rounded-xl border border-ink-200 p-3 text-xs dark:border-ink-800">
              <span className="text-[10px] font-bold uppercase text-ink-400">Delivery costs</span>
              <p className="mt-1 font-mono font-bold text-ink-800 dark:text-ink-200">{money(totals.deliveryCosts)}</p>
              <p className="text-[10px] text-ink-400">Captured delivery fees</p>
            </div>
            <div className="rounded-xl border border-ink-200 p-3 text-xs dark:border-ink-800">
              <span className="text-[10px] font-bold uppercase text-ink-400">Rider earnings</span>
              <p className="mt-1 font-mono font-bold text-ink-800 dark:text-ink-200">{money(totals.riderEarnings)}</p>
              <p className="text-[10px] text-ink-400">Ledger, excluding void</p>
            </div>
            <div className="rounded-xl border border-ink-200 p-3 text-xs dark:border-ink-800">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-ink-400">
                <Route className="h-3 w-3" /> Estimated routes
              </span>
              <p className="mt-1 font-mono font-bold text-ink-800 dark:text-ink-200">{data.routeDistanceEstimateCount}</p>
              <p className="text-[10px] text-ink-400">Straight-line values</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">By state</h4>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {data.byState.length === 0 && <p className="text-[11px] text-ink-400">No state data yet.</p>}
                {data.byState.map((row) => (
                  <div key={row.state} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px] dark:bg-ink-950/50">
                    <span className="font-semibold text-ink-700 dark:text-ink-200">{row.state}</span>
                    <span className="font-mono text-ink-500">
                      {row.completed}/{row.total} · {row.failed} failed
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">By city</h4>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {data.byCity.length === 0 && <p className="text-[11px] text-ink-400">No city data yet.</p>}
                {data.byCity.map((row) => (
                  <div key={`${row.state}-${row.city}`} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px] dark:bg-ink-950/50">
                    <span className="truncate font-semibold text-ink-700 dark:text-ink-200">
                      {row.city}<span className="ml-1 font-normal text-ink-400">{row.state}</span>
                    </span>
                    <span className="ml-2 shrink-0 font-mono text-ink-500">
                      {row.completed}/{row.total} · {row.failed} failed
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">Courier performance</h4>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {data.courierPerformance.length === 0 && <p className="text-[11px] text-ink-400">No courier data yet.</p>}
                {data.courierPerformance.map((row) => (
                  <div key={row.courier} className="flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px] dark:bg-ink-950/50">
                    <span className="truncate font-semibold text-ink-700 dark:text-ink-200">{row.courier}</span>
                    <span className="ml-2 shrink-0 font-mono text-ink-500">
                      {row.completed}/{row.shipments} · {row.failed} failed
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
