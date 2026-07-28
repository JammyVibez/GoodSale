import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';
import {
  createTransferRecipient,
  initiateTransfer,
  resolveBankCode,
} from '@/lib/payments/transfer';
import { sendTransactionalEmail, payoutApprovedEmailHtml } from '@/lib/email';

/** POST { withdrawalId, approve: boolean, notes?, bankCode? } — admin */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`wallet:withdraw-admin:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: 'Too many attempts' }, { status: 429 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const withdrawalId = Number(body.withdrawalId);
    const approve = Boolean(body.approve);
    const notes = String(body.notes || '');
    const bankCodeOverride = body.bankCode ? String(body.bankCode) : undefined;

    if (!withdrawalId) {
      return NextResponse.json({ success: false, error: 'withdrawalId required' }, { status: 400 });
    }

    let transferMeta: Record<string, unknown> | null = null;

    if (approve) {
      const admin = createAdminClient();
      if (admin) {
        const { data: withdrawal } = await admin
          .from('withdrawal_requests')
          .select('*')
          .eq('id', withdrawalId)
          .maybeSingle();

        if (withdrawal && withdrawal.status === 'PENDING') {
          const bankCode = resolveBankCode(
            String(withdrawal.bank_name || ''),
            bankCodeOverride || withdrawal.bank_code
          );

          if (!bankCode && process.env.PAYSTACK_SECRET_KEY) {
            return NextResponse.json(
              {
                success: false,
                error:
                  'Could not resolve Paystack bank code. Pass bankCode (e.g. 058 for GTBank) or set PAYSTACK_DEFAULT_BANK_CODE.',
              },
              { status: 400 }
            );
          }

          const recipient = await createTransferRecipient({
            name: String(withdrawal.account_name || 'GoodSale Seller'),
            accountNumber: String(withdrawal.account_number || ''),
            bankCode: bankCode || '058',
          });

          if (!recipient.ok) {
            return NextResponse.json(
              { success: false, error: recipient.error || 'Failed to create transfer recipient' },
              { status: 400 }
            );
          }

          const transfer = await initiateTransfer({
            amountNaira: Number(withdrawal.amount),
            recipientCode: recipient.recipientCode!,
            reason: `GoodSale payout #${withdrawalId}`,
            reference: `GS_WD_${withdrawalId}_${Date.now()}`,
          });

          if (!transfer.ok) {
            return NextResponse.json(
              { success: false, error: transfer.error || 'Paystack transfer failed' },
              { status: 400 }
            );
          }

          transferMeta = {
            recipientCode: recipient.recipientCode,
            transferReference: transfer.reference,
            transferCode: transfer.transferCode,
            demo: 'demo' in transfer ? transfer.demo : false,
          };

          await admin
            .from('withdrawal_requests')
            .update({
              paystack_transfer_code: transfer.transferCode || null,
              paystack_reference: transfer.reference || null,
              admin_notes: notes || null,
            })
            .eq('id', withdrawalId);

          const { data: profile } = await admin
            .from('profiles')
            .select('email')
            .eq('id', withdrawal.user_id)
            .maybeSingle();
          if (profile?.email) {
            await sendTransactionalEmail({
              to: profile.email,
              subject: 'GoodSale payout approved',
              html: payoutApprovedEmailHtml(Number(withdrawal.amount), String(withdrawal.bank_name)),
              tags: ['payout'],
            });
          }
        }
      }
    }

    const { data, error } = await supabase.rpc('admin_process_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_approve: approve,
      p_notes: notes,
    });

    if (error) {
      logger.warn('admin_process_withdrawal failed', { error: error.message });
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data, transfer: transferMeta });
  } catch (error) {
    logger.error('Admin withdrawal error', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Could not process withdrawal') },
      { status: 500 }
    );
  }
}
