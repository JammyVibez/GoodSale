import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

type AddressInput = {
  label?: unknown;
  contactName?: unknown;
  phone?: unknown;
  state?: unknown;
  city?: unknown;
  area?: unknown;
  street?: unknown;
  landmark?: unknown;
  instructions?: unknown;
  lat?: unknown;
  lng?: unknown;
  isDefault?: unknown;
};

function clean(value: unknown, max = 160): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function rowToAddress(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    label: String(row.label ?? 'Home'),
    contactName: String(row.contact_name ?? ''),
    phone: String(row.phone ?? ''),
    state: String(row.state ?? ''),
    city: String(row.city ?? ''),
    area: String(row.area ?? ''),
    street: String(row.street ?? ''),
    landmark: String(row.landmark ?? ''),
    instructions: String(row.instructions ?? ''),
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    isDefault: Boolean(row.is_default),
  };
}

function payLoad(input: AddressInput, profileId: number) {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  return {
    profile_id: profileId,
    label: clean(input.label, 40) || 'Home',
    contact_name: clean(input.contactName, 100),
    phone: clean(input.phone, 30),
    state: clean(input.state, 80),
    city: clean(input.city, 80),
    area: clean(input.area, 100),
    street: clean(input.street, 240),
    landmark: clean(input.landmark, 160),
    instructions: clean(input.instructions, 500),
    lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
    lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
    is_default: Boolean(input.isDefault),
  };
}

async function requireProfile() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: 'Supabase not configured', status: 503 as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!profile?.id) return { error: 'Profile not found', status: 403 as const };
  return { supabase, profileId: Number(profile.id) };
}

export async function GET() {
  try {
    const auth = await requireProfile();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase
      .from('buyer_addresses')
      .select('*')
      .eq('profile_id', auth.profileId)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, addresses: (data || []).map(rowToAddress) });
  } catch (error) {
    logger.error('Saved addresses load failed', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Could not load saved addresses.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireProfile();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const body = (await req.json().catch(() => null)) as AddressInput | null;
    if (!body) return NextResponse.json({ success: false, error: 'Invalid address.' }, { status: 400 });
    const payload = payLoad(body, auth.profileId);
    if (!payload.contact_name || !payload.phone || !payload.state || !payload.city || !payload.street) {
      return NextResponse.json(
        { success: false, error: 'Contact name, phone, state, city and street are required.' },
        { status: 400 }
      );
    }
    if (payload.is_default) {
      await auth.supabase.from('buyer_addresses').update({ is_default: false }).eq('profile_id', auth.profileId);
    }
    const { data, error } = await auth.supabase.from('buyer_addresses').insert(payload).select('*').single();
    if (error) throw error;
    return NextResponse.json({ success: true, address: rowToAddress(data) }, { status: 201 });
  } catch (error) {
    logger.error('Saved address create failed', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Could not save this address.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireProfile();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const body = (await req.json().catch(() => null)) as (AddressInput & { id?: unknown }) | null;
    const id = Number(body?.id);
    if (!body || !id) return NextResponse.json({ success: false, error: 'Address id is required.' }, { status: 400 });
    const payload = payLoad(body, auth.profileId);
    if (!payload.contact_name || !payload.phone || !payload.state || !payload.city || !payload.street) {
      return NextResponse.json(
        { success: false, error: 'Contact name, phone, state, city and street are required.' },
        { status: 400 }
      );
    }
    if (payload.is_default) {
      await auth.supabase.from('buyer_addresses').update({ is_default: false }).eq('profile_id', auth.profileId);
    }
    const { data, error } = await auth.supabase
      .from('buyer_addresses')
      .update(payload)
      .eq('id', id)
      .eq('profile_id', auth.profileId)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, address: rowToAddress(data) });
  } catch (error) {
    logger.error('Saved address update failed', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Could not update this address.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireProfile();
    if ('error' in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!id) return NextResponse.json({ success: false, error: 'Address id is required.' }, { status: 400 });
    const { error } = await auth.supabase
      .from('buyer_addresses')
      .delete()
      .eq('id', id)
      .eq('profile_id', auth.profileId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Saved address delete failed', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Could not delete this address.' }, { status: 500 });
  }
}
