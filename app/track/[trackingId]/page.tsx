import type { Metadata } from 'next';
import ShipmentTrackingPage from '@/components/tracking/ShipmentTrackingPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}): Promise<Metadata> {
  const { trackingId } = await params;
  const id = decodeURIComponent(trackingId);
  return {
    title: `Track ${id}`,
    description: 'Follow a GoodSale shipment with real delivery milestones and live rider tracking when available.',
    robots: { index: false, follow: false },
  };
}

export default async function TrackShipmentPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;
  return <ShipmentTrackingPage trackingId={decodeURIComponent(trackingId)} />;
}
