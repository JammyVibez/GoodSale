import { describe, expect, it } from 'vitest';
import { resolveBankCode, NG_BANK_CODES } from '@/lib/payments/transfer';

describe('resolveBankCode', () => {
  it('returns explicit numeric codes', () => {
    expect(resolveBankCode('Anything', '058')).toBe('058');
    expect(resolveBankCode('Anything', '50211')).toBe('50211');
  });

  it('maps common Nigerian bank names', () => {
    expect(resolveBankCode('GTBank Plc')).toBe('058');
    expect(resolveBankCode('Access Bank')).toBe('044');
    expect(resolveBankCode('Zenith')).toBe('057');
    expect(resolveBankCode('Kuda Microfinance')).toBe('50211');
    expect(resolveBankCode('OPay')).toBe('999992');
  });

  it('exposes a stable GTBank code in the map', () => {
    expect(NG_BANK_CODES.gtbank).toBe('058');
  });
});
