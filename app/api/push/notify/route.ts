import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { logger, publicErrorMessage } from '@/lib/logger';
import { buildPushPayload } from '@/lib/push/payload';
import { isWebPushConfigured, sendPushToProfileIds } from '@/lib/push/server';

/**
 * POST /api/push/notify
 * Authenticated trigger for real-time chat room push alerts.
 * Verifies the sender belongs to the chat room and respects room mute status.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`push:notify:${ip}`, 60, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    if (!isWebPushConfigured()) {
      return NextResponse.json({ success: true, configured: false, sent: 0 });
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

    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('id, full_name, username')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (!senderProfile?.id) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const kind = String(body?.kind || '');
    if (kind !== 'CHAT_MESSAGE') {
      return NextResponse.json({ success: false, error: 'Unsupported push event kind' }, { status: 400 });
    }

    const roomId = Number(body?.roomId);
    const preview = String(body?.preview || '').trim() || 'Sent you a message';
    if (!Number.isInteger(roomId) || roomId <= 0) {
      return NextResponse.json({ success: false, error: 'Valid roomId is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ success: true, configured: false, sent: 0 });
    }

    const { data: room } = await admin
      .from('chat_rooms')
      .select('id, buyer_id, seller_id, buyer_muted, seller_muted')
      .eq('id', roomId)
      .maybeSingle();

    if (!room) {
      return NextResponse.json({ success: false, error: 'Chat room not found' }, { status: 404 });
    }

    const senderId = Number(senderProfile.id);
    const buyerId = Number(room.buyer_id);
    const sellerId = Number(room.seller_id);
    if (senderId !== buyerId && senderId !== sellerId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const recipientId = senderId === buyerId ? sellerId : buyerId;
    const recipientMuted =
      recipientId === buyerId ? room.buyer_muted === true : room.seller_muted === true;
    if (recipientMuted) {
      return NextResponse.json({ success: true, configured: true, sent: 0, muted: true });
    }

    const senderName = String(
      senderProfile.full_name || senderProfile.username || 'GoodSale member'
    );
    const payload = buildPushPayload({
      kind: 'CHAT_MESSAGE',
      roomId,
      senderName,
      preview,
    });

    const summary = await sendPushToProfileIds({
      profileIds: [recipientId],
      payload,
      category: 'messages',
    });

    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logger.warn('Push notify error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not dispatch push alert') },
      { status: 500 }
    );
  }
}
