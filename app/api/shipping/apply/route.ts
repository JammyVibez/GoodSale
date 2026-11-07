import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ShippingError, applyQuoteToOrders } from '@/lib/shipping/server';

/**
 * POST /api/shipping/apply
 * Re-price unpaid cart orders from a server quote before payment begins.
 * POST { quoteId: string, orderIds: number[] }
 */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(`shipping:apply:${clientIpFromRequest(req)}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase is not configured.' }, { status: 503 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Sign in to continue.' }, { status: 401 });
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('auth_id', user.id)
      .maybeSingle();
    if (profileError || !profile?.id) {
      return NextResponse.json({ success: false, error: 'Your profile could not be loaded.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const quoteId = typeof body?.quoteId === 'string' ? body.quoteId : '';
    const orderIds = Array.isArray(body?.orderIds)
      ? body.orderIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
      : [];
    if (!quoteId || orderIds.length === 0) {
      return NextResponse.json({ success: false, error: 'A quote and order ids are required.' }, { status: 400 });
    }

    const role = String(profile.role || '').toUpperCase();
    const results = await applyQuoteToOrders(quoteId, orderIds, {
      profileId: Number(profile.id),
      isAdmin: role === 'ADMIN' || role === 'SUPER_ADMIN',
    });

    return NextResponse.json({ success: true, orders: results });
  } catch (error) {
    if (error instanceof ShippingError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    logger.error('Verified shipping apply failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Could not verify shipping. Please refresh and retry.' },
      { status: 500 }
    );
  }
}
