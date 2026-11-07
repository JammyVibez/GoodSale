import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

/**
 * POST /api/ads/event { adId, type: 'IMPRESSION' | 'CLICK' }
 *
 * Delivery counters are server-authoritative. Clicks are deduplicated per
 * IP/campaign over a short time bucket, so repeatedly clicking an ad cannot
 * burn its whole budget.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`ads:event:${ip}`, 120, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many ad events' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const adId = Number(body.adId);
    const type = String(body.type || '').toUpperCase();
    if (!Number.isInteger(adId) || adId <= 0) {
      return NextResponse.json({ success: false, error: 'Valid campaign required' }, { status: 400 });
    }
    if (type !== 'IMPRESSION' && type !== 'CLICK') {
      return NextResponse.json({ success: false, error: 'Valid ad event required' }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Advertising service is not configured' }, { status: 503 });
    }

    // Clicks get a 10-minute dedup window per IP and campaign. Impressions are
    // deduplicated per IP/campaign/minute to absorb rapid remounts.
    const bucket = Math.floor(Date.now() / (type === 'CLICK' ? 10 * 60_000 : 60_000));
    const dedupKey = createHash('sha256')
      .update(`${type}:${ip}:${adId}:${bucket}`)
      .digest('hex');

    const { data, error } = await admin.rpc('record_sponsored_ad_event', {
      p_ad_id: adId,
      p_event_type: type,
      p_dedup_key: dedupKey,
    });

    if (error) {
      logger.warn('Ad event recording failed', { adId, type, error: error.message });
      return NextResponse.json({ success: false, error: 'Ad event could not be recorded' }, { status: 400 });
    }

    return NextResponse.json({
      success: Boolean(data?.success),
      deduplicated: Boolean(data?.deduplicated),
      reason: data?.reason || null,
    });
  } catch (error) {
    logger.error('Ad event error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Ad event failed') },
      { status: 500 }
    );
  }
}
