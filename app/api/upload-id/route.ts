import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { isDemoMode } from '@/lib/env';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

function sanitizeUserId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown';
}

function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'application/pdf') return 'pdf';
  return 'jpg';
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`upload-id:${ip}`, 10, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many upload attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    // Production requires Supabase private storage — no public FS / base64 fallbacks
    if (!isDemoMode() && !supabase) {
      return NextResponse.json(
        {
          success: false,
          error: 'Identity document uploads require configured Supabase storage in production.',
        },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const userId = sanitizeUserId(formData.get('userId')?.toString() || 'unknown');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Upload JPEG, PNG, WebP, or PDF.' },
        { status: 415 }
      );
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File must be between 1 byte and 5 MB.' },
        { status: 413 }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileExtension = extensionFor(file);
    const fileName = `gov_id_${userId}_${Date.now()}.${fileExtension}`;

    let uploadedUrl = '';
    let uploadSource = 'none';

    if (supabase) {
      try {
        const bucket = 'government-ids';
        const { error } = await supabase.storage.from(bucket).upload(fileName, fileBuffer, {
          contentType: file.type,
          upsert: false,
        });

        if (!error) {
          // Prefer signed URLs (private bucket). Fall back to public URL only in demo mode.
          const { data: signed, error: signError } = await supabase.storage
            .from(bucket)
            .createSignedUrl(fileName, 60 * 60);

          if (!signError && signed?.signedUrl) {
            uploadedUrl = signed.signedUrl;
            uploadSource = 'supabase-signed';
          } else if (isDemoMode()) {
            const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
            uploadedUrl = publicUrlData.publicUrl;
            uploadSource = 'supabase-public-demo';
          } else {
            logger.warn('Could not create signed URL for ID upload', {
              message: signError?.message,
            });
          }
        } else {
          logger.warn('Supabase ID upload failed', { message: error.message });
        }
      } catch (err) {
        logger.warn('Supabase storage upload exception', { error: String(err) });
      }
    }

    // Local / base64 fallbacks are demo-only — never store government IDs in /public in production
    if (!uploadedUrl && isDemoMode()) {
      try {
        const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
        if (!fs.existsSync(publicUploadsDir)) {
          fs.mkdirSync(publicUploadsDir, { recursive: true });
        }
        const localPath = path.join(publicUploadsDir, fileName);
        await fs.promises.writeFile(localPath, fileBuffer);
        uploadedUrl = `/uploads/${fileName}`;
        uploadSource = 'local-file-system-demo';
      } catch (fsError) {
        logger.warn('Local FS write failed, using base64 demo fallback', {
          error: String(fsError),
        });
        uploadedUrl = `data:${file.type};base64,${fileBuffer.toString('base64')}`;
        uploadSource = 'base64-fallback-demo';
      }
    }

    if (!uploadedUrl) {
      return NextResponse.json(
        { success: false, error: 'Upload failed. Configure private Supabase storage.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      url: uploadedUrl,
      source: uploadSource,
      fileName,
      pendingReview: !isDemoMode(),
    });
  } catch (error) {
    logger.error('Error in upload-id route', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Upload failed') },
      { status: 500 }
    );
  }
}
