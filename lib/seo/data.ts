/**
 * Server-side public catalog reader for SEO routes.
 *
 * Uses the service-role client only on the server (never bundled to the
 * browser) so sitemaps and crawler HTML are complete even when anonymous RLS
 * policies are restrictive. Only public marketplace fields leave this module —
 * never emails, phones, messages, orders, verification documents or wallets.
 */
import { cache } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { categorySlug } from './site';

export interface SeoReview {
  id: number;
  rating: number;
  comment: string;
  author: string;
  createdAt: string;
}

export interface SeoProduct {
  id: number;
  title: string;
  description: string;
  category: string;
  categorySlug: string;
  brand: string;
  condition: string;
  price: number;
  compareAtPrice?: number;
  stockStatus: string;
  quantity: number;
  inStock: boolean;
  images: string[];
  sellerId: number;
  sellerName: string;
  sellerUsername: string;
  sellerVerified: boolean;
  sellerCity: string;
  sellerState: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  deliveryMethod: string;
  warranty?: string;
  returnPolicy?: string;
  rating: number | null;
  reviewCount: number;
  reviews: SeoReview[];
}

export interface SeoStore {
  id: number;
  name: string;
  username: string;
  role: string;
  verified: boolean;
  business: boolean;
  bio: string;
  photoUrl: string;
  city: string;
  state: string;
  businessName?: string;
  businessDescription?: string;
  businessAddress?: string;
  openingHours?: string;
  logoUrl?: string;
  bannerUrl?: string;
  joinedAt: string;
  productCount: number;
  rating: number | null;
  reviewCount: number;
  reviews: SeoReview[];
}

export interface SeoCategory {
  name: string;
  slug: string;
  count: number;
  sampleImage?: string;
}

type Row = Record<string, unknown>;

const SELLER_ROLES = new Set(['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS']);

/**
 * The public badge is driven by profiles.verification_status (migration 024),
 * which only GoodSale reviewers can change. The role/business flags remain a
 * fallback for records created before that migration.
 */
function publicVerified(status: unknown, expiresAt: unknown): boolean {
  if (String(status || '').toUpperCase() !== 'VERIFIED') return false;
  if (!expiresAt) return true;
  const expires = new Date(String(expiresAt)).getTime();
  return Number.isFinite(expires) ? expires > Date.now() : true;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function ratingStats(reviews: SeoReview[]) {
  const rated = reviews.filter((r) => r.rating > 0);
  if (!rated.length) return { rating: null as number | null, reviewCount: 0 };
  return {
    rating: Number((rated.reduce((sum, r) => sum + r.rating, 0) / rated.length).toFixed(1)),
    reviewCount: rated.length,
  };
}

function mapReview(row: Row): SeoReview {
  return {
    id: num(row.id),
    rating: num(row.rating),
    comment: str(row.comment),
    author: str(row.reviewer_name, 'GoodSale buyer'),
    createdAt: str(row.created_at, new Date().toISOString()),
  };
}

function publicCatalogClient(): SupabaseClient | null {
  const admin = createAdminClient();
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  // Fallback for deployments without a service key: read through RLS with the
  // anonymous key so public catalog pages and the sitemap still render.
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

const loadSnapshot = cache(async () => {
  const client = publicCatalogClient();
  if (!client) return { products: [] as Row[], profiles: [] as Row[], businesses: [] as Row[], reviews: [] as Row[], featured: [] as Row[] };

  // Select only public catalog columns. Profile email, phone, address and
  // preferences must never be fetched into a public page or its RSC payload.
  const [products, profiles, businesses, reviews, featured] = await Promise.all([
    // Products contain no private account data. `*` keeps this resilient to
    // optional migrations (for example moderation_status / compare_at_price)
    // while the mapper below reads only public marketing fields.
    client.from('products').select('*').limit(1000),
    client
      .from('profiles')
      .select('id, full_name, username, role, photo_url, bio, city, state, created_at, verification_status, verification_expires_at')
      .in('role', ['SELLER', 'VERIFIED_SELLER', 'BUSINESS', 'VERIFIED_BUSINESS'])
      .limit(1000),
    client
      .from('businesses')
      .select('owner_id, name, description, opening_hours, address, city, state, logo_url, banner_url, is_verified, rating, reviews_count')
      .limit(500),
    client
      .from('reviews')
      .select('id, product_id, reviewer_name, reviewee_id, rating, comment, created_at')
      .limit(2000),
    client.from('featured_listings').select('product_id, status, expires_at').limit(500),
  ]);

  for (const [label, result] of Object.entries({ products, profiles, businesses, reviews, featured })) {
    if (result.error) {
      console.warn(`[GoodSale SEO] ${label} unavailable:`, result.error.message);
    }
  }

  return {
    products: (products.data || []) as Row[],
    profiles: (profiles.data || []) as Row[],
    businesses: (businesses.data || []) as Row[],
    reviews: (reviews.data || []) as Row[],
    featured: (featured.data || []) as Row[],
  };
});

export const getPublicProducts = cache(async (): Promise<SeoProduct[]> => {
  const snap = await loadSnapshot();
  const profiles = new Map(snap.profiles.map((p) => [num(p.id), p]));
  const businesses = new Map(snap.businesses.map((b) => [num(b.owner_id), b]));

  const reviewsByProduct = new Map<number, SeoReview[]>();
  for (const row of snap.reviews) {
    if (row.product_id == null) continue;
    const list = reviewsByProduct.get(num(row.product_id)) || [];
    list.push(mapReview(row));
    reviewsByProduct.set(num(row.product_id), list);
  }

  return snap.products
    .filter((row) => str(row.moderation_status, 'APPROVED') === 'APPROVED')
    .map((row): SeoProduct => {
      const sellerId = num(row.seller_id);
      const profile = profiles.get(sellerId);
      const business = businesses.get(sellerId);
      const productReviews = (reviewsByProduct.get(num(row.id)) || [])
        .filter((r) => r.rating > 0)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20);
      const stats = ratingStats(productReviews);
      const quantity = num(row.quantity);
      const stockStatus = str(row.stock_status, 'IN_STOCK');
      return {
        id: num(row.id),
        title: str(row.title, 'GoodSale listing'),
        description: str(row.description),
        category: str(row.category, 'Marketplace'),
        categorySlug: categorySlug(str(row.category, 'Marketplace')),
        brand: str(row.brand),
        condition: str(row.condition, 'GOOD'),
        price: num(row.price),
        compareAtPrice: row.compare_at_price != null ? num(row.compare_at_price) : undefined,
        stockStatus,
        quantity,
        inStock: quantity > 0 && ['IN_STOCK', 'LOW_STOCK'].includes(stockStatus),
        images: arr(row.images).filter(Boolean),
        sellerId,
        sellerName: (str(business?.name) || str(profile?.full_name, 'GoodSale seller')).trim(),
        sellerUsername: str(profile?.username),
        sellerVerified: publicVerified(profile?.verification_status, profile?.verification_expires_at),
        sellerCity: str(business?.city) || str(profile?.city),
        sellerState: str(business?.state) || str(profile?.state),
        createdAt: str(row.created_at, new Date().toISOString()),
        updatedAt: str(row.updated_at, str(row.created_at, new Date().toISOString())),
        viewCount: num(row.view_count),
        deliveryMethod: str(row.delivery_method, 'GOODSALE_PARTNER'),
        warranty: row.warranty != null ? str(row.warranty) : undefined,
        returnPolicy: row.return_policy != null ? str(row.return_policy) : undefined,
        rating: stats.rating,
        reviewCount: stats.reviewCount,
        reviews: productReviews,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

export const getProductById = cache(async (id: number): Promise<SeoProduct | null> => {
  const products = await getPublicProducts();
  return products.find((p) => p.id === id) || null;
});

export const getProductsByCategory = cache(async (slug: string): Promise<SeoProduct[]> => {
  const products = await getPublicProducts();
  return products.filter((p) => p.categorySlug === slug);
});

export const getProductsBySeller = cache(async (sellerId: number): Promise<SeoProduct[]> => {
  const products = await getPublicProducts();
  return products.filter((p) => p.sellerId === sellerId);
});

export const getPublicCategories = cache(async (): Promise<SeoCategory[]> => {
  const products = await getPublicProducts();
  const map = new Map<string, { name: string; count: number; sampleImage?: string }>();
  for (const product of products) {
    const entry = map.get(product.categorySlug) || { name: product.category, count: 0, sampleImage: product.images[0] };
    entry.count += 1;
    if (!entry.sampleImage) entry.sampleImage = product.images[0];
    map.set(product.categorySlug, entry);
  }
  return [...map.entries()]
    .map(([slug, value]) => ({ slug, ...value }))
    .sort((a, b) => b.count - a.count);
});

export const getCategoryBySlug = cache(async (slug: string): Promise<SeoCategory | null> => {
  const categories = await getPublicCategories();
  return categories.find((c) => c.slug === slug) || null;
});

export const getPublicStores = cache(async (): Promise<SeoStore[]> => {
  const snap = await loadSnapshot();
  const products = await getPublicProducts();
  const productsBySeller = new Map<number, SeoProduct[]>();
  for (const product of products) {
    const list = productsBySeller.get(product.sellerId) || [];
    list.push(product);
    productsBySeller.set(product.sellerId, list);
  }

  const reviewsBySeller = new Map<number, SeoReview[]>();
  for (const row of snap.reviews) {
    if (row.reviewee_id == null) continue;
    const list = reviewsBySeller.get(num(row.reviewee_id)) || [];
    list.push(mapReview(row));
    reviewsBySeller.set(num(row.reviewee_id), list);
  }

  const businesses = new Map(snap.businesses.map((b) => [num(b.owner_id), b]));

  return snap.profiles
    .filter((row) => SELLER_ROLES.has(str(row.role)))
    .map((row): SeoStore => {
      const id = num(row.id);
      const business = businesses.get(id);
      const sellerReviews = (reviewsBySeller.get(id) || [])
        .filter((r) => r.rating > 0)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10);
      const stats = ratingStats(sellerReviews);
      return {
        id,
        name: str(row.full_name, str(row.username, 'GoodSale seller')).trim(),
        username: str(row.username),
        role: str(row.role),
        verified: publicVerified(row.verification_status, row.verification_expires_at),
        business: !!business,
        bio: str(business?.description) || str(row.bio),
        photoUrl: str(row.photo_url),
        city: str(business?.city) || str(row.city),
        state: str(business?.state) || str(row.state),
        businessName: business ? str(business.name).trim() : undefined,
        businessDescription: business ? str(business.description) : undefined,
        businessAddress: business ? str(business.address) : undefined,
        openingHours: business ? str(business.opening_hours) : undefined,
        logoUrl: business ? str(business.logo_url) : undefined,
        bannerUrl: business ? str(business.banner_url) : undefined,
        joinedAt: str(row.created_at, new Date().toISOString()),
        productCount: productsBySeller.get(id)?.length || 0,
        rating: stats.rating,
        reviewCount: stats.reviewCount,
        reviews: sellerReviews,
      };
    })
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.productCount - a.productCount);
});

export const getStoreById = cache(async (id: number): Promise<SeoStore | null> => {
  const stores = await getPublicStores();
  return stores.find((s) => s.id === id) || null;
});

export async function searchPublicProducts(query: string, limit = 60): Promise<SeoProduct[]> {
  const products = await getPublicProducts();
  const q = query.trim().toLowerCase();
  if (!q) return products.slice(0, limit);
  const terms = q.split(/\s+/).filter(Boolean);
  return products
    .filter((p) => {
      const haystack = `${p.title} ${p.description} ${p.category} ${p.brand} ${p.sellerName} ${p.sellerCity}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, limit);
}

export const getFeaturedProducts = cache(async (): Promise<SeoProduct[]> => {
  const snap = await loadSnapshot();
  const products = await getPublicProducts();
  const now = Date.now();
  const ids = new Set(
    snap.featured
      .filter((row) => str(row.status, 'ACTIVE') === 'ACTIVE' && new Date(str(row.expires_at)).getTime() > now)
      .map((row) => num(row.product_id))
  );
  // Only real, unexpired placements for currently purchasable listings are
  // labelled as promotions.
  return products.filter((p) => ids.has(p.id) && p.inStock);
});
