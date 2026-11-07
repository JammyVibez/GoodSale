/**
 * Paystack Transfer API — seller payouts after admin approval.
 * Docs: https://paystack.com/docs/transfers/single-transfers
 */

const PAYSTACK_BASE = 'https://api.paystack.co';

async function paystackFetch(path: string, init?: RequestInit) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { ok: false as const, error: 'PAYSTACK_SECRET_KEY missing' };

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload?.status === false) {
    return {
      ok: false as const,
      error: payload?.message || `Paystack ${path} failed`,
      payload,
    };
  }
  return { ok: true as const, data: payload.data, payload };
}

/** Resolve the account name held by the bank before creating a recipient. */
export async function resolveAccountName(opts: {
  accountNumber: string;
  bankCode: string;
}) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return { ok: false as const, error: 'PAYSTACK_SECRET_KEY missing — cannot verify the bank account.' };
  }

  const result = await paystackFetch(
    `/bank/resolve?account_number=${encodeURIComponent(opts.accountNumber)}&bank_code=${encodeURIComponent(opts.bankCode)}`,
    { method: 'GET' }
  );

  if (!result.ok) return result;
  return {
    ok: true as const,
    accountName: String(result.data?.account_name || ''),
    accountNumber: String(result.data?.account_number || opts.accountNumber),
  };
}

/** Create (or reuse) a transfer recipient for a Nigerian NUBAN account */
export async function createTransferRecipient(opts: {
  name: string;
  accountNumber: string;
  bankCode: string;
}) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return {
      ok: false as const,
      error: 'PAYSTACK_SECRET_KEY missing — cannot create a real transfer recipient.',
    };
  }

  const result = await paystackFetch('/transferrecipient', {
    method: 'POST',
    body: JSON.stringify({
      type: 'nuban',
      name: opts.name,
      account_number: opts.accountNumber,
      bank_code: opts.bankCode,
      currency: 'NGN',
    }),
  });

  if (!result.ok) return result;
  return {
    ok: true as const,
    recipientCode: result.data?.recipient_code as string,
    data: result.data,
  };
}

/** Initiate a single transfer (kobo) */
export async function initiateTransfer(opts: {
  amountNaira: number;
  recipientCode: string;
  reason: string;
  reference?: string;
}) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return {
      ok: false as const,
      error: 'PAYSTACK_SECRET_KEY missing — cannot send a real bank transfer.',
    };
  }

  const result = await paystackFetch('/transfer', {
    method: 'POST',
    body: JSON.stringify({
      source: 'balance',
      amount: Math.round(opts.amountNaira * 100),
      recipient: opts.recipientCode,
      reason: opts.reason,
      reference: opts.reference,
      currency: 'NGN',
    }),
  });

  if (!result.ok) return result;
  return {
    ok: true as const,
    reference: result.data?.reference as string,
    transferCode: result.data?.transfer_code as string,
    data: result.data,
  };
}

/** Verify a transfer with Paystack before reconciliation. */
export async function verifyTransfer(reference: string) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return { ok: false as const, error: 'PAYSTACK_SECRET_KEY missing — cannot verify the transfer.' };
  }
  const result = await paystackFetch(`/transfer/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
  });
  if (!result.ok) return result;
  return {
    ok: true as const,
    status: String(result.data?.status || ''),
    reference: String(result.data?.reference || reference),
    transferCode: String(result.data?.transfer_code || ''),
    data: result.data,
  };
}

/** Map common Nigerian bank names → Paystack bank codes (subset) */
export const NG_BANK_CODES: Record<string, string> = {
  gtb: '058',
  gtbank: '058',
  access: '044',
  accessbank: '044',
  zenith: '057',
  uba: '033',
  firstbank: '011',
  first: '011',
  fidelity: '070',
  union: '032',
  sterling: '232',
  stanbic: '221',
  polarity: '101',
  kuda: '50211',
  opay: '999992',
  palmpay: '999991',
  moniepoint: '50515',
  providus: '101',
  wema: '035',
  eco: '050',
  ecobank: '050',
};

export function resolveBankCode(bankName: string, explicitCode?: string): string | null {
  if (explicitCode && /^\d{3,6}$/.test(explicitCode)) return explicitCode;
  const key = bankName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [name, code] of Object.entries(NG_BANK_CODES)) {
    if (key.includes(name)) return code;
  }
  return process.env.PAYSTACK_DEFAULT_BANK_CODE || null;
}
