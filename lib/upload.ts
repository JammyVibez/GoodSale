/**
 * Upload a file to Supabase Storage via the authenticated /api/upload route.
 * All app media (products, chat, avatars, receipts, IDs) should use this.
 */

export type UploadBucket =
  | 'product-images'
  | 'chat-media'
  | 'government-ids'
  | 'user-media';

export async function uploadMedia(
  file: File,
  bucket: UploadBucket = 'product-images'
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.url) {
    throw new Error(data.error || 'Upload failed');
  }
  return data.url as string;
}

/** Upload with a temporary object-URL preview for immediate UI feedback. */
export async function uploadMediaWithPreview(
  file: File,
  bucket: UploadBucket
): Promise<{ url: string; preview: string }> {
  const preview = URL.createObjectURL(file);
  try {
    const url = await uploadMedia(file, bucket);
    return { url, preview };
  } catch (err) {
    URL.revokeObjectURL(preview);
    throw err;
  }
}
