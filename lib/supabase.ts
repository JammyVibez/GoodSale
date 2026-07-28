/** Compatibility re-exports — prefer @/lib/supabase/client */
export { createClient, getSupabase, isSupabaseConfigured } from './supabase/client';
export { createAdminClient as getSupabaseAdmin } from './supabase/admin';
