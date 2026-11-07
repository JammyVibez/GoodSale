import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { loadEntitlements } from '@/lib/entitlements/server';
import { staffCan, type StaffCapability, type StaffRole } from '@/lib/business/staff';

const CAPABILITIES: StaffCapability[] = ['analytics', 'inventory', 'team'];

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
    .select('id, full_name')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!profile?.id) return { error: 'Profile not found', status: 404 as const };
  return { admin, profileId: Number(profile.id), profileName: String(profile.full_name || 'Business') };
}

/**
 * GET — read-only business snapshot for the owner or one of their active staff.
 *
 * Staff work from their own account, so the seller dashboard (which filters by
 * the signed-in seller) can never show them the store they support. This route
 * serves that overview instead: stock, low-stock alerts, recent orders and
 * membership state, scoped to the owner the caller actually works for.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await context();
    if ('error' in ctx) return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });

    const param = Number(new URL(req.url).searchParams.get('ownerId'));
    const ownerId = Number.isInteger(param) && param > 0 ? param : ctx.profileId;

    let role: string | null = null;
    if (ownerId !== ctx.profileId) {
      const { data: staffRow } = await ctx.admin
        .from('business_staff')
        .select('role,status')
        .eq('owner_id', ownerId)
        .eq('member_id', ctx.profileId)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (!staffRow) {
        return NextResponse.json(
          { success: false, error: 'You are not active staff for this business.' },
          { status: 403 }
        );
      }
      role = String(staffRow.role);
    }

    const ownerEntitlements = await loadEntitlements(ctx.admin, ownerId);
    if (!ownerEntitlements.businessTools && ownerId !== ctx.profileId) {
      return NextResponse.json(
        { success: false, error: 'That business no longer has an active Business membership.' },
        { status: 403 }
      );
    }

    const [{ data: ownerProfile }, products, openOrders, recentOrders, completedOrders] = await Promise.all([
      ctx.admin.from('profiles').select('full_name,email,city,state').eq('id', ownerId).maybeSingle(),
      ctx.admin
        .from('products')
        .select('id,title,price,quantity,stock_status,images,moderation_status,created_at')
        .eq('seller_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(60),
      ctx.admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', ownerId)
        .in('status', ['PENDING', 'PAID_ESCROW', 'SHIPPED', 'OUT_FOR_DELIVERY']),
      ctx.admin
        .from('orders')
        .select('id,status,total_amount,created_at')
        .eq('seller_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(8),
      ctx.admin.from('orders').select('total_amount').eq('seller_id', ownerId).eq('status', 'DELIVERED_SUCCESS'),
    ]);

    const listings = (products.data || []).map((row) => ({
      id: Number(row.id),
      title: String(row.title || 'Listing'),
      price: Number(row.price || 0),
      quantity: Number(row.quantity || 0),
      stockStatus: String(row.stock_status || 'IN_STOCK'),
      image: Array.isArray(row.images) && row.images.length ? String(row.images[0]) : '',
      moderationStatus: String(row.moderation_status || 'APPROVED'),
    }));

    const lowStock = listings
      .filter((item) => item.quantity > 0 && item.quantity <= 3)
      .sort((a, b) => a.quantity - b.quantity);
    const pendingModeration = listings.filter((item) => item.moderationStatus === 'PENDING').length;
    const revenue = (completedOrders.data || []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0);

    return NextResponse.json({
      success: true,
      ownerId,
      businessName: String(ownerProfile?.full_name || ctx.profileName),
      location: [ownerProfile?.city, ownerProfile?.state].filter(Boolean).join(', '),
      role,
      capabilities: role
        ? CAPABILITIES.filter((capability) => staffCan(role as StaffRole, 'ACTIVE', capability))
        : CAPABILITIES,
      plan: ownerEntitlements.businessPlan,
      expiresAt: ownerEntitlements.expiresAt,
      stats: {
        listings: listings.length,
        lowStock: lowStock.length,
        pendingModeration,
        openOrders: openOrders.count ?? 0,
        revenue,
      },
      lowStock: lowStock.slice(0, 5),
      listings: listings.slice(0, 8),
      recentOrders: (recentOrders.data || []).map((row) => ({
        id: Number(row.id),
        status: String(row.status),
        amount: Number(row.total_amount || 0),
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    logger.error('Staff overview failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load the business snapshot') },
      { status: 500 }
    );
  }
}
