'use client';

import { isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * Shown when the live Supabase backend is not configured.
 * Replace mock data was removed — credentials are required for auth & marketplace data.
 */
export default function SetupBanner() {
  if (isSupabaseConfigured()) return null;

  return (
    <div className="sticky top-0 z-[100] bg-amber-500 text-slate-950 px-4 py-3 text-sm">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <p className="font-semibold shrink-0">Supabase credentials required</p>
        <p className="text-xs sm:text-sm opacity-90 leading-relaxed">
          Mock data has been removed. Add{' '}
          <code className="bg-black/10 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code>,{' '}
          <code className="bg-black/10 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{' '}
          <code className="bg-black/10 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code> to{' '}
          <code className="bg-black/10 px-1 rounded">.env.local</code>, then run{' '}
          <code className="bg-black/10 px-1 rounded">supabase/schema.sql</code> in the Supabase SQL editor.
          Optionally set Paystack keys for live checkout.
        </p>
      </div>
    </div>
  );
}
