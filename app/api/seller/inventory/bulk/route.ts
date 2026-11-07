import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { profileIdForAuth } from '@/lib/wallet/server';
import { loadEntitlements } from '@/lib/entitlements/server';
import { staffCan, type StaffRole } from '@/lib/business/staff';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

type BulkRow = {
  productId?: unknown;
  price?: unknown;
  quantity?: unknown;
  stockStatus?: unknown;
};

const STOCK = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'SOLD', 'UNAVAILABLE'];

/** POST /api/seller/inventory/bulk — Business member CSV/bulk stock and price updates. */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`seller:inventory:bulk:${ip}`, 10, 60_000);
    if (!limited.allowed) return NextResponse.json({ success: false, error: 'Too many bulk updates' }, { status: 429 });

    const supabase = await createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 503 });
    const profileId = await profileIdForAuth(admin, user.id);
    if (!profileId) return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });

    // The owner needs Business membership; an active Inventory/Manager staff
    // member can act for that owner's listings without their own membership.
    const entitlements = await loadEntitlements(admin, profileId);
    let sellerScopeId = profileId;
    let allowed = entitlements.businessTools;
    if (!allowed) {
      const { data: staffRow } = await admin
        .from('business_staff')
        .select('owner_id,role,status')
        .eq('member_id', profileId)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (staffRow && staffCan(String(staffRow.role) as StaffRole, 'ACTIVE', 'inventory')) {
        const ownerId = Number(staffRow.owner_id);
        const ownerEntitlements = await loadEntitlements(admin, ownerId);
        if (ownerEntitlements.businessTools) {
          allowed = true;
          sellerScopeId = ownerId;
        }
      }
    }
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Bulk inventory is a Business membership tool. Ask the Business owner to add you as inventory staff, or subscribe in the Revenue Hub.',
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? (body.rows as BulkRow[]) : [];
    if (!rows.length || rows.length > 250) {
      return NextResponse.json({ success: false, error: 'Send between 1 and 250 inventory rows' }, { status: 400 });
    }

    const normalized = rows.map((row, index) => {
      const productId = Number(row.productId);
      const price = row.price == null || row.price === '' ? null : Number(row.price);
      const quantity = row.quantity == null || row.quantity === '' ? null : Number(row.quantity);
      const stockStatus = row.stockStatus == null ? null : String(row.stockStatus).toUpperCase();
      if (!Number.isInteger(productId) || productId <= 0) throw new Error(`Row ${index + 1}: invalid product id`);
      if (price != null && (!Number.isFinite(price) || price < 1)) throw new Error(`Row ${index + 1}: invalid price`);
      if (quantity != null && (!Number.isInteger(quantity) || quantity < 0)) throw new Error(`Row ${index + 1}: invalid quantity`);
      if (stockStatus && !STOCK.includes(stockStatus)) throw new Error(`Row ${index + 1}: invalid stock status`);
      if (price == null && quantity == null && !stockStatus) throw new Error(`Row ${index + 1}: nothing to update`);
      return { productId, price, quantity, stockStatus };
    });

    const ids = [...new Set(normalized.map((row) => row.productId))];
    const { data: owned, error: ownedError } = await admin
      .from('products')
      .select('id,seller_id')
      .in('id', ids);
    if (ownedError) throw new Error(ownedError.message);
    const ownedIds = new Set(
      (owned || []).filter((row) => Number(row.seller_id) === sellerScopeId).map((row) => Number(row.id))
    );
    if (ownedIds.size !== ids.length) {
      return NextResponse.json({ success: false, error: 'One or more listings do not belong to you' }, { status: 403 });
    }

    let updated = 0;
    for (const row of normalized) {
      const patch: Record<string, unknown> = {};
      if (row.price != null) patch.price = Math.round(row.price);
      if (row.quantity != null) patch.quantity = row.quantity;
      if (row.stockStatus) patch.stock_status = row.stockStatus;
      if (row.quantity === 0 && !row.stockStatus) patch.stock_status = 'OUT_OF_STOCK';
      const { error } = await admin
        .from('products')
        .update(patch)
        .eq('id', row.productId)
        .eq('seller_id', sellerScopeId);
      if (error) throw new Error(`Product #${row.productId}: ${error.message}`);
      updated += 1;
    }

    await admin.from('audit_logs').insert({
      user_id: profileId,
      action: 'BULK_UPDATE_INVENTORY',
      entity_type: 'PRODUCT',
      entity_id: ids[0],
      details:
        sellerScopeId === profileId
          ? `${updated} listings updated via Business bulk inventory`
          : `${updated} listings updated as staff for business #${sellerScopeId}`,

    });

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    logger.warn('Bulk inventory update failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Bulk inventory update failed') },
      { status: 400 }
    );
  }
}
