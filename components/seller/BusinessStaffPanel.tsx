'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import { toast } from '@/lib/feedback';
import {
  STAFF_ROLES,
  staffRoleDescription,
  staffRoleLabel,
  type StaffRole,
} from '@/lib/business/staff';

type StaffRow = {
  id: number;
  memberId: number;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};
type Membership = {
  id: number;
  ownerId: number;
  businessName: string;
  role: string;
  status: string;
};

export default function BusinessStaffPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('ANALYST');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/business/staff', { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not load staff access');
      setStaff(Array.isArray(payload.staff) ? payload.staff : []);
      setMemberships(Array.isArray(payload.memberships) ? payload.memberships : []);
      setCanManage(Boolean(payload.canManage));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load staff access');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addStaff = async () => {
    if (!email.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/business/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not add staff');
      setEmail('');
      toast.success('Staff access granted');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add staff');
    } finally {
      setSaving(false);
    }
  };

  const patchStaff = async (id: number, patch: { role?: string; status?: string }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/business/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not update staff');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update staff');
    } finally {
      setSaving(false);
    }
  };

  const removeStaff = async (id: number) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/business/staff?id=${id}`, { method: 'DELETE' });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not remove staff');
      toast.success('Staff access revoked');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove staff');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-ink-100 pt-5 dark:border-ink-850">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-jade-600" />
        <h3 className="text-xs font-bold tracking-wider text-ink-800 dark:text-white">Staff access</h3>
      </div>
      <p className="text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">
        Staff sign in with their own GoodSale account. They never see your bank details or payouts, and only their
        role&apos;s tools are available to them.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading staff…
        </p>
      ) : (
        <>
          {staff.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-3 text-xs text-ink-400 dark:border-ink-700">
              No staff yet.
            </p>
          ) : (
            <div className="space-y-2">
              {staff.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-150 bg-ink-50 p-3 text-xs dark:border-ink-800 dark:bg-ink-800/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-800 dark:text-white">{row.name}</p>
                    <p className="truncate text-[10px] text-ink-400">{row.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.role}
                      disabled={saving}
                      onChange={(event) => void patchStaff(row.id, { role: event.target.value })}
                      className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold dark:bg-ink-950 dark:text-white"
                      aria-label={`Role for ${row.name}`}
                    >
                      {STAFF_ROLES.map((option) => (
                        <option key={option} value={option}>
                          {staffRoleLabel(option)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void patchStaff(row.id, { status: row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
                      }
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                        row.status === 'ACTIVE'
                          ? 'bg-jade-100 text-jade-800 dark:bg-jade-500/15 dark:text-jade-200'
                          : 'bg-ink-200 text-ink-600 dark:bg-ink-700 dark:text-ink-300'
                      }`}
                    >
                      {row.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void removeStaff(row.id)}
                      className="grid h-6 w-6 place-items-center rounded-lg text-ink-400 hover:text-red-600"
                      aria-label={`Remove ${row.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {canManage ? (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Staff account email"
                  className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-xs dark:border-ink-700 dark:bg-ink-800/50 dark:text-white"
                />
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as StaffRole)}
                  className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-xs dark:border-ink-700 dark:bg-ink-800/50 dark:text-white"
                  aria-label="Staff role"
                >
                  {STAFF_ROLES.map((option) => (
                    <option key={option} value={option}>
                      {staffRoleLabel(option)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !email.trim()}
                  onClick={() => void addStaff()}
                  className="inline-flex items-center gap-1 rounded-xl bg-jade-600 px-4 py-2 text-xs font-bold text-white hover:bg-jade-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Add staff
                </button>
              </div>
              <p className="text-[10px] text-ink-400">{staffRoleDescription(role)}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-gold-400/25 bg-gold-300/10 px-3 py-2 text-[10px] font-semibold text-ink-600 dark:text-gold-200">
              Staff access is included with Business membership. Subscribe in the Revenue Hub to add staff.
            </p>
          )}

          {memberships.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Businesses you support</p>
              {memberships.map((entry) => (
                <p key={entry.id} className="text-[11px] text-ink-600 dark:text-ink-300">
                  {entry.businessName} · {staffRoleLabel(entry.role as StaffRole)} ·{' '}
                  <span className={entry.status === 'ACTIVE' ? 'text-jade-700 dark:text-jade-300' : 'text-ink-400'}>
                    {entry.status === 'ACTIVE' ? 'active' : 'suspended'}
                  </span>
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
