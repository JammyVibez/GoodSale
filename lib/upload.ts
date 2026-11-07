/**
 * Upload a file to Supabase Storage via the authenticated /api/upload route.
 *
 * Photos from phones are commonly 4–12 MB. Sending the original file makes
 * uploads slow and can exceed the bucket limit, so images are downscaled and
 * re-encoded on the device first. Documents (PDFs) and videos are untouched.
 */
export type UploadBucket = 'product-images' | 'chat-media' | 'government-ids' | 'avatars';

const IMAGE_LIMITS: Record<UploadBucket, { maxEdge: number; quality: number }> = {
  'product-images': { maxEdge: 1800, quality: 0.82 },
  'chat-media': { maxEdge: 1800, quality: 0.8 },
  avatars: { maxEdge: 1400, quality: 0.84 },
  'government-ids': { maxEdge: 2200, quality: 0.9 },
};

const COMPRESS_UNDER_BYTES = 300 * 1024;
const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml']);

type Drawable = ImageBitmap | HTMLImageElement;

function withExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.${extension}`;
}

function loadImage(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadWithElement(file));
  }
  return loadWithElement(file);
}

function loadWithElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image'));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function compressImage(file: File, bucket: UploadBucket): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP_TYPES.has(file.type)) return file;
  if (file.size <= COMPRESS_UNDER_BYTES) return file;

  const limit = IMAGE_LIMITS[bucket];
  let source: Drawable | null = null;

  try {
    source = await loadImage(file);
    const longestEdge = Math.max(source.width, source.height);
    if (!longestEdge) return file;

    const scale = Math.min(1, limit.maxEdge / longestEdge);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    // Already small enough and light enough — avoid a needless canvas pass.
    if (scale === 1 && file.size <= 900 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);

    const webp = await toBlob(canvas, 'image/webp', limit.quality);
    const blob = webp ?? (await toBlob(canvas, 'image/jpeg', limit.quality));
    if (!blob) return file;

    // Never make the upload larger than the original.
    if (blob.size >= file.size && file.size <= 5 * 1024 * 1024) return file;

    const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], withExtension(file.name, extension), {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (source && 'close' in source && typeof source.close === 'function') source.close();
  }
}

export async function uploadMedia(
  file: File,
  bucket: UploadBucket = 'product-images'
): Promise<string> {
  const prepared = await compressImage(file, bucket);

  const form = new FormData();
  form.append('file', prepared);
  form.append('bucket', bucket);

  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success || !data?.url) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return data.url as string;
}
