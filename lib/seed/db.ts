// lib/seed/db.ts
/**
 * Service-role operations for the seeded launch catalog.
 *
 * Everything here runs on the server (Next route handlers) with the Supabase
 * service-role key, because the storefront RLS policies only let a seller edit
 * their own products — an admin managing the seeded catalog must not depend on
 * owning those accounts.
 *
 * Every write is scoped to rows flagged `is_seeded`, so real seller accounts can
 * never be edited or removed through these helpers.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  seedBuyers,
  seedProducts,
  seedReviews,
  seedSellers,
  SEED_BUYER_DOMAIN,
  SEED_SELLER_DOMAIN,
  type SeedProduct,
  type SeedSeller,
} from './catalog';

const PRODUCT_CATEGORIES = [
  'Phones',
  'Laptops',
  'Electronics',
  'Fashion',
  'Beauty',
  'Groceries',
  'Furniture',
  'Books',
  'Vehicles',
] as const;

const CONDITIONS = ['NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR'] as const;

export interface SeededProductRecord {
  id: number;
  sellerId: number;
  sellerUsername: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  condition: string;
  price: number;
  quantity: number;
  stockStatus: string;
  images: string[];
  deliveryMethod: string;
  pickupAvailable: boolean;
  isNegotiable: boolean;
  warranty: string;
  returnPolicy: string;
  weightKg: number | null;
  dimensionsCm: string;
  viewCount: number;
  createdAt: string;
}

export interface SeededSellerRecord {
  id: number;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  bio: string;
  address: string;
  city: string;
  state: string;
  photoUrl: string;
  trustScore: number;
  sellerLevel: string;
  goodPoints: number;
  createdAt: string;
  business: {
    id: number;
    name: string;
    description: string;
    openingHours: string;
    address: string;
    city: string;
    state: string;
    logoUrl: string;
    bannerUrl: string;
    isVerified: boolean;
    followers: number;
    rating: number;
    reviewsCount: number;
  } | null;
  products: SeededProductRecord[];
}

export interface SeededCatalogSnapshot {
  sellers: SeededSellerRecord[];
  buyers: { id: number; fullName: string; username: string; email: string; city: string; state: string }[];
  totals: {
    sellers: number;
    businesses: number;
    buyers: number;
    products: number;
    reviews: number;
    seedSellers: number;
    seedProducts: number;
    seedReviews: number;
  };
  options: { categories: readonly string[]; conditions: readonly string[] };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 20; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${out}!7`;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  // listUsers is paginated; the seeded accounts are always in the first pages.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (!data?.users?.length || data.users.length < 200) return null;
  }
  return null;
}

/**
 * Create (or find) the auth user behind a seeded account and return its profile
 * id. The `handle_new_user` trigger normally creates the profile; we insert one
 * ourselves if the project has no trigger installed.
 */
async function ensureProfile(
  admin: SupabaseClient,
  account: { email: string; username: string; fullName: string; phone: string }
): Promise<number> {
  let authId: string | null = null;

  const created = await admin.auth.admin.createUser({
    email: account.email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: {
      full_name: account.fullName,
      username: account.username,
      phone: account.phone,
      seeded: true,
    },
  });

  if (created.data?.user?.id) {
    authId = created.data.user.id;
  } else {
    // Already registered from an earlier seed run.
    authId = await findAuthUserIdByEmail(admin, account.email);
  }
  if (!authId) throw new Error(`Could not create or find auth user for ${account.email}`);

  const { data: profile } = await admin.from('profiles').select('id').eq('auth_id', authId).maybeSingle();
  if (profile?.id) return profile.id as number;

  const { data: inserted, error } = await admin
    .from('profiles')
    .insert({
      auth_id: authId,
      username: account.username,
      full_name: account.fullName,
      email: account.email,
      phone_number: account.phone,
    })
    .select('id')
    .single();
  if (error || !inserted?.id) {
    throw new Error(`Could not create profile for ${account.email}: ${error?.message || 'unknown error'}`);
  }
  return inserted.id as number;
}

/** Patch a profile, retrying without the username if it is already taken. */
async function patchProfile(
  admin: SupabaseClient,
  profileId: number,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from('profiles').update(patch).eq('id', profileId);
  if (!error) return;
  // Username collisions (a real account already owns it) must not fail the seed.
  const { username, ...rest } = patch;
  if (error.code === '23505' && username) {
    const { error: retryError } = await admin.from('profiles').update(rest).eq('id', profileId);
    if (!retryError) return;
    throw new Error(retryError.message);
  }
  throw new Error(error.message);
}

/* -------------------------------------------------------------------------- */
/* Seeding                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The seeded catalog needs migration 013 (`is_seeded` columns). Detect a project
 * that has not run it yet and return a message an admin can act on, instead of
 * a raw PostgREST error.
 */
export async function seededSchemaMessage(admin: SupabaseClient): Promise<string | null> {
  const { error } = await admin.from('profiles').select('is_seeded').limit(1);
  if (!error) return null;
  if (error.code === '42703' || /is_seeded/.test(error.message)) {
    return 'The seeded-catalog migration is missing. Apply supabase/migrations/013_seeded_catalog.sql (or run `npm run migrate`) and try again.';
  }
  return null;
}

export interface SeedRunSummary {
  sellers: number;
  businesses: number;
  buyers: number;
  products: number;
  reviews: number;
  replies: number;
  skippedProducts: number;
}

/**
 * Realign every table's id sequence with its rows (migration 015). Without this
 * a delete-then-reinsert can collide on the primary key when the sequence had
 * drifted behind max(id). Missing function is non-fatal.
 */
async function resyncSequences(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.rpc('resync_id_sequences');
  if (error) console.warn('[GoodSale] resync_id_sequences skipped:', error.message);
}

export async function seedCatalog(admin: SupabaseClient, opts: { force?: boolean } = {}): Promise<SeedRunSummary> {
  const schemaIssue = await seededSchemaMessage(admin);
  if (schemaIssue) throw new Error(schemaIssue);
  await resyncSequences(admin);

  const sellers = seedSellers();
  const buyers = seedBuyers();
  const products = seedProducts();
  const reviews = seedReviews();
  const summary: SeedRunSummary = {
    sellers: 0, businesses: 0, buyers: 0, products: 0, reviews: 0, replies: 0, skippedProducts: 0,
  };

  if (opts.force) {
    await removeSeededCatalog(admin, { keepProfiles: true });
  }

  /* ---- sellers ---- */
  const sellerIds = new Map<string, number>();
  const businessIds = new Map<string, number>();
  for (const seller of sellers) {
    const profileId = await ensureProfile(admin, {
      email: seller.email,
      username: seller.username,
      fullName: seller.fullName,
      phone: seller.phone,
    });
    sellerIds.set(seller.slug, profileId);

    await patchProfile(admin, profileId, {
      username: seller.username,
      full_name: seller.fullName,
      email: seller.email,
      phone_number: seller.phone,
      role: seller.role,
      bio: seller.bio,
      address: seller.address,
      city: seller.city,
      state: seller.state,
      photo_url: seller.photoUrl,
      trust_score: seller.trustScore,
      seller_level: seller.sellerLevel,
      good_points: seller.goodPoints,
      is_seeded: true,
      created_at: daysAgoIso(seller.joinedDaysAgo),
    });
    summary.sellers += 1;

    if (seller.business) {
      const { data: existing } = await admin
        .from('businesses')
        .select('id')
        .eq('owner_id', profileId)
        .eq('is_seeded', true)
        .maybeSingle();

      const row = {
        owner_id: profileId,
        name: seller.business.name,
        description: seller.business.description,
        opening_hours: seller.business.openingHours,
        address: seller.business.address,
        city: seller.city,
        state: seller.state,
        logo_url: seller.business.logoUrl,
        banner_url: seller.business.bannerUrl,
        is_verified: seller.business.isVerified,
        trust_score: seller.trustScore,
        followers: seller.business.followers,
        is_seeded: true,
      };

      if (existing?.id) {
        await admin.from('businesses').update(row).eq('id', existing.id);
        businessIds.set(seller.slug, existing.id as number);
      } else {
        const { data: created } = await admin.from('businesses').insert(row).select('id').single();
        if (created?.id) businessIds.set(seller.slug, created.id as number);
      }
      summary.businesses += 1;
    }
  }

  /* ---- buyers ---- */
  const buyerIds = new Map<string, number>();
  for (const buyer of buyers) {
    const profileId = await ensureProfile(admin, {
      email: buyer.email,
      username: buyer.username,
      fullName: buyer.fullName,
      phone: buyer.phone,
    });
    buyerIds.set(buyer.slug, profileId);
    await patchProfile(admin, profileId, {
      username: buyer.username,
      full_name: buyer.fullName,
      email: buyer.email,
      phone_number: buyer.phone,
      role: 'BUYER',
      bio: '',
      city: buyer.city,
      state: buyer.state,
      photo_url: buyer.photoUrl,
      trust_score: 78,
      is_seeded: true,
      created_at: daysAgoIso(240),
    });
    summary.buyers += 1;
  }

  /* ---- products ---- */
  const seededSellerIds = Array.from(sellerIds.values());
  const { data: existingProducts } = seededSellerIds.length
    ? await admin.from('products').select('id, seller_id, title').in('seller_id', seededSellerIds)
    : { data: [] as { id: number; seller_id: number; title: string }[] };
  const existingKeys = new Set(
    (existingProducts || []).map((p) => `${p.seller_id}::${String(p.title).toLowerCase()}`)
  );

  const productRows: Record<string, unknown>[] = [];
  const productSlugByTitle = new Map<string, string>();
  products.forEach((product: SeedProduct, index) => {
    const sellerId = sellerIds.get(product.sellerSlug);
    if (!sellerId) return;
    productSlugByTitle.set(`${sellerId}::${product.title.toLowerCase()}`, product.slug);
    if (existingKeys.has(`${sellerId}::${product.title.toLowerCase()}`)) {
      summary.skippedProducts += 1;
      return;
    }
    productRows.push({
      seller_id: sellerId,
      business_id: businessIds.get(product.sellerSlug) ?? null,
      title: product.title,
      description: product.description,
      category: product.category,
      brand: product.brand,
      condition: product.condition,
      price: product.price,
      compare_at_price: product.compareAtPrice ?? null,
      is_negotiable: product.isNegotiable,
      quantity: product.quantity,
      stock_status: product.stockStatus,
      images: product.images,
      delivery_method: product.deliveryMethod,
      pickup_available: product.pickupAvailable,
      warranty: product.warranty ?? null,
      return_policy: product.returnPolicy ?? null,
      weight_kg: product.weightKg ?? null,
      dimensions_cm: product.dimensionsCm ?? null,
      view_count: product.viewCount,
      is_auction: false,
      is_seeded: true,
      created_at: daysAgoIso((index * 3) % 150),
    });
  });

  if (productRows.length) {
    await resyncSequences(admin);
    const { error, count } = await admin.from('products').insert(productRows, { count: 'exact' });
    if (error) throw new Error(`Product insert failed: ${error.message}`);
    summary.products = count ?? productRows.length;
  }

  /* ---- map inserted/known products so reviews can reference them ---- */
  const { data: allProducts } = seededSellerIds.length
    ? await admin.from('products').select('id, seller_id, title').in('seller_id', seededSellerIds).eq('is_seeded', true)
    : { data: [] as { id: number; seller_id: number; title: string }[] };
  const productIdBySlug = new Map<string, number>();
  for (const row of allProducts || []) {
    const slug = productSlugByTitle.get(`${row.seller_id}::${String(row.title).toLowerCase()}`);
    if (slug) productIdBySlug.set(slug, row.id);
  }

  /* ---- reviews + seller replies ---- */
  const { data: existingReviews } = await admin.from('reviews').select('id').in('reviewer_id', Array.from(buyerIds.values()));
  if (!existingReviews?.length) {
    const reviewRows: Record<string, unknown>[] = [];
    const pendingReplies: { productSlug: string; buyerSlug: string; comment: string }[] = [];

    for (const review of reviews) {
      const productId = productIdBySlug.get(review.productSlug);
      const reviewerId = buyerIds.get(review.buyerSlug);
      if (!productId || !reviewerId) continue;
      const sellerSlug = review.productSlug.replace(/-\d+$/, '');
      const sellerId = sellerIds.get(sellerSlug);
      const buyer = buyers.find((b) => b.slug === review.buyerSlug);
      const product = products.find((p) => p.slug === review.productSlug);

      reviewRows.push({
        product_id: productId,
        reviewer_id: reviewerId,
        reviewer_name: buyer?.fullName || 'GoodSale buyer',
        reviewer_photo: buyer?.photoUrl || '',
        reviewee_id: sellerId ?? null,
        rating: review.rating,
        comment: review.comment,
        is_helpful_votes: (review.rating * 3) % 11,
        created_at: daysAgoIso(review.daysAgo),
      });

      if (review.sellerReply && sellerId && product) {
        pendingReplies.push({ productSlug: review.productSlug, buyerSlug: review.buyerSlug, comment: review.sellerReply });
      }
    }

    if (reviewRows.length) {
      const { error, count } = await admin.from('reviews').insert(reviewRows, { count: 'exact' });
      if (error) throw new Error(`Review insert failed: ${error.message}`);
      summary.reviews = count ?? reviewRows.length;
    }

    if (pendingReplies.length) {
      const { data: freshReviews } = await admin.from('reviews').select('id, product_id, reviewer_id');
      const replyRows: Record<string, unknown>[] = [];
      for (const reply of pendingReplies) {
        const productId = productIdBySlug.get(reply.productSlug);
        const reviewerId = buyerIds.get(reply.buyerSlug);
        const sellerSlug = reply.productSlug.replace(/-\d+$/, '');
        const sellerId = sellerIds.get(sellerSlug);
        const review = (freshReviews || []).find(
          (r) => r.product_id === productId && r.reviewer_id === reviewerId
        );
        if (!review || !sellerId) continue;
        const seller = sellers.find((s) => s.slug === sellerSlug);
        replyRows.push({
          review_id: review.id,
          author_id: sellerId,
          author_name: seller?.fullName || 'Seller',
          author_photo: seller?.photoUrl || '',
          author_role: 'SELLER',
          comment: reply.comment,
        });
      }
      if (replyRows.length) {
        const { error, count } = await admin.from('review_replies').insert(replyRows, { count: 'exact' });
        if (!error) summary.replies = count ?? replyRows.length;
      }
    }
  }

  /* ---- store ratings from the reviews the buyers left ---- */
  for (const [slug, businessId] of businessIds) {
    const sellerId = sellerIds.get(slug);
    if (!sellerId) continue;
    const { data: rows } = await admin
      .from('reviews')
      .select('rating, product_id, products!inner(seller_id)')
      .eq('products.seller_id', sellerId)
      .gt('rating', 0);
    const ratings = (rows || []).map((r) => Number(r.rating)).filter((n) => n > 0);
    if (!ratings.length) continue;
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    await admin
      .from('businesses')
      .update({ rating: Number(avg.toFixed(2)), reviews_count: ratings.length })
      .eq('id', businessId);
  }

  return summary;
}

/** Delete everything this module ever created. Real accounts are never touched. */
export async function removeSeededCatalog(
  admin: SupabaseClient,
  opts: { keepProfiles?: boolean } = {}
): Promise<{ products: number; businesses: number; reviews: number; profiles: number; authUsers: number }> {
  const schemaIssue = await seededSchemaMessage(admin);
  if (schemaIssue) throw new Error(schemaIssue);

  const out = { products: 0, businesses: 0, reviews: 0, profiles: 0, authUsers: 0 };

  const { data: seededProfiles } = await admin.from('profiles').select('id, auth_id').eq('is_seeded', true);
  const profileIds = (seededProfiles || []).map((p) => p.id as number);

  const { data: seededProducts } = await admin.from('products').select('id').eq('is_seeded', true);
  const productIds = (seededProducts || []).map((p) => p.id as number);

  const deleteReviews = async (column: 'reviewer_id' | 'product_id' | 'reviewee_id', values: number[]) => {
    if (!values.length) return;
    const { count, error } = await admin.from('reviews').delete({ count: 'exact' }).in(column, values);
    if (error) throw new Error(`Could not delete seeded reviews (${column}): ${error.message}`);
    out.reviews += count ?? 0;
  };
  await deleteReviews('reviewer_id', profileIds);
  await deleteReviews('product_id', productIds);
  await deleteReviews('reviewee_id', profileIds);

  const { count: productCount, error: productError } = await admin
    .from('products')
    .delete({ count: 'exact' })
    .eq('is_seeded', true);
  if (productError) throw new Error(`Could not delete seeded listings: ${productError.message}`);
  out.products = productCount ?? 0;

  const { count: businessCount, error: businessError } = await admin
    .from('businesses')
    .delete({ count: 'exact' })
    .eq('is_seeded', true);
  if (businessError) throw new Error(`Could not delete seeded storefronts: ${businessError.message}`);
  out.businesses = businessCount ?? 0;

  if (!opts.keepProfiles && profileIds.length) {
    const { count, error: profileError } = await admin
      .from('profiles')
      .delete({ count: 'exact' })
      .eq('is_seeded', true);
    if (profileError) throw new Error(`Could not delete seeded accounts: ${profileError.message}`);
    out.profiles = count ?? 0;

    for (const profile of seededProfiles || []) {
      const authId = profile.auth_id as string | null;
      if (!authId) continue;
      const { error } = await admin.auth.admin.deleteUser(authId);
      if (!error) out.authUsers += 1;
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Admin listing + editing                                                     */
/* -------------------------------------------------------------------------- */

/** Everything the admin seeded-catalog screen needs, in one round trip. */
export async function listSeededCatalog(admin: SupabaseClient): Promise<SeededCatalogSnapshot> {
  const schemaIssue = await seededSchemaMessage(admin);
  if (schemaIssue) throw new Error(schemaIssue);

  const { data: profiles } = await admin
    .from('profiles')
    .select('*')
    .eq('is_seeded', true)
    .order('id', { ascending: true });

  const rows = profiles || [];
  const sellerRows = rows.filter((p) => String(p.role) !== 'BUYER');
  const buyerRows = rows.filter((p) => String(p.role) === 'BUYER');
  const sellerIds = sellerRows.map((p) => p.id as number);

  const { data: businesses } = sellerIds.length
    ? await admin.from('businesses').select('*').eq('is_seeded', true).in('owner_id', sellerIds)
    : { data: [] as Record<string, unknown>[] };

  const { data: products } = sellerIds.length
    ? await admin
        .from('products')
        .select('*')
        .eq('is_seeded', true)
        .in('seller_id', sellerIds)
        .order('id', { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  const { count: reviewCount } = await admin
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .in('reviewee_id', sellerIds.length ? sellerIds : [-1]);

  const usernameById = new Map(sellerRows.map((p) => [p.id as number, String(p.username)]));
  const productsBySeller = new Map<number, SeededProductRecord[]>();
  for (const p of products || []) {
    const sellerId = p.seller_id as number;
    const list = productsBySeller.get(sellerId) || [];
    list.push(mapSeededProduct(p, usernameById.get(sellerId) || ''));
    productsBySeller.set(sellerId, list);
  }

  const businessByOwner = new Map<number, Record<string, unknown>>();
  for (const b of businesses || []) businessByOwner.set(b.owner_id as number, b);

  const sellers: SeededSellerRecord[] = sellerRows.map((p) => {
    const business = businessByOwner.get(p.id as number) || null;
    return {
      id: p.id as number,
      fullName: String(p.full_name || ''),
      username: String(p.username || ''),
      email: String(p.email || ''),
      phone: String(p.phone_number || ''),
      role: String(p.role || 'SELLER'),
      bio: String(p.bio || ''),
      address: String(p.address || ''),
      city: String(p.city || ''),
      state: String(p.state || ''),
      photoUrl: String(p.photo_url || ''),
      trustScore: Number(p.trust_score ?? 50),
      sellerLevel: String(p.seller_level || 'BRONZE'),
      goodPoints: Number(p.good_points ?? 0),
      createdAt: String(p.created_at || ''),
      business: business
        ? {
            id: business.id as number,
            name: String(business.name || ''),
            description: String(business.description || ''),
            openingHours: String(business.opening_hours || ''),
            address: String(business.address || ''),
            city: String(business.city || ''),
            state: String(business.state || ''),
            logoUrl: String(business.logo_url || ''),
            bannerUrl: String(business.banner_url || ''),
            isVerified: Boolean(business.is_verified),
            followers: Number(business.followers ?? 0),
            rating: Number(business.rating ?? 0),
            reviewsCount: Number(business.reviews_count ?? 0),
          }
        : null,
      products: productsBySeller.get(p.id as number) || [],
    };
  });

  const seedSellersCount = seedSellers().length;
  const seedProductsCount = seedProducts().length;
  const seedReviewsCount = seedReviews().length;

  return {
    sellers,
    buyers: buyerRows.map((p) => ({
      id: p.id as number,
      fullName: String(p.full_name || ''),
      username: String(p.username || ''),
      email: String(p.email || ''),
      city: String(p.city || ''),
      state: String(p.state || ''),
    })),
    totals: {
      sellers: sellers.length,
      businesses: sellers.filter((s) => s.business).length,
      buyers: buyerRows.length,
      products: (products || []).length,
      reviews: reviewCount ?? 0,
      seedSellers: seedSellersCount,
      seedProducts: seedProductsCount,
      seedReviews: seedReviewsCount,
    },
    options: { categories: PRODUCT_CATEGORIES, conditions: CONDITIONS },
  };
}

function mapSeededProduct(row: Record<string, unknown>, sellerUsername: string): SeededProductRecord {
  const images = Array.isArray(row.images) ? (row.images as unknown[]).map((i) => String(i)) : [];
  return {
    id: row.id as number,
    sellerId: row.seller_id as number,
    sellerUsername,
    title: String(row.title || ''),
    description: String(row.description || ''),
    category: String(row.category || ''),
    brand: String(row.brand || ''),
    condition: String(row.condition || 'NEW'),
    price: Number(row.price ?? 0),
    quantity: Number(row.quantity ?? 0),
    stockStatus: String(row.stock_status || 'IN_STOCK'),
    images,
    deliveryMethod: String(row.delivery_method || ''),
    pickupAvailable: Boolean(row.pickup_available),
    isNegotiable: Boolean(row.is_negotiable),
    warranty: String(row.warranty || ''),
    returnPolicy: String(row.return_policy || ''),
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    dimensionsCm: String(row.dimensions_cm || ''),
    viewCount: Number(row.view_count ?? 0),
    createdAt: String(row.created_at || ''),
  };
}

/** Update a seeded seller profile and (optionally) their storefront. */
export async function updateSeededSeller(
  admin: SupabaseClient,
  profileId: number,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_seeded')
    .eq('id', profileId)
    .maybeSingle();
  if (!profile) return { ok: false, error: 'Account not found' };
  if (!profile.is_seeded) return { ok: false, error: 'Only seeded accounts can be edited here' };

  const allowed = [
    'full_name', 'username', 'email', 'phone_number', 'role', 'bio',
    'address', 'city', 'state', 'photo_url', 'trust_score', 'seller_level', 'good_points',
  ];
  const profilePatch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) profilePatch[key] = patch[key];
  }
  if (patch.email) profilePatch.email = String(patch.email).trim();
  if (patch.full_name) profilePatch.full_name = String(patch.full_name).trim();
  if (patch.username) profilePatch.username = String(patch.username).trim().toLowerCase();

  if (Object.keys(profilePatch).length) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', profileId);
    if (error) return { ok: false, error: error.message };
  }

  const businessPatchSource = (patch.business || {}) as Record<string, unknown>;
  const businessAllowed: Record<string, string> = {
    name: 'name',
    description: 'description',
    openingHours: 'opening_hours',
    address: 'address',
    city: 'city',
    state: 'state',
    logoUrl: 'logo_url',
    bannerUrl: 'banner_url',
    isVerified: 'is_verified',
    followers: 'followers',
  };
  const businessPatch: Record<string, unknown> = {};
  for (const [camel, column] of Object.entries(businessAllowed)) {
    if (businessPatchSource[camel] !== undefined) businessPatch[column] = businessPatchSource[camel];
  }
  if (Object.keys(businessPatch).length) {
    const { data: business } = await admin
      .from('businesses')
      .select('id, is_seeded')
      .eq('owner_id', profileId)
      .maybeSingle();
    if (business?.is_seeded) {
      const { error } = await admin.from('businesses').update(businessPatch).eq('id', business.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  return { ok: true };
}

/** Update a seeded product. Refuses to touch anything a real seller owns. */
export async function updateSeededProduct(
  admin: SupabaseClient,
  productId: number,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: product } = await admin
    .from('products')
    .select('id, is_seeded')
    .eq('id', productId)
    .maybeSingle();
  if (!product) return { ok: false, error: 'Product not found' };
  if (!product.is_seeded) return { ok: false, error: 'Only seeded listings can be edited here' };

  const map: Record<string, string> = {
    title: 'title',
    description: 'description',
    category: 'category',
    brand: 'brand',
    condition: 'condition',
    price: 'price',
    quantity: 'quantity',
    stockStatus: 'stock_status',
    deliveryMethod: 'delivery_method',
    pickupAvailable: 'pickup_available',
    isNegotiable: 'is_negotiable',
    warranty: 'warranty',
    returnPolicy: 'return_policy',
    weightKg: 'weight_kg',
    dimensionsCm: 'dimensions_cm',
  };
  const row: Record<string, unknown> = {};
  for (const [camel, column] of Object.entries(map)) {
    if (patch[camel] !== undefined) row[column] = patch[camel];
  }
  if (patch.images !== undefined) {
    const images = Array.isArray(patch.images) ? (patch.images as unknown[]).map((i) => String(i)) : [];
    row.images = images;
  }
  if (row.price !== undefined) row.price = Number(row.price) || 0;
  if (row.quantity !== undefined) {
    const qty = Math.max(0, Math.trunc(Number(row.quantity) || 0));
    row.quantity = qty;
    if (patch.stockStatus === undefined) row.stock_status = qty === 0 ? 'OUT_OF_STOCK' : qty <= 8 ? 'LOW_STOCK' : 'IN_STOCK';
  }
  if (!Object.keys(row).length) return { ok: false, error: 'Nothing to update' };
  if (typeof row.title === 'string' && !row.title.trim()) return { ok: false, error: 'Title is required' };

  const { error } = await admin.from('products').update(row).eq('id', productId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteSeededProduct(
  admin: SupabaseClient,
  productId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: product } = await admin
    .from('products')
    .select('id, is_seeded')
    .eq('id', productId)
    .maybeSingle();
  if (!product) return { ok: false, error: 'Product not found' };
  if (!product.is_seeded) return { ok: false, error: 'Only seeded listings can be removed here' };
  const { error } = await admin.from('products').delete().eq('id', productId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Give a seeded account a password the admin can actually log in with (useful
 * for demos) without ever storing a password in the repository.
 */
export async function setSeededPassword(
  admin: SupabaseClient,
  username: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  const { data: profile } = await admin
    .from('profiles')
    .select('id, auth_id, is_seeded')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (!profile) return { ok: false, error: 'Account not found' };
  if (!profile.is_seeded) return { ok: false, error: 'Only seeded accounts can be reset here' };
  if (!profile.auth_id) return { ok: false, error: 'This account has no auth user' };

  const { error } = await admin.auth.admin.updateUserById(String(profile.auth_id), { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Admin gate shared by the seeded-catalog routes. */
export async function getAdminProfile(
  supabase: SupabaseClient,
  authUserId: string
): Promise<{ id: number; role: string } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('auth_id', authUserId)
    .maybeSingle();
  if (!data) return null;
  const role = String(data.role || '');
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return null;
  return { id: data.id as number, role };
}

export { SEED_BUYER_DOMAIN, SEED_SELLER_DOMAIN };
