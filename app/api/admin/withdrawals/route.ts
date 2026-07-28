import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

/** POST { withdrawalId, approve: boolean, notes? } — admin */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`wallet:withdraw-admin:${ip}`, 30, 60_000);
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
    const withdrawalId = Number(body.withdrawalId);
    const approve = Boolean(body.approve);
    const notes = String(body.notes || '');

    if (!withdrawalId) {
      return NextResponse.json({ success: false, error: 'withdrawalId required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('admin_process_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_approve: approve,
      p_notes: notes,
    });

    if (error) {
      logger.warn('admin_process_withdrawal failed', { error: error.message });
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Admin withdrawal error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not process withdrawal') },
      { status: 500 }
    );
  }
}
