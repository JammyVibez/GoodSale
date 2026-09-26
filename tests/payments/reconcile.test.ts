import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reconcilePaystackPayment } from '@/lib/data/payments';

/**
 * These tests lock down the money-safety contract of payment reconciliation:
 * no admin client → no write, unknown reference → logged and skipped, terminal
 * orders → refused, amount mismatch → refused, and a clean payable order →
 * marked paid exactly once via the service-role RPC.
 */

const rpc = vi.fn();
const from = vi.fn();
let adminClient: { rpc: typeof rpc; from: typeof from } | null = { rpc, from };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminClient,
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type QueryResult = { data?: unknown; error?: unknown };

/** Minimal chainable + thenable PostgREST query stub. */
function makeQuery(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'limit', 'order', 'gte', 'lte']) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.single = () => Promise.resolve(result);
  chain.insert = () => Promise.resolve(result);
  chain.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const PAYABLE_ORDER: QueryResult = { data: { total_amount: 10000, status: 'PENDING' }, error: null };

function mockTables(orders: QueryResult, logs: QueryResult = { data: null, error: null }) {
  from.mockImplementation((table: string) => makeQuery(table === 'orders' ? orders : logs));
}

function extractFirstError(result: unknown): string | undefined {
  const results = (result as { results?: { error?: string }[] }).results;
  return results?.[0]?.error;
}

beforeEach(() => {
  vi.clearAllMocks();
  adminClient = { rpc, from };
  rpc.mockResolvedValue({ data: { success: true }, error: null });
  mockTables(PAYABLE_ORDER);
});

describe('reconcilePaystackPayment — guard rails', () => {
  it('does not reconcile without a service-role admin client', async () => {
    adminClient = null;
    const result = await reconcilePaystackPayment({ reference: 'GS_5_x', amountKobo: 1_000_000 });
    expect(result.reconciled).toBe(false);
    expect(result.reason).toBe('no_admin_client');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('logs and skips when no order id can be resolved', async () => {
    const result = await reconcilePaystackPayment({ reference: 'PAY_REF_123', amountKobo: 500_000 });
    expect(result.reconciled).toBe(false);
    expect(result.reason).toBe('order_not_found');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses an order in a terminal state', async () => {
    mockTables({ data: { total_amount: 10000, status: 'REFUNDED' }, error: null });
    const result = await reconcilePaystackPayment({ reference: 'GS_7_x', amountKobo: 1_000_000 });
    expect(result.reconciled).toBe(false);
    expect(extractFirstError(result)).toBe('terminal_status');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses when the paid amount does not match the order total', async () => {
    const result = await reconcilePaystackPayment({ reference: 'GS_7_x', amountKobo: 2_000_000 });
    expect(result.reconciled).toBe(false);
    expect(extractFirstError(result)).toBe('amount_mismatch');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('marks a payable order paid via the service-role RPC', async () => {
    const result = await reconcilePaystackPayment({
      reference: 'GS_5_x',
      amountKobo: 1_000_000,
      channel: 'card',
    });
    expect(result.reconciled).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'mark_order_paid_by_reference',
      expect.objectContaining({ p_order_id: 5, p_reference: 'GS_5_x', p_amount_kobo: 1_000_000 })
    );
  });

  it('accepts an already-paid order as an idempotent success', async () => {
    mockTables({ data: { total_amount: 10000, status: 'PAID_ESCROW' }, error: null });
    const result = await reconcilePaystackPayment({ reference: 'GS_5_x', amountKobo: 999_999 });
    expect(result.reconciled).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
