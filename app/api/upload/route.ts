import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

const BUCKETS = new Set(['product-images', 'chat-media', 'government-ids', 'avatars']);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Authenticated media upload to Supabase Storage.
 * formData: file, bucket ('product-images' | 'chat-media' | 'government-ids' | 'avatars')
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`upload:media:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many uploads' }, { status: 429 });
    }

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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const bucket = String(formData.get('bucket') || 'product-images');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (!BUCKETS.has(bucket)) {
      return NextResponse.json({ success: false, error: 'Invalid bucket' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'File must be under 8MB' }, { status: 413 });
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Prefer user session for RLS; fall back to admin for bucket bootstrap
    let uploader = supabase;
    const admin = createAdminClient();
    const { error: uploadError } = await uploader.storage.from(bucket).upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

    if (uploadError && admin) {
      logger.warn('User upload failed, retrying with admin', { message: uploadError.message });
      uploader = admin;
      const retry = await uploader.storage.from(bucket).upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (retry.error) {
        return NextResponse.json({ success: false, error: retry.error.message }, { status: 502 });
      }
    } else if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 502 });
    }

    if (bucket === 'government-ids') {
      const { data: signed, error: signError } = await (admin || supabase).storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60 * 24);
      if (signError || !signed?.signedUrl) {
        return NextResponse.json({ success: false, error: 'Could not sign URL' }, { status: 502 });
      }
      return NextResponse.json({ success: true, url: signed.signedUrl, path, bucket, private: true });
    }

    const { data: pub } = (admin || supabase).storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ success: true, url: pub.publicUrl, path, bucket, private: false });
  } catch (error) {
    logger.error('Media upload failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Upload failed') },
      { status: 500 }
    );
  }
}
