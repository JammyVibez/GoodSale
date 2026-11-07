/**
 * Pure shipping pricing engine. No network/database access so the same rules
 * run in the admin preview, the quote API and tests.
 */
import type {
  Product,
  SellerShippingQuoteGroup,
  SellerShippingSettings,
  ShippingBreakdown,
  ShippingCourier,
  ShippingDeliveryMethod,
  ShippingDistanceTier,
  ShippingManualQuote,
  ShippingOption,
  ShippingRule,
  ShippingServiceType,
  ShippingSettings,
  ShippingZone,
} from '@/lib/types';

export interface ShippingConfig {
  settings: ShippingSettings;
  tiers: ShippingDistanceTier[];
  zones: ShippingZone[];
  rules: ShippingRule[];
  couriers: ShippingCourier[];
  sellerSettings?: SellerShippingSettings;
  manualQuotes?: ShippingManualQuote[];
}

export interface ShippingLineItem {
  productId: number;
  sellerId: number;
  title?: string;
  quantity: number;
  price: number;
  weightKg?: number;
  dimensionsCm?: string;
}

export interface ShippingDestination {
  address: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
}

export interface ShippingSellerInput {
  sellerId: number;
  sellerName: string;
  pickup: { address?: string; city: string; state: string; lat?: number; lng?: number };
  items: ShippingLineItem[];
  destination: ShippingDestination;
  /** Admin preview / tests can supply a known road distance. */
  distanceKm?: number;
  deliveryMethod: ShippingDeliveryMethod;
  service: ShippingServiceType;
  courierId?: number;
  destinationDeliveryEnabled?: boolean;
}

const norm = (value?: string) => (value || '').trim().toLowerCase();
const normState = (value?: string) => norm(value).replace(/\s+state$/, '');
const money = (value: number) => Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function haversineKm(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number }
): number | undefined {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return undefined;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Supports "40x30x20", "40 x 30 x 20 cm", etc. Returns centimetres. */
export function parseDimensionsCm(value?: string): [number, number, number] | undefined {
  if (!value) return undefined;
  const nums = value.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 3) return undefined;
  const [l, w, h] = nums.slice(0, 3).map(Number);
  if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) return undefined;
  return [l, w, h];
}

export function isOversized(dimensions?: string): boolean {
  const parsed = parseDimensionsCm(dimensions);
  if (!parsed) return false;
  const [l, w, h] = parsed;
  const longest = Math.max(l, w, h);
  const girth = l + w + h;
  return longest > 120 || girth > 260;
}

/**
 * Same-state deliveries use local tiers (Nigerian metro areas often span
 * several LGAs); crossing a state boundary is interstate.
 */
export function isLocalRoute(pickup: { city: string; state: string }, destination: ShippingDestination) {
  const pickupState = normState(pickup.state);
  const destinationState = normState(destination.state);
  if (pickupState && destinationState) return pickupState === destinationState;
  return Boolean(norm(pickup.city) && norm(pickup.city) === norm(destination.city));
}

export function matchingZone(
  zones: ShippingZone[],
  destination: ShippingDestination
): ShippingZone | undefined {
  const city = norm(destination.city);
  const state = normState(destination.state);
  return zones
    .filter((zone) => {
      if (!zone.enabled) return false;
      if (zone.state && normState(zone.state) !== state) return false;
      if (zone.city && norm(zone.city) !== city) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority || b.id - a.id)[0];
}

function ruleSpecificity(rule: ShippingRule): number {
  return rule.scope === 'ZONE' ? 4 : rule.scope === 'CITY' ? 3 : rule.scope === 'STATE' ? 2 : 1;
}

export function matchingRule(
  rules: ShippingRule[],
  destination: ShippingDestination,
  method: ShippingDeliveryMethod,
  service: ShippingServiceType,
  zone?: ShippingZone,
  pickup?: { city?: string; state?: string }
): ShippingRule | undefined {
  const city = norm(destination.city);
  const state = normState(destination.state);
  const originCity = norm(pickup?.city);
  const originState = normState(pickup?.state);
  return rules
    .filter((rule) => {
      if (!rule.enabled) return false;
      if (rule.deliveryMethod !== 'ANY' && rule.deliveryMethod !== method) return false;
      if (rule.serviceType !== 'ANY' && rule.serviceType !== service) return false;
      if (rule.originState && normState(rule.originState) !== originState) return false;
      if (rule.originCity && norm(rule.originCity) !== originCity) return false;
      if (rule.scope === 'ZONE') return Boolean(zone && rule.zoneId === zone.id);
      if (rule.scope === 'CITY') {
        return (!rule.state || normState(rule.state) === state) && (!rule.city || norm(rule.city) === city);
      }
      if (rule.scope === 'STATE') return !rule.state || normState(rule.state) === state;
      return true;
    })
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        ruleSpecificity(b) - ruleSpecificity(a) ||
        b.id - a.id
    )[0];
}

export function matchingManualQuote(
  quotes: ShippingManualQuote[],
  sellerId: number,
  destination: ShippingDestination,
  now = Date.now()
): ShippingManualQuote | undefined {
  const city = norm(destination.city);
  const state = normState(destination.state);
  return quotes
    .filter((quote) => {
      if (!quote.active || quote.sellerId !== sellerId) return false;
      if (quote.expiresAt && new Date(quote.expiresAt).getTime() < now) return false;
      if (quote.state && normState(quote.state) !== state) return false;
      if (quote.city && norm(quote.city) !== city) return false;
      return true;
    })
    .sort((a, b) => Number(Boolean(b.city)) - Number(Boolean(a.city)) || b.id - a.id)[0];
}

function matchingTier(tiers: ShippingDistanceTier[], distanceKm?: number): ShippingDistanceTier | undefined {
  if (distanceKm == null) return undefined;
  return tiers
    .filter((tier) => tier.enabled && distanceKm >= tier.minKm && (tier.maxKm == null || distanceKm < tier.maxKm))
    .sort((a, b) => b.priority - a.priority || a.minKm - b.minKm)[0];
}

function serviceFee(settings: ShippingSettings, service: ShippingServiceType) {
  if (service === 'EXPRESS') return settings.expressFee;
  if (service === 'ECONOMY') return settings.economyFee;
  return settings.standardFee;
}

function etaFor(
  settings: ShippingSettings,
  rule: ShippingRule | undefined,
  seller: SellerShippingSettings | undefined,
  service: ShippingServiceType,
  local: boolean
) {
  const handling = Math.max(0, seller?.handlingDays ?? 0);
  let min = rule?.etaMinDays ?? (local ? Math.min(settings.defaultEtaMinDays, 1) : settings.defaultEtaMinDays);
  let max = rule?.etaMaxDays ?? (local ? Math.min(settings.defaultEtaMaxDays, 3) : settings.defaultEtaMaxDays);
  if (service === 'EXPRESS') {
    min = Math.max(0, min - 1);
    max = Math.max(min, Math.min(max, 2));
  } else if (service === 'ECONOMY') {
    max += 1;
  }
  return { min: min + handling, max: Math.max(min + handling, max + handling) };
}

function emptyBreakdown(
  sellerId: number,
  sellerName: string,
  method: ShippingDeliveryMethod,
  service: ShippingServiceType
): ShippingBreakdown {
  return {
    sellerId,
    sellerName,
    method,
    service,
    baseFee: 0,
    distanceFee: 0,
    weightFee: 0,
    sizeFee: 0,
    remoteFee: 0,
    handlingFee: 0,
    platformFee: 0,
    zoneFee: 0,
    discount: 0,
    total: 0,
    etaMinDays: 0,
    etaMaxDays: 0,
    freeShipping: false,
    manualQuote: false,
  };
}

export interface EngineResult {
  option?: ShippingOption;
  unavailableReason?: string;
  requiresManualQuote: boolean;
}

function manualQuoteResult(
  breakdown: ShippingBreakdown,
  method: ShippingDeliveryMethod,
  service: ShippingServiceType,
  quote: ShippingManualQuote,
  courierName?: string
): EngineResult {
  return {
    requiresManualQuote: false,
    option: {
      method,
      service,
      label: `Manual quotation · ${quote.city || quote.state}`,
      fee: money(quote.amount),
      etaMinDays: quote.etaMinDays,
      etaMaxDays: quote.etaMaxDays,
      ruleName: 'Admin manual quotation',
      courierName,
      freeShipping: quote.amount === 0,
      manualQuote: true,
      breakdown: {
        ...breakdown,
        total: money(quote.amount),
        etaMinDays: quote.etaMinDays,
        etaMaxDays: quote.etaMaxDays,
        manualQuote: true,
        freeShipping: quote.amount === 0,
        ruleName: 'Admin manual quotation',
        courierName,
      },
    },
  };
}

/**
 * Prices one seller group for a requested method/service.
 * Returns no option when the route is unsupported, so callers never invent a fee.
 */
export function priceSellerShipping(
  config: ShippingConfig,
  input: ShippingSellerInput
): EngineResult {
  const { settings, tiers, zones, rules, couriers } = config;
  const seller = config.sellerSettings;
  const sellerId = input.sellerId;
  const sellerName = input.sellerName;
  const method = input.deliveryMethod;
  const service = input.service;
  const breakdown = emptyBreakdown(sellerId, sellerName, method, service);
  const manualQuote = matchingManualQuote(
    config.manualQuotes || [],
    sellerId,
    input.destination
  );

  if (!settings.enabled) {
    return { requiresManualQuote: false, unavailableReason: 'Shipping is temporarily paused by GoodSale.' };
  }
  if (input.destinationDeliveryEnabled === false) {
    if (manualQuote) return manualQuoteResult(breakdown, method, service, manualQuote);
    return {
      requiresManualQuote: Boolean(settings.manualQuotesEnabled),
      unavailableReason: 'Delivery is not currently available in this area.',
    };
  }

  const local = isLocalRoute(input.pickup, input.destination);
  if (method === 'PICKUP') {
    if (seller && !seller.pickupEnabled) {
      return { requiresManualQuote: false, unavailableReason: 'This seller does not offer buyer pickup.' };
    }
    const eta = etaFor(settings, undefined, seller, service, true);
    return {
      requiresManualQuote: false,
      option: {
        method,
        service,
        label: 'Pickup from seller',
        fee: 0,
        etaMinDays: 0,
        etaMaxDays: 0,
        ruleName: 'Seller pickup',
        freeShipping: true,
        manualQuote: false,
        breakdown: {
          ...breakdown,
          etaMinDays: eta.min,
          etaMaxDays: eta.max,
          freeShipping: true,
        },
      },
    };
  }

  if (seller && ((local && !seller.localEnabled) || (!local && !seller.interstateEnabled))) {
    if (manualQuote) return manualQuoteResult(breakdown, method, service, manualQuote);
    return {
      requiresManualQuote: Boolean(settings.manualQuotesEnabled),
      unavailableReason: local
        ? 'This seller has paused local delivery.'
        : 'This seller does not currently deliver interstate.',
    };
  }

  const zone = matchingZone(zones, input.destination);
  const rule = matchingRule(rules, input.destination, method, service, zone, input.pickup);
  const courier = method === 'THIRD_PARTY_COURIER'
    ? couriers.find((c) => c.id === input.courierId && c.enabled) ||
      couriers.filter((c) => c.enabled && c.mode === 'MANUAL').sort((a, b) => a.id - b.id)[0]
    : undefined;

  const distanceKm = input.distanceKm != null ? Math.max(0, input.distanceKm) : haversineKm(input.pickup, input.destination);
  const manualAbove = settings.manualQuoteAboveKm;
  const localTier = local ? matchingTier(tiers, distanceKm) : undefined;
  const outOfTier = local && distanceKm != null && manualAbove > 0 && distanceKm > manualAbove;

  const wantsManual =
    Boolean(rule?.manualQuote) ||
    (local && outOfTier && !rule) ||
    (!local && !rule && !settings.interstateBaseFee);

  if (wantsManual || (method === 'THIRD_PARTY_COURIER' && !courier && !rule)) {
    if (manualQuote) return manualQuoteResult(breakdown, method, service, manualQuote, courier?.name);
    return {
      requiresManualQuote: true,
      unavailableReason:
        'This route needs a manual courier quotation. Save the item or contact support for a delivery quote.',
    };
  }

  const totalWeight = input.items.reduce(
    (sum, item) => sum + (item.weightKg ?? seller?.defaultWeightKg ?? 1) * item.quantity,
    0
  );
  const oversized = input.items.some((item) => isOversized(item.dimensionsCm));

  let baseFee = 0;
  let distanceFee = 0;
  if (rule?.baseFee != null) {
    baseFee = rule.baseFee;
    distanceFee = (rule.perKmFee ?? 0) * (distanceKm ?? 0);
  } else if (method === 'THIRD_PARTY_COURIER' && courier) {
    baseFee = courier.baseFee;
    distanceFee = courier.perKmFee * (distanceKm ?? 0);
    if (service === 'EXPRESS') {
      baseFee *= courier.expressMultiplier;
      distanceFee *= courier.expressMultiplier;
    }
  } else if (local) {
    if (localTier) {
      distanceFee = localTier.fee;
    } else {
      baseFee = settings.localBaseFee;
      distanceFee = settings.perKmFee * (distanceKm ?? 0);
    }
  } else {
    baseFee = settings.interstateBaseFee;
    distanceFee = settings.interstatePerKmFee * (distanceKm ?? 0);
  }

  const weightFee = totalWeight * (rule?.weightPerKg ?? settings.weightSurchargePerKg);
  const sizeFee = oversized ? (rule?.oversizeSurcharge ?? settings.oversizeSurcharge) : 0;
  const zoneFee = zone?.surcharge ?? 0;
  const remoteFee = zone?.kind === 'REMOTE'
    ? (zone.surcharge > 0 ? 0 : rule?.remoteSurcharge ?? settings.remoteSurcharge)
    : 0;
  const handlingFee = rule?.handlingFee ?? settings.handlingFee;
  const platformFee = rule?.platformFee ?? settings.platformShippingFee;
  const serviceCharge = serviceFee(settings, service);

  const preDiscount = baseFee + distanceFee + weightFee + sizeFee + remoteFee + zoneFee + handlingFee + serviceCharge;
  const minFee = rule?.minFee ?? settings.minFee;
  const maxFee = rule?.maxFee ?? settings.maxFee;
  const afterClamp = clamp(preDiscount, minFee, maxFee);
  const scale = preDiscount > 0 ? afterClamp / preDiscount : 0;
  // Scale every delivery component so the admin's minimum/maximum is applied
  // to the actual charge, not just to the base + distance portion.
  const adjustedBaseFee = preDiscount === 0 ? afterClamp : baseFee * scale;
  const adjustedDistanceFee = distanceFee * scale;
  const adjustedWeightFee = weightFee * scale;
  const adjustedSizeFee = sizeFee * scale;
  const adjustedRemoteFee = remoteFee * scale;
  const adjustedZoneFee = zoneFee * scale;
  const adjustedHandlingFee = handlingFee * scale;

  const sellerThreshold = settings.sellerSponsoredShipping ? seller?.freeShippingThreshold : undefined;
  const ruleThreshold = rule?.freeShippingThreshold;
  const threshold = ruleThreshold ?? sellerThreshold ?? settings.freeShippingThreshold;
  const subtotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const freeByThreshold = threshold > 0 && subtotal >= threshold;
  const freeBySponsor =
    rule?.sellerSponsored ||
    rule?.platformSponsored ||
    (settings.platformSponsoredShipping && method !== 'THIRD_PARTY_COURIER');

  const rawTotal = afterClamp + platformFee;
  const freeShipping = freeByThreshold || freeBySponsor;
  const discount = freeShipping ? rawTotal : 0;
  const total = money(Math.max(0, rawTotal - discount));
  const eta = etaFor(settings, rule, seller, service, local);

  const breakdownResult: ShippingBreakdown = {
    ...breakdown,
    distanceKm,
    baseFee: money(adjustedBaseFee),
    distanceFee: money(adjustedDistanceFee),
    weightFee: money(adjustedWeightFee),
    sizeFee: money(adjustedSizeFee),
    remoteFee: money(adjustedRemoteFee),
    handlingFee: money(adjustedHandlingFee),
    platformFee: money(platformFee),
    zoneFee: money(adjustedZoneFee),
    discount: money(discount),
    total,
    ruleId: rule?.id,
    ruleName: rule?.name,
    zoneId: zone?.id,
    zoneName: zone?.name,
    courierName: courier?.name,
    etaMinDays: eta.min,
    etaMaxDays: eta.max,
    freeShipping,
    manualQuote: false,
  };

  return {
    requiresManualQuote: false,
    option: {
      method,
      service,
      label:
        method === 'THIRD_PARTY_COURIER'
          ? courier?.name || rule?.name || 'Third-party courier'
          : service === 'EXPRESS'
            ? 'Express delivery'
            : service === 'ECONOMY'
              ? 'Economy delivery'
              : 'Standard delivery',
      fee: total,
      etaMinDays: eta.min,
      etaMaxDays: eta.max,
      courierName: courier?.name,
      ruleName: rule?.name,
      freeShipping,
      manualQuote: false,
      breakdown: breakdownResult,
    },
  };
}

/** All methods a buyer can choose for one seller group. */
export function quoteSellerOptions(
  config: ShippingConfig,
  base: Omit<ShippingSellerInput, 'deliveryMethod' | 'service'> & {
    deliveryMethod: ShippingDeliveryMethod;
    service: ShippingServiceType;
  }
): { options: ShippingOption[]; selected?: ShippingOption; requiresManualQuote: boolean; message?: string; messages: string[] } {
  const methods: ShippingDeliveryMethod[] = ['GOODSALE_PARTNER', 'THIRD_PARTY_COURIER', 'PICKUP'];
  const options: ShippingOption[] = [];
  const messages: string[] = [];

  for (const method of methods) {
    if (method === 'PICKUP' && config.sellerSettings?.pickupEnabled === false) continue;
    const result = priceSellerShipping(config, { ...base, deliveryMethod: method, service: base.service });
    if (result.option) options.push(result.option);
    if (result.unavailableReason) messages.push(result.unavailableReason);
  }

  const selected =
    options.find((option) => option.method === base.deliveryMethod && option.service === base.service) ||
    options.find((option) => option.method === base.deliveryMethod) ||
    options[0];

  const selectedMethodResult = priceSellerShipping(config, {
    ...base,
    deliveryMethod: base.deliveryMethod,
    service: base.service,
  });

  return {
    options,
    selected,
    requiresManualQuote: selectedMethodResult.requiresManualQuote || !selected,
    message: selectedMethodResult.unavailableReason,
    messages: [...new Set(messages)],
  };
}

export function buildSellerQuoteGroup(
  config: ShippingConfig,
  base: Omit<ShippingSellerInput, 'deliveryMethod' | 'service'> & {
    deliveryMethod: ShippingDeliveryMethod;
    service: ShippingServiceType;
  }
): SellerShippingQuoteGroup {
  const result = quoteSellerOptions(config, base);
  const subtotal = base.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return {
    sellerId: base.sellerId,
    sellerName: base.sellerName,
    subtotal,
    items: base.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      title: item.title,
    })),
    options: result.options,
    selected: result.selected,
    requiresManualQuote: result.requiresManualQuote,
    message: result.message,
    unavailableReasons: result.messages,
  };
}

/** Maps product dimensions/weight into a shipping line item. */
export function productToLineItem(product: Product, quantity: number): ShippingLineItem {
  return {
    productId: product.id,
    sellerId: product.sellerId,
    title: product.title,
    quantity,
    price: product.price,
    weightKg: product.weightKg,
    dimensionsCm: product.dimensionsCm,
  };
}
