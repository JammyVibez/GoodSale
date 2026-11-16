/**
 * Shared rate limiter. Supabase Postgres is the single backend: the
 * `check_rate_limit` RPC (migration 042) does an atomic fixed-window increment,
 * so every server instance sees the same counters. No Redis, no Rust service.
 *
 * Local in-memory counters are kept only for development when Supabase is not
 * configured at all. A limiter outage degrades to "allow + warn" rather than
 * taking the whole API offline with 503s.
 */
import { logger } from './logger';

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  /** True only when the shared limiter could not be consulted. */
  degraded?: boolean;
};

function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] || now;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(windowMs - (now - oldest), 0),
    };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(limit - bucket.timestamps.length, 0),
    retryAfterMs: 0,
  };
}

function supabaseConfig(): { url: string; token: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const token = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();
  if (!url || !token) return null;
  return { url, token };
}

async function supabaseRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const config = supabaseConfig();
  if (!config) return null;

  const timeout = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
    ? AbortSignal.timeout(4000)
    : undefined;

  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: {
        apikey: config.token,
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window_ms: windowMs }),
      cache: 'no-store',
      signal: timeout,
    });
    if (!response.ok) {
      logger.warn('Rate limit RPC failed', { status: response.status });
      return null;
    }

    const rows = (await response.json()) as
      | { allowed?: boolean; remaining?: number; retry_after_ms?: number }[]
      | null;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || typeof row.allowed !== 'boolean') {
      logger.warn('Rate limit RPC returned an unexpected payload');
      return null;
    }

    return {
      allowed: row.allowed,
      remaining: Math.max(0, Number(row.remaining) || 0),
      retryAfterMs: row.allowed ? 0 : Math.max(0, Number(row.retry_after_ms) || 1000),
    };
  } catch (error) {
    logger.warn('Rate limit RPC unreachable', { error: String(error) });
    return null;
  }
}

/** Synchronous fallback retained for existing handlers during migration. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  return memoryRateLimit(key, limit, windowMs);
}

/**
 * Ask the shared limiter. Failures never block traffic: the middleware would
 * otherwise return 503 for every API call while Supabase is briefly unhealthy,
 * which is worse than serving a request without a counter.
 */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const shared = await supabaseRateLimit(key, limit, windowMs);
  if (shared) return shared;

  if (!supabaseConfig()) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('Shared rate limiter is not configured — Supabase URL/key missing');
    }
    return memoryRateLimit(key, limit, windowMs);
  }

  return { allowed: true, remaining: 0, retryAfterMs: 0, degraded: true };
}

/** Trust only forwarding headers written by the hosting proxy. */
export function clientIpFromRequest(req: Request): string {
  const configured = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const trustedHeader =
    configured ||
    (process.env.VERCEL === '1'
      ? 'x-vercel-forwarded-for'
      : process.env.CF_PAGES === '1'
        ? 'cf-connecting-ip'
        : '');

  // Never fall back to arbitrary X-Forwarded-For values supplied by callers.
  if (!['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip'].includes(trustedHeader)) {
    return 'unknown';
  }

  const value = req.headers.get(trustedHeader)?.split(',')[0]?.trim();
  return value || 'unknown';
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < 60_000);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}, 60_000).unref?.();
