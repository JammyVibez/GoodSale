import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { ACCEPTED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, VERIFICATION_SLOTS } from '@/lib/verification';

/**
 * POST /api/seller/verification/documents
 * formData: file, applicationId, slot
 *
 * Identity documents are written to the private `government-ids` bucket under
 * the caller's auth uid. The response never contains a URL — only metadata.
 * Admins later receive short-lived signed URLs from a separate, audited route.
 */

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Cheap magic-byte check so a renamed executable cannot masquerade as a PDF. */
function looksLikeAllowedFile(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length < 4) return false;
  const [a, b, c, d] = bytes;
  if (mime === 'application/pdf') return a === 0x25 && b === 0x50 && c === 0x44 && d === 0x46; // %PDF
  if (mime === 'image/png') return a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47;
  if (mime === 'image/jpeg') return a === 0xff && b === 0xd8 && c === 0xff;
  if (mime === 'image/webp') {
    return (
      a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46 // RIFF
    );
  }
  return false;
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
      return NextResponse.json({ success: false, error: 'Sign in to upload documents.' }, { status: 401 });
    }

    const limited = rateLimit(`verification-upload:${user.id}:${clientIpFromRequest(req)}`, 12, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many uploads. Please wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Private document storage is not configured.' },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const applicationId = Number(formData.get('applicationId'));
    const slot = String(formData.get('slot') || '').toUpperCase();
    const label = String(formData.get('label') || '').slice(0, 80);

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Choose a file to upload.' }, { status: 400 });
    }
    if (!Number.isFinite(applicationId) || !VERIFICATION_SLOTS.includes(slot as never)) {
      return NextResponse.json({ success: false, error: 'Invalid document request.' }, { status: 400 });
    }
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Upload a JPEG, PNG, WebP image or a PDF.' },
        { status: 415 }
      );
    }
    if (file.size <= 0 || file.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ success: false, error: 'Files must be 5 MB or smaller.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!looksLikeAllowedFile(buffer, file.type)) {
      return NextResponse.json(
        { success: false, error: 'That file does not look like the format it claims to be.' },
        { status: 415 }
      );
    }

    // Ownership + editability are re-checked against the database (RLS scopes
    // this select to the caller) — never trusted from the form.
    const { data: application } = await supabase
      .from('identity_verifications')
      .select('id, user_id, status')
      .eq('id', applicationId)
      .maybeSingle();

    if (!application || !['DRAFT', 'REJECTED', 'INFO_REQUIRED'].includes(String(application.status))) {
      return NextResponse.json(
        { success: false, error: 'This application can no longer be edited.' },
        { status: 409 }
      );
    }

    const extension = EXTENSION_BY_MIME[file.type] || 'bin';
    const path = `${user.id}/${applicationId}/${slot.toLowerCase()}-${Date.now()}.${extension}`;

    const { error: uploadError } = await admin.storage.from('government-ids').upload(path, buffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: 'private, max-age=0',
    });

    if (uploadError) {
      logger.error('verification document upload failed', { message: uploadError.message });
      return NextResponse.json(
        { success: false, error: 'Could not store the document. Please try again.' },
        { status: 502 }
      );
    }

    const { error: attachError } = await supabase.rpc('seller_attach_verification_document', {
      p_application_id: applicationId,
      p_slot: slot,
      p_storage_path: path,
      p_label: label,
      p_mime: file.type,
      p_size: file.size,
    });

    if (attachError) {
      // Never leave an orphaned private file behind if the record was refused.
      await admin.storage.from('government-ids').remove([path]);
      return NextResponse.json({ success: false, error: attachError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      document: { slot, label, mimeType: file.type, sizeBytes: file.size },
    });
  } catch (error) {
    logger.error('verification document upload error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Upload failed.') },
      { status: 500 }
    );
  }
}

/** DELETE /api/seller/verification/documents?slot=ID_BACK — remove a mistake. */
export async function DELETE(req: NextRequest) {
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

    const applicationId = Number(req.nextUrl.searchParams.get('applicationId'));
    const slot = String(req.nextUrl.searchParams.get('slot') || '').toUpperCase();
    if (!Number.isFinite(applicationId) || !VERIFICATION_SLOTS.includes(slot as never)) {
      return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
    }

    const { data: application } = await supabase
      .from('identity_verifications')
      .select('id, status')
      .eq('id', applicationId)
      .maybeSingle();

    if (!application || !['DRAFT', 'REJECTED', 'INFO_REQUIRED'].includes(String(application.status))) {
      return NextResponse.json({ success: false, error: 'This application can no longer be edited.' }, { status: 409 });
    }

    const { data: document } = await supabase
      .from('verification_documents')
      .select('id, storage_path')
      .eq('application_id', applicationId)
      .eq('slot', slot)
      .maybeSingle();

    if (!document) {
      return NextResponse.json({ success: true, removed: false });
    }

    const admin = createAdminClient();
    await admin?.storage.from('government-ids').remove([String(document.storage_path)]);
    await supabase.from('verification_documents').delete().eq('id', document.id);

    return NextResponse.json({ success: true, removed: true });
  } catch (error) {
    logger.error('verification document delete error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not remove the document.') },
      { status: 500 }
    );
  }
}
