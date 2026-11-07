import type { Product } from './types';

export type ActiveFlashSale = {
  price: number;
  startsAt: string;
  endsAt: string;
  discountPercent: number;
};

/** Integer-kobo conversion used at payment/configuration boundaries. */
export function nairaToKobo(amountNaira: number): number {
  if (!Number.isFinite(amountNaira) || amountNaira < 0) throw new Error('Amount must be a non-negative Naira value');
  return Math.round(amountNaira * 100);
}

export function koboToNaira(amountKobo: number): number {
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 0) throw new Error('Amount must be a non-negative integer number of kobo');
  return amountKobo / 100;
}

/** Only a server-scheduled, currently running Flash Sale changes the price. */
export function activeFlashSale(product: Pick<Product, 'price' | 'flashSalePrice' | 'flashSaleStartsAt' | 'flashSaleEndsAt'>, now = Date.now()): ActiveFlashSale | null {
  const price = Number(product.flashSalePrice) || 0;
  if (!product.flashSaleEndsAt || price <= 0 || price >= product.price) return null;
  const start = product.flashSaleStartsAt ? new Date(product.flashSaleStartsAt).getTime() : 0;
  const end = new Date(product.flashSaleEndsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (now < start || now >= end) return null;
  return {
    price,
    startsAt: product.flashSaleStartsAt as string,
    endsAt: product.flashSaleEndsAt,
    discountPercent: Math.max(1, Math.round(((product.price - price) / product.price) * 100)),
  };
}

export function effectiveProductPrice(
  product: Pick<Product, 'price' | 'flashSalePrice' | 'flashSaleStartsAt' | 'flashSaleEndsAt'>,
  now = Date.now()
): number {
  return activeFlashSale(product, now)?.price ?? product.price;
}
