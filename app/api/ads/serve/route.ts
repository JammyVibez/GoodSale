import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

const PLACEMENTS = new Set(['HOME', 'CATEGORY', 'DETAIL', 'CHAT', 'DASHBOARD', 'SEARCH']);

/**
 * GET /api/ads/serve?placement=HOME&state=Lagos&category=Phones
 *
 * Server-authoritative ad selection. It never trusts the browser's cached ad
 * list: status, moderation, schedule, budget, placement and targeting are all
 * rechecked before a creative is returned.
 */
export async function GET(req: NextRequest) {
  try {
    const placement = String(req.nextUrl.searchParams.get('placement') || 'HOME').toUpperCase();
    if (!PLACEMENTS.has(placement)) {
      return NextResponse.json({ success: true, ad: null });
    }
    const state = String(req.nextUrl.searchParams.get('state') || '').trim();
    const city = String(req.nextUrl.searchParams.get('city') || '').trim();
    const category = String(req.nextUrl.searchParams.get('category') || '').trim();

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ success: true, ad: null });

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('sponsored_ads')
      .select('*')
      .eq('status', 'ACTIVE')
      .eq('moderation_status', 'APPROVED')
      .order('id', { ascending: false })
      .limit(30);
    if (error) {
      logger.warn('Ad serving lookup failed', { error: error.message });
      return NextResponse.json({ success: true, ad: null });
    }

    const today = new Date().toISOString().slice(0, 10);
    const ids = (data || []).map((row) => Number(row.id));
    const daily = new Map<number, number>();
    if (ids.length) {
      const { data: spendRows } = await admin
        .from('sponsored_ad_daily_spend')
        .select('ad_id,spend')
        .in('ad_id', ids)
        .eq('spend_date', today);
      for (const row of spendRows || []) daily.set(Number(row.ad_id), Number(row.spend) || 0);
    }

    const eligible = (data || []).find((row) => {
      const placements = Array.isArray(row.placements) ? row.placements.map(String) : ['HOME'];
      if (!placements.includes(placement)) return false;
      if (row.starts_at && String(row.starts_at) > now) return false;
      if (row.ends_at && String(row.ends_at) <= now) return false;
      if (Number(row.budget) > 0 && Number(row.spent) >= Number(row.budget)) return false;
      if (Number(row.daily_budget) > 0 && (daily.get(Number(row.id)) || 0) >= Number(row.daily_budget)) return false;
      if (row.target_state && String(row.target_state).toLowerCase() !== state.toLowerCase()) return false;
      if (row.target_city && String(row.target_city).toLowerCase() !== city.toLowerCase()) return false;
      if (row.target_category && String(row.target_category).toLowerCase() !== category.toLowerCase()) return false;
      return true;
    });

    if (!eligible) return NextResponse.json({ success: true, ad: null });
    const placements = Array.isArray(eligible.placements) ? eligible.placements.map(String) : ['HOME'];

    return NextResponse.json({
      success: true,
      ad: {
        id: Number(eligible.id),
        sellerId: Number(eligible.seller_id),
        type: eligible.type,
        targetId: Number(eligible.target_id || 0),
        bannerUrl: eligible.banner_url || undefined,
        mediaUrl: eligible.media_url || undefined,
        mediaType: eligible.media_type === 'video' ? 'video' : 'image',
        ctaText: eligible.cta_text || '',
        clickView: eligible.click_view || '',
        placements,
        title: eligible.title,
        status: eligible.status,
        budget: Number(eligible.budget) || 0,
        dailyBudget: Number(eligible.daily_budget) || 0,
        spent: Number(eligible.spent) || 0,
        clicks: Number(eligible.clicks) || 0,
        impressions: Number(eligible.impressions) || 0,
        cpcBid: Number(eligible.cpc_bid) || 0,
        startsAt: eligible.starts_at || undefined,
        endsAt: eligible.ends_at || undefined,
      },
    });
  } catch (error) {
    logger.warn('Ad serving error', { error: String(error) });
    return NextResponse.json({ success: true, ad: null });
  }
}
