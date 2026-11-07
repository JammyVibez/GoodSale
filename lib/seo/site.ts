/** Canonical site origin used by metadata, sitemap, robots and JSON-LD. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || 'https://goodsale.ng';
  return raw.replace(/\/+$/, '');
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function categorySlug(category: string): string {
  return category
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function naira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}
