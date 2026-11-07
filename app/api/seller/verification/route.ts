import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import {
  isVerifiedSeller,
  toStage,
  verificationProgress,
  verificationRequirements,
  type VerificationStage,
} from '@/lib/verification';

/**
 * GET  /api/seller/verification — the seller's own application, documents
 *                               metadata, reviewer-visible history and the
 *                               derived requirements checklist.
 * POST /api/seller/verification — { action: 'SAVE' | 'SUBMIT' | 'WITHDRAW' }
 *
 * Writes go through the SECURITY DEFINER RPCs in migration 024, which enforce
 * ownership and status rules. This route only sanitises input.
 */

type Row = Record<string, unknown>;

const EDITABLE_STAGES: VerificationStage[] = ['UNVERIFIED', 'DRAFT', 'REJECTED', 'INFO_REQUIRED'];

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function integrationHint(message: string) {
  return /does not exist|schema cache|column .* does not exist/i.test(message)
    ? ' Seller verification needs migration 024 — run `npm run migrate` and try again.'
    : '';
}

function mapApplication(row: Row) {
  return {
    id: Number(row.id),
    stage: toStage(String(row.status || 'DRAFT')),
    rawStatus: String(row.status || 'DRAFT'),
    sellerType: row.seller_type === 'BUSINESS' || row.application_kind === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL',
    legalName: str(row.full_name),
    dateOfBirth: row.date_of_birth ? String(row.date_of_birth) : '',
    phone: str(row.contact_phone),
    email: str(row.contact_email),
    state: str(row.residence_state),
    city: str(row.residence_city),
    address: str(row.residence_address),
    documentType: str(row.document_type),
    businessName: str(row.business_name),
    businessRegistrationNumber: str(row.business_registration_number),
    businessContactName: str(row.business_contact_name),
    businessAddress: str(row.business_address),
    storeName: str(row.store_name),
    storeDescription: str(row.store_description),
    storeCity: str(row.store_city),
    storeState: str(row.store_state),
    storePhone: str(row.store_phone),
    submittedAt: row.submitted_at ? String(row.submitted_at) : '',
    reviewStartedAt: row.review_started_at ? String(row.review_started_at) : '',
    decidedAt: row.decided_at ? String(row.decided_at) : '',
    expiresAt: row.expires_at ? String(row.expires_at) : '',
    infoRequestNote: str(row.info_request_note),
    rejectionReason: str(row.rejection_reason || row.status_reason),
    createdAt: row.created_at ? String(row.created_at) : '',
  };
}

function mapDocument(row: Row) {
  return {
    id: Number(row.id),
    slot: String(row.slot),
    label: str(row.label),
    mimeType: str(row.mime_type),
    sizeBytes: Number(row.size_bytes || 0),
    uploadedAt: row.uploaded_at ? String(row.uploaded_at) : '',
  };
}

function mapEvent(row: Row) {
  return {
    id: Number(row.id),
    action: String(row.action),
    fromStatus: String(row.from_status || ''),
    toStatus: String(row.to_status || ''),
    reason: str(row.reason),
    createdAt: row.created_at ? String(row.created_at) : '',
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Sign in to continue.' }, { status: 401 });
    }

    // Expire anything past its review window before showing the status.
    await supabase.rpc('run_verification_expiry').then(
      () => undefined,
      () => undefined
    );

    const profileId = Number(
      (
        await supabase
          .from('profiles')
          .select('id, full_name, email, phone_number, city, state, role, verification_status, verification_type, verified_at, verification_expires_at, wants_selling')
          .eq('auth_id', user.id)
          .maybeSingle()
      ).data?.id || 0
    );

    if (!profileId) {
      return NextResponse.json({ success: false, error: 'Profile not found.' }, { status: 404 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, city, state, role, verification_status, verification_type, verified_at, verification_expires_at, wants_selling')
      .eq('id', profileId)
      .single();

    if (profileError) {
      logger.error('seller verification profile read failed', { message: profileError.message });
      return NextResponse.json(
        { success: false, error: `Could not load your verification status.${integrationHint(profileError.message)}` },
        { status: 500 }
      );
    }

    const [{ data: applicationRow }, { data: storeRow }] = await Promise.all([
      supabase
        .from('identity_verifications')
        .select('*')
        .eq('user_id', profileId)
        .in('application_kind', ['SELLER', 'BUSINESS'])
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('businesses')
        .select('id, name, description, city, state, contact_phone, logo_url, policies, seller_type')
        .eq('owner_id', profileId)
        .order('id')
        .limit(1)
        .maybeSingle(),
    ]);

    const application = applicationRow ? mapApplication(applicationRow as Row) : null;

    const [{ data: documentRows }, { data: eventRows }] = await Promise.all([
      application
        ? supabase
            .from('verification_documents')
            .select('id, slot, label, mime_type, size_bytes, uploaded_at')
            .eq('application_id', application.id)
            .order('uploaded_at')
        : Promise.resolve({ data: [] as Row[] }),
      application
        ? supabase
            .from('verification_events')
            .select('id, action, from_status, to_status, reason, created_at')
            .eq('application_id', application.id)
            .order('created_at', { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] as Row[] }),
    ]);

    // The badge stage prefers the profile (public source of truth) but falls
    // back to the latest application so a fresh approval shows immediately.
    const profileStage = toStage(String(profile.verification_status || 'UNVERIFIED'));
    const stage: VerificationStage =
      profileStage === 'UNVERIFIED' && application ? application.stage : profileStage;

    const documents = (documentRows || []).map((row) => mapDocument(row as Row));
    const requirements = verificationRequirements({
      stage,
      sellerType: application?.sellerType === 'BUSINESS' || storeRow?.seller_type === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL',
      application,
      documents,
      store: storeRow
        ? {
            name: storeRow.name,
            description: storeRow.description,
            city: storeRow.city,
            state: storeRow.state,
            contactPhone: storeRow.contact_phone,
          }
        : null,
      profile: {
        fullName: profile.full_name,
        phoneNumber: profile.phone_number,
        email: profile.email,
        state: profile.state,
        city: profile.city,
      },
    });

    return NextResponse.json({
      success: true,
      profile: {
        id: profileId,
        fullName: profile.full_name,
        email: profile.email,
        phoneNumber: profile.phone_number,
        state: profile.state,
        city: profile.city,
        role: profile.role,
        wantsSelling: Boolean(profile.wants_selling),
        verificationStatus: profile.verification_status,
        verificationType: profile.verification_type,
        verifiedAt: profile.verified_at,
        verificationExpiresAt: profile.verification_expires_at,
      },
      store: storeRow
        ? {
            id: storeRow.id,
            name: storeRow.name,
            description: storeRow.description,
            city: storeRow.city,
            state: storeRow.state,
            contactPhone: storeRow.contact_phone,
            logoUrl: storeRow.logo_url,
            policies: storeRow.policies,
          }
        : null,
      stage,
      verified: isVerifiedSeller({
        verificationStatus: profile.verification_status,
        verificationExpiresAt: profile.verification_expires_at,
      }),
      application,
      documents,
      events: (eventRows || []).map((row) => mapEvent(row as Row)),
      requirements,
      progress: verificationProgress(
        requirements.filter((entry) => entry.complete).length,
        requirements.length
      ),
      canEdit: EDITABLE_STAGES.includes(stage),
      canApply: !['VERIFIED', 'PENDING', 'UNDER_REVIEW', 'SUSPENDED'].includes(stage),
    });
  } catch (error) {
    logger.error('seller verification GET failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load verification.') },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Sign in to continue.' }, { status: 401 });
    }

    const limited = rateLimit(`seller-verification:${user.id}:${clientIpFromRequest(req)}`, 20, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json().catch(() => null);
    const action = String(body?.action || 'SAVE').toUpperCase();

    if (action === 'WITHDRAW') {
      const applicationId = Number(body?.applicationId);
      if (!Number.isFinite(applicationId)) {
        return NextResponse.json({ success: false, error: 'Application is required.' }, { status: 400 });
      }
      const { error } = await supabase.rpc('seller_withdraw_verification', {
        p_application_id: applicationId,
      });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }
      return NextResponse.json({ success: true, status: 'DRAFT' });
    }

    if (action !== 'SAVE' && action !== 'SUBMIT') {
      return NextResponse.json({ success: false, error: 'Unknown action.' }, { status: 400 });
    }

    const input = (body?.payload || {}) as Record<string, unknown>;
    const sellerType = String(input.sellerType || 'INDIVIDUAL').toUpperCase() === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL';

    const payload: Record<string, unknown> = {
      sellerType,
      legalName: str(input.legalName).slice(0, 160),
      dateOfBirth: str(input.dateOfBirth) || null,
      phone: str(input.phone).slice(0, 32),
      email: str(input.email).slice(0, 160),
      state: str(input.state).slice(0, 80),
      city: str(input.city).slice(0, 80),
      address: str(input.address).slice(0, 240),
      documentType: str(input.documentType) || 'NATIONAL_ID',
      // Masked inside SQL before it is persisted.
      documentNumber: str(input.documentNumber).slice(0, 40),
      businessName: str(input.businessName).slice(0, 160),
      businessRegistrationNumber: str(input.businessRegistrationNumber).slice(0, 60),
      businessContactName: str(input.businessContactName).slice(0, 160),
      businessAddress: str(input.businessAddress).slice(0, 240),
      storeName: str(input.storeName).slice(0, 120),
      storeDescription: str(input.storeDescription).slice(0, 800),
      storeCity: str(input.storeCity).slice(0, 80),
      storeState: str(input.storeState).slice(0, 80),
      storePhone: str(input.storePhone).slice(0, 32),
      declarationAccepted: action === 'SUBMIT' ? String(input.declarationAccepted === true) : 'false',
    };

    if (action === 'SUBMIT') {
      if (!payload.phone || !/^(?:\+?234|0)[789]\d{9}$/.test(String(payload.phone).replace(/\s+/g, ''))) {
        return NextResponse.json(
          { success: false, error: 'Enter a valid Nigerian phone number (e.g. 0803 123 4567).' },
          { status: 400 }
        );
      }
      if (!payload.declarationAccepted || String(payload.declarationAccepted) !== 'true') {
        return NextResponse.json(
          { success: false, error: 'Confirm the declaration before submitting.' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase.rpc('seller_save_verification', {
      p_payload: payload,
      p_submit: action === 'SUBMIT',
    });

    if (error) {
      logger.warn('seller verification save failed', { message: error.message });
      return NextResponse.json(
        { success: false, error: `${error.message}${integrationHint(error.message)}` },
        { status: 400 }
      );
    }

    // Store details captured in step 5 are the seller's own row; update it with
    // the user's session so RLS decides (never the service role).
    if (payload.storeName || payload.storeDescription || payload.storePhone) {
      const { data: me } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_id', user.id)
        .single();

      if (me?.id) {
        const { data: store } = await supabase
          .from('businesses')
          .select('id')
          .eq('owner_id', me.id)
          .order('id')
          .limit(1)
          .maybeSingle();

        if (store) {
          const patch: Record<string, unknown> = {};
          if (payload.storeName) patch.name = payload.storeName;
          if (payload.storeDescription) patch.description = payload.storeDescription;
          if (payload.storeCity) patch.city = payload.storeCity;
          if (payload.storeState) patch.state = payload.storeState;
          if (payload.storePhone) patch.contact_phone = payload.storePhone;
          if (Object.keys(patch).length > 0) {
            await supabase.from('businesses').update(patch).eq('id', store.id);
          }
        }
      }
    }

    const response = (data || {}) as { applicationId?: number; status?: string };
    return NextResponse.json({
      success: true,
      applicationId: response.applicationId,
      status: toStage(response.status),
    });
  } catch (error) {
    logger.error('seller verification POST failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not save verification.') },
      { status: 500 }
    );
  }
}
