import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

const BUCKETS = new Set(['product-images', 'chat-media', 'government-ids', 'avatars']);
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Cloudinary is enabled when all three keys are present. Uploads are signed
 * server-side with HMAC-SHA1 so the secret never reaches the browser, and no
 * client SDK is required.
 *
 * Note: identity documents intentionally stay on the private Supabase bucket
 * (signed URLs) — they are never sent to a public CDN.
 */
function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function cloudinarySignature(params: Record<string, string>): string {
  const secret = process.env.CLOUDINARY_API_SECRET!;
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(toSign + secret).digest('hex');
}

type CloudinaryResult = { url: string; publicId: string } | null;

async function uploadToCloudinary(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<CloudinaryResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  if (!cloudinaryConfigured()) return null;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = { folder: 'goodsale', timestamp };
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: mimeType || 'application/octet-stream' }),
    filename
  );
  form.append('api_key', apiKey!);
  form.append('folder', params.folder);
  form.append('timestamp', params.timestamp);
  form.append('signature', cloudinarySignature(params));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.warn('Cloudinary upload failed', { status: res.status, detail: detail.slice(0, 300) });
    return null;
  }
  const data = (await res.json()) as { secure_url?: string; public_id?: string };
  if (!data?.secure_url) return null;
  return { url: data.secure_url, publicId: data.public_id || '' };
}

/**
 * Authenticated media upload.
 * formData: file, bucket ('product-images' | 'chat-media' | 'government-ids' | 'avatars')
 * Cloudinary handles images + video for public buckets; private IDs stay on Supabase.
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

    const isVideo = file.type.startsWith('video/');
    const maxBytes = isVideo ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json(
        { success: false, error: `File must be under ${Math.round(maxBytes / 1024 / 1024)}MB` },
        { status: 413 }
      );
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Identity documents always stay private on Supabase Storage.
    if (bucket !== 'government-ids' && cloudinaryConfigured()) {
      const cdn = await uploadToCloudinary(buffer, file.name || path, file.type);
      if (cdn) {
        return NextResponse.json({
          success: true,
          url: cdn.url,
          publicId: cdn.publicId,
          provider: 'cloudinary',
          bucket,
        });
      }
      logger.warn('Cloudinary unavailable, falling back to Supabase Storage');
    }

    // --- Supabase Storage (fallback + private buckets) ---
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
