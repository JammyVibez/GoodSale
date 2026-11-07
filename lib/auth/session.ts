// lib/auth/session.ts
/**
 * "Keep me signed in on this device" support.
 *
 * Supabase persists its session by default. When the user unchecks the box we
 * record a per-tab marker: a fresh browser session (new tab / reopened browser)
 * has no marker, so the stored session is revoked on the next load instead of
 * silently keeping the account signed in. Nothing about the password or the
 * token is stored here — only the scope preference.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const SCOPE_KEY = 'goodsale_session_scope';
const TAB_MARKER = 'goodsale_tab_session';

export function rememberSession(remember: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SCOPE_KEY, remember ? 'persistent' : 'tab');
    if (remember) sessionStorage.removeItem(TAB_MARKER);
    else sessionStorage.setItem(TAB_MARKER, '1');
  } catch {
    // Private mode / storage disabled — Supabase's own persistence still applies.
  }
}

export function forgetSessionScope(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SCOPE_KEY);
    sessionStorage.removeItem(TAB_MARKER);
  } catch {
    // ignore
  }
}

/** Revokes a "this tab only" session once the browser session is gone. */
export async function enforceSessionScope(client: SupabaseClient): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  let scope: string | null = null;
  let marker: string | null = null;
  try {
    scope = localStorage.getItem(SCOPE_KEY);
    marker = sessionStorage.getItem(TAB_MARKER);
  } catch {
    return false;
  }
  if (scope !== 'tab' || marker === '1') return false;

  await client.auth.signOut();
  forgetSessionScope();
  return true;
}
