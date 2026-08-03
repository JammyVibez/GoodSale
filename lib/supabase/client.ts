import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Browser Supabase client — session lives in cookies so hard refresh keeps you signed in.
 */
export function createClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        // 1 year — Supabase refreshes tokens; cookie must outlive access token
        maxAge: 60 * 60 * 24 * 365,
      },
      isSingleton: true,
    }
  );
  return browserClient;
}

/** @deprecated Prefer createClient() from lib/supabase/client */
export function getSupabase() {
  return createClient();
}
