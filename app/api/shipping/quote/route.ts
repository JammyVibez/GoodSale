import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ShippingError, quoteShipping, type QuoteRequest } from '@/lib/shipping/server';
import type { ShippingDeliveryMethod, ShippingServiceType } from '@/lib/types';

const METHODS = new Set<ShippingDeliveryMethod>(['GOODSALE_PARTNER', 'THIRD_PARTY_COURIER', 'PICKUP']);
const SERVICES = new Set<ShippingServiceType>(['ECONOMY', 'STANDARD', 'EXPRESS']);

/**
 * POST /api/shipping/quote
 * Server-authoritative delivery quote for a cart and destination.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(`shipping:quote:${clientIpFromRequest(req)}`, 60, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many quote requests. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body.' }, { status: 400 });
    }

    const method = String(body.deliveryMethod || 'GOODSALE_PARTNER').toUpperCase() as ShippingDeliveryMethod;
    const service = String(body.serviceType || 'STANDARD').toUpperCase() as ShippingServiceType;
    if (!METHODS.has(method) || !SERVICES.has(service)) {
      return NextResponse.json({ success: false, error: 'Unsupported delivery option.' }, { status: 400 });
    }

    let buyerId: number | undefined;
    const supabase = await createServerSupabaseClient();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_id', user.id)
          .maybeSingle();
        if (profile?.id) buyerId = Number(profile.id);
      }
    }

    const lat = Number(body.destination?.lat);
    const lng = Number(body.destination?.lng);
    const request: QuoteRequest = {
      items: Array.isArray(body.items) ? body.items : [],
      destination: {
        address: String(body.destination?.address || ''),
        city: String(body.destination?.city || ''),
        state: String(body.destination?.state || ''),
        lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : undefined,
        lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : undefined,
      },
      deliveryMethod: method,
      serviceType: service,
      courierId: body.courierId != null ? Number(body.courierId) : undefined,
      buyerId,
    };

    const quote = await quoteShipping(request);
    return NextResponse.json({ success: true, quote });
  } catch (error) {
    if (error instanceof ShippingError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    logger.error('Shipping quote failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Could not calculate delivery right now. Please retry.' },
      { status: 500 }
    );
  }
}
