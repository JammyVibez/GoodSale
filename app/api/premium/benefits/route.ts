import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';

/** GET /api/premium/benefits — public, admin-owned membership benefit copy. */
export async function GET() {
  try {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ success: true, benefits: [] });
    const { data, error } = await admin
      .from('membership_plan_benefits')
      .select('id,plan_code,label,description,included,sort_order,active')
      .eq('active', true)
      .order('plan_code')
      .order('sort_order');
    if (error) {
      logger.warn('Membership benefits lookup failed', { error: error.message });
      return NextResponse.json({ success: true, benefits: [] });
    }
    return NextResponse.json({
      success: true,
      benefits: (data || []).map((row) => ({
        id: Number(row.id),
        planCode: row.plan_code,
        label: row.label,
        description: row.description,
        included: Boolean(row.included),
        sortOrder: Number(row.sort_order),
        active: Boolean(row.active),
      })),
    });
  } catch (error) {
    logger.error('Membership benefits error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load membership benefits') },
      { status: 500 }
    );
  }
}
