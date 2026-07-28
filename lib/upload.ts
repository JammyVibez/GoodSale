/**
 * Upload a file to Supabase Storage via the authenticated /api/upload route.
 */
export async function uploadMedia(
  file: File,
  bucket: 'product-images' | 'chat-media' | 'government-ids' = 'product-images'
): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || !data.success || !data.url) {
    throw new Error(data.error || 'Upload failed');
  }
  return data.url as string;
}
