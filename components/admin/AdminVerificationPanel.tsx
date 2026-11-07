// components/admin/AdminVerificationPanel.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  UserRound,
} from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import VerificationStatusChip from '@/components/verification/VerificationStatusChip';
import { toast } from '@/lib/feedback';
import { formatVerificationDate, humanFileSize, type VerificationStage } from '@/lib/verification';

interface AdminRow {
  id: number;
  stage: VerificationStage;
  rawStatus: string;
  sellerType: 'INDIVIDUAL' | 'BUSINESS';
  sellerId: number;
  legalName: string;
  sellerName: string;
  sellerUsername: string;
  sellerEmail: string;
  sellerPhone: string;
  sellerRole: string;
  accountVerificationStatus: string;
  accountSuspended: boolean;
  storeName: string;
  city: string;
  state: string;
  submittedAt: string;
  decidedAt: string;
  expiresAt: string;
  createdAt: string;
  rejectionReason: string;
  infoRequestNote: string;
}

interface Detail {
  application: AdminRow & {
    documentType: string;
    documentNumberMasked: string;
    dateOfBirth: string;
    phone: string;
    email: string;
    address: string;
    businessName: string;
    businessRegistrationNumber: string;
    businessContactName: string;
    businessAddress: string;
    storeDescription: string;
    storeCity: string;
    storeState: string;
    storePhone: string;
    declarationAcceptedAt: string;
    reviewStartedAt: string;
    reviewedBy: number | null;
  };
  seller: {
    id: number;
    full_name: string;
    username: string;
    email: string;
    phone_number: string;
    role: string;
    state: string;
    city: string;
    created_at: string;
    is_suspended: boolean;
    verification_status: string;
    verified_at: string | null;
  } | null;
  store: {
    id: number;
    name: string;
    description: string;
    city: string;
    state: string;
    address: string;
    contact_phone: string;
    contact_email: string;
    logo_url: string;
    is_verified: boolean;
    seller_type: string;
  } | null;
  documents: { id: number; slot: string; label: string; mimeType: string; sizeBytes: number; uploadedAt: string }[];
  events: {
    id: number;
    action: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    internalNote: string;
    adminId: number | null;
    createdAt: string;
    isInternal: boolean;
  }[];
  history: AdminRow[];
  canDecide: boolean;
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'UNDER_REVIEW', label: 'In review' },
  { key: 'INFO_REQUIRED', label: 'Info needed' },
  { key: 'APPROVED', label: 'Verified' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'REVOKED', label: 'Revoked' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'DRAFT', label: 'Drafts' },
];

const ACTION_COPY: Record<string, { label: string; icon: typeof Check; tone: 'primary' | 'outline' | 'danger'; requireReason?: boolean; blurb: string }> = {
  START_REVIEW: {
    label: 'Start review',
    icon: Clock3,
    tone: 'outline',
    blurb: 'Marks the application as under review and tells the seller.',
  },
  APPROVE: {
    label: 'Approve & verify',
    icon: BadgeCheck,
    tone: 'primary',
    blurb: 'Issues the GoodSale Verified badge, upgrades the seller role and starts a 12-month validity period.',
  },
  REQUEST_INFO: {
    label: 'Request information',
    icon: AlertTriangle,
    tone: 'outline',
    requireReason: true,
    blurb: 'Returns the application to the seller with your note. Nothing is verified.',
  },
  REJECT: {
    label: 'Reject application',
    icon: ShieldX,
    tone: 'danger',
    requireReason: true,
    blurb: 'Rejects the application. The seller can correct the details and apply again.',
  },
  SUSPEND: {
    label: 'Suspend verification',
    icon: ShieldAlert,
    tone: 'danger',
    requireReason: true,
    blurb: 'Hides the public badge immediately while the account is reviewed.',
  },
  REVOKE: {
    label: 'Revoke verification',
    icon: ShieldX,
    tone: 'danger',
    requireReason: true,
    blurb: 'Permanently removes verification and the badge until the seller is verified again.',
  },
  EXPIRE: {
    label: 'Mark expired',
    icon: Clock3,
    tone: 'outline',
    blurb: 'Ends the verification period and removes the badge.',
  },
  NOTE: {
    label: 'Add internal note',
    icon: FileText,
    tone: 'outline',
    blurb: 'Internal only. The seller never sees this note.',
  },
};

const SLOT_LABEL: Record<string, string> = {
  ID_FRONT: 'Identity document',
  ID_BACK: 'Back of ID',
  SELFIE: 'Selfie with ID',
  ADDRESS_PROOF: 'Proof of address',
  CAC_CERT: 'Business certificate',
  STORE_LOGO: 'Store logo',
};

function availableActions(stage: VerificationStage): string[] {
  switch (stage) {
    case 'PENDING':
      return ['START_REVIEW', 'APPROVE', 'REQUEST_INFO', 'REJECT', 'NOTE'];
    case 'UNDER_REVIEW':
      return ['APPROVE', 'REQUEST_INFO', 'REJECT', 'NOTE'];
    case 'INFO_REQUIRED':
      return ['START_REVIEW', 'APPROVE', 'REJECT', 'NOTE'];
    case 'VERIFIED':
      return ['SUSPEND', 'REVOKE', 'EXPIRE', 'NOTE'];
    case 'SUSPENDED':
      return ['REVOKE', 'NOTE'];
    case 'EXPIRED':
      return ['REVOKE', 'NOTE'];
    default:
      return ['NOTE'];
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error || 'Request failed.');
  return body as T;
}

export default function AdminVerificationPanel() {
  const [status, setStatus] = useState('ALL');
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [canDecide, setCanDecide] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [openingDoc, setOpeningDoc] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setError('');
    try {
      const body = await getJson<{ applications: AdminRow[]; counts: Record<string, number>; canDecide: boolean }>(
        `/api/admin/verifications?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`
      );
      setRows(body.applications || []);
      setCounts(body.counts || {});
      setCanDecide(Boolean(body.canDecide));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load verification applications.');
    } finally {
      setLoading(false);
    }
  }, [status, query]);

  useEffect(() => {
    setLoading(true);
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const body = await getJson<Detail>(`/api/admin/verifications?id=${id}`);
      setDetail(body);
      setCanDecide(Boolean(body.canDecide));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the application.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const select = (id: number) => {
    setSelectedId(id);
    void loadDetail(id);
  };

  const pendingCount = (counts.PENDING || 0) + (counts.UNDER_REVIEW || 0) + (counts.INFO_REQUIRED || 0);

  const runAction = async () => {
    if (!action || !detail) return;
    const copy = ACTION_COPY[action];
    if (copy.requireReason && !reason.trim()) {
      toast.error('Enter a reason before continuing.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: detail.application.id,
          action,
          reason: reason.trim(),
          internalNote: internalNote.trim(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || 'Could not record the decision.');
      toast.success(`${copy.label} recorded.`, 'Verification updated');
      setAction(null);
      setReason('');
      setInternalNote('');
      await Promise.all([loadList(), loadDetail(detail.application.id)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not record the decision.');
    } finally {
      setBusy(false);
    }
  };

  const openDocument = async (documentId: number) => {
    setOpeningDoc(documentId);
    try {
      const body = await getJson<{ url: string }>(`/api/admin/verifications/documents?id=${documentId}`);
      window.open(body.url, '_blank', 'noopener,noreferrer');
      // Refresh the audit trail so the document view is visible immediately.
      if (detail) void loadDetail(detail.application.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the document.');
    } finally {
      setOpeningDoc(null);
    }
  };

  const actions = useMemo(() => (detail ? availableActions(detail.application.stage) : []), [detail]);
  const sellerLabel = detail
    ? detail.seller?.full_name ||
      detail.application.sellerName ||
      detail.application.legalName ||
      `Seller #${detail.application.sellerId}`
    : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-jade-500" aria-hidden="true" />
            Seller verification management
          </p>
          <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
            {pendingCount} application{pendingCount === 1 ? '' : 's'} awaiting a decision · every
            approval, rejection and document view is logged.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(searchInput.trim());
          }}
          className="flex w-full gap-2 sm:w-auto"
        >
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search seller, email, store"
              className="w-full rounded-xl border border-ink-200 bg-white py-2 pl-8 pr-3 text-xs text-ink-800 outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950/50 dark:text-white"
            />
          </div>
          <Button size="sm" type="submit">Search</Button>
          {query ? (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setSearchInput('');
                setQuery('');
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((filter) => {
          const count =
            filter.key === 'ALL'
              ? Object.values(counts).reduce((sum, value) => sum + value, 0)
              : filter.key === 'APPROVED'
                ? counts.APPROVED || 0
                : counts[filter.key] || 0;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatus(filter.key)}
              className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors ${
                status === filter.key
                  ? 'bg-jade-500 text-white'
                  : 'bg-ink-100 text-ink-600 hover:text-ink-900 dark:bg-ink-800 dark:text-ink-300 dark:hover:text-white'
              }`}
            >
              {filter.label}
              {count ? <span className="ml-1 opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {!canDecide ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[11px] text-amber-800 dark:text-amber-300">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          You can review applications and documents, but only ADMIN or SUPER_ADMIN accounts can
          approve, reject, suspend or revoke verification.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
        <div className={`overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900 ${selectedId ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <div className="flex items-center gap-2 p-8 text-xs text-ink-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading applications…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <FileCheck2 className="mx-auto h-7 w-7 text-ink-300" aria-hidden="true" />
              <p className="mt-2 text-xs font-semibold text-ink-600 dark:text-ink-300">No applications here</p>
              <p className="mt-1 text-[11px] text-ink-400">Try another status filter or clear the search.</p>
            </div>
          ) : (
            <ul className="max-h-[640px] divide-y divide-ink-100 overflow-y-auto dark:divide-ink-800">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => select(row.id)}
                    className={`flex w-full items-start justify-between gap-3 p-3.5 text-left transition-colors hover:bg-ink-50 dark:hover:bg-ink-950/40 ${
                      selectedId === row.id ? 'bg-jade-500/[0.06]' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-bold text-ink-900 dark:text-white">
                          {row.sellerName || row.legalName || `Seller #${row.sellerId}`}
                        </span>
                        {row.sellerType === 'BUSINESS' ? (
                          <Building2 className="h-3 w-3 text-ink-400" aria-hidden="true" />
                        ) : (
                          <UserRound className="h-3 w-3 text-ink-400" aria-hidden="true" />
                        )}
                        {row.accountSuspended ? (
                          <span className="rounded bg-red-500/10 px-1 py-0.5 text-[9px] font-bold uppercase text-red-600 dark:text-red-300">
                            Account suspended
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-ink-400">
                        {row.storeName || 'No store name'} · {[row.city, row.state].filter(Boolean).join(', ') || 'Nigeria'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        #{row.id} · {row.submittedAt ? `submitted ${formatVerificationDate(row.submittedAt)}` : `created ${formatVerificationDate(row.createdAt)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <VerificationStatusChip stage={row.stage} size="sm" />
                      <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${selectedId ? '' : 'hidden lg:block'}`}>
          {!selectedId ? (
            <div className="grid h-full min-h-[220px] place-items-center rounded-2xl border border-dashed border-ink-250 bg-white p-8 text-center dark:border-ink-700 dark:bg-ink-900">
              <div>
                <FileCheck2 className="mx-auto h-8 w-8 text-ink-300" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-ink-700 dark:text-ink-200">Select an application</p>
                <p className="mt-1 max-w-xs text-[11px] text-ink-400">
                  Review the seller&apos;s details, open documents in protected storage, then approve,
                  reject or ask for more information.
                </p>
              </div>
            </div>
          ) : detailLoading && !detail ? (
            <div className="flex items-center gap-2 rounded-2xl border border-ink-200 bg-white p-8 text-xs text-ink-500 dark:border-ink-800 dark:bg-ink-900">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the file…
            </div>
          ) : detail ? (
            <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
              <div className="border-b border-ink-150 p-4 dark:border-ink-800">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-400 lg:hidden"
                >
                  <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back to queue
                </button>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-base font-bold text-ink-950 dark:text-white">
                      {sellerLabel}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      {detail.application.sellerType === 'BUSINESS' ? 'Registered business' : 'Individual seller'}
                      {' · '}Application #{detail.application.id}
                      {detail.seller?.username ? ` · @${detail.seller.username}` : ''}
                    </p>
                  </div>
                  <VerificationStatusChip stage={detail.application.stage} />
                </div>
              </div>

              <div className="max-h-[560px] space-y-4 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    ['Legal name', detail.application.legalName],
                    ['Contact phone', detail.application.phone || detail.seller?.phone_number || '—'],
                    ['Email', detail.application.email || detail.seller?.email || '—'],
                    ['Date of birth', detail.application.dateOfBirth || '—'],
                    ['Location', [detail.application.city, detail.application.state].filter(Boolean).join(', ') || '—'],
                    ['Address', detail.application.address || '—'],
                    ['Document type', detail.application.documentType || '—'],
                    ['Document reference', detail.application.documentNumberMasked || '—'],
                    ['Submitted', detail.application.submittedAt ? new Date(detail.application.submittedAt).toLocaleString() : '—'],
                    ['Declaration', detail.application.declarationAcceptedAt ? new Date(detail.application.declarationAcceptedAt).toLocaleString() : 'Not recorded'],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</p>
                      <p className="truncate text-xs text-ink-800 dark:text-ink-100">{value}</p>
                    </div>
                  ))}
                </div>

                {detail.application.sellerType === 'BUSINESS' ? (
                  <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                      <Building2 className="h-3 w-3" aria-hidden="true" /> Business
                    </p>
                    <dl className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {[
                        ['Registered name', detail.application.businessName || '—'],
                        ['Registration number', detail.application.businessRegistrationNumber || '—'],
                        ['Contact name', detail.application.businessContactName || '—'],
                        ['Business address', detail.application.businessAddress || '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-[10px] text-ink-400">{label}</dt>
                          <dd className="truncate text-xs text-ink-800 dark:text-ink-100">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}

                <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Store</p>
                  <p className="mt-1 text-xs font-semibold text-ink-800 dark:text-ink-100">
                    {detail.store?.name || detail.application.storeName || 'No store'}
                  </p>
                  <p className="text-[11px] text-ink-500 dark:text-ink-400">
                    {[detail.store?.city || detail.application.storeCity, detail.store?.state || detail.application.storeState]
                      .filter(Boolean)
                      .join(', ') || 'No location'}
                  </p>
                  {detail.store?.description || detail.application.storeDescription ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                      {detail.store?.description || detail.application.storeDescription}
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                    <Lock className="h-3 w-3" aria-hidden="true" /> Private documents
                  </p>
                  {detail.documents.length === 0 ? (
                    <p className="mt-1.5 text-[11px] text-ink-400">No documents attached.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-1.5">
                      {detail.documents.map((document) => (
                        <li
                          key={document.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-ink-150 bg-white p-2.5 dark:border-ink-800 dark:bg-ink-950/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-ink-800 dark:text-ink-100">
                              {SLOT_LABEL[document.slot] || document.slot}
                            </p>
                            <p className="text-[10px] text-ink-400">
                              {humanFileSize(document.sizeBytes)} · uploaded {formatVerificationDate(document.uploadedAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void openDocument(document.id)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink-900 px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-ink-800 dark:bg-white dark:text-ink-950"
                          >
                            {openingDoc === document.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            )}
                            Open
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1.5 text-[10px] text-ink-400">
                    Links expire after 90 seconds and every open is recorded in the audit history.
                  </p>
                </div>

                {detail.application.rejectionReason ? (
                  <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Last decision reason</p>
                    <p className="mt-1 text-xs text-ink-700 dark:text-ink-200">{detail.application.rejectionReason}</p>
                  </div>
                ) : null}

                {detail.history.length > 1 ? (
                  <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                      Previous applications
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {detail.history
                        .filter((entry) => entry.id !== detail.application.id)
                        .map((entry) => (
                          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-600 dark:text-ink-300">
                            <span>
                              #{entry.id} · {formatVerificationDate(entry.submittedAt || entry.createdAt)}
                            </span>
                            <VerificationStatusChip stage={entry.stage} size="sm" />
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}

                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                    <History className="h-3 w-3" aria-hidden="true" /> Audit history
                  </p>
                  <ol className="mt-1.5 space-y-2">
                    {detail.events.map((event) => (
                      <li key={event.id} className="border-l border-ink-150 pl-2.5 dark:border-ink-800">
                        <p className="text-[11px] font-semibold text-ink-800 dark:text-ink-100">
                          {event.action.replace(/_/g, ' ').toLowerCase()}
                          {event.toStatus ? (
                            <span className="ml-1 font-normal text-ink-400">
                              {event.fromStatus ? `${event.fromStatus} → ` : ''}
                              {event.toStatus}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[10px] text-ink-400">
                          {new Date(event.createdAt).toLocaleString()}
                          {event.adminId ? ` · admin #${event.adminId}` : ' · system'}
                        </p>
                        {event.reason ? (
                          <p className="text-[10px] text-ink-500 dark:text-ink-400">Reason: {event.reason}</p>
                        ) : null}
                        {event.internalNote ? (
                          <p className="text-[10px] italic text-ink-400">{event.internalNote}</p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="border-t border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Decide</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {actions.map((key) => {
                    const copy = ACTION_COPY[key];
                    const Icon = copy.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!canDecide && key !== 'NOTE'}
                        onClick={() => {
                          setAction(key);
                          setReason('');
                          setInternalNote('');
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          copy.tone === 'primary'
                            ? 'bg-jade-500 text-white hover:bg-jade-600'
                            : copy.tone === 'danger'
                              ? 'border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-300'
                              : 'border border-ink-200 bg-white text-ink-700 hover:border-jade-500/40 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        {copy.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center text-xs text-ink-400 dark:border-ink-800 dark:bg-ink-900">
              Could not load this application.
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(action)}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title={action ? ACTION_COPY[action].label : ''}
        description={action ? ACTION_COPY[action].blurb : ''}
      >
        {action ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 text-[11px] text-ink-600 dark:border-ink-800 dark:bg-ink-950/30 dark:text-ink-300">
              Application #{detail?.application.id} · {sellerLabel} · {detail?.application.stage}
            </div>
            {action !== 'NOTE' ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-ink-600 dark:text-ink-300">
                  Reason shown to the seller {ACTION_COPY[action].requireReason ? '(required)' : '(optional)'}
                </span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  className="min-h-[80px] w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-800 outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950/50 dark:text-white"
                  placeholder="Be specific so the seller can act on it."
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-ink-600 dark:text-ink-300">
                Internal note (never shown to the seller)
              </span>
              <textarea
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                maxLength={500}
                className="min-h-[60px] w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-800 outline-none focus:border-jade-500 dark:border-ink-700 dark:bg-ink-950/50 dark:text-white"
                placeholder="Optional reviewer context for the audit log."
              />
            </label>
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              This is recorded against your admin account with a timestamp and cannot be undone from
              the interface. Confirm the evidence before continuing.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" disabled={busy} onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                variant={ACTION_COPY[action].tone === 'danger' ? 'danger' : 'primary'}
                loading={busy}
                onClick={() => void runAction()}
              >
                Confirm {ACTION_COPY[action].label.toLowerCase()}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
