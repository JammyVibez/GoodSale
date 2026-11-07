import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { loadEntitlements } from '@/lib/entitlements/server';

const CATEGORIES = ['PAYMENT', 'DELIVERY', 'ACCOUNT', 'REFUND', 'SELLER_DISPUTE', 'OTHER'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH'];

function makeReference() {
  return `GS-TKT-${Math.floor(100000 + Math.random() * 900000)}`;
}

/** GET — the signed-in user's tickets with their message threads. */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 503 });

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle();
    if (!profile?.id) return NextResponse.json({ success: true, tickets: [] });

    const { data, error } = await admin
      .from('support_tickets')
      .select('*, support_ticket_messages(*)')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) {
      logger.warn('support tickets unavailable', { error: error.message });
      return NextResponse.json({ success: false, error: 'Support tables not installed' }, { status: 503 });
    }
    return NextResponse.json({ success: true, tickets: data ?? [] });
  } catch (error) {
    logger.error('Support ticket list error', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not load tickets') }, { status: 500 });
  }
}

/** POST — open a support ticket and its first message. */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`support:ticket:${ip}`, 8, 60_000);
    if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const supabase = await createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const category = String(body.category || '');
    const subject = String(body.subject || '').trim();
    const description = String(body.description || '').trim();
    const orderId = body.orderId ? Number(body.orderId) : null;
    const requestedPriority = PRIORITIES.includes(String(body.priority)) ? String(body.priority) : 'NORMAL';

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ success: false, error: 'Choose a valid category' }, { status: 400 });
    }
    if (subject.length < 4 || description.length < 10) {
      return NextResponse.json({ success: false, error: 'Subject and a 10+ character description are required' }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 503 });

    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('auth_id', user.id)
      .maybeSingle();
    if (!profile?.id) return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });

    // Business Premium and Enterprise include priority operations support, so
    // their tickets are raised at high priority regardless of what the client
    // asked for. Everyone else keeps the priority they chose.
    const entitlements = await loadEntitlements(admin, Number(profile.id));
    const priority =
      entitlements.businessPlan === 'PREMIUM' || entitlements.businessPlan === 'ENTERPRISE'
        ? 'HIGH'
        : requestedPriority;

    if (orderId) {
      const { data: order } = await admin
        .from('orders')
        .select('id, buyer_id, seller_id')
        .eq('id', orderId)
        .maybeSingle();
      if (!order || (order.buyer_id !== profile.id && order.seller_id !== profile.id)) {
        return NextResponse.json({ success: false, error: 'Order does not belong to your account' }, { status: 403 });
      }
    }

    const reference = makeReference();
    const { data: ticket, error } = await admin
      .from('support_tickets')
      .insert({
        reference,
        user_id: profile.id,
        user_name: profile.full_name || '',
        category,
        subject,
        description,
        order_id: orderId,
        status: 'OPEN',
        priority,
      })
      .select('id, reference')
      .single();

    if (error || !ticket) {
      logger.warn('support ticket insert failed', { error: error?.message });
      return NextResponse.json({ success: false, error: 'Support tables not installed' }, { status: 503 });
    }

    await admin.from('support_ticket_messages').insert({
      ticket_id: ticket.id,
      author_id: profile.id,
      author_name: profile.full_name || '',
      author_role: 'BUYER',
      body: description,
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    logger.error('Support ticket create error', { error: String(error) });
    return NextResponse.json({ success: false, error: publicErrorMessage(error, 'Could not create ticket') }, { status: 500 });
  }
}
