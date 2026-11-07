import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { profileIdForAuth } from '@/lib/wallet/server';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

/**
 * POST /api/promotions/purchase
 * { productId, featureType: 'FEATURED' | 'FLASH_SALE', durationDays? }
 *
 * The database re-checks ownership, listing eligibility, the admin price and
 * wallet balance, then debits the wallet and writes the promotion atomically.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`promotions:purchase:${ip}`, 12, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many promotion attempts' }, { status: 429 });
    }

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
      return NextResponse.json({ success: false, error: 'Promotion service is not configured' }, { status: 503 });
    }

    const profileId = await profileIdForAuth(admin, user.id);
    if (!profileId) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const productId = Number(body.productId);
    const featureType = String(body.featureType || '').toUpperCase();
    const durationDays = Number(body.durationDays ?? 7);

    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ success: false, error: 'Choose a valid listing' }, { status: 400 });
    }
    if (featureType !== 'FEATURED' && featureType !== 'FLASH_SALE') {
      return NextResponse.json({ success: false, error: 'Choose a valid promotion type' }, { status: 400 });
    }

    const { data, error } = await admin.rpc('purchase_listing_promotion', {
      p_user_id: profileId,
      p_product_id: productId,
      p_feature_type: featureType,
      p_duration_days: Number.isInteger(durationDays) ? durationDays : 7,
    });

    if (error) {
      logger.warn('Promotion purchase failed', { productId, featureType, error: error.message });
      return NextResponse.json(
        { success: false, error: error.message || 'Promotion purchase failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, promotion: data });
  } catch (error) {
    logger.error('Promotion purchase error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not buy this promotion') },
      { status: 500 }
    );
  }
}
