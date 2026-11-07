import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { getWalletProviderConfig, profileIdForAuth } from '@/lib/wallet/server';

/** GET /api/premium/subscriptions — the signed-in user's own membership state. */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Premium service is not configured' }, { status: 503 });
    }
    const profileId = await profileIdForAuth(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    const [business, verified, payments] = await Promise.all([
      admin
        .from('business_subscriptions')
        .select('*')
        .eq('user_id', profileId)
        .order('expires_at', { ascending: false })
        .limit(10),
      admin
        .from('verified_plus_subscriptions')
        .select('*')
        .eq('user_id', profileId)
        .order('expires_at', { ascending: false })
        .limit(10),
      admin
        .from('premium_subscription_payments')
        .select('reference,product,plan_code,amount,currency,status,starts_at,expires_at,created_at,paid_at')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const schemaError =
      business.error?.message ||
      verified.error?.message ||
      payments.error?.message ||
      null;

    if (schemaError) {
      logger.warn('Premium subscription read failed', { error: schemaError });
    }

    return NextResponse.json({
      success: true,
      provider: getWalletProviderConfig(),
      businessSubscriptions: (business.data || []).map((row) => ({
        id: Number(row.id),
        plan: String(row.plan || 'FREE'),
        startsAt: row.starts_at || row.created_at,
        expiresAt: row.expires_at,
        status: String(row.status || 'ACTIVE'),
        autoRenew: Boolean(row.auto_renew),
        cancelledAt: row.cancelled_at || null,
      })),
      verifiedPlusSubscriptions: (verified.data || []).map((row) => ({
        id: Number(row.id),
        startsAt: row.starts_at || row.created_at,
        expiresAt: row.expires_at,
        status: String(row.status || 'ACTIVE'),
        autoRenew: Boolean(row.auto_renew),
        cancelledAt: row.cancelled_at || null,
      })),
      payments: (payments.data || []).map((row) => ({
        reference: String(row.reference),
        product: String(row.product),
        planCode: String(row.plan_code),
        amount: Number(row.amount),
        currency: String(row.currency || 'NGN'),
        status: String(row.status),
        startsAt: row.starts_at || null,
        expiresAt: row.expires_at || null,
        createdAt: row.created_at,
        paidAt: row.paid_at || null,
      })),
      schemaReady: !schemaError,
    });
  } catch (error) {
    logger.error('Premium subscriptions GET error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load membership history') },
      { status: 500 }
    );
  }
}
