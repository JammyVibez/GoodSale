/**
 * Optional transactional email via Resend.
 * No-ops when RESEND_API_KEY is unset (logs instead).
 */

import { logger } from '@/lib/logger';

export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  html: string;
  tags?: string[];
}): Promise<{ sent: boolean; id?: string; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'GoodSale <noreply@goodsale.app>';

  if (!key) {
    logger.info('Email skipped (RESEND_API_KEY not set)', {
      to: opts.to,
      subject: opts.subject,
    });
    return { sent: false, skipped: true };
  }

  if (!opts.to || !opts.to.includes('@')) {
    return { sent: false, skipped: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        tags: (opts.tags || []).map((name) => ({ name, value: 'goodsale' })),
      }),
    });
    const payload = await res.json();
    if (!res.ok) {
      logger.warn('Resend email failed', { error: payload?.message });
      return { sent: false };
    }
    return { sent: true, id: payload?.id };
  } catch (err) {
    logger.warn('Resend email error', { error: String(err) });
    return { sent: false };
  }
}

export function orderPaidEmailHtml(orderNumber: string, amount: number, pin: string) {
  return `<p>Your GoodSale order <strong>${orderNumber}</strong> is paid.</p>
<p>₦${amount.toLocaleString()} is locked in escrow.</p>
<p>Your delivery PIN: <strong>${pin}</strong> — share only after inspecting the item.</p>`;
}

export function disputeOpenedEmailHtml(orderNumber: string) {
  return `<p>A dispute was opened on order <strong>${orderNumber}</strong>.</p>
<p>Escrow payouts are frozen until an admin resolves the case.</p>`;
}

export function payoutApprovedEmailHtml(amount: number, bank: string) {
  return `<p>Your withdrawal of <strong>₦${amount.toLocaleString()}</strong> to ${bank} was approved and submitted to Paystack Transfer.</p>`;
}
