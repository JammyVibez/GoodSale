import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { buildPushPayload } from '@/lib/push/payload';
import { isWebPushConfigured, sendPushToProfileIds } from '@/lib/push/server';

/** POST /api/push/test — send a test push notification to the signed-in user's subscribed devices */
export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limited = rateLimit(`push:test:${ip}`, 10, 60_000);
  if (!limited.allowed) {
    return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
  }

  if (!isWebPushConfigured()) {
    return NextResponse.json(
      {
        success: false,
        configured: false,
        error: 'VAPID keys are not configured on the server yet.',
      },
      { status: 503 }
    );
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!profile?.id) {
    return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
  }

  const payload = buildPushPayload({
    kind: 'TEST',
    userName: String(profile.full_name || '').split(' ')[0] || undefined,
  });

  const summary = await sendPushToProfileIds({
    profileIds: [Number(profile.id)],
    payload,
    category: 'escrow',
  });

  if (summary.attempted === 0) {
    return NextResponse.json(
      { success: false, error: 'No active push subscription found on this account.' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: summary.sent > 0, ...summary });
}
