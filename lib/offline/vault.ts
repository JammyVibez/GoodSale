// lib/offline/vault.ts
import { OrderStatus, type Order, type Product } from '@/lib/types';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface OfflineProductSnapshot {
  id: number;
  title: string;
  price: number;
  image: string;
  sellerId: number;
  category: string;
  pickupAvailable: boolean;
  cachedAt: string;
}

export interface OfflineOrderSnapshot {
  id: number;
  orderNumber: string;
  productId: number;
  productTitle: string;
  productImage: string;
  totalAmount: number;
  status: OrderStatus;
  deliveryPin: string;
  qrCodeToken: string;
  deliveryAddress: string;
  balanceRemaining?: number;
  isBalanceSettled?: boolean;
  proofStatus?: string;
  cachedAt: string;
}

export interface OfflineQueuedAction {
  id: string;
  kind: 'CART_ADD' | 'CART_REMOVE' | 'WISHLIST_TOGGLE' | 'PRICE_DROP_ALERT';
  productId: number;
  payload?: Record<string, unknown>;
  queuedAt: string;
}

export interface OfflineVaultState {
  cartIds: number[];
  wishlistIds: number[];
  products: OfflineProductSnapshot[];
  orders: OfflineOrderSnapshot[];
  queue: OfflineQueuedAction[];
  lastSyncedAt: string | null;
}

export const OFFLINE_VAULT_KEYS = {
  cart: 'goodsale_cart',
  wishlist: 'goodsale_wishlist',
  products: 'goodsale_offline_products_v1',
  orders: 'goodsale_offline_orders_v1',
  queue: 'goodsale_offline_queue_v1',
  syncedAt: 'goodsale_offline_synced_at_v1',
} as const;

export const OFFLINE_VAULT_EVENT = 'goodsale:offline-vault';

function browserStorage(): StorageAdapter | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(storage: StorageAdapter | null, key: string, fallback: T): T {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: StorageAdapter | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore storage quota errors */
  }
}

function emitVaultChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_VAULT_EVENT));
  }
}

export function readOfflineVault(storage: StorageAdapter | null = browserStorage()): OfflineVaultState {
  const cartRaw = readJson<unknown[]>(storage, OFFLINE_VAULT_KEYS.cart, []);
  const wishlistRaw = readJson<unknown[]>(storage, OFFLINE_VAULT_KEYS.wishlist, []);
  const productsRaw = readJson<OfflineProductSnapshot[]>(storage, OFFLINE_VAULT_KEYS.products, []);
  const ordersRaw = readJson<OfflineOrderSnapshot[]>(storage, OFFLINE_VAULT_KEYS.orders, []);
  const queueRaw = readJson<OfflineQueuedAction[]>(storage, OFFLINE_VAULT_KEYS.queue, []);
  const lastSyncedAt = storage ? storage.getItem(OFFLINE_VAULT_KEYS.syncedAt) : null;

  return {
    cartIds: Array.isArray(cartRaw) ? cartRaw.filter((id): id is number => typeof id === 'number') : [],
    wishlistIds: Array.isArray(wishlistRaw) ? wishlistRaw.filter((id): id is number => typeof id === 'number') : [],
    products: Array.isArray(productsRaw) ? productsRaw : [],
    orders: Array.isArray(ordersRaw) ? ordersRaw : [],
    queue: Array.isArray(queueRaw) ? queueRaw : [],
    lastSyncedAt: lastSyncedAt || null,
  };
}

export function syncOfflineProducts(
  products: Product[],
  targetIds: number[],
  storage: StorageAdapter | null = browserStorage(),
  now = new Date()
): OfflineProductSnapshot[] {
  const existing = readJson<OfflineProductSnapshot[]>(storage, OFFLINE_VAULT_KEYS.products, []);
  const existingMap = new Map(existing.map((item) => [item.id, item]));
  const wanted = new Set(targetIds);
  const nowIso = now.toISOString();

  for (const prod of products) {
    if (!wanted.has(prod.id)) continue;
    existingMap.set(prod.id, {
      id: prod.id,
      title: prod.title,
      price: prod.price,
      image: prod.images?.[0] || '',
      sellerId: prod.sellerId,
      category: prod.category,
      pickupAvailable: Boolean(prod.pickupAvailable),
      cachedAt: nowIso,
    });
  }

  const next = Array.from(existingMap.values()).filter((p) => wanted.has(p.id) || existing.some((e) => e.id === p.id)).slice(0, 60);
  writeJson(storage, OFFLINE_VAULT_KEYS.products, next);
  if (storage) {
    try {
      storage.setItem(OFFLINE_VAULT_KEYS.syncedAt, nowIso);
    } catch {
      /* ignore */
    }
  }
  emitVaultChange();
  return next;
}

export function syncOfflineOrders(
  orders: Order[],
  currentUserId?: number | null,
  storage: StorageAdapter | null = browserStorage(),
  now = new Date()
): OfflineOrderSnapshot[] {
  if (!currentUserId) return [];
  const nowIso = now.toISOString();
  const mine = orders
    .filter((o) => o.buyerId === currentUserId || o.sellerId === currentUserId)
    .slice(0, 30)
    .map<OfflineOrderSnapshot>((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      productId: o.productId,
      productTitle: o.productTitle,
      productImage: o.productImage,
      totalAmount: o.totalAmount,
      status: o.status,
      deliveryPin: o.buyerId === currentUserId ? o.deliveryPin : '',
      qrCodeToken: o.qrCodeToken,
      deliveryAddress: `${o.deliveryAddress}${o.deliveryCity ? `, ${o.deliveryCity}` : ''}`,
      balanceRemaining: o.balanceRemaining,
      isBalanceSettled: o.isBalanceSettled,
      proofStatus: o.dispatchProof?.status,
      cachedAt: nowIso,
    }));

  writeJson(storage, OFFLINE_VAULT_KEYS.orders, mine);
  if (storage) {
    try {
      storage.setItem(OFFLINE_VAULT_KEYS.syncedAt, nowIso);
    } catch {
      /* ignore */
    }
  }
  emitVaultChange();
  return mine;
}

export function enqueueOfflineAction(
  action: Omit<OfflineQueuedAction, 'id' | 'queuedAt'>,
  storage: StorageAdapter | null = browserStorage(),
  now = new Date()
): OfflineQueuedAction[] {
  const queue = readJson<OfflineQueuedAction[]>(storage, OFFLINE_VAULT_KEYS.queue, []);
  const deduped = queue.filter((q) => !(q.kind === action.kind && q.productId === action.productId));
  const next: OfflineQueuedAction[] = [
    ...deduped,
    {
      ...action,
      id: `oq-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      queuedAt: now.toISOString(),
    },
  ];
  writeJson(storage, OFFLINE_VAULT_KEYS.queue, next);
  emitVaultChange();
  return next;
}

export function clearOfflineQueue(storage: StorageAdapter | null = browserStorage()): void {
  writeJson(storage, OFFLINE_VAULT_KEYS.queue, []);
  emitVaultChange();
}
