import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * Reconcile a verified Paystack payment against an order (service role).
 */
export async function reconcilePaystackPayment(opts: {
  orderId?: number | null;
  reference: string;
  amountKobo?: number | null;
  channel?: string | null;
  customerEmail?: string | null;
}) {
  const admin = createAdminClient();
  if (!admin) {
    logger.warn('Cannot reconcile payment — SUPABASE_SERVICE_ROLE_KEY missing');
    return { reconciled: false, reason: 'no_admin_client' as const };
  }

  let orderId = opts.orderId ?? null;

  // Resolve order from metadata-style reference GS_<orderId>_... or explicit orderId
  if (!orderId) {
    const match = opts.reference.match(/^GS_(\d+)_/i);
    if (match) orderId = Number(match[1]);
  }

  if (!orderId && opts.customerEmail) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', opts.customerEmail)
      .maybeSingle();
    if (profile?.id) {
      const { data: pending } = await admin
        .from('orders')
        .select('id')
        .eq('buyer_id', profile.id)
        .in('status', ['PENDING', 'PENDING_BANK_TRANSFER', 'PARTIAL_DEPOSIT_PAID'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pending?.id) orderId = Number(pending.id);
    }
  }

  if (!orderId) {
    // Still log the payment transaction for ops
    await admin.from('payment_logs').insert({
      action: 'PAYSTACK_VERIFIED_NO_ORDER',
      details: JSON.stringify(opts),
      ip_address: '',
    });
    return { reconciled: false, reason: 'order_not_found' as const };
  }

  const { data, error } = await admin.rpc('mark_order_paid_by_reference', {
    p_order_id: orderId,
    p_reference: opts.reference,
    p_amount_kobo: opts.amountKobo ?? null,
    p_channel: opts.channel || 'card',
  });

  if (error) {
    // Fallback without RPC if migration not applied yet
    logger.warn('mark_order_paid_by_reference failed, using direct update', {
      message: error.message,
    });
    const { error: updErr } = await admin
      .from('orders')
      .update({ status: 'PAID_ESCROW', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (updErr) {
      return { reconciled: false, reason: 'update_failed' as const, error: updErr.message };
    }
    return { reconciled: true, orderId, fallback: true };
  }

  return { reconciled: true, orderId, data };
}
