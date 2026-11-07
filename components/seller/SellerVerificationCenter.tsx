// components/seller/SellerVerificationCenter.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  History,
  Info,
  Loader2,
  Lock,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import VerifiedBadge from '@/components/verification/VerifiedBadge';
import VerificationStatusChip from '@/components/verification/VerificationStatusChip';
import Button from '@/components/ui/Button';
import { confirmDialog, toast } from '@/lib/feedback';
import { salesCitiesFor, salesStates } from '@/lib/serviceAreas';
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_TYPE_OPTIONS,
  STAGE_META,
  formatVerificationDate,
  humanFileSize,
  verificationBenefits,
  verificationRequirements,
  type VerificationStage,
  type VerificationSlot,
} from '@/lib/verification';

interface ApiApplication {
  id: number;
  stage: VerificationStage;
  rawStatus: string;
  sellerType: 'INDIVIDUAL' | 'BUSINESS';
  legalName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  state: string;
  city: string;
  address: string;
  documentType: string;
  businessName: string;
  businessRegistrationNumber: string;
  businessContactName: string;
  businessAddress: string;
  storeName: string;
  storeDescription: string;
  storeCity: string;
  storeState: string;
  storePhone: string;
  submittedAt: string;
  reviewStartedAt: string;
  decidedAt: string;
  expiresAt: string;
  infoRequestNote: string;
  rejectionReason: string;
  createdAt: string;
}

interface ApiDocument {
  id: number;
  slot: VerificationSlot;
  label: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

interface ApiEvent {
  id: number;
  action: string;
  toStatus: string;
  reason: string;
  createdAt: string;
}

interface ApiState {
  success: boolean;
  profile: {
    id: number;
    fullName: string;
    email: string;
    phoneNumber: string;
    state: string;
    city: string;
    role: string;
    verificationStatus: string;
    verificationType: string;
    verifiedAt: string | null;
    verificationExpiresAt: string | null;
  };
  store: {
    id: number;
    name: string;
    description: string;
    city: string;
    state: string;
    contactPhone: string;
    logoUrl: string;
    policies: string;
  } | null;
  stage: VerificationStage;
  verified: boolean;
  application: ApiApplication | null;
  documents: ApiDocument[];
  events: ApiEvent[];
  requirements: { key: string; label: string; detail: string; step: number; complete: boolean }[];
  progress: number;
  canEdit: boolean;
  canApply: boolean;
}

interface FormState {
  sellerType: 'INDIVIDUAL' | 'BUSINESS';
  legalName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  state: string;
  city: string;
  address: string;
  documentType: string;
  documentNumber: string;
  businessName: string;
  businessRegistrationNumber: string;
  businessContactName: string;
  businessAddress: string;
  storeName: string;
  storeDescription: string;
  storeCity: string;
  storeState: string;
  storePhone: string;
}

const EMPTY_FORM: FormState = {
  sellerType: 'INDIVIDUAL',
  legalName: '',
  dateOfBirth: '',
  phone: '',
  email: '',
  state: '',
  city: '',
  address: '',
  documentType: 'NATIONAL_ID',
  documentNumber: '',
  businessName: '',
  businessRegistrationNumber: '',
  businessContactName: '',
  businessAddress: '',
  storeName: '',
  storeDescription: '',
  storeCity: '',
  storeState: '',
  storePhone: '',
};

const STEPS = [
  { id: 1, label: 'Seller type' },
  { id: 2, label: 'Your details' },
  { id: 3, label: 'Identity' },
  { id: 4, label: 'Business' },
  { id: 5, label: 'Store' },
  { id: 6, label: 'Review' },
];

const NIGERIAN_PHONE = /^(?:\+?234|0)[789]\d{9}$/;

const ACTION_LABELS: Record<string, string> = {
  DRAFT_CREATED: 'Application started',
  SUBMITTED: 'Submitted for review',
  START_REVIEW: 'Review started',
  APPROVE: 'Verification approved',
  REJECT: 'Application rejected',
  REQUEST_INFO: 'Additional information requested',
  SUSPEND: 'Verification suspended',
  REVOKE: 'Verification revoked',
  EXPIRE: 'Verification expired',
  WITHDRAWN: 'Application withdrawn',
  NOTE: 'Reviewer note added',
};

const SLOT_COPY: Record<VerificationSlot, { label: string; hint: string }> = {
  ID_FRONT: { label: 'Identity document', hint: 'Photo or PDF of your government ID' },
  ID_BACK: { label: 'Back of ID (optional)', hint: 'If your document has information on both sides' },
  SELFIE: { label: 'Selfie holding your ID', hint: 'Your face and the document, clearly visible' },
  ADDRESS_PROOF: { label: 'Proof of address (optional)', hint: 'Utility bill or bank statement' },
  CAC_CERT: { label: 'Business registration certificate', hint: 'CAC certificate or incorporation PDF' },
  STORE_LOGO: { label: 'Store logo', hint: 'Square image, at least 400×400' },
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error || 'Something went wrong. Please try again.');
  }
  return body as T;
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink-600 dark:text-ink-300">
        {label}
        {required ? <span className="text-jade-600 dark:text-jade-400">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-medium text-red-600 dark:text-red-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-medium text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-jade-500 focus:ring-2 focus:ring-jade-500/15 dark:border-ink-700 dark:bg-ink-950/50 dark:text-white';

function UploadTile({
  slot,
  document,
  uploading,
  onPick,
  onRemove,
  compact,
}: {
  slot: VerificationSlot;
  document?: ApiDocument;
  uploading: boolean;
  onPick: () => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const copy = SLOT_COPY[slot];
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-3 ${
        document
          ? 'border-jade-500/35 bg-jade-500/[0.05]'
          : 'border-dashed border-ink-250 bg-ink-50/60 dark:border-ink-700 dark:bg-ink-950/30'
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-ink-400 shadow-sm dark:bg-ink-900">
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-jade-600" aria-hidden="true" />
        ) : document ? (
          <Check className="h-5 w-5 text-jade-600" aria-hidden="true" />
        ) : (
          <FileText className="h-5 w-5" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink-800 dark:text-ink-100">{copy.label}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-400">
          {uploading
            ? 'Uploading to private storage…'
            : document
              ? `${document.label || 'Uploaded'} · ${humanFileSize(document.sizeBytes)} · ${formatVerificationDate(document.uploadedAt)}`
              : copy.hint}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPick}
            className="inline-flex items-center gap-1 rounded-lg bg-ink-900 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-ink-800 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100"
          >
            <Upload className="h-3 w-3" aria-hidden="true" />
            {document ? 'Replace' : 'Upload'}
          </button>
          {document && onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" /> Remove
            </button>
          ) : null}
          {!compact ? null : <span className="text-[10px] text-ink-400">Private</span>}
        </div>
      </div>
    </div>
  );
}

export default function SellerVerificationCenter() {
  const [data, setData] = useState<ApiState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [declaration, setDeclaration] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<VerificationSlot | null>(null);
  const [formError, setFormError] = useState('');
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSlotRef = useRef<VerificationSlot>('ID_FRONT');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const body = await api<ApiState>('/api/seller/verification');
      setData(body);
      const app = body.application;
      const store = body.store;
      setForm({
        sellerType: app?.sellerType || (store ? 'INDIVIDUAL' : 'INDIVIDUAL'),
        legalName: app?.legalName || body.profile.fullName || '',
        dateOfBirth: app?.dateOfBirth || '',
        phone: app?.phone || body.profile.phoneNumber || '',
        email: app?.email || body.profile.email || '',
        state: app?.state || body.profile.state || store?.state || '',
        city: app?.city || body.profile.city || store?.city || '',
        address: app?.address || '',
        documentType: app?.documentType || 'NATIONAL_ID',
        documentNumber: '',
        businessName: app?.businessName || '',
        businessRegistrationNumber: app?.businessRegistrationNumber || '',
        businessContactName: app?.businessContactName || '',
        businessAddress: app?.businessAddress || '',
        storeName: app?.storeName || store?.name || '',
        storeDescription: app?.storeDescription || store?.description || '',
        storeCity: app?.storeCity || store?.city || '',
        storeState: app?.storeState || store?.state || '',
        storePhone: app?.storePhone || store?.contactPhone || body.profile.phoneNumber || '',
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load verification.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stage = data?.stage || 'UNVERIFIED';
  const meta = STAGE_META[stage];
  const benefits = useMemo(() => verificationBenefits(stage), [stage]);
  const documents = data?.documents || [];
  const docFor = (slot: VerificationSlot) => documents.find((doc) => doc.slot === slot);

  const requirements = useMemo(() => {
    if (!data) return [];
    return verificationRequirements({
      stage,
      sellerType: form.sellerType,
      application: {
        ...form,
        documentType: form.documentType,
      },
      documents,
      store: data.store
        ? {
            name: form.storeName,
            description: form.storeDescription,
            city: form.storeCity,
            state: form.storeState,
            contactPhone: form.storePhone,
          }
        : null,
      profile: {
        fullName: data.profile.fullName,
        phoneNumber: data.profile.phoneNumber,
        email: data.profile.email,
        state: data.profile.state,
        city: data.profile.city,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, form, documents, stage]);

  const completed = requirements.filter((requirement) => requirement.complete).length;
  const progress = requirements.length ? Math.round((completed / requirements.length) * 100) : 0;

  const scrollTop = () => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const update = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  const payload = (): FormState => ({ ...form, declarationAccepted: declaration } as FormState);

  const saveDraft = async () => {
    setSaving(true);
    setFormError('');
    try {
      await api('/api/seller/verification', {
        method: 'POST',
        body: JSON.stringify({ action: 'SAVE', payload: payload() }),
      });
      await load();
      return true;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save your application.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const ensureApplication = async (): Promise<number | null> => {
    if (data?.application?.id) return data.application.id;
    setSaving(true);
    try {
      const body = await api<{ applicationId?: number }>('/api/seller/verification', {
        method: 'POST',
        body: JSON.stringify({ action: 'SAVE', payload: payload() }),
      });
      await load();
      return body.applicationId ?? null;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not start your application.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const openWizard = async (atStep?: number) => {
    setFormError('');
    setStepErrors({});
    setDeclaration(false);
    const firstIncomplete = requirements.find((requirement) => !requirement.complete);
    setStep(atStep || (data?.application ? firstIncomplete?.step || 6 : 1));
    setWizard(true);
    scrollTop();
    if (data?.canApply && !data.application) await ensureApplication();
  };

  const validateStep = (target: number): boolean => {
    const errors: Record<string, string> = {};
    if (target === 2) {
      if (!form.legalName.trim()) errors.legalName = 'Enter your legal name.';
      if (!NIGERIAN_PHONE.test(form.phone.replace(/\s+/g, ''))) {
        errors.phone = 'Enter a valid Nigerian phone number.';
      }
      if (!form.state) errors.state = 'Select your state.';
      if (!form.city) errors.city = 'Select or enter your city.';
    }
    if (target === 3) {
      if (!form.documentType) errors.documentType = 'Choose a document type.';
      if (!docFor('ID_FRONT')) errors.document = 'Upload your identity document to continue.';
    }
    if (target === 4 && form.sellerType === 'BUSINESS') {
      if (!form.businessName.trim()) errors.businessName = 'Enter the registered business name.';
      if (!form.businessRegistrationNumber.trim()) {
        errors.businessRegistrationNumber = 'Enter the business registration number.';
      }
      if (!docFor('CAC_CERT')) errors.cac = 'Upload your business registration certificate.';
    }
    if (target === 5) {
      if (!form.storeName.trim()) errors.storeName = 'Your store needs a name.';
      if (!form.storeDescription.trim()) errors.storeDescription = 'Add a short store description.';
      if (!form.storeCity || !form.storeState) errors.storeLocation = 'Add your store location.';
    }
    if (target === 6 && !declaration) errors.declaration = 'Confirm the declaration to submit.';
    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goNext = async () => {
    if (!validateStep(step)) return;
    const saved = await saveDraft();
    if (!saved) return;
    if (step === 5 && form.sellerType === 'INDIVIDUAL') {
      setStep(6);
    } else {
      setStep(Math.min(6, step + 1));
    }
    setStepErrors({});
    scrollTop();
  };

  const submit = async () => {
    if (!validateStep(6)) return;
    setSubmitting(true);
    setFormError('');
    try {
      await api('/api/seller/verification', {
        method: 'POST',
        body: JSON.stringify({ action: 'SUBMIT', payload: payload() }),
      });
      await load();
      setWizard(false);
      toast.success('Application submitted. A GoodSale reviewer will check your documents.', 'Pending review');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not submit your application.');
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    if (!data?.application) return;
    const confirmed = await confirmDialog({
      title: 'Withdraw application?',
      message: 'Your application returns to draft. You can edit and resubmit it later.',
      confirmText: 'Withdraw',
      danger: true,
    });
    if (!confirmed) return;
    setWithdrawing(true);
    try {
      await api('/api/seller/verification', {
        method: 'POST',
        body: JSON.stringify({ action: 'WITHDRAW', applicationId: data.application.id }),
      });
      await load();
      toast.success('Application returned to draft.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not withdraw.');
    } finally {
      setWithdrawing(false);
    }
  };

  const pickSlot = (slot: VerificationSlot) => {
    activeSlotRef.current = slot;
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File, slot: VerificationSlot) => {
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      setFormError('Upload a JPEG, PNG, WebP image or a PDF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Documents must be 5 MB or smaller.');
      return;
    }
    setFormError('');
    setUploadingSlot(slot);
    try {
      const applicationId = await ensureApplication();
      if (!applicationId) throw new Error('Start the application first.');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('applicationId', String(applicationId));
      formData.append('slot', slot);
      formData.append('label', SLOT_COPY[slot].label);
      await api('/api/seller/verification/documents', { method: 'POST', body: formData });
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const removeDocument = async (slot: VerificationSlot) => {
    if (!data?.application) return;
    try {
      await api(
        `/api/seller/verification/documents?applicationId=${data.application.id}&slot=${slot}`,
        { method: 'DELETE' }
      );
      await load();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not remove the document.');
    }
  };

  const stateOptions = salesStates();
  const cityOptions = form.state ? salesCitiesFor(form.state) : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50 px-4 py-16 dark:bg-ink-950">
        <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your verification…
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-ink-50 px-4 py-16 dark:bg-ink-950">
        <div className="mx-auto max-w-xl rounded-3xl border border-ink-200 bg-white p-8 text-center dark:border-ink-800 dark:bg-ink-900">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" aria-hidden="true" />
          <h1 className="mt-3 font-display text-xl font-bold text-ink-900 dark:text-white">
            Verification is unavailable
          </h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">{loadError || 'Please try again.'}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {/sign in/i.test(loadError) ? (
              <Link href="/auth?next=/seller/verification">
                <Button>Sign in to continue</Button>
              </Link>
            ) : (
              <Button onClick={() => void load()}>Try again</Button>
            )}
            <Link href="/?view=dashboard">
              <Button variant="outline">Back to seller hub</Button>
            </Link>
          </div>
          {/sign in/i.test(loadError) ? null : (
            <p className="mt-3 text-[11px] text-ink-400">
              If this keeps happening, the verification migration may not be applied on this
              environment.
            </p>
          )}
        </div>
      </div>
    );
  }

  const sellerId = data.profile.id;
  const verified = data.verified;
  const reviewNote = data.application?.infoRequestNote || '';
  const rejectionReason = data.application?.rejectionReason || '';

  return (
    <div className="min-h-screen bg-ink-50 pb-24 transition-colors duration-300 dark:bg-ink-950">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadFile(file, activeSlotRef.current);
          event.target.value = '';
        }}
      />

      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/?view=dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Seller hub
          </Link>
          <VerificationStatusChip stage={stage} />
        </div>

        <header className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-jade-600 dark:text-jade-400">
            Trust &amp; safety
          </p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-ink-950 dark:text-white">
            Seller Verification
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">
            Verification tells buyers that GoodSale checked who is behind this store. A reviewer
            reads every document before the badge is issued — submitting an application never
            verifies you on its own.
          </p>
        </header>

        {wizard ? (
          <section className="mt-7 overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900">
            <div className="border-b border-ink-150 bg-ink-50/70 px-4 py-4 dark:border-ink-800 dark:bg-ink-950/40 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">
                    Application · step {step} of 6
                  </p>
                  <h2 className="mt-0.5 font-display text-lg font-bold text-ink-950 dark:text-white">
                    {STEPS[step - 1]?.label}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setWizard(false)}
                  className="rounded-full p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800 dark:hover:text-white"
                  aria-label="Close application"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {STEPS.map((entry) => {
                  const done = entry.id < step;
                  const active = entry.id === step;
                  return (
                    <li key={entry.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (entry.id <= step || entry.id === 1) setStep(entry.id);
                        }}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-jade-500 text-white'
                            : done
                              ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                              : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                        }`}
                      >
                        {done ? <Check className="h-3 w-3" aria-hidden="true" /> : <span>{entry.id}</span>}
                        {entry.label}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="space-y-5 px-4 py-6 sm:px-6">
              {formError ? (
                <p className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-3 text-xs font-medium text-red-700 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {formError}
                </p>
              ) : null}

              {step === 1 ? (
                <div className="space-y-3">
                  {[
                    {
                      value: 'INDIVIDUAL' as const,
                      Icon: UserRound,
                      title: 'Individual seller',
                      detail: 'Verify your own identity. No business registration is required.',
                      requirements: 'Identity document, selfie, contact details and store profile.',
                    },
                    {
                      value: 'BUSINESS' as const,
                      Icon: Building2,
                      title: 'Registered business',
                      detail: 'For stores trading under a registered company or business name.',
                      requirements: 'Everything above plus CAC registration number and certificate.',
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => update({ sellerType: option.value })}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                        form.sellerType === option.value
                          ? 'border-jade-500/60 bg-jade-500/[0.06] ring-2 ring-jade-500/15'
                          : 'border-ink-200 hover:border-jade-500/40 dark:border-ink-700'
                      }`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-jade-500/10 text-jade-600 dark:text-jade-400">
                        <option.Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-ink-900 dark:text-white">{option.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">{option.detail}</span>
                        <span className="mt-1 block text-[11px] text-ink-400">{option.requirements}</span>
                      </span>
                      {form.sellerType === option.value ? (
                        <Check className="ml-auto h-4 w-4 shrink-0 text-jade-600" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                  <p className="text-[11px] text-ink-400">
                    This is the seller type for verification only. It does not create a second
                    account — buying and selling stay on the same GoodSale account.
                  </p>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Legal name" required error={stepErrors.legalName} hint="Exactly as printed on your ID">
                      <input
                        className={inputClass}
                        value={form.legalName}
                        onChange={(event) => update({ legalName: event.target.value })}
                        placeholder="e.g. Chiamaka Okafor"
                        autoComplete="name"
                      />
                    </Field>
                  </div>
                  <Field label="Date of birth" hint="Optional — helps match your ID">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.dateOfBirth}
                      onChange={(event) => update({ dateOfBirth: event.target.value })}
                    />
                  </Field>
                  <Field label="Phone number" required error={stepErrors.phone} hint="Nigerian mobile number">
                    <input
                      className={inputClass}
                      value={form.phone}
                      onChange={(event) => update({ phone: event.target.value })}
                      placeholder="0803 123 4567"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Email address" hint="Review updates are also sent in-app">
                    <input
                      type="email"
                      className={inputClass}
                      value={form.email}
                      onChange={(event) => update({ email: event.target.value })}
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="State" required error={stepErrors.state}>
                    <select
                      className={inputClass}
                      value={form.state}
                      onChange={(event) => {
                        const nextState = event.target.value;
                        update({ state: nextState, city: salesCitiesFor(nextState)[0] || '' });
                      }}
                    >
                      <option value="">Select state</option>
                      {stateOptions.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="City" required error={stepErrors.city}>
                    {cityOptions.length > 0 ? (
                      <select
                        className={inputClass}
                        value={form.city}
                        onChange={(event) => update({ city: event.target.value })}
                      >
                        <option value="">Select city</option>
                        {cityOptions.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={inputClass}
                        value={form.city}
                        onChange={(event) => update({ city: event.target.value })}
                        placeholder="City or area"
                      />
                    )}
                  </Field>
                  <div className="sm:col-span-2">
                    <Field
                      label="Residential or business address"
                      hint="Private. Reviewers use it to confirm your details; it is never shown publicly."
                    >
                      <input
                        className={inputClass}
                        value={form.address}
                        onChange={(event) => update({ address: event.target.value })}
                        placeholder="Street, area, landmark"
                        autoComplete="street-address"
                      />
                    </Field>
                  </div>
                  <p className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-ink-150 bg-ink-50 p-3 text-[11px] leading-relaxed text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    We pre-filled what your account already knows. Only state and city ever appear on
                    your public verification badge.
                  </p>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Document type" required error={stepErrors.documentType}>
                      <select
                        className={inputClass}
                        value={form.documentType}
                        onChange={(event) => update({ documentType: event.target.value })}
                      >
                        {DOCUMENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Document number"
                      hint="Only the last 4 characters are stored — reviewers read the rest from the image."
                    >
                      <input
                        className={inputClass}
                        value={form.documentNumber}
                        onChange={(event) => update({ documentNumber: event.target.value })}
                        placeholder="Enter the number on your document"
                        autoComplete="off"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <UploadTile
                      slot="ID_FRONT"
                      document={docFor('ID_FRONT')}
                      uploading={uploadingSlot === 'ID_FRONT'}
                      onPick={() => pickSlot('ID_FRONT')}
                      onRemove={() => void removeDocument('ID_FRONT')}
                    />
                    <UploadTile
                      slot="SELFIE"
                      document={docFor('SELFIE')}
                      uploading={uploadingSlot === 'SELFIE'}
                      onPick={() => pickSlot('SELFIE')}
                      onRemove={() => void removeDocument('SELFIE')}
                    />
                    <UploadTile
                      slot="ID_BACK"
                      document={docFor('ID_BACK')}
                      uploading={uploadingSlot === 'ID_BACK'}
                      onPick={() => pickSlot('ID_BACK')}
                      onRemove={() => void removeDocument('ID_BACK')}
                    />
                    <UploadTile
                      slot="ADDRESS_PROOF"
                      document={docFor('ADDRESS_PROOF')}
                      uploading={uploadingSlot === 'ADDRESS_PROOF'}
                      onPick={() => pickSlot('ADDRESS_PROOF')}
                      onRemove={() => void removeDocument('ADDRESS_PROOF')}
                    />
                  </div>
                  {stepErrors.document ? (
                    <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{stepErrors.document}</p>
                  ) : null}
                  <p className="flex items-start gap-2 rounded-xl border border-jade-500/20 bg-jade-500/[0.05] p-3 text-[11px] leading-relaxed text-jade-800 dark:text-jade-200">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Documents go to private, access-controlled storage. They are never shown on your
                    profile, never given a public link, and only reviewers can open them. GoodSale
                    stores a reference to the file, not a public URL.
                  </p>
                </div>
              ) : null}

              {step === 4 ? (
                form.sellerType === 'BUSINESS' ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Field label="Registered business name" required error={stepErrors.businessName}>
                          <input
                            className={inputClass}
                            value={form.businessName}
                            onChange={(event) => update({ businessName: event.target.value })}
                            placeholder="e.g. Bright Electronics Ltd"
                          />
                        </Field>
                      </div>
                      <Field
                        label="Business registration number"
                        required
                        error={stepErrors.businessRegistrationNumber}
                        hint="CAC RC / BN number"
                      >
                        <input
                          className={inputClass}
                          value={form.businessRegistrationNumber}
                          onChange={(event) => update({ businessRegistrationNumber: event.target.value })}
                          placeholder="RC 1234567"
                        />
                      </Field>
                      <Field label="Business contact name" hint="Optional">
                        <input
                          className={inputClass}
                          value={form.businessContactName}
                          onChange={(event) => update({ businessContactName: event.target.value })}
                          placeholder="Contact person"
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Business address">
                          <input
                            className={inputClass}
                            value={form.businessAddress}
                            onChange={(event) => update({ businessAddress: event.target.value })}
                            placeholder="Registered business address"
                          />
                        </Field>
                      </div>
                    </div>
                    <UploadTile
                      slot="CAC_CERT"
                      document={docFor('CAC_CERT')}
                      uploading={uploadingSlot === 'CAC_CERT'}
                      onPick={() => pickSlot('CAC_CERT')}
                      onRemove={() => void removeDocument('CAC_CERT')}
                    />
                    {stepErrors.cac ? (
                      <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{stepErrors.cac}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-ink-200 bg-ink-50 p-5 dark:border-ink-800 dark:bg-ink-950/40">
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white">
                      <UserRound className="h-4 w-4 text-jade-600" aria-hidden="true" />
                      Not required for individual sellers
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      GoodSale does not ask individual sellers for CAC registration. If you trade under
                      a registered business name, go back to step 1 and choose Registered business.
                    </p>
                  </div>
                )
              ) : null}

              {step === 5 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label="Store name" required error={stepErrors.storeName}>
                        <input
                          className={inputClass}
                          value={form.storeName}
                          onChange={(event) => update({ storeName: event.target.value })}
                          placeholder="Your store name"
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="Store description"
                        required
                        error={stepErrors.storeDescription}
                        hint="What you sell and what buyers can expect"
                      >
                        <textarea
                          className={`${inputClass} min-h-[96px] resize-y`}
                          value={form.storeDescription}
                          onChange={(event) => update({ storeDescription: event.target.value })}
                          placeholder="Describe your store in a few sentences."
                        />
                      </Field>
                    </div>
                    <Field label="Store state" error={stepErrors.storeLocation}>
                      <select
                        className={inputClass}
                        value={form.storeState}
                        onChange={(event) => {
                          const nextState = event.target.value;
                          update({
                            storeState: nextState,
                            storeCity: salesCitiesFor(nextState)[0] || form.storeCity,
                          });
                        }}
                      >
                        <option value="">Select state</option>
                        {stateOptions.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Store city">
                      {form.storeState && salesCitiesFor(form.storeState).length > 0 ? (
                        <select
                          className={inputClass}
                          value={form.storeCity}
                          onChange={(event) => update({ storeCity: event.target.value })}
                        >
                          <option value="">Select city</option>
                          {salesCitiesFor(form.storeState).map((city) => (
                            <option key={city} value={city}>
                              {city}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className={inputClass}
                          value={form.storeCity}
                          onChange={(event) => update({ storeCity: event.target.value })}
                          placeholder="City"
                        />
                      )}
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Store contact phone" hint="Shown to buyers on your storefront">
                        <input
                          className={inputClass}
                          value={form.storePhone}
                          onChange={(event) => update({ storePhone: event.target.value })}
                          inputMode="tel"
                          placeholder="0803 123 4567"
                        />
                      </Field>
                    </div>
                  </div>
                  <UploadTile
                    slot="STORE_LOGO"
                    document={docFor('STORE_LOGO')}
                    uploading={uploadingSlot === 'STORE_LOGO'}
                    onPick={() => pickSlot('STORE_LOGO')}
                    onRemove={() => void removeDocument('STORE_LOGO')}
                    compact
                  />
                  {!data.store ? (
                    <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[11px] text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      You need a store before verification. Finish store setup, then come back.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === 6 ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-ink-200 p-4 dark:border-ink-800">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-400">
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Summary
                    </p>
                    <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {[
                        ['Seller type', form.sellerType === 'BUSINESS' ? 'Registered business' : 'Individual seller'],
                        ['Legal name', form.legalName || '—'],
                        ['Phone', form.phone || '—'],
                        ['Location', [form.city, form.state].filter(Boolean).join(', ') || '—'],
                        ['Document', DOCUMENT_TYPE_OPTIONS.find((option) => option.value === form.documentType)?.label || '—'],
                        ['Identity file', docFor('ID_FRONT') ? 'Uploaded' : 'Missing'],
                        ['Selfie', docFor('SELFIE') ? 'Uploaded' : 'Missing'],
                        ...(form.sellerType === 'BUSINESS'
                          ? ([
                              ['Business name', form.businessName || '—'],
                              ['Registration number', form.businessRegistrationNumber || '—'],
                              ['Registration certificate', docFor('CAC_CERT') ? 'Uploaded' : 'Missing'],
                            ] as [string, string][])
                          : []),
                        ['Store', form.storeName || '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
                          <dd className="truncate text-sm font-medium text-ink-800 dark:text-ink-100">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="mt-3 text-[11px] font-semibold text-jade-600 hover:underline dark:text-jade-400"
                    >
                      Edit details
                    </button>
                  </div>

                  <label className="flex items-start gap-3 rounded-2xl border border-jade-500/25 bg-jade-500/[0.04] p-4">
                    <input
                      type="checkbox"
                      checked={declaration}
                      onChange={(event) => setDeclaration(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-jade-600"
                    />
                    <span className="text-xs leading-relaxed text-ink-700 dark:text-ink-200">
                      I confirm the information and documents are mine, accurate and current. I
                      understand GoodSale will review them, that submission does not verify me, and
                      that a reviewer may reject the application or ask for more information.
                    </span>
                  </label>
                  {stepErrors.declaration ? (
                    <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                      {stepErrors.declaration}
                    </p>
                  ) : null}

                  <Button
                    className="w-full"
                    size="lg"
                    loading={submitting}
                    onClick={() => void submit()}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" /> Submit for verification
                  </Button>
                  <p className="text-center text-[11px] text-ink-400">
                    Status becomes Pending review. Duplicate applications are blocked while one is open.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ink-150 bg-ink-50/70 px-4 py-3 dark:border-ink-800 dark:bg-ink-950/40 sm:px-6">
              <Button
                variant="ghost"
                onClick={() => (step === 1 ? setWizard(false) : setStep(step - 1))}
              >
                {step === 1 ? 'Close' : 'Back'}
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  loading={saving}
                  onClick={async () => {
                    const saved = await saveDraft();
                    if (saved) {
                      setWizard(false);
                      toast.success('Progress saved. You can continue any time.', 'Draft saved');
                    }
                  }}
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" /> Save &amp; exit
                </Button>
                {step < 6 ? (
                  <Button loading={saving} onClick={() => void goNext()}>
                    Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
              <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900">
                <div className="border-b border-ink-150 px-5 py-4 dark:border-ink-800 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">
                        Current status
                      </p>
                      <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-ink-950 dark:text-white">
                        {meta.label}
                      </h2>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                        {meta.summary}
                      </p>
                    </div>
                    <VerificationStatusChip stage={stage} />
                  </div>
                </div>

                <div className="space-y-4 px-5 py-4 sm:px-6">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-ink-500 dark:text-ink-400">
                      <span>Application completeness</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-jade-600 to-jade-400 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                        <CalendarDays className="h-3 w-3" aria-hidden="true" /> Submitted
                      </dt>
                      <dd className="mt-1 text-xs font-semibold text-ink-800 dark:text-ink-100">
                        {formatVerificationDate(data.application?.submittedAt)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30">
                      <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                        <Clock3 className="h-3 w-3" aria-hidden="true" /> Review
                      </dt>
                      <dd className="mt-1 text-xs font-semibold text-ink-800 dark:text-ink-100">
                        {stage === 'VERIFIED'
                          ? `Verified ${formatVerificationDate(data.profile.verifiedAt)}`
                          : stage === 'PENDING'
                            ? 'Waiting for a reviewer'
                            : stage === 'UNDER_REVIEW'
                              ? `Started ${formatVerificationDate(data.application?.reviewStartedAt)}`
                              : stage === 'UNVERIFIED'
                                ? 'Not submitted yet'
                                : meta.next}
                      </dd>
                    </div>
                  </dl>

                  {reviewNote && (stage === 'INFO_REQUIRED' || stage === 'PENDING') ? (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Information requested
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-700 dark:text-ink-200">{reviewNote}</p>
                    </div>
                  ) : null}

                  {rejectionReason && stage === 'REJECTED' ? (
                    <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                        Reason for rejection
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-700 dark:text-ink-200">{rejectionReason}</p>
                    </div>
                  ) : null}

                  {stage === 'SUSPENDED' || stage === 'REVOKED' ? (
                    <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                        {STAGE_META[stage].label}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-700 dark:text-ink-200">
                        {data.application?.rejectionReason || meta.summary}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {data.canApply ? (
                      <Button onClick={() => void openWizard()}>
                        {data.application ? (
                          <>
                            <ArrowRight className="h-4 w-4" aria-hidden="true" /> Continue application
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Start application
                          </>
                        )}
                      </Button>
                    ) : null}

                    {stage === 'PENDING' || stage === 'UNDER_REVIEW' || stage === 'INFO_REQUIRED' ? (
                      data.canEdit ? (
                        <Button variant="outline" onClick={() => void openWizard()}>
                          Update &amp; resubmit
                        </Button>
                      ) : null
                    ) : null}

                    {stage === 'PENDING' || stage === 'UNDER_REVIEW' ? (
                      <Button variant="ghost" loading={withdrawing} onClick={() => void withdraw()}>
                        Withdraw
                      </Button>
                    ) : null}
                  </div>

                  {!data.canApply && !['PENDING', 'UNDER_REVIEW'].includes(stage) ? (
                    <p className="text-[11px] text-ink-400">{meta.next}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-gold-300/40 bg-gradient-to-br from-jade-950 via-jade-900 to-ink-950 p-5 text-white shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-200/80">
                      Badge preview
                    </p>
                    {verified ? (
                      <VerifiedBadge
                        sellerId={sellerId}
                        status={data.profile.verificationStatus}
                        expiresAt={data.profile.verificationExpiresAt}
                        variant="storefront"
                        fallbackName={data.store?.name}
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gold-300/25 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/55">
                        <Lock className="h-3 w-3" aria-hidden="true" /> Locked
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-gold-300/30">
                      {verified ? (
                        <BadgeCheck className="h-7 w-7 text-gold-300" aria-hidden="true" />
                      ) : (
                        <Lock className="h-6 w-6 text-white/45" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <p className="font-display text-base font-bold">GoodSale Verified</p>
                      <p className="text-[11px] text-white/60">
                        {verified
                          ? `Live since ${formatVerificationDate(data.profile.verifiedAt)}`
                          : 'Issued only after a reviewer approves your application'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-white/65">
                    {verified
                      ? 'Buyers see this badge on your storefront, every listing and beside your seller name. Tapping it shows what GoodSale checked.'
                      : 'This is a preview. Sellers cannot switch the badge on themselves — only a completed GoodSale review can.'}
                  </p>
                  {verified && data.profile.verificationExpiresAt ? (
                    <p className="mt-2 text-[10px] text-white/45">
                      Valid until {formatVerificationDate(data.profile.verificationExpiresAt)}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-ink-900 dark:text-white">
                    <ShieldCheck className="h-4 w-4 text-jade-600 dark:text-jade-400" aria-hidden="true" />
                    Requirements
                  </p>
                  <ul className="mt-3 space-y-2">
                    {requirements.map((requirement) => (
                      <li key={requirement.key} className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                            requirement.complete
                              ? 'bg-jade-500/15 text-jade-600 dark:text-jade-400'
                              : 'bg-ink-100 text-ink-300 dark:bg-ink-800'
                          }`}
                        >
                          {requirement.complete ? (
                            <Check className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              setStep(requirement.step);
                              setWizard(true);
                              scrollTop();
                            }}
                            className="block text-left text-xs font-semibold text-ink-800 hover:text-jade-600 dark:text-ink-100 dark:hover:text-jade-400"
                          >
                            {requirement.label}
                          </button>
                          <span className="block truncate text-[11px] text-ink-400">{requirement.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
              <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">What verification gives you</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {benefits.map((benefit) => (
                    <div
                      key={benefit.title}
                      className="rounded-2xl border border-ink-150 bg-ink-50/60 p-3 dark:border-ink-800 dark:bg-ink-950/30"
                    >
                      <p className="flex items-center gap-1.5 text-xs font-bold text-ink-800 dark:text-ink-100">
                        {benefit.live ? (
                          <BadgeCheck className="h-3.5 w-3.5 text-jade-600 dark:text-jade-400" aria-hidden="true" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-ink-300" aria-hidden="true" />
                        )}
                        {benefit.title}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                        {benefit.detail}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-ink-400">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  Verification does not change how listings are ranked. Any future seller programme
                  benefit is offered separately and will be announced in-app.
                </p>
              </div>

              <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900">
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink-900 dark:text-white">
                  <History className="h-4 w-4 text-ink-400" aria-hidden="true" /> Review history
                </p>
                {data.events.length === 0 ? (
                  <p className="mt-3 text-[11px] text-ink-400">
                    No activity yet. Your application events will appear here.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {data.events.map((event) => (
                      <li key={event.id} className="relative border-l border-ink-150 pl-3 dark:border-ink-800">
                        <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-jade-500" />
                        <p className="text-[11px] font-semibold text-ink-800 dark:text-ink-100">
                          {ACTION_LABELS[event.action] || event.action.replace(/_/g, ' ').toLowerCase()}
                        </p>
                        <p className="text-[10px] text-ink-400">{formatVerificationDate(event.createdAt)}</p>
                        {event.reason ? (
                          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                            {event.reason}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <p className="mt-6 flex items-start gap-2 rounded-2xl border border-ink-200 bg-white p-4 text-[11px] leading-relaxed text-ink-400 dark:border-ink-800 dark:bg-ink-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              GoodSale keeps verification documents only for as long as the review and any legal
              obligation require. You can request deletion of your documents through Support once a
              decision is final; the verification record itself is retained so buyers can trust the
              badge history.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
