/**
 * Server-only shipping quote orchestration. Uses the service role so pricing
 * configuration and seller pickup details are never trusted from the browser.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_SHIPPING_SETTINGS,
  DEFAULT_SHIPPING_TIERS,
} from '@/lib/data/empty-state';
import * as M from '@/lib/data/mappers';
import type {
  ShippingCourier,
  ShippingDeliveryMethod,
  ShippingDistanceTier,
  ShippingManualQuote,
  ShippingQuoteResult,
  ShippingRule,
  ShippingServiceType,
  ShippingSettings,
  ShippingZone,
  SellerShippingSettings,
} from '@/lib/types';
import {
  buildSellerQuoteGroup,
  priceSellerShipping,
  type ShippingConfig,
  type ShippingDestination,
  type ShippingLineItem,
} from './engine';

export class ShippingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ShippingError';
    this.status = status;
  }
}

export interface QuoteRequestItem {
  productId: number;
  quantity: number;
}

export interface QuoteRequest {
  items: QuoteRequestItem[];
  destination: ShippingDestination;
  deliveryMethod: ShippingDeliveryMethod;
  serviceType: ShippingServiceType;
  courierId?: number;
  buyerId?: number;
}

const asRows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

interface ShippingQueryFilter {
  eq(column: string, value: unknown): ShippingQueryFilter;
  in(column: string, values: readonly unknown[]): ShippingQueryFilter;
  limit(count: number): unknown;
}

async function safeRows(
  client: SupabaseClient,
  table: string,
  filter?: (q: ShippingQueryFilter) => unknown
): Promise<Record<string, unknown>[]> {
  try {
    const base = client.from(table).select('*');
    const result = (filter ? filter(base as unknown as ShippingQueryFilter) : base) as PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
    const { data, error } = await result;
    if (error) {
      console.warn(`[shipping] ${table}: ${error.message}`);
      return [];
    }
    return asRows(data);
  } catch (error) {
    console.warn(`[shipping] ${table}:`, String(error));
    return [];
  }
}

function normaliseState(value?: string) {
  return (value || '').trim().toLowerCase().replace(/\s+state$/, '');
}
function normalise(value?: string) {
  return (value || '').trim().toLowerCase();
}

interface LoadedConfig {
  base: Omit<ShippingConfig, 'sellerSettings' | 'manualQuotes'>;
  sellers: Map<number, { name: string; address: string; city: string; state: string; lat?: number; lng?: number }>;
  sellerSettings: Map<number, SellerShippingSettings>;
  manualQuotes: Map<number, ShippingManualQuote[]>;
  deliveryEnabledByRoute: Map<string, boolean>;
}

async function loadConfig(client: SupabaseClient, sellerIds: number[]): Promise<LoadedConfig> {
  const [
    settingsRows,
    tierRows,
    zoneRows,
    ruleRows,
    courierRows,
    sellerSettingRows,
    manualQuoteRows,
    profileRows,
    areaRows,
  ] = await Promise.all([
    safeRows(client, 'shipping_settings', (q) => q.eq('id', 1).limit(1)),
    safeRows(client, 'shipping_distance_tiers'),
    safeRows(client, 'shipping_zones'),
    safeRows(client, 'shipping_rules'),
    safeRows(client, 'shipping_couriers'),
    sellerIds.length
      ? safeRows(client, 'seller_shipping_settings', (q) => q.in('seller_id', sellerIds))
      : Promise.resolve([]),
    sellerIds.length
      ? safeRows(client, 'shipping_manual_quotes', (q) => q.in('seller_id', sellerIds).eq('active', true))
      : Promise.resolve([]),
    sellerIds.length
      ? safeRows(client, 'profiles', (q) => q.in('id', sellerIds))
      : Promise.resolve([]),
    safeRows(client, 'service_areas'),
  ]);

  const settings: ShippingSettings = settingsRows[0]
    ? M.mapShippingSettings(settingsRows[0])
    : { ...DEFAULT_SHIPPING_SETTINGS };
  const tiers: ShippingDistanceTier[] = tierRows.length
    ? tierRows.map(M.mapShippingTier).sort((a, b) => a.minKm - b.minKm)
    : DEFAULT_SHIPPING_TIERS.map((tier) => ({ ...tier }));
  const zones: ShippingZone[] = zoneRows.map(M.mapShippingZone);
  const rules: ShippingRule[] = ruleRows.map(M.mapShippingRule);
  const couriers: ShippingCourier[] = courierRows.map(M.mapShippingCourier);

  const sellerSettings = new Map<number, SellerShippingSettings>();
  for (const row of sellerSettingRows) {
    const mapped = M.mapSellerShippingSettings(row);
    sellerSettings.set(mapped.sellerId, mapped);
  }

  const manualQuotes = new Map<number, ShippingManualQuote[]>();
  for (const row of manualQuoteRows) {
    const mapped = M.mapShippingManualQuote(row);
    const list = manualQuotes.get(mapped.sellerId) || [];
    list.push(mapped);
    manualQuotes.set(mapped.sellerId, list);
  }

  const sellers = new Map<number, { name: string; address: string; city: string; state: string; lat?: number; lng?: number }>();
  for (const row of profileRows) {
    const id = Number(row.id);
    sellers.set(id, {
      name: String(row.full_name || row.username || `Seller #${id}`),
      address: String(row.address || ''),
      city: String(row.city || ''),
      state: String(row.state || ''),
      lat: row.lat != null ? Number(row.lat) : undefined,
      lng: row.lng != null ? Number(row.lng) : undefined,
    });
  }

  const deliveryEnabledByRoute = new Map<string, boolean>();
  for (const row of areaRows) {
    const enabled = row.delivery_enabled !== false;
    const state = normaliseState(String(row.state || ''));
    const city = normalise(String(row.city || ''));
    deliveryEnabledByRoute.set(`${state}|${city}`, enabled);
    if (!deliveryEnabledByRoute.has(`${state}|`)) deliveryEnabledByRoute.set(`${state}|`, enabled);
  }

  return {
    base: { settings, tiers, zones, rules, couriers },
    sellers,
    sellerSettings,
    manualQuotes,
    deliveryEnabledByRoute,
  };
}

function pickupFor(
  sellerId: number,
  loaded: LoadedConfig
): { address: string; city: string; state: string; lat?: number; lng?: number } {
  const settings = loaded.sellerSettings.get(sellerId);
  const profile = loaded.sellers.get(sellerId);
  return settings
    ? {
        address: settings.pickupAddress,
        city: settings.pickupCity,
        state: settings.pickupState,
        lat: settings.pickupLat,
        lng: settings.pickupLng,
      }
    : {
        address: profile?.address || '',
        city: profile?.city || '',
        state: profile?.state || '',
        lat: profile?.lat,
        lng: profile?.lng,
      };
}

/** Validate and price a cart from database-owned products. */
export async function quoteShipping(request: QuoteRequest): Promise<ShippingQuoteResult> {
  const client = createAdminClient();
  if (!client) throw new ShippingError('Shipping is not configured on the server.', 503);

  const destination = request.destination;
  if (!destination?.city?.trim() || !destination?.state?.trim()) {
    throw new ShippingError('Delivery city and state are required.', 400);
  }
  if (!Array.isArray(request.items) || request.items.length === 0 || request.items.length > 50) {
    throw new ShippingError('Add at least one item to get a delivery quote.', 400);
  }

  const items = request.items
    .map((item) => ({
      productId: Number(item.productId),
      quantity: Math.floor(Number(item.quantity)),
    }))
    .filter((item) => Number.isFinite(item.productId) && item.productId > 0);
  if (
    items.length !== request.items.length ||
    items.some((item) => !item.quantity || item.quantity < 1 || item.quantity > 999)
  ) {
    throw new ShippingError('Invalid cart quantity.', 400);
  }

  const productIds = [...new Set(items.map((item) => item.productId))];
  const productRows = await safeRows(client, 'products', (q) => q.in('id', productIds));
  if (productRows.length !== productIds.length) {
    throw new ShippingError('One or more items are no longer available.', 409);
  }
  const productById = new Map<number, Record<string, unknown>>();
  for (const row of productRows) productById.set(Number(row.id), row);

  const linesBySeller = new Map<number, ShippingLineItem[]>();
  for (const item of items) {
    const row = productById.get(item.productId);
    if (!row) throw new ShippingError('One or more items are no longer available.', 409);
    const stockStatus = String(row.stock_status || '');
    if (stockStatus === 'SOLD' || stockStatus === 'UNAVAILABLE' || stockStatus === 'OUT_OF_STOCK') {
      throw new ShippingError(`${String(row.title || 'An item')} is no longer available.`, 409);
    }
    const available = Number(row.quantity ?? 0);
    if (Number.isFinite(available) && available < item.quantity) {
      throw new ShippingError(
        `Only ${available} unit${available === 1 ? '' : 's'} of ${String(row.title || 'this item')} remain.`,
        409
      );
    }
    const sellerId = Number(row.seller_id);
    const line: ShippingLineItem = {
      productId: item.productId,
      sellerId,
      title: row.title != null ? String(row.title) : undefined,
      quantity: item.quantity,
      price: Number(row.price || 0),
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : undefined,
      dimensionsCm: row.dimensions_cm != null ? String(row.dimensions_cm) : undefined,
    };
    const list = linesBySeller.get(sellerId) || [];
    list.push(line);
    linesBySeller.set(sellerId, list);
  }

  const sellerIds = [...linesBySeller.keys()];
  const loaded = await loadConfig(client, sellerIds);
  if (!loaded.base.settings.enabled) {
    throw new ShippingError('Shipping is temporarily paused. Please try again later.', 503);
  }

  const stateKey = normaliseState(destination.state);
  const cityKey = normalise(destination.city);
  const deliveryEnabled =
    loaded.deliveryEnabledByRoute.get(`${stateKey}|${cityKey}`) ??
    loaded.deliveryEnabledByRoute.get(`${stateKey}|`);

  const groups = sellerIds.map((sellerId) => {
    const seller = loaded.sellers.get(sellerId);
    return buildSellerQuoteGroup(
      {
        ...loaded.base,
        sellerSettings: loaded.sellerSettings.get(sellerId),
        manualQuotes: loaded.manualQuotes.get(sellerId) || [],
      },
      {
        sellerId,
        sellerName: seller?.name || `Seller #${sellerId}`,
        pickup: pickupFor(sellerId, loaded),
        items: linesBySeller.get(sellerId) || [],
        destination,
        deliveryMethod: request.deliveryMethod,
        service: request.serviceType,
        courierId: request.courierId,
        destinationDeliveryEnabled: deliveryEnabled,
      }
    );
  });

  const total = groups.reduce((sum, group) => sum + (group.selected?.fee || 0), 0);
  const requiresManualQuote = groups.some((group) => group.requiresManualQuote || !group.selected);
  const message = groups.find((group) => group.message)?.message;
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

  const services: ShippingServiceType[] = ['ECONOMY', 'STANDARD', 'EXPRESS'];
  const serviceTotals = Object.fromEntries(services.map((service) => {
    let serviceTotal = 0;
    for (const sellerId of sellerIds) {
      const seller = loaded.sellers.get(sellerId);
      const priced = priceSellerShipping(
        {
          ...loaded.base,
          sellerSettings: loaded.sellerSettings.get(sellerId),
          manualQuotes: loaded.manualQuotes.get(sellerId) || [],
        },
        {
          sellerId,
          sellerName: seller?.name || `Seller #${sellerId}`,
          pickup: pickupFor(sellerId, loaded),
          items: linesBySeller.get(sellerId) || [],
          destination,
          deliveryMethod: request.deliveryMethod,
          service,
          courierId: request.courierId,
          destinationDeliveryEnabled: deliveryEnabled,
        }
      );
      serviceTotal += priced.option?.fee || 0;
    }
    return [service, serviceTotal];
  })) as Record<ShippingServiceType, number>;

  const result: ShippingQuoteResult = {
    groups,
    total,
    requiresManualQuote,
    message,
    expiresAt,
    serviceTotals,
  };

  const { data: quoteRow, error: quoteError } = await client
    .from('shipping_quotes')
    .insert({
      buyer_id: request.buyerId ?? null,
      seller_ids: sellerIds,
      delivery_city: destination.city.trim(),
      delivery_state: destination.state.trim(),
      delivery_method: request.deliveryMethod,
      service_type: request.serviceType,
      result,
      total,
      requires_manual_quote: requiresManualQuote,
      expires_at: expiresAt,
    })
    .select('id')
    .single();
  if (quoteError) {
    console.error('[shipping] quote persistence failed', quoteError.message);
    throw new ShippingError('Could not save the delivery quote. Please retry.', 503);
  }

  return { ...result, quoteId: String(quoteRow.id) };
}

export interface AppliedOrderShipping {
  orderId: number;
  totalAmount: number;
  deliveryFee: number;
  unchanged?: boolean;
}

/**
 * Re-price unpaid orders from a server quote. The first order for each seller
 * carries the group fee; later orders are zero so multi-item carts are never
 * charged shipping twice. Idempotent per quote id.
 */
export async function applyQuoteToOrders(
  quoteId: string,
  orderIds: number[],
  actor: { profileId: number; isAdmin: boolean }
): Promise<AppliedOrderShipping[]> {
  const client = createAdminClient();
  if (!client) throw new ShippingError('Shipping is not configured on the server.', 503);
  if (!quoteId || !Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 50) {
    throw new ShippingError('A quote and at least one order are required.', 400);
  }

  const { data: quote, error: quoteError } = await client
    .from('shipping_quotes')
    .select('*')
    .eq('id', quoteId)
    .maybeSingle();
  if (quoteError || !quote) throw new ShippingError('Delivery quote not found.', 404);
  if (quote.expires_at && new Date(quote.expires_at).getTime() < Date.now()) {
    throw new ShippingError('This delivery quote has expired. Refresh shipping and retry.', 409);
  }
  if (quote.buyer_id != null && Number(quote.buyer_id) !== actor.profileId && !actor.isAdmin) {
    throw new ShippingError('This quote belongs to another buyer.', 403);
  }

  const { data: orderRows, error: orderError } = await client
    .from('orders')
    .select('*')
    .in('id', orderIds);
  if (orderError) throw new ShippingError('Could not load orders.', 503);
  const orders = (orderRows || []) as Record<string, unknown>[];
  if (orders.length !== orderIds.length) throw new ShippingError('One or more orders were not found.', 404);

  const groups = Array.isArray(quote.result?.groups) ? quote.result.groups : [];
  const groupBySeller = new Map<number, Record<string, unknown>>();
  for (const group of groups) groupBySeller.set(Number(group.sellerId), group as Record<string, unknown>);
  const seenSellers = new Map<number, number>();

  const results: AppliedOrderShipping[] = [];
  for (const order of orders.sort((a, b) => Number(a.id) - Number(b.id))) {
    const buyerId = Number(order.buyer_id);
    if (buyerId !== actor.profileId && !actor.isAdmin) {
      throw new ShippingError('You cannot change shipping on this order.', 403);
    }
    const sellerId = Number(order.seller_id);
    const group = groupBySeller.get(sellerId);
    if (!group) continue;
    const selected = group.selected as Record<string, unknown> | undefined;
    const breakdown = (selected?.breakdown as Record<string, unknown> | undefined) || {};
    const groupFee = Number(selected?.fee || 0);
    const priorCount = seenSellers.get(sellerId) || 0;
    const fee = priorCount === 0 ? groupFee : 0;
    seenSellers.set(sellerId, priorCount + 1);

    const existingQuote = order.shipping_quote_id ? String(order.shipping_quote_id) : '';
    if (existingQuote === quoteId) {
      results.push({
        orderId: Number(order.id),
        totalAmount: Number(order.total_amount || 0),
        deliveryFee: Number(order.delivery_fee || 0),
        unchanged: true,
      });
      continue;
    }

    const status = String(order.status || '');
    if (!['PENDING', 'PENDING_BANK_TRANSFER', 'COD_PENDING', 'INVOICE_SENT'].includes(status)) {
      throw new ShippingError('Shipping cannot be changed after payment has started.', 409);
    }

    const oldFee = Number(order.delivery_fee || 0);
    const newTotal = Math.max(0, Number(order.total_amount || 0) - oldFee + fee);
    const snapshot =
      fee === groupFee
        ? breakdown
        : { ...breakdown, total: 0, discount: groupFee, freeShipping: true };
    const { error: updateError } = await client
      .from('orders')
      .update({
        delivery_fee: fee,
        total_amount: newTotal,
        shipping_quote_id: quoteId,
        shipping_snapshot: snapshot,
        shipping_rule_id: breakdown.ruleId ?? null,
        shipping_zone_id: breakdown.zoneId ?? null,
        estimated_delivery_min_days: selected?.etaMinDays ?? null,
        estimated_delivery_max_days: selected?.etaMaxDays ?? null,
      })
      .eq('id', order.id);
    if (updateError) throw new ShippingError('Could not save verified shipping on the order.', 503);

    const { data: escrow } = await client
      .from('escrows')
      .select('id,is_released,is_refunded,held_amount')
      .eq('order_id', order.id)
      .maybeSingle();
    if (escrow && !escrow.is_released && !escrow.is_refunded) {
      const escrowTotal = Number(escrow.held_amount || 0);
      if (escrowTotal > 0) {
        const updatedHeld = Math.max(0, escrowTotal - oldFee + fee);
        await client.from('escrows').update({ held_amount: updatedHeld }).eq('id', escrow.id);
      }
    }

    results.push({ orderId: Number(order.id), totalAmount: newTotal, deliveryFee: fee });
  }

  return results;
}
