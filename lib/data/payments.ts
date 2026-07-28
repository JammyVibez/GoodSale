import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import {
  parseOrderIdFromReference,
  amountsMatchNaira,
  isPayableOrderStatus,
  isAlreadyPaidStatus,
  isTerminalOrderStatus,
} from '@/lib/payments/helpers';

/**
 * Reconcile a verified Paystack payment against an order (service role).
 * Requires explicit orderId or GS_<orderId>_ reference — no email fallback.
 */
export async function reconcilePaystackPayment(opts: {
  orderId?: number | null;
  orderIds?: number[] | null;
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

  const ids = new Set<number>();
  if (opts.orderId && Number.isFinite(opts.orderId) && opts.orderId > 0) {
    ids.add(Number(opts.orderId));
  }
  if (opts.orderIds?.length) {
    opts.orderIds.forEach((id) => {
      if (Number.isFinite(id) && id > 0) ids.add(Number(id));
    });
  }
  const fromRef = parseOrderIdFromReference(opts.reference);
  if (fromRef) ids.add(fromRef);

  if (ids.size === 0) {
    await admin.from('payment_logs').insert({
      action: 'PAYSTACK_VERIFIED_NO_ORDER',
      details: JSON.stringify({
        reference: opts.reference,
        amountKobo: opts.amountKobo,
        channel: opts.channel,
      }),
      ip_address: '',
    });
    return { reconciled: false, reason: 'order_not_found' as const };
  }

  const orderIdList = [...ids];
  const results: { orderId: number; ok: boolean; error?: string; data?: unknown }[] = [];

  // Multi-order: verify sum when amount provided
  if (orderIdList.length > 1 && opts.amountKobo != null && opts.amountKobo > 0) {
    const { data: rows } = await admin.from('orders').select('id, total_amount, status').in('id', orderIdList);
    const sum = (rows || []).reduce((acc, r) => acc + Number(r.total_amount || 0), 0);
    if (!amountsMatchNaira(sum, opts.amountKobo)) {
      return { reconciled: false, reason: 'amount_mismatch' as const, orderIds: orderIdList };
    }
  }

  for (const orderId of orderIdList) {
    if (orderIdList.length === 1 && opts.amountKobo != null && opts.amountKobo > 0) {
      const { data: row } = await admin
        .from('orders')
        .select('total_amount, status')
        .eq('id', orderId)
        .maybeSingle();
      if (!row) {
        results.push({ orderId, ok: false, error: 'order_not_found' });
        continue;
      }
      if (isTerminalOrderStatus(String(row.status))) {
        results.push({ orderId, ok: false, error: 'terminal_status' });
        continue;
      }
      if (
        !isAlreadyPaidStatus(String(row.status)) &&
        !isPayableOrderStatus(String(row.status))
      ) {
        results.push({ orderId, ok: false, error: 'invalid_status' });
        continue;
      }
      if (
        !isAlreadyPaidStatus(String(row.status)) &&
        !amountsMatchNaira(Number(row.total_amount), opts.amountKobo)
      ) {
        results.push({ orderId, ok: false, error: 'amount_mismatch' });
        continue;
      }
    }

    const { data, error } = await admin.rpc('mark_order_paid_by_reference', {
      p_order_id: orderId,
      p_reference: orderIdList.length > 1 ? `${opts.reference}#${orderId}` : opts.reference,
      p_amount_kobo: orderIdList.length > 1 ? null : opts.amountKobo ?? null,
      p_channel: opts.channel || 'card',
    });

    if (error) {
      logger.warn('mark_order_paid_by_reference failed', {
        message: error.message,
        orderId,
      });
      results.push({ orderId, ok: false, error: error.message });
      continue;
    }
    results.push({ orderId, ok: true, data });
  }

  const anyOk = results.some((r) => r.ok);
  return {
    reconciled: anyOk,
    orderId: orderIdList[0],
    orderIds: orderIdList,
    results,
    reason: anyOk ? undefined : ('update_failed' as const),
  };
}

/** Initiate Paystack refund (server). Returns provider response. */
export async function initiatePaystackRefund(opts: {
  transactionReference: string;
  amountKobo?: number;
  reason?: string;
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return { success: false, demo: true, message: 'Paystack not configured — refund recorded as PENDING' };
  }

  const body: Record<string, unknown> = {
    transaction: opts.transactionReference,
    merchant_note: opts.reason || 'GoodSale escrow refund',
  };
  if (opts.amountKobo && opts.amountKobo > 0) body.amount = opts.amountKobo;

  const res = await fetch('https://api.paystack.co/refund', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok || !payload?.status) {
    return { success: false, error: payload?.message || 'Paystack refund failed', payload };
  }
  return { success: true, data: payload.data };
}
