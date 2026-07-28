import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

/** POST { orderId, reason } — open escrow dispute */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`dispute:open:${ip}`, 10, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many attempts' }, { status: 429 });
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

    const body = await req.json();
    const orderId = Number(body.orderId);
    const reason = String(body.reason || '').trim();
    if (!orderId || reason.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Valid orderId and reason (10+ chars) required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('open_dispute', {
      p_order_id: orderId,
      p_reason: reason,
    });

    if (error) {
      logger.warn('open_dispute failed', { error: error.message, orderId });
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Open dispute error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not open dispute') },
      { status: 500 }
    );
  }
}
