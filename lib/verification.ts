/**
 * Seller verification — shared, framework-free rules for both the seller
 * center and the admin review queue.
 *
 * The database is the authority: `profiles.verification_status` decides the
 * public badge, and only `admin_verification_action()` can move an application
 * to APPROVED. Nothing in this file grants verification — it only translates
 * the stored state into labels, checklists and progress for the interface.
 */

export type VerificationStage =
  | 'UNVERIFIED'
  | 'DRAFT'
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'INFO_REQUIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED';

export type StageTone = 'neutral' | 'info' | 'gold' | 'success' | 'warning' | 'danger';

export interface StageMeta {
  label: string;
  tone: StageTone;
  /** One-line meaning, written for the seller. */
  summary: string;
  /** What happens next, or what the seller can do now. */
  next: string;
  /** Only VERIFIED may show the public badge. */
  publicBadge: boolean;
}

export const STAGE_META: Record<VerificationStage, StageMeta> = {
  UNVERIFIED: {
    label: 'Not started',
    tone: 'neutral',
    summary: 'You have not applied for GoodSale verification yet.',
    next: 'Start the application — it takes about ten minutes.',
    publicBadge: false,
  },
  DRAFT: {
    label: 'Incomplete',
    tone: 'neutral',
    summary: 'Your application is saved but has not been submitted.',
    next: 'Finish the remaining steps and submit it for review.',
    publicBadge: false,
  },
  PENDING: {
    label: 'Pending review',
    tone: 'info',
    summary: 'Your application is queued for a GoodSale reviewer.',
    next: 'No action needed. We will notify you when review starts.',
    publicBadge: false,
  },
  UNDER_REVIEW: {
    label: 'Under review',
    tone: 'info',
    summary: 'A reviewer is checking your documents right now.',
    next: 'No action needed. Most reviews finish within three working days.',
    publicBadge: false,
  },
  VERIFIED: {
    label: 'Verified',
    tone: 'success',
    summary: 'GoodSale completed its verification checks for your store.',
    next: 'Your badge is live on your storefront and listings.',
    publicBadge: true,
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'danger',
    summary: 'Your application was not approved.',
    next: 'Read the reason, correct the details and apply again.',
    publicBadge: false,
  },
  INFO_REQUIRED: {
    label: 'Additional information required',
    tone: 'warning',
    summary: 'A reviewer needs more from you before deciding.',
    next: 'Open the application, address the note and resubmit.',
    publicBadge: false,
  },
  SUSPENDED: {
    label: 'Suspended',
    tone: 'danger',
    summary: 'Your verified badge is hidden while GoodSale reviews your account.',
    next: 'Contact support if you believe this is a mistake.',
    publicBadge: false,
  },
  REVOKED: {
    label: 'Revoked',
    tone: 'danger',
    summary: 'GoodSale removed your verification.',
    next: 'You can apply again once the issue is resolved.',
    publicBadge: false,
  },
  EXPIRED: {
    label: 'Expired',
    tone: 'warning',
    summary: 'Your verification period ended.',
    next: 'Re-apply to renew the GoodSale Verified badge.',
    publicBadge: false,
  },
};

/** Raw application statuses stored in `identity_verifications`. */
export type ApplicationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'INFO_REQUIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED';

/** Map the public profile status (or a raw application status) to a stage. */
export function toStage(value: string | null | undefined): VerificationStage {
  switch ((value || '').toUpperCase()) {
    case 'DRAFT':
      return 'DRAFT';
    case 'PENDING':
      return 'PENDING';
    case 'UNDER_REVIEW':
      return 'UNDER_REVIEW';
    case 'APPROVED':
    case 'VERIFIED':
      return 'VERIFIED';
    case 'REJECTED':
      return 'REJECTED';
    case 'INFO_REQUIRED':
      return 'INFO_REQUIRED';
    case 'SUSPENDED':
      return 'SUSPENDED';
    case 'REVOKED':
      return 'REVOKED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'UNVERIFIED';
  }
}

/**
 * The single badge decision used by seller-facing and buyer-facing surfaces.
 * A verified status with a past expiry is treated as expired even before the
 * sweep runs, so a stale badge can never render.
 */
export function isVerifiedSeller(input: {
  verificationStatus?: string | null;
  verificationExpiresAt?: string | null;
} | null | undefined): boolean {
  if (!input) return false;
  if (toStage(input.verificationStatus) !== 'VERIFIED') return false;
  if (input.verificationExpiresAt) {
    const expires = new Date(input.verificationExpiresAt).getTime();
    if (Number.isFinite(expires) && expires <= Date.now()) return false;
  }
  return true;
}

/** Fill percentage for the verification progress meter (0–100). */
export function verificationProgress(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export interface RequirementInput {
  stage: VerificationStage;
  sellerType: 'INDIVIDUAL' | 'BUSINESS';
  application?: {
    legalName?: string;
    dateOfBirth?: string;
    phone?: string;
    email?: string;
    state?: string;
    city?: string;
    address?: string;
    documentType?: string;
    businessName?: string;
    businessRegistrationNumber?: string;
    businessAddress?: string;
    storeName?: string;
    storeDescription?: string;
  } | null;
  documents?: { slot: string }[];
  store?: { name?: string; description?: string; city?: string; state?: string; contactPhone?: string } | null;
  profile?: { fullName?: string; phoneNumber?: string; email?: string; state?: string; city?: string } | null;
}

export interface VerificationRequirement {
  key: string;
  label: string;
  detail: string;
  /** Which wizard step owns this requirement. */
  step: number;
  complete: boolean;
}

/**
 * Requirements checklist shown in the seller center. It is derived from the
 * saved application so a seller can see exactly what is blocking submission.
 */
export function verificationRequirements(input: RequirementInput): VerificationRequirement[] {
  const app = input.application || {};
  const docs = new Set((input.documents || []).map((doc) => doc.slot));
  const store = input.store || {};
  const profile = input.profile || {};
  const business = input.sellerType === 'BUSINESS';

  const has = (value?: string) => Boolean(value && value.trim().length > 0);

  const requirements: VerificationRequirement[] = [
    {
      key: 'seller_type',
      label: 'Seller type selected',
      detail: business ? 'Registered business' : 'Individual seller',
      step: 1,
      complete: true,
    },
    {
      key: 'legal_name',
      label: 'Legal name',
      detail: app.legalName || profile.fullName || 'Use the name printed on your ID',
      step: 2,
      complete: has(app.legalName || profile.fullName),
    },
    {
      key: 'contact',
      label: 'Contact phone and email',
      detail: app.phone || profile.phoneNumber || 'How we reach you about the review',
      step: 2,
      complete: has(app.phone || profile.phoneNumber),
    },
    {
      key: 'address',
      label: 'State and city',
      detail: [app.city || profile.city, app.state || profile.state].filter(Boolean).join(', ') || 'Used at state/city level only',
      step: 2,
      complete: Boolean((app.state || profile.state) && (app.city || profile.city)),
    },
    {
      key: 'id_document',
      label: 'Government identity document',
      detail: 'Uploaded to private review storage',
      step: 3,
      complete: has(app.documentType) && docs.has('ID_FRONT'),
    },
    {
      key: 'selfie',
      label: 'Selfie holding your ID',
      detail: 'Confirms the document belongs to you',
      step: 3,
      complete: docs.has('SELFIE'),
    },
  ];

  if (business) {
    requirements.push(
      {
        key: 'business_name',
        label: 'Registered business name',
        detail: app.businessName || 'As it appears on your CAC certificate',
        step: 4,
        complete: has(app.businessName),
      },
      {
        key: 'business_registration',
        label: 'Business registration number and certificate',
        detail: 'CAC RC number plus the certificate upload',
        step: 4,
        complete: has(app.businessRegistrationNumber) && docs.has('CAC_CERT'),
      }
    );
  }

  requirements.push(
    {
      key: 'store',
      label: 'Store profile complete',
      detail:
        (store.name || app.storeName || '') +
          (store.contactPhone ? ' · contact added' : '') || 'Name, description and location',
      step: 5,
      complete: Boolean((store.name || app.storeName) && (store.description || app.storeDescription) && (store.city || app.city)),
    },
    {
      key: 'declaration',
      label: 'Declaration accepted',
      detail: 'Confirm the information is accurate',
      step: 6,
      complete: input.stage !== 'DRAFT' && input.stage !== 'REJECTED' && input.stage !== 'INFO_REQUIRED'
        ? true
        : false,
    }
  );

  return requirements;
}

export function verificationBenefits(stage: VerificationStage) {
  return [
    {
      title: 'GoodSale Verified badge',
      detail: 'A gold-rimmed badge on your storefront, listings and seller name.',
      available: true,
      live: stage === 'VERIFIED',
    },
    {
      title: 'Buyer confidence panel',
      detail: 'Buyers can tap the badge to see what GoodSale checked, without seeing your documents.',
      available: true,
      live: stage === 'VERIFIED',
    },
    {
      title: 'Verified seller indicator in listings',
      detail: 'Every product you list carries your verification status.',
      available: true,
      live: stage === 'VERIFIED',
    },
    {
      title: 'Priority consideration for seller programmes',
      detail: 'Eligibility for future promotions and marketplace features as they launch.',
      available: true,
      live: false,
    },
  ];
}

export const VERIFICATION_SLOTS = [
  'ID_FRONT',
  'ID_BACK',
  'SELFIE',
  'ADDRESS_PROOF',
  'CAC_CERT',
  'STORE_LOGO',
] as const;

export type VerificationSlot = (typeof VERIFICATION_SLOTS)[number];

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'NIN', label: 'National Identification Number (NIN) slip' },
  { value: 'NATIONAL_ID', label: 'National identity card' },
  { value: 'DRIVERS_LICENSE', label: "Driver's licence" },
  { value: 'PASSPORT', label: 'International passport' },
] as const;

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format an ISO timestamp for verification UI, with a stable fallback. */
export function formatVerificationDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}
