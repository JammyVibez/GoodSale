// lib/priceAlerts.ts — Single shared Price Drop Alert store & evaluator
import type { Product } from '@/lib/types';
import { effectiveProductPrice } from '@/lib/productPricing';

export const GOODSALE_PRICE_ALERTS_KEY = 'goodsale_price_alerts';
export const PRICE_ALERTS_EVENT = 'goodsale_price_alerts_change';

export interface PriceAlertEntry {
  productId: number;
  threshold: number;
  lastNotifiedPrice?: number;
  createdAt?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(override?: StorageLike): StorageLike | null {
  if (override) return override;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function sanitizePriceAlerts(raw: unknown): PriceAlertEntry[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<number, PriceAlertEntry>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<PriceAlertEntry>;
    const productId = Number(rec.productId);
    const threshold = Math.round(Number(rec.threshold));
    if (!Number.isFinite(productId) || productId <= 0) continue;
    if (!Number.isFinite(threshold) || threshold <= 0) continue;
    const lastNotifiedPrice =
      typeof rec.lastNotifiedPrice === 'number' && Number.isFinite(rec.lastNotifiedPrice)
        ? Math.round(rec.lastNotifiedPrice)
        : undefined;

    byId.set(productId, {
      productId,
      threshold,
      lastNotifiedPrice,
      createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : undefined,
    });
  }

  return Array.from(byId.values());
}

export function readPriceAlerts(storageOverride?: StorageLike): PriceAlertEntry[] {
  const storage = getStorage(storageOverride);
  if (!storage) return [];
  try {
    const raw = storage.getItem(GOODSALE_PRICE_ALERTS_KEY);
    if (!raw) return [];
    return sanitizePriceAlerts(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writePriceAlerts(
  entries: PriceAlertEntry[],
  storageOverride?: StorageLike
): PriceAlertEntry[] {
  const clean = sanitizePriceAlerts(entries);
  const storage = getStorage(storageOverride);
  if (storage) {
    try {
      storage.setItem(GOODSALE_PRICE_ALERTS_KEY, JSON.stringify(clean));
    } catch {
      // Storage quota exceeded — ignore gracefully
    }
  }
  if (!storageOverride && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PRICE_ALERTS_EVENT));
  }
  return clean;
}

export function hasPriceAlert(entries: PriceAlertEntry[], productId: number): boolean {
  return entries.some((entry) => entry.productId === productId);
}

export function defaultPriceDropTarget(currentPrice: number, discountRatio = 0.9): number {
  const safePrice = Math.max(100, Math.round(Number(currentPrice) || 0));
  const rawTarget = Math.max(1, Math.round(safePrice * discountRatio));
  if (safePrice >= 10_000) {
    return Math.max(1000, Math.round(rawTarget / 500) * 500);
  }
  return rawTarget;
}

export function togglePriceAlertEntry(
  entries: PriceAlertEntry[],
  productId: number,
  currentPrice: number,
  customThreshold?: number,
  now = new Date()
): { next: PriceAlertEntry[]; added: boolean; entry?: PriceAlertEntry } {
  const existing = entries.find((e) => e.productId === productId);
  if (existing) {
    return {
      next: entries.filter((e) => e.productId !== productId),
      added: false,
    };
  }

  const threshold =
    typeof customThreshold === 'number' && Number.isFinite(customThreshold) && customThreshold > 0
      ? Math.round(customThreshold)
      : defaultPriceDropTarget(currentPrice);

  const entry: PriceAlertEntry = {
    productId,
    threshold,
    createdAt: now.toISOString(),
  };

  return {
    next: [...entries, entry],
    added: true,
    entry,
  };
}

export function updatePriceAlertThreshold(
  entries: PriceAlertEntry[],
  productId: number,
  newThreshold: number
): PriceAlertEntry[] {
  const threshold = Math.max(1, Math.round(Number(newThreshold) || 0));
  return entries.map((e) =>
    e.productId === productId ? { ...e, threshold, lastNotifiedPrice: undefined } : e
  );
}

export interface TriggeredPriceDrop {
  alert: PriceAlertEntry;
  product: Product;
  effectivePrice: number;
}

export function evaluatePriceDrops(
  entries: PriceAlertEntry[],
  products: Product[]
): { triggered: TriggeredPriceDrop[]; nextEntries: PriceAlertEntry[] } {
  if (!entries.length || !products.length) {
    return { triggered: [], nextEntries: entries };
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const triggered: TriggeredPriceDrop[] = [];
  const nextEntries = entries.map((entry) => {
    const product = byId.get(entry.productId);
    if (!product) return entry;
    const effectivePrice = effectiveProductPrice(product);
    if (
      effectivePrice <= entry.threshold &&
      entry.lastNotifiedPrice !== effectivePrice
    ) {
      const updated = { ...entry, lastNotifiedPrice: effectivePrice };
      triggered.push({ alert: updated, product, effectivePrice });
      return updated;
    }
    return entry;
  });

  return { triggered, nextEntries };
}
