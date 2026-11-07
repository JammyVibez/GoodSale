import type {
  DeliveryStatus,
  DeliveryTrackingView,
  ShipmentTrackingEvent,
  ShipmentTrackingResult,
  ShipmentTrackingRider,
  ShipmentTrackingSibling,
} from '@/lib/types';

type Raw = Record<string, unknown>;

const str = (value: unknown, fallback = ''): string =>
  value == null ? fallback : String(value);
const num = (value: unknown): number | undefined => {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function mapTrackingResult(raw: Raw): ShipmentTrackingResult {
  const destination = (raw.destination || {}) as Raw;
  const order = raw.order as Raw | null;
  const rider = raw.rider as Raw | null;
  const live = raw.live as Raw | null;

  return {
    found: Boolean(raw.found),
    deliveryId: Number(raw.delivery_id || 0),
    trackingId: str(raw.tracking_id),
    deliveryNumber: str(raw.delivery_number),
    orderNumber: str(raw.order_number),
    checkoutGroupId: str(raw.checkout_group_id),
    status: str(raw.status, 'AWAITING_SELLER_PREPARATION') as DeliveryStatus,
    deliveryMethod: str(raw.delivery_method, 'GOODSALE_PARTNER'),
    serviceType: (['ECONOMY', 'STANDARD', 'EXPRESS'].includes(str(raw.service_type, 'STANDARD'))
      ? str(raw.service_type, 'STANDARD')
      : 'STANDARD') as ShipmentTrackingResult['serviceType'],
    courierName: str(raw.courier_name),
    courierTrackingNumber: str(raw.courier_tracking_number),
    estimatedDeliveryDate: raw.estimated_delivery_date ? str(raw.estimated_delivery_date) : undefined,
    createdAt: str(raw.created_at),
    deliveredAt: raw.delivered_at ? str(raw.delivered_at) : undefined,
    confirmedAt: raw.confirmed_at ? str(raw.confirmed_at) : undefined,
    cancelledAt: raw.cancelled_at ? str(raw.cancelled_at) : undefined,
    lastUpdated: str(raw.last_updated),
    authorized: Boolean(raw.authorized),
    accessLevel: str(raw.access_level, 'PUBLIC') as ShipmentTrackingResult['accessLevel'],
    viewerRole: str(raw.viewer_role) as ShipmentTrackingResult['viewerRole'],
    destination: {
      address: str(destination.address),
      city: str(destination.city),
      state: str(destination.state),
      phone: str(destination.phone),
      instructions: str(destination.instructions),
      lat: num(destination.lat),
      lng: num(destination.lng),
    },
    events: Array.isArray(raw.events)
      ? (raw.events as Raw[]).map((event): ShipmentTrackingEvent => ({
          id: Number(event.id || 0),
          status: str(event.status, 'AWAITING_SELLER_PREPARATION') as DeliveryStatus,
          note: str(event.note),
          actorRole: str(event.actor_role),
          createdAt: str(event.created_at),
        }))
      : [],
    rider: rider
      ? ({
          id: Number(rider.id || 0),
          name: str(rider.name),
          photoUrl: str(rider.photo_url),
          phone: str(rider.phone),
          vehicleType: str(rider.vehicle_type),
          vehicle: str(rider.vehicle),
          plateNumber: str(rider.plate_number),
          rating: Number(rider.rating || 0),
          completedDeliveries: Number(rider.completed_deliveries || 0),
          trustScore: Number(rider.trust_score || 0),
        } satisfies ShipmentTrackingRider)
      : null,
    live: live
      ? ({
          deliveryId: Number(live.delivery_id || 0),
          deliveryNumber: str(live.delivery_number),
          status: str(live.status) as DeliveryStatus,
          assignmentStatus: str(live.assignment_status, 'UNASSIGNED') as DeliveryTrackingView['assignmentStatus'],
          trackingActive: Boolean(live.tracking_active),
          trackingStatus: str(live.tracking_status, 'UNAVAILABLE') as DeliveryTrackingView['trackingStatus'],
          reason: str(live.reason),
          lastUpdated: live.last_updated ? str(live.last_updated) : undefined,
          riderLocation: live.rider_location
            ? {
                lat: Number((live.rider_location as Raw).lat),
                lng: Number((live.rider_location as Raw).lng),
                accuracyM: num((live.rider_location as Raw).accuracy_m),
                speedKmh: num((live.rider_location as Raw).speed_kmh),
                headingDegrees: num((live.rider_location as Raw).heading_degrees),
              }
            : undefined,
          destination: live.destination
            ? {
                lat: Number((live.destination as Raw).lat),
                lng: Number((live.destination as Raw).lng),
              }
            : undefined,
          pickup: live.pickup
            ? {
                lat: Number((live.pickup as Raw).lat),
                lng: Number((live.pickup as Raw).lng),
              }
            : undefined,
          routeDistanceKm: num(live.route_distance_km),
          routeDurationMinutes: num(live.route_duration_minutes),
          routeProvider: str(live.route_provider),
          routeIsEstimate: Boolean(live.route_is_estimate),
        } satisfies DeliveryTrackingView)
      : null,
    order: order
      ? {
          id: Number(order.id || 0),
          orderNumber: str(order.order_number),
          checkoutGroupId: str(order.checkout_group_id),
          productTitle: str(order.product_title),
          productImage: str(order.product_image),
          totalAmount: Number(order.total_amount || 0),
          deliveryFee: Number(order.delivery_fee || 0),
          paymentMethod: str(order.payment_method),
          status: str(order.status),
          createdAt: str(order.created_at),
          deliveredAt: order.delivered_at ? str(order.delivered_at) : undefined,
          confirmedAt: order.confirmed_at ? str(order.confirmed_at) : undefined,
        }
      : null,
    shipments: Array.isArray(raw.shipments)
      ? (raw.shipments as Raw[]).map((shipment): ShipmentTrackingSibling => ({
          trackingId: str(shipment.tracking_id),
          status: str(shipment.status, 'AWAITING_SELLER_PREPARATION') as DeliveryStatus,
          sellerName: str(shipment.seller_name),
          productTitle: str(shipment.product_title),
          isCurrent: Boolean(shipment.is_current),
        }))
      : [],
    sellerName: str(raw.seller_name),
    deliveryPin: raw.delivery_pin ? str(raw.delivery_pin) : null,
    canConfirmReceipt: Boolean(raw.can_confirm_receipt),
    canReportIssue: Boolean(raw.can_report_issue),
  };
}
