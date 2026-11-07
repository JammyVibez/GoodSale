import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

/**
 * GET /api/admin/verifications/documents?id=42
 *
 * Returns a 90-second signed URL for one private identity document. Only an
 * authenticated ADMIN / SUPER_ADMIN / MODERATOR may call it, every view is
 * written to the verification audit trail, and the URL is never stored.
 */

const REVIEWER_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'MODERATOR']);

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
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (!profile || !REVIEWER_ROLES.has(String(profile.role))) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const limited = rateLimit(`verification-doc:${profile.id}:${clientIpFromRequest(req)}`, 60, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many document views.' }, { status: 429 });
    }

    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Document is required.' }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Storage not configured' }, { status: 503 });
    }

    const { data: document } = await admin
      .from('verification_documents')
      .select('id, application_id, seller_id, slot, label, storage_path, mime_type')
      .eq('id', id)
      .maybeSingle();

    if (!document || !document.storage_path) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from('government-ids')
      .createSignedUrl(String(document.storage_path), 90);

    if (signError || !signed?.signedUrl) {
      logger.error('admin document signing failed', { message: signError?.message });
      return NextResponse.json({ success: false, error: 'Could not open the document.' }, { status: 502 });
    }

    // Audit the access itself — who looked at which evidence and when.
    await admin.from('verification_events').insert({
      application_id: document.application_id,
      seller_id: document.seller_id,
      admin_id: profile.id,
      action: 'DOCUMENT_VIEWED',
      from_status: '',
      to_status: '',
      internal_note: `Opened ${document.slot}${document.label ? ` (${document.label})` : ''}`,
      is_internal: true,
    });

    return NextResponse.json({
      success: true,
      url: signed.signedUrl,
      mimeType: document.mime_type || '',
      label: document.label || document.slot,
      expiresInSeconds: 90,
    });
  } catch (error) {
    logger.error('admin document view error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not open the document.') },
      { status: 500 }
    );
  }
}
