import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

/** POST { orderId, action: RELEASE_SELLER|REFUND_BUYER, notes? } — admin */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`admin:escrow:${ip}`, 30, 60_000);
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
    const action = String(body.action || '');
    const notes = String(body.notes || '');

    if (!orderId || !['RELEASE_SELLER', 'REFUND_BUYER'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Valid orderId and action required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('admin_force_escrow', {
      p_order_id: orderId,
      p_action: action,
      p_notes: notes,
    });

    if (error) {
      logger.warn('admin_force_escrow failed', { error: error.message });
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Admin escrow error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Admin escrow action failed') },
      { status: 500 }
    );
  }
}
