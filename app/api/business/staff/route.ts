import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { loadEntitlements } from '@/lib/entitlements/server';
import { isStaffRole, STAFF_ROLES, type StaffRole } from '@/lib/business/staff';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

async function context() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: 'Supabase not configured', status: 503 as const };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const admin = createAdminClient();
  if (!admin) return { error: 'Server not configured', status: 503 as const };
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!profile?.id) return { error: 'Profile not found', status: 404 as const };
  return { admin, profileId: Number(profile.id) };
}

/** GET — the caller's own business staff list plus the businesses they work for. */
export async function GET() {
  try {
    const ctx = await context();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const entitlements = await loadEntitlements(ctx.admin, ctx.profileId);
    const [{ data: ownedRows }, { data: memberRows }] = await Promise.all([
      ctx.admin
        .from('business_staff')
        .select('id,owner_id,member_id,role,status,created_at,profiles!business_staff_member_id_fkey(full_name,email)')
        .eq('owner_id', ctx.profileId)
        .order('created_at', { ascending: true }),
      ctx.admin
        .from('business_staff')
        .select('id,owner_id,member_id,role,status,profiles!business_staff_owner_id_fkey(full_name,email)')
        .eq('member_id', ctx.profileId)
        .order('created_at', { ascending: true }),
    ]);

    const staff = (ownedRows || []).map((row) => {
      const member = (row as unknown as { profiles?: { full_name?: string; email?: string } }).profiles;
      return {
        id: Number(row.id),
        memberId: Number(row.member_id),
        name: member?.full_name || 'Team member',
        email: member?.email || '',
        role: String(row.role),
        status: String(row.status),
        createdAt: row.created_at,
      };
    });
    const memberships = (memberRows || []).map((row) => {
      const owner = (row as unknown as { profiles?: { full_name?: string; email?: string } }).profiles;
      return {
        id: Number(row.id),
        ownerId: Number(row.owner_id),
        businessName: owner?.full_name || 'Business owner',
        role: String(row.role),
        status: String(row.status),
      };
    });

    return NextResponse.json({
      success: true,
      canManage: entitlements.businessTools,
      businessPlan: entitlements.businessPlan,
      staff,
      memberships,
    });
  } catch (error) {
    logger.error('Staff list failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load staff access') },
      { status: 500 }
    );
  }
}

/** POST — the Business owner adds an existing account to their staff list. */
export async function POST(req: NextRequest) {
  try {
    const limited = rateLimit(`business:staff:${clientIpFromRequest(req)}`, 20, 60_000);
    if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const ctx = await context();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const entitlements = await loadEntitlements(ctx.admin, ctx.profileId);
    if (!entitlements.businessTools) {
      return NextResponse.json(
        { success: false, error: 'Staff access is a Business membership tool. Subscribe or renew in the Revenue Hub.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || 'ANALYST').toUpperCase();
    if (!email || !email.includes('@')) {
      return NextResponse.json({ success: false, error: 'Enter the email of an existing GoodSale account' }, { status: 400 });
    }
    if (!isStaffRole(role)) {
      return NextResponse.json({ success: false, error: `Role must be one of ${STAFF_ROLES.join(', ')}` }, { status: 400 });
    }

    const { data: member } = await ctx.admin
      .from('profiles')
      .select('id, full_name, email')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (!member?.id) {
      return NextResponse.json(
        { success: false, error: 'No GoodSale account uses that email. Ask them to sign up first.' },
        { status: 404 }
      );
    }
    if (Number(member.id) === ctx.profileId) {
      return NextResponse.json({ success: false, error: 'You cannot add yourself as staff' }, { status: 400 });
    }

    const { data: existing } = await ctx.admin
      .from('business_staff')
      .select('id,status')
      .eq('owner_id', ctx.profileId)
      .eq('member_id', member.id)
      .maybeSingle();

    if (existing) {
      const { error } = await ctx.admin
        .from('business_staff')
        .update({ role, status: 'ACTIVE' })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await ctx.admin.from('business_staff').insert({
        owner_id: ctx.profileId,
        member_id: member.id,
        role,
        status: 'ACTIVE',
        invited_by: ctx.profileId,
      });
      if (error) throw new Error(error.message);
    }

    await ctx.admin.from('notifications').insert({
      user_id: member.id,
      title: 'Business staff access',
      message: `You were added as ${role.toLowerCase()} staff. Sign in and open Settings to see the business you support.`,
      type: 'ACCOUNT',
      is_read: false,
    });
    await ctx.admin.from('audit_logs').insert({
      user_id: ctx.profileId,
      action: 'BUSINESS_STAFF_ADD',
      entity_type: 'PROFILE',
      entity_id: Number(member.id),
      details: `Added ${email} as ${role}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Staff add failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not add staff') },
      { status: 400 }
    );
  }
}

/** PATCH — owner changes a staff role or suspends/restores access. */
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await context();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Staff id is required' }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (body.role != null) {
      const role = String(body.role).toUpperCase();
      if (!isStaffRole(role)) return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
      patch.role = role as StaffRole;
    }
    if (body.status != null) {
      const status = String(body.status).toUpperCase();
      if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
        return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
      }
      patch.status = status;
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    const { data: updated, error } = await ctx.admin
      .from('business_staff')
      .update(patch)
      .eq('id', id)
      .eq('owner_id', ctx.profileId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return NextResponse.json({ success: false, error: 'Staff member not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Staff update failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not update staff') },
      { status: 400 }
    );
  }
}

/** DELETE — owner removes a staff member's access. */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await context();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Staff id is required' }, { status: 400 });
    }

    const { data: removed, error } = await ctx.admin
      .from('business_staff')
      .delete()
      .eq('id', id)
      .eq('owner_id', ctx.profileId)
      .select('id,member_id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!removed) return NextResponse.json({ success: false, error: 'Staff member not found' }, { status: 404 });

    await ctx.admin.from('audit_logs').insert({
      user_id: ctx.profileId,
      action: 'BUSINESS_STAFF_REMOVE',
      entity_type: 'PROFILE',
      entity_id: Number(removed.member_id),
      details: 'Removed business staff access',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Staff remove failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not remove staff') },
      { status: 400 }
    );
  }
}
