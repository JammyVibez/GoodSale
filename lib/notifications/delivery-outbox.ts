/**
 * Optional email/SMS delivery notifications. In-app notifications are always
 * written by the database trigger; this worker only runs when the relevant
 * provider is configured. Unconfigured channels are left pending rather than
 * being marked sent.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

type OutboxRow = {
  id: number;
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
};

function smsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendSms(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { sent: false, error: 'SMS provider is not configured' };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 480) }).toString(),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      return { sent: false, error: String(payload?.message || `Twilio ${res.status}`) };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, error: String(error) };
  }
}

export async function processDeliveryOutbox(limit = 25): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  emailConfigured: boolean;
  smsConfigured: boolean;
}> {
  const result = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    emailConfigured: emailConfigured(),
    smsConfigured: smsConfigured(),
  };
  if (!result.emailConfigured && !result.smsConfigured) return result;

  const client = createAdminClient();
  if (!client) throw new Error('Server service role is not configured');

  const { data, error } = await client
    .from('delivery_notification_outbox')
    .select('id, channel, recipient, subject, body, attempts')
    .in('status', ['PENDING', 'FAILED'])
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  for (const row of (data || []) as OutboxRow[]) {
    if (row.channel === 'EMAIL' && !result.emailConfigured) {
      result.skipped += 1;
      continue;
    }
    if (row.channel === 'SMS' && !result.smsConfigured) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;
    let ok = false;
    let message = '';
    if (row.channel === 'EMAIL') {
      const sent = await sendTransactionalEmail({
        to: row.recipient,
        subject: row.subject,
        html: row.body,
        tags: ['delivery'],
      });
      ok = sent.sent;
      if (!sent.sent) message = 'Email provider rejected the message';
    } else {
      const sent = await sendSms(row.recipient, row.body);
      ok = sent.sent;
      message = sent.error || '';
    }

    const { error: updateError } = await client
      .from('delivery_notification_outbox')
      .update({
        status: ok ? 'SENT' : 'FAILED',
        attempts: Number(row.attempts || 0) + 1,
        last_error: ok ? '' : message.slice(0, 500),
        sent_at: ok ? new Date().toISOString() : null,
      })
      .eq('id', row.id);
    if (updateError) {
      logger.warn('Delivery outbox update failed', { error: updateError.message, id: row.id });
    }
    if (ok) result.sent += 1;
    else result.failed += 1;
  }
  return result;
}
