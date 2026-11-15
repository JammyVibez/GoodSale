import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { logger, publicErrorMessage } from '@/lib/logger';
import { getVapidPublicKey, isWebPushConfigured } from '@/lib/push/server';
import {
  DEFAULT_PUSH_TOPICS,
  normalizePushTopics,
  validatePushSubscriptionInput,
} from '@/lib/push/payload';

async function getCurrentProfileId(supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, push_enabled')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!profile?.id) return null;
  return {
    profileId: Number(profile.id),
    pushEnabled: profile.push_enabled !== false,
  };
}

/** GET /api/push/subscribe — returns VAPID configuration & current user subscription state */
export async function GET() {
  try {
    const configured = isWebPushConfigured();
    const publicKey = getVapidPublicKey();

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({
        success: true,
        configured,
        publicKey,
        subscribed: false,
        subscriptionCount: 0,
        topics: DEFAULT_PUSH_TOPICS,
      });
    }

    const current = await getCurrentProfileId(supabase);
    if (!current) {
      return NextResponse.json({
        success: true,
        configured,
        publicKey,
        subscribed: false,
        subscriptionCount: 0,
        topics: DEFAULT_PUSH_TOPICS,
      });
    }

    const { data: rows } = await supabase
      .from('push_subscriptions')
      .select('id, topics, platform, updated_at')
      .eq('profile_id', current.profileId)
      .order('updated_at', { ascending: false });

    const count = rows?.length || 0;
    const latestTopics = rows?.[0]?.topics
      ? normalizePushTopics(rows[0].topics as Record<string, boolean>)
      : DEFAULT_PUSH_TOPICS;

    return NextResponse.json({
      success: true,
      configured,
      publicKey,
      subscribed: count > 0 && current.pushEnabled,
      subscriptionCount: count,
      topics: latestTopics,
    });
  } catch (error) {
    logger.error('Push subscription status error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not inspect push subscription') },
      { status: 500 }
    );
  }
}

/** POST /api/push/subscribe — register or update a browser Web Push subscription */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`push:subscribe:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }

    const current = await getCurrentProfileId(supabase);
    if (!current) {
      return NextResponse.json({ success: false, error: 'Sign in to enable push alerts' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const validated = validatePushSubscriptionInput(body);
    if (!validated.ok) {
      return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
    }

    const dbClient = createAdminClient() || supabase;
    const now = new Date().toISOString();
    const userAgent = (req.headers.get('user-agent') || '').slice(0, 300);

    const { error: upsertErr } = await dbClient
      .from('push_subscriptions')
      .upsert(
        {
          profile_id: current.profileId,
          endpoint: validated.data.endpoint,
          p256dh: validated.data.p256dh,
          auth: validated.data.auth,
          platform: validated.data.platform,
          topics: validated.data.topics,
          user_agent: userAgent,
          updated_at: now,
        },
        { onConflict: 'endpoint' }
      );

    if (upsertErr) {
      logger.warn('Push subscription upsert failed', { error: upsertErr.message });
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 400 });
    }

    await dbClient
      .from('profiles')
      .update({ push_enabled: true })
      .eq('id', current.profileId);

    return NextResponse.json({
      success: true,
      configured: isWebPushConfigured(),
      topics: validated.data.topics,
    });
  } catch (error) {
    logger.error('Push subscribe error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not save push subscription') },
      { status: 500 }
    );
  }
}

/** PATCH /api/push/subscribe — update push topic preferences without re-subscribing */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }
    const current = await getCurrentProfileId(supabase);
    if (!current) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const topics = normalizePushTopics(body?.topics);
    const dbClient = createAdminClient() || supabase;

    await dbClient
      .from('push_subscriptions')
      .update({ topics, updated_at: new Date().toISOString() })
      .eq('profile_id', current.profileId);

    return NextResponse.json({ success: true, topics });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not update push topics') },
      { status: 500 }
    );
  }
}

/** DELETE /api/push/subscribe — remove one or all push subscriptions for current user */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }

    const current = await getCurrentProfileId(supabase);
    if (!current) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    const dbClient = createAdminClient() || supabase;

    let query = dbClient
      .from('push_subscriptions')
      .delete()
      .eq('profile_id', current.profileId);
    if (endpoint) {
      query = query.eq('endpoint', endpoint);
    }
    await query;

    const { count } = await dbClient
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', current.profileId);

    if (!count) {
      await dbClient
        .from('profiles')
        .update({ push_enabled: false })
        .eq('id', current.profileId);
    }

    return NextResponse.json({ success: true, remaining: count || 0 });
  } catch (error) {
    logger.error('Push unsubscribe error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not remove push subscription') },
      { status: 500 }
    );
  }
}
