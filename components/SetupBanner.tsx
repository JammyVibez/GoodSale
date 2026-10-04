'use client';

import { isSupabaseConfigured } from '@/lib/supabase/client';
import { Shield, ArrowRight, Database } from 'lucide-react';

/**
 * Aurora alert bar — shown when the live Supabase backend is not configured.
 * Deep ink surface with a jade aurora wash: a system notice, not decoration.
 * (Mock data was removed — credentials are required for auth & marketplace data.)
 */
export default function SetupBanner() {
  if (isSupabaseConfigured()) return null;

  return (
    <div className="sticky top-0 z-[100] aurora-bg animate-gradient bg-ink-900 text-ink-50 border-b border-jade-500/30 px-4 py-3 animate-slide-in">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1.5 bg-jade-500/20 text-jade-400 rounded-xl">
            <Database className="w-4 h-4" />
          </div>
          <p className="font-bold text-sm">Setup Required</p>
        </div>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <p className="text-xs sm:text-sm opacity-90 leading-relaxed">
            Connect your Supabase project to enable auth, listings, and payments.
            Set{' '}
            <code className="bg-white/10 text-jade-300 px-1.5 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_SUPABASE_URL</code>
            {' '}and{' '}
            <code className="bg-white/10 text-jade-300 px-1.5 py-0.5 rounded text-xs font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            {' '}in API Keys.
          </p>
        </div>
        <a
          href="https://supabase.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-jade-500 hover:bg-jade-600 text-white rounded-xl text-xs font-bold shrink-0 transition-colors press-scale focus-ring"
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Create Supabase</span>
          <ArrowRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
