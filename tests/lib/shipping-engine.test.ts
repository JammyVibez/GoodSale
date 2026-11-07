import { describe, expect, it } from 'vitest';
import {
  buildSellerQuoteGroup,
  priceSellerShipping,
  type ShippingConfig,
  type ShippingSellerInput,
} from '@/lib/shipping/engine';
import { DEFAULT_SHIPPING_SETTINGS, DEFAULT_SHIPPING_TIERS } from '@/lib/data/empty-state';
import type { ShippingCourier, ShippingManualQuote, ShippingZone } from '@/lib/types';

const zone: ShippingZone = {
  id: 1,
  name: 'Lekki remote',
  state: 'Lagos State',
  city: 'Lekki',
  kind: 'REMOTE',
  surcharge: 1000,
  enabled: true,
  priority: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const courier: ShippingCourier = {
  id: 1,
  name: 'GIG Logistics',
  code: 'GIG',
  mode: 'MANUAL',
  enabled: true,
  baseFee: 2000,
  perKmFee: 100,
  expressMultiplier: 1.5,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function config(overrides: Partial<ShippingConfig> = {}): ShippingConfig {
  return {
    settings: { ...DEFAULT_SHIPPING_SETTINGS },
    tiers: DEFAULT_SHIPPING_TIERS.map((tier) => ({ ...tier })),
    zones: [],
    rules: [],
    couriers: [],
    ...overrides,
  };
}

function input(overrides: Partial<ShippingSellerInput> = {}): ShippingSellerInput {
  return {
    sellerId: 7,
    sellerName: 'Seller Seven',
    pickup: { address: '12 Allen Ave', city: 'Ikeja', state: 'Lagos State' },
    items: [{ productId: 1, sellerId: 7, quantity: 1, price: 25000, weightKg: 1 }],
    destination: { address: '5 Admiralty Way', city: 'Ikeja', state: 'Lagos State' },
    distanceKm: 2,
    deliveryMethod: 'GOODSALE_PARTNER',
    service: 'STANDARD',
    ...overrides,
  };
}

describe('shipping engine — local pricing', () => {
  it('uses the seeded 0–3 km tier instead of a hardcoded checkout fee', () => {
    const result = priceSellerShipping(config(), input({ distanceKm: 2 }));
    expect(result.requiresManualQuote).toBe(false);
    expect(result.option?.fee).toBe(1000);
    expect(result.option?.breakdown.distanceFee).toBe(1000);
  });

  it('uses the 3–7 km tier and adds configured weight surcharges', () => {
    const result = priceSellerShipping(
      config({ settings: { ...DEFAULT_SHIPPING_SETTINGS, weightSurchargePerKg: 200 } }),
      input({
        distanceKm: 5,
        items: [{ productId: 1, sellerId: 7, quantity: 2, price: 25000, weightKg: 3 }],
      })
    );
    expect(result.option?.fee).toBe(2700); // 1,500 tier + (6kg × ₦200)
    expect(result.option?.breakdown.weightFee).toBe(1200);
  });

  it('applies the admin min/max clamp to the delivery components', () => {
    const result = priceSellerShipping(
      config({ settings: { ...DEFAULT_SHIPPING_SETTINGS, maxFee: 900 } }),
      input({ distanceKm: 5 })
    );
    expect(result.option?.fee).toBe(900);
  });

  it('changes price immediately when an admin edits a tier', () => {
    const edited = DEFAULT_SHIPPING_TIERS.map((tier) =>
      tier.id === 1 ? { ...tier, fee: 1800 } : { ...tier }
    );
    const result = priceSellerShipping(config({ tiers: edited }), input({ distanceKm: 2 }));
    expect(result.option?.fee).toBe(1800);
  });
});

describe('shipping engine — interstate and unsupported routes', () => {
  it('prices interstate delivery from base + per-km and clamps the maximum', () => {
    const result = priceSellerShipping(
      config(),
      input({
        destination: { address: 'Wuse II', city: 'Abuja', state: 'FCT' },
        distanceKm: 700,
      })
    );
    expect(result.option?.fee).toBe(50000); // 3,500 + 70,000, capped at 50,000
  });

  it('returns a manual quotation request above 15 km with no matching tier', () => {
    const result = priceSellerShipping(config(), input({ distanceKm: 20 }));
    expect(result.option).toBeUndefined();
    expect(result.requiresManualQuote).toBe(true);
  });

  it('uses a genuine admin manual quote when one exists for the route', () => {
    const manual: ShippingManualQuote = {
      id: 4,
      sellerId: 7,
      state: 'Lagos State',
      city: 'Ikeja',
      amount: 7000,
      etaMinDays: 1,
      etaMaxDays: 3,
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const result = priceSellerShipping(
      config({ manualQuotes: [manual] }),
      input({ distanceKm: 20, deliveryMethod: 'THIRD_PARTY_COURIER' })
    );
    expect(result.requiresManualQuote).toBe(false);
    expect(result.option?.fee).toBe(7000);
    expect(result.option?.manualQuote).toBe(true);
  });

  it('refuses to invent a rate when the seller has paused interstate delivery', () => {
    const result = priceSellerShipping(
      config({
        sellerSettings: {
          sellerId: 7,
          pickupAddress: '12 Allen Ave',
          pickupCity: 'Ikeja',
          pickupState: 'Lagos State',
          handlingDays: 1,
          localEnabled: true,
          interstateEnabled: false,
          pickupEnabled: true,
          defaultWeightKg: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
      input({ destination: { address: 'Wuse II', city: 'Abuja', state: 'FCT' }, distanceKm: 700 })
    );
    expect(result.option).toBeUndefined();
    expect(result.unavailableReason).toMatch(/interstate/i);
  });
});

describe('shipping engine — promotions and couriers', () => {
  it('honours a free-shipping threshold', () => {
    const result = priceSellerShipping(
      config({ settings: { ...DEFAULT_SHIPPING_SETTINGS, freeShippingThreshold: 20000 } }),
      input({ distanceKm: 5 })
    );
    expect(result.option?.freeShipping).toBe(true);
    expect(result.option?.fee).toBe(0);
    expect(result.option?.breakdown.discount).toBeGreaterThan(0);
  });

  it('ignores seller free-shipping thresholds when the platform disables sponsorship', () => {
    const result = priceSellerShipping(
      config({
        settings: { ...DEFAULT_SHIPPING_SETTINGS, sellerSponsoredShipping: false },
        sellerSettings: {
          sellerId: 7,
          pickupAddress: '12 Allen Ave',
          pickupCity: 'Ikeja',
          pickupState: 'Lagos State',
          handlingDays: 1,
          localEnabled: true,
          interstateEnabled: true,
          pickupEnabled: true,
          freeShippingThreshold: 20000,
          defaultWeightKg: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
      input({
        distanceKm: 5,
        items: [{ productId: 1, sellerId: 7, quantity: 1, price: 25000 }],
      })
    );
    expect(result.option?.fee).toBeGreaterThan(0);
  });

  it('honours a seller-sponsored free-shipping threshold when sponsorship is enabled', () => {
    const result = priceSellerShipping(
      config({
        sellerSettings: {
          sellerId: 7,
          pickupAddress: '12 Allen Ave',
          pickupCity: 'Ikeja',
          pickupState: 'Lagos State',
          handlingDays: 1,
          localEnabled: true,
          interstateEnabled: true,
          pickupEnabled: true,
          freeShippingThreshold: 20000,
          defaultWeightKg: 1,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
      input({ distanceKm: 5 })
    );
    expect(result.option?.fee).toBe(0);
    expect(result.option?.freeShipping).toBe(true);
  });

  it('uses an admin courier rate card for third-party delivery', () => {
    const result = priceSellerShipping(
      config({ couriers: [courier] }),
      input({ distanceKm: 10, deliveryMethod: 'THIRD_PARTY_COURIER', courierId: 1 })
    );
    expect(result.option?.fee).toBe(3000); // ₦2,000 base + 10 km × ₦100
    expect(result.option?.courierName).toBe('GIG Logistics');
  });

  it('never fabricates a third-party rate without a courier or rule', () => {
    const result = priceSellerShipping(
      config(),
      input({ distanceKm: 5, deliveryMethod: 'THIRD_PARTY_COURIER' })
    );
    expect(result.option).toBeUndefined();
    expect(result.requiresManualQuote).toBe(true);
  });

  it('applies zone surcharges and higher-priority zone rules', () => {
    const result = priceSellerShipping(
      config({
        zones: [zone],
        rules: [{
          id: 9,
          name: 'Lekki zone rate',
          enabled: true,
          priority: 50,
          scope: 'ZONE',
          zoneId: 1,
          state: 'Lagos State',
          city: 'Lekki',
          deliveryMethod: 'ANY',
          serviceType: 'ANY',
          baseFee: 4000,
          sellerSponsored: false,
          platformSponsored: false,
          manualQuote: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        }],
      }),
      input({ destination: { address: 'Admiralty', city: 'Lekki', state: 'Lagos State' }, distanceKm: 2 })
    );
    expect(result.option?.fee).toBe(5000); // zone rule base 4,000 + zone surcharge 1,000
    expect(result.option?.breakdown.ruleName).toBe('Lekki zone rate');
  });
});

describe('shipping engine — origin/destination pairs', () => {
  it('matches a state-to-state rule only when the seller origin matches', () => {
    const rule = {
      id: 12,
      name: 'Abuja → Lagos interstate',
      enabled: true,
      priority: 20,
      scope: 'STATE' as const,
      state: 'Lagos State',
      city: '',
      originState: 'Abuja',
      originCity: '',
      deliveryMethod: 'ANY' as const,
      serviceType: 'ANY' as const,
      baseFee: 9000,
      sellerSponsored: false,
      platformSponsored: false,
      manualQuote: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const matched = priceSellerShipping(
      config({ rules: [rule] }),
      input({
        pickup: { address: 'Kubwa', city: 'Kubwa', state: 'Abuja' },
        destination: { address: 'Ikeja', city: 'Ikeja', state: 'Lagos State' },
        distanceKm: 700,
      })
    );
    expect(matched.option?.fee).toBe(9000);

    const nonMatchingOrigin = priceSellerShipping(
      config({ rules: [rule] }),
      input({
        pickup: { address: 'Ikeja', city: 'Ikeja', state: 'Lagos State' },
        destination: { address: 'Lekki', city: 'Lekki', state: 'Lagos State' },
        distanceKm: 5,
      })
    );
    expect(nonMatchingOrigin.option?.fee).not.toBe(9000);
  });
});

describe('shipping engine — multi-seller carts', () => {
  it('prices each seller independently and combines the fees', () => {
    const first = buildSellerQuoteGroup(config(), input({ sellerId: 7, distanceKm: 2 }));
    const second = buildSellerQuoteGroup(
      config(),
      input({
        sellerId: 8,
        sellerName: 'Seller Eight',
        pickup: { city: 'Ikeja', state: 'Lagos State' },
        distanceKm: 5,
        items: [{ productId: 2, sellerId: 8, quantity: 1, price: 15000 }],
      })
    );
    expect(first.selected?.fee).toBe(1000);
    expect(second.selected?.fee).toBe(1500);
    expect((first.selected?.fee || 0) + (second.selected?.fee || 0)).toBe(2500);
  });
});
