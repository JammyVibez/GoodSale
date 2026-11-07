/**
 * Extensible courier adapter boundary.
 *
 * Admin-configured courier rates are the default price source. A real provider
 * adapter can be registered here once its API credentials are available. No
 * adapter fabricates rates, tracking numbers or delivery events: unavailable
 * providers surface an explicit error and fall back to an admin manual quote.
 */
import type { ShippingCourier } from '@/lib/types';

export interface CourierQuoteRequest {
  pickupAddress: string;
  pickupCity: string;
  pickupState: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryLat?: number;
  deliveryLng?: number;
  weightKg: number;
  dimensionsCm?: string;
  service: 'ECONOMY' | 'STANDARD' | 'EXPRESS';
}

export interface CourierQuote {
  provider: string;
  amount: number;
  currency: 'NGN';
  etaMinDays: number;
  etaMaxDays: number;
  quoteReference: string;
}

export interface CourierShipmentRequest extends CourierQuoteRequest {
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
}

export interface CourierShipment {
  provider: string;
  trackingNumber: string;
  labelUrl?: string;
  externalShipmentId?: string;
}

export interface CourierTrackingEvent {
  status: string;
  note?: string;
  occurredAt: string;
  location?: string;
}

export class CourierUnavailableError extends Error {
  constructor(message = 'This courier provider is not configured. Use an administrator manual quotation.') {
    super(message);
    this.name = 'CourierUnavailableError';
  }
}

export interface CourierAdapter {
  readonly provider: string;
  readonly live: boolean;
  quote(request: CourierQuoteRequest): Promise<CourierQuote>;
  createShipment(request: CourierShipmentRequest): Promise<CourierShipment>;
  getTracking(trackingNumber: string): Promise<CourierTrackingEvent[]>;
  handleDeliveryUpdate(payload: unknown): Promise<{ trackingNumber: string; event: CourierTrackingEvent } | null>;
}

/**
 * Manual mode never pretends to be a courier. Fees come from admin rates or an
 * admin-managed quotation; shipment/tracking calls require a registered adapter.
 */
export class ManualCourierAdapter implements CourierAdapter {
  readonly provider = 'manual';
  readonly live = false;
  async quote(): Promise<CourierQuote> {
    throw new CourierUnavailableError();
  }
  async createShipment(): Promise<CourierShipment> {
    throw new CourierUnavailableError('Create this shipment with the courier, then record its tracking number.');
  }
  async getTracking(): Promise<CourierTrackingEvent[]> {
    throw new CourierUnavailableError('No live tracking is available for a manually booked courier.');
  }
  async handleDeliveryUpdate(): Promise<null> {
    return null;
  }
}

const registry = new Map<string, CourierAdapter>();
const manualAdapter = new ManualCourierAdapter();

export function registerCourierAdapter(provider: string, adapter: CourierAdapter) {
  registry.set(provider.trim().toLowerCase(), adapter);
}

export function getCourierAdapter(courier?: Pick<ShippingCourier, 'mode' | 'apiProvider'>): CourierAdapter {
  if (!courier || courier.mode !== 'AUTO' || !courier.apiProvider) return manualAdapter;
  return registry.get(courier.apiProvider.trim().toLowerCase()) || manualAdapter;
}

export function hasLiveCourierAdapter(provider?: string): boolean {
  return Boolean(provider && registry.has(provider.trim().toLowerCase()));
}

// ---------------------------------------------------------------------------
// Generic HTTP courier adapter
// ---------------------------------------------------------------------------
// This is a real server-side adapter for a courier whose REST contract matches
// the documented shape below. Credentials are read from server env only. If
// they are absent we return null and the UI must keep the manual fallback; no
// tracking number or delivery event is ever fabricated.

export type CourierApiConfig = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  createPath: string;
  trackingPath: string;
  webhookSecret: string;
};

export function getCourierApiConfig(): CourierApiConfig | null {
  const baseUrl = (process.env.COURIER_API_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.COURIER_API_KEY || '';
  if (!baseUrl || !apiKey) return null;
  return {
    provider: (process.env.COURIER_PROVIDER_CODE || 'custom').trim().toLowerCase(),
    baseUrl,
    apiKey,
    createPath: process.env.COURIER_CREATE_PATH || '/shipments',
    trackingPath: process.env.COURIER_TRACKING_PATH || '/tracking/{trackingNumber}',
    webhookSecret: process.env.COURIER_WEBHOOK_SECRET || '',
  };
}

type HttpCourierShipmentResponse = {
  id?: string;
  shipmentId?: string;
  trackingNumber?: string;
  tracking_number?: string;
  labelUrl?: string;
  label_url?: string;
};

type HttpCourierTrackingResponse = {
  events?: {
    id?: string;
    eventId?: string;
    status?: string;
    note?: string;
    occurredAt?: string;
    occurred_at?: string;
    location?: string;
  }[];
};

export class HttpCourierAdapter implements CourierAdapter {
  readonly live = true;
  readonly provider: string;
  private config: CourierApiConfig;

  constructor(config: CourierApiConfig) {
    this.config = config;
    this.provider = config.provider;
  }

  async quote(): Promise<CourierQuote> {
    throw new CourierUnavailableError(
      'This courier adapter does not provide live quotes. Use the configured courier rate card.'
    );
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const url = `${this.config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
          },
        });
        const text = await res.text();
        const payload = text ? (JSON.parse(text) as unknown) : null;
        if (res.ok) return payload;
        lastError = new Error(
          `Courier API ${res.status}: ${
            payload && typeof payload === 'object' && 'message' in payload
              ? String((payload as { message?: unknown }).message)
              : 'request failed'
          }`
        );
        if (res.status !== 429 && res.status < 500) throw lastError;
      } catch (error) {
        lastError = error;
        if (error instanceof Error && error.message.includes('Courier API 4')) break;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * 2 ** attempt));
    }
    throw lastError instanceof Error ? lastError : new Error('Courier API request failed');
  }

  async createShipment(request: CourierShipmentRequest): Promise<CourierShipment> {
    const payload = await this.request(this.config.createPath, {
      method: 'POST',
      body: JSON.stringify({
        reference: request.orderNumber,
        orderId: request.orderId,
        service: request.service,
        pickup: {
          address: request.pickupAddress,
          city: request.pickupCity,
          state: request.pickupState,
          lat: request.pickupLat,
          lng: request.pickupLng,
        },
        delivery: {
          address: request.deliveryAddress,
          city: request.deliveryCity,
          state: request.deliveryState,
          lat: request.deliveryLat,
          lng: request.deliveryLng,
        },
        customer: {
          name: request.customerName,
          phone: request.customerPhone,
        },
        weightKg: request.weightKg,
        dimensionsCm: request.dimensionsCm,
      }),
    });
    const data = (payload || {}) as HttpCourierShipmentResponse;
    const trackingNumber = String(data.trackingNumber || data.tracking_number || '').trim();
    if (!trackingNumber) {
      throw new Error('Courier API did not return a tracking number');
    }
    return {
      provider: this.provider,
      trackingNumber,
      labelUrl: data.labelUrl || data.label_url || undefined,
      externalShipmentId: data.id || data.shipmentId || undefined,
    };
  }

  async getTracking(trackingNumber: string): Promise<CourierTrackingEvent[]> {
    const path = this.config.trackingPath.replace('{trackingNumber}', encodeURIComponent(trackingNumber));
    const payload = (await this.request(path)) as HttpCourierTrackingResponse;
    return (payload?.events || [])
      .filter((event) => event.status)
      .map((event) => ({
        status: String(event.status || ''),
        note: event.note ? String(event.note) : undefined,
        occurredAt: String(event.occurredAt || event.occurred_at || new Date().toISOString()),
        location: event.location ? String(event.location) : undefined,
      }));
  }

  async handleDeliveryUpdate(payload: unknown): Promise<{ trackingNumber: string; event: CourierTrackingEvent } | null> {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as {
      trackingNumber?: string;
      tracking_number?: string;
      status?: string;
      note?: string;
      occurredAt?: string;
      location?: string;
    };
    const trackingNumber = String(data.trackingNumber || data.tracking_number || '').trim();
    if (!trackingNumber || !data.status) return null;
    return {
      trackingNumber,
      event: {
        status: String(data.status),
        note: data.note ? String(data.note) : undefined,
        occurredAt: data.occurredAt || new Date().toISOString(),
        location: data.location ? String(data.location) : undefined,
      },
    };
  }
}

export function getConfiguredCourierAdapter(): HttpCourierAdapter | null {
  const config = getCourierApiConfig();
  return config ? new HttpCourierAdapter(config) : null;
}

export function courierIntegrationStatus() {
  const config = getCourierApiConfig();
  return {
    configured: Boolean(config),
    provider: config?.provider || '',
    trackingSync: Boolean(config),
    webhookConfigured: Boolean(config?.webhookSecret),
  };
}
