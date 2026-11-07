import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import { initiatePaystackRefund } from '@/lib/data/payments';
import { verifyTransfer } from '@/lib/payments/transfer';
import { getWalletProviderConfig, loadWalletSettings } from '@/lib/wallet/server';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: 'Supabase not configured', status: 503 as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const admin = createAdminClient();
  if (!admin) return { error: 'Finance service is not configured', status: 503 as const };
  const { data: profile } = await admin
    .from('profiles')
    .select('id,role')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!profile || !['ADMIN', 'SUPER_ADMIN'].includes(String(profile.role))) {
    return { error: 'Admin only', status: 403 as const };
  }
  return { supabase, admin, profile };
}

/** GET /api/admin/finance — server-authoritative finance overview. */
export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }
    const { supabase, admin } = ctx;
    const search = String(req.nextUrl.searchParams.get('q') || '').trim().slice(0, 64);
    const safeSearch = search.replace(/[^a-zA-Z0-9_.@-]/g, '');

    const [summary, settings, wallets, withdrawals, refunds, ledger, audit, funding] = await Promise.all([
      supabase.rpc('admin_finance_summary'),
      loadWalletSettings(admin),
      admin
        .from('wallets')
        .select('id,user_id,balance,bank_name,bank_account_name,bank_account_number,updated_at')
        .order('balance', { ascending: false })
        .limit(100),
      admin.from('withdrawal_requests').select('*').order('created_at', { ascending: false }).limit(100),
      admin.from('refunds').select('*').order('created_at', { ascending: false }).limit(100),
      (() => {
        let query = admin
          .from('wallet_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        if (safeSearch) {
          query = query.or(
            `reference.ilike.%${safeSearch}%,provider_reference.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`
          );
        }
        return query;
      })(),
      admin
        .from('audit_logs')
        .select('*')
        .in('entity_type', ['WALLET', 'WITHDRAWAL', 'REFUND', 'WALLET_SETTINGS'])
        .order('created_at', { ascending: false })
        .limit(100),
      admin.from('wallet_funding_intents').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    if (summary.error) logger.warn('admin_finance_summary failed', { error: summary.error.message });

    const userIds = new Set<number>();
    (wallets.data || []).forEach((row) => userIds.add(Number(row.user_id)));
    (withdrawals.data || []).forEach((row) => userIds.add(Number(row.user_id)));
    (refunds.data || []).forEach((row) => {
      if (row.transaction_id) userIds.add(Number(row.user_id || 0));
    });
    const { data: profiles } = userIds.size
      ? await admin
          .from('profiles')
          .select('id,full_name,username,email,role')
          .in('id', [...userIds].filter((id) => id > 0))
      : { data: [] as Record<string, unknown>[] };

    const profileById = new Map(
      (profiles || []).map((profile) => [Number(profile.id), profile])
    );

    return NextResponse.json({
      success: true,
      provider: getWalletProviderConfig(),
      settings,
      summary: summary.data || {},
      wallets: (wallets.data || []).map((wallet) => ({
        ...wallet,
        profile: profileById.get(Number(wallet.user_id)) || null,
      })),
      withdrawals: (withdrawals.data || []).map((withdrawal) => ({
        ...withdrawal,
        profile: profileById.get(Number(withdrawal.user_id)) || null,
      })),
      refunds: refunds.data || [],
      ledger: ledger.data || [],
      audit: audit.data || [],
      funding: funding.data || [],
      ledgerError: ledger.error?.message || null,
      auditError: audit.error?.message || null,
    });
  } catch (error) {
    logger.error('Admin finance GET error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not load finance data') },
      { status: 500 }
    );
  }
}

/** POST /api/admin/finance — audited admin actions only. */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`admin:finance:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many attempts' }, { status: 429 });
    }

    const ctx = await requireAdmin();
    if ('error' in ctx) {
      return NextResponse.json({ success: false, error: ctx.error }, { status: ctx.status });
    }
    const { supabase, admin } = ctx;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();

    if (action === 'ADJUSTMENT') {
      const userId = Number(body.userId);
      const amount = Number(body.amount);
      const reason = String(body.reason || '').trim();
      if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(amount) || amount === 0) {
        return NextResponse.json({ success: false, error: 'Valid user and non-zero amount required' }, { status: 400 });
      }
      if (reason.length < 10) {
        return NextResponse.json({ success: false, error: 'An adjustment reason of at least 10 characters is required' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('admin_adjust_wallet', {
        p_user_id: userId,
        p_amount: amount,
        p_reason: reason,
      });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'WALLET_SETTINGS') {
      const numeric = (key: string) => Number(body[key]);
      const values = {
        fundingMin: numeric('fundingMin'),
        fundingMax: numeric('fundingMax'),
        withdrawalMin: numeric('withdrawalMin'),
        withdrawalMax: numeric('withdrawalMax'),
        withdrawalFee: numeric('withdrawalFee'),
        dailyWithdrawalLimit: numeric('dailyWithdrawalLimit'),
      };
      if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
        return NextResponse.json({ success: false, error: 'Enter valid non-negative limits' }, { status: 400 });
      }
      const { error } = await supabase.rpc('admin_update_wallet_settings', {
        p_funding_min: values.fundingMin,
        p_funding_max: values.fundingMax,
        p_withdrawal_min: values.withdrawalMin,
        p_withdrawal_max: values.withdrawalMax,
        p_withdrawal_fee: values.withdrawalFee,
        p_daily_withdrawal_limit: values.dailyWithdrawalLimit,
      });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (action === 'PAYOUT_VERIFY') {
      const withdrawalId = Number(body.withdrawalId);
      if (!Number.isInteger(withdrawalId) || withdrawalId <= 0) {
        return NextResponse.json({ success: false, error: 'Valid withdrawal required' }, { status: 400 });
      }
      const { data: withdrawal } = await admin
        .from('withdrawal_requests')
        .select('id,status,paystack_reference,paystack_transfer_code')
        .eq('id', withdrawalId)
        .maybeSingle();
      if (!withdrawal) return NextResponse.json({ success: false, error: 'Withdrawal not found' }, { status: 404 });
      if (withdrawal.status !== 'PROCESSING') {
        return NextResponse.json({ success: false, error: 'Only processing payouts can be reconciled' }, { status: 409 });
      }
      const reference = withdrawal.paystack_reference || withdrawal.paystack_transfer_code;
      if (!reference) {
        return NextResponse.json({ success: false, error: 'This payout has no Paystack reference yet' }, { status: 400 });
      }
      const verified = await verifyTransfer(reference);
      if (!verified.ok) {
        return NextResponse.json({ success: false, error: verified.error || 'Could not verify transfer' }, { status: 400 });
      }
      if (verified.status === 'success') {
        const { error } = await supabase.rpc('admin_payout_complete', {
          p_withdrawal_id: withdrawalId,
          p_provider_reference: verified.reference,
        });
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        return NextResponse.json({ success: true, status: 'SUCCESS', providerConfirmed: true });
      }
      if (['failed', 'reversed', 'abandoned'].includes(verified.status)) {
        const { error } = await supabase.rpc('admin_payout_fail', {
          p_withdrawal_id: withdrawalId,
          p_reason: `Paystack transfer status: ${verified.status}`,
        });
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        return NextResponse.json({ success: true, status: 'FAILED', providerConfirmed: true });
      }
      return NextResponse.json({
        success: true,
        status: 'PROCESSING',
        providerConfirmed: false,
        providerStatus: verified.status,
      });
    }

    if (action === 'PAYOUT_FAIL') {
      const withdrawalId = Number(body.withdrawalId);
      const reason = String(body.reason || '').trim();
      if (!Number.isInteger(withdrawalId) || withdrawalId <= 0 || !reason) {
        return NextResponse.json({ success: false, error: 'Withdrawal and reason required' }, { status: 400 });
      }
      const { error } = await supabase.rpc('admin_payout_fail', {
        p_withdrawal_id: withdrawalId,
        p_reason: reason,
      });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (action === 'REFUND_TO_WALLET') {
      const refundId = Number(body.refundId);
      const reason = String(body.reason || '').trim();
      if (!Number.isInteger(refundId) || refundId <= 0 || reason.length < 5) {
        return NextResponse.json({ success: false, error: 'Refund and reason required' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('admin_refund_to_wallet', {
        p_refund_id: refundId,
        p_reason: reason,
      });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, data });
    }

    if (action === 'REFUND_PROVIDER') {
      if (!getWalletProviderConfig().payoutsEnabled) {
        return NextResponse.json(
          { success: false, code: 'PROVIDER_REFUND_UNAVAILABLE', error: 'Paystack is not configured for refunds.' },
          { status: 503 }
        );
      }
      const refundId = Number(body.refundId);
      const reason = String(body.reason || '').trim();
      const { data: refund } = await admin
        .from('refunds')
        .select('*')
        .eq('id', refundId)
        .maybeSingle();
      if (!refund) return NextResponse.json({ success: false, error: 'Refund not found' }, { status: 404 });
      if (refund.status === 'COMPLETED') {
        return NextResponse.json({ success: true, status: 'COMPLETED', alreadyCompleted: true });
      }
      const provider = await initiatePaystackRefund({
        transactionReference: String(refund.transaction_id || ''),
        amountKobo: Math.round(Number(refund.amount || 0) * 100),
        reason: reason || refund.reason || 'GoodSale refund',
      });
      if (!provider.success) {
        return NextResponse.json({ success: false, error: provider.message || 'Paystack refund failed' }, { status: 400 });
      }
      const providerReference = String(
        (provider.data as { reference?: string; transaction?: { reference?: string } } | undefined)?.reference ||
          (provider.data as { transaction?: { reference?: string } } | undefined)?.transaction?.reference ||
          ''
      );
      await admin
        .from('refunds')
        .update({ status: 'PROCESSING', provider_reference: providerReference || null, admin_notes: reason })
        .eq('id', refundId);
      await admin.from('audit_logs').insert({
        user_id: ctx.profile.id,
        action: 'REFUND_SENT_TO_PROVIDER',
        entity_type: 'REFUND',
        entity_id: refundId,
        details: `Paystack refund initiated. Provider reference: ${providerReference || 'pending'}`,
      });
      return NextResponse.json({
        success: true,
        status: 'PROCESSING',
        providerConfirmed: false,
        providerReference,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown finance action' }, { status: 400 });
  } catch (error) {
    logger.error('Admin finance POST error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not complete finance action') },
      { status: 500 }
    );
  }
}
