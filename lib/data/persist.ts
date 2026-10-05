/**
 * Fire-and-forget Supabase persistence helpers for marketplace writes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';

export function withClient(fn: (client: SupabaseClient) => Promise<void>) {
  const client = createClient();
  if (!client) return;
  void fn(client).catch((err) => logger.warn('Persist failed', { error: String(err) }));
}

export async function insertBid(
  client: SupabaseClient,
  bid: {
    auctionId: number;
    userId: number;
    amount: number;
  }
) {
  const { error } = await client.from('bids').insert({
    auction_id: bid.auctionId,
    user_id: bid.userId,
    amount: bid.amount,
  });
  if (error) throw error;
}

export async function insertReview(
  client: SupabaseClient,
  review: {
    orderId?: number;
    productId?: number;
    reviewerId: number;
    revieweeId?: number;
    rating: number;
    comment: string;
  }
) {
  const { error } = await client.from('reviews').insert({
    order_id: review.orderId ?? null,
    product_id: review.productId ?? null,
    reviewer_id: review.reviewerId,
    reviewee_id: review.revieweeId ?? null,
    rating: review.rating,
    comment: review.comment,
    is_helpful_votes: 0,
  });
  if (error) throw error;
}

export async function upsertSafeMeetMeetup(
  client: SupabaseClient,
  meetup: {
    id?: number;
    orderId: number;
    locationId: number;
    scheduledAt: string;
    status: string;
    buyerConfirmedArrival: boolean;
    sellerConfirmedArrival: boolean;
  }
) {
  const payload: Record<string, unknown> = {
    order_id: meetup.orderId,
    location_id: meetup.locationId,
    scheduled_at: meetup.scheduledAt,
    status: meetup.status,
    buyer_confirmed_arrival: meetup.buyerConfirmedArrival,
    seller_confirmed_arrival: meetup.sellerConfirmedArrival,
  };
  if (meetup.id && meetup.id > 0) payload.id = meetup.id;
  const { error } = await client.from('safe_meet_meetups').upsert(payload, { onConflict: 'order_id' });
  if (error) {
    // Fallback without unique on order_id
    const { error: insErr } = await client.from('safe_meet_meetups').insert(payload);
    if (insErr) throw insErr;
  }
}

export async function updateSafeMeetMeetup(
  client: SupabaseClient,
  meetupId: number,
  patch: Record<string, unknown>
) {
  const { error } = await client.from('safe_meet_meetups').update(patch).eq('id', meetupId);
  if (error) throw error;
}

export async function insertSponsoredAd(
  client: SupabaseClient,
  ad: {
    sellerId: number;
    type: string;
    targetId: number;
    title: string;
    budget: number;
    bannerUrl?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    ctaText?: string;
    clickView?: string;
    placements?: string[];
  }
) {
  const { error } = await client.from('sponsored_ads').insert({
    seller_id: ad.sellerId,
    type: ad.type,
    target_id: ad.targetId,
    title: ad.title,
    budget: ad.budget,
    banner_url: ad.bannerUrl || '',
    media_url: ad.mediaUrl || '',
    media_type: ad.mediaType || 'image',
    cta_text: ad.ctaText || '',
    click_view: ad.clickView || '',
    placements: ad.placements || ['HOME'],
    status: 'ACTIVE',
    spent: 0,
    clicks: 0,
    impressions: 0,
  });
  if (error) throw error;
}

/** Admin writes a new announcement that pops up for users on app entry. */
export async function insertAnnouncement(
  client: SupabaseClient,
  a: {
    title: string;
    body: string;
    kind: string;
    audience: string;
    imageUrl?: string;
    isActive?: boolean;
  }
) {
  const { error } = await client.from('announcements').insert({
    title: a.title,
    body: a.body,
    kind: a.kind,
    audience: a.audience,
    image_url: a.imageUrl || '',
    is_active: a.isActive ?? true,
  });
  if (error) throw error;
}

export async function updateAnnouncement(
  client: SupabaseClient,
  id: number,
  patch: { is_active?: boolean }
) {
  const { error } = await client.from('announcements').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteAnnouncementById(client: SupabaseClient, id: number) {
  const { error } = await client.from('announcements').delete().eq('id', id);
  if (error) throw error;
}

/** Persist live stats/management changes back to an existing ad row. */
export async function updateSponsoredAd(
  client: SupabaseClient,
  id: number,
  patch: Partial<{
    title: string;
    status: string;
    budget: number;
    spent: number;
    clicks: number;
    impressions: number;
    media_url: string;
    media_type: string;
    cta_text: string;
    click_view: string;
    placements: string[];
    banner_url: string;
  }>
) {
  const { error } = await client.from('sponsored_ads').update(patch).eq('id', id);
  if (error) throw error;
}

export async function insertBundle(
  client: SupabaseClient,
  bundle: {
    sellerId: number;
    title: string;
    description: string;
    productIds: number[];
    price: number;
    discountPercentage: number;
    quantity: number;
  }
) {
  const { error } = await client.from('product_bundles').insert({
    seller_id: bundle.sellerId,
    title: bundle.title,
    description: bundle.description,
    product_ids: bundle.productIds,
    price: bundle.price,
    discount_percentage: bundle.discountPercentage,
    quantity: bundle.quantity,
  });
  if (error) throw error;
}

export async function upsertRevenueSettings(client: SupabaseClient, settings: Record<string, unknown>) {
  const { data: existing } = await client.from('revenue_settings').select('id').order('id').limit(1).maybeSingle();
  if (existing?.id) {
    const { error } = await client.from('revenue_settings').update(settings).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await client.from('revenue_settings').insert(settings);
    if (error) throw error;
  }
}

export async function upsertPaymentSettings(client: SupabaseClient, settings: Record<string, unknown>) {
  const { data: existing } = await client.from('payment_settings').select('id').order('id').limit(1).maybeSingle();
  if (existing?.id) {
    const { error } = await client.from('payment_settings').update(settings).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await client.from('payment_settings').insert(settings);
    if (error) throw error;
  }
}

export async function insertNotification(
  client: SupabaseClient,
  n: { userId: number; title: string; message: string; type: string }
) {
  const { error } = await client.from('notifications').insert({
    user_id: n.userId,
    title: n.title,
    message: n.message,
    type: n.type,
    is_read: false,
  });
  if (error) throw error;
}

export async function insertFeaturedListing(
  client: SupabaseClient,
  row: { productId: number; sellerId: number; featureType: string; startsAt: string; endsAt: string; amountPaid: number }
) {
  const { error } = await client.from('featured_listings').insert({
    product_id: row.productId,
    seller_id: row.sellerId,
    feature_type: row.featureType,
    starts_at: row.startsAt,
    ends_at: row.endsAt,
    amount_paid: row.amountPaid,
    status: 'ACTIVE',
  });
  if (error) throw error;
}
