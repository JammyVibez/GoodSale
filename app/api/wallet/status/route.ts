import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getWalletProviderConfig,
  loadWalletSettings,
  profileIdForAuth,
} from '@/lib/wallet/server';

/** Authenticated wallet capabilities, provider availability and server limits. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const rustBackend = process.env.RUST_BACKEND_URL?.trim().replace(/\/+$/, '');
  if (rustBackend) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    try {
      const upstream = await fetch(`${rustBackend}/v1/wallet/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });
      const payload = await upstream.json().catch(() => ({
        success: false,
        error: 'Wallet service returned an invalid response',
      }));
      return NextResponse.json(payload, { status: upstream.status });
    } catch {
      return NextResponse.json({ success: false, error: 'Wallet service is temporarily unavailable' }, { status: 502 });
    }
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Wallet service is not configured' }, { status: 503 });
  }

  const settings = await loadWalletSettings(admin);
  const provider = getWalletProviderConfig();
  const profileId = await profileIdForAuth(admin, user.id);
  const { data: funding } = profileId
    ? await admin
        .from('wallet_funding_intents')
        .select('id,reference,amount,status,provider_reference,created_at,completed_at')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: [] };

  return NextResponse.json({
    success: true,
    currency: 'NGN',
    provider,
    fundingAvailable: provider.fundingEnabled,
    payoutsAvailable: provider.payoutsEnabled,
    limits: settings,
    funding: funding || [],
    source: 'server',
  });
}
