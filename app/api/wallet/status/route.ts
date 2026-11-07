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
