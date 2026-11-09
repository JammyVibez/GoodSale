/**
 * Shared catalogue collections.
 *
 * One definition powers both the homepage rails ("Feature ≠ category") and the
 * dedicated listing routes, so a rail's "See all" link can never point at a
 * page that disagrees with what the rail showed.
 *
 * This module is imported by client components — no server-only code here.
 */

export type CollectionSlug =
  | 'featured'
  | 'flash-deals'
  | 'recommended'
  | 'trending'
  | 'new-arrivals'
  | 'best-deals';

export type CollectionAccent = 'jade' | 'gold' | 'ink';

export interface CollectionDefinition {
  slug: CollectionSlug;
  href: string;
  /** Rail / page heading. */
  title: string;
  /** Small label above the heading on a listing page. */
  eyebrow: string;
  /** One line under the rail heading. */
  subtitle: string;
  /** Longer copy for the listing page hero. */
  description: string;
  accent: CollectionAccent;
  /** How the collection is ordered, spelled out for the buyer. */
  ordering: string;
  /** Canonical sort applied when the buyer has not chosen one. */
  defaultSort: CollectionSort;
  /** Only show the rail when the catalogue can fill it. */
  minItems: number;
}

export type CollectionSort = 'recommended' | 'price_asc' | 'price_desc' | 'newest' | 'discount' | 'rating';

export const COLLECTIONS: Record<CollectionSlug, CollectionDefinition> = {
  featured: {
    slug: 'featured',
    href: '/featured',
    title: 'Featured products',
    eyebrow: 'Handpicked',
    subtitle: 'Premium listings, promoted placements first.',
    description:
      'Featured listings are promoted by GoodSale sellers and reviewed before they appear here. When no placement is running, the page falls back to the highest-rated live listings so there is still something worth browsing. Promotion never changes buyer protection — every order still runs through GoodSale escrow.',
    accent: 'gold',
    ordering: 'Promoted placements, then top-rated picks',
    defaultSort: 'recommended',
    minItems: 4,
  },
  'flash-deals': {
    slug: 'flash-deals',
    href: '/flash-deals',
    title: 'Flash deals',
    eyebrow: 'Limited time',
    subtitle: 'Scheduled price drops that end when the clock runs out.',
    description:
      'Flash deals are scheduled by sellers and end automatically. The price shown is the price you pay at checkout while the deal is live, and stock is limited to what each seller listed.',
    accent: 'jade',
    ordering: 'Biggest discount first',
    defaultSort: 'discount',
    minItems: 3,
  },
  recommended: {
    slug: 'recommended',
    href: '/recommended',
    title: 'Recommended for you',
    eyebrow: 'Picked for you',
    subtitle: 'Ranked by what buyers in your market actually buy and rate.',
    description:
      'Recommendations combine real review scores, listing views and where sellers are located. Signed-in shoppers also get picks tuned to their saved items and delivery state.',
    accent: 'jade',
    ordering: 'Best match first',
    defaultSort: 'recommended',
    minItems: 4,
  },
  trending: {
    slug: 'trending',
    href: '/trending',
    title: 'Trending now',
    eyebrow: 'Moving fast',
    subtitle: 'What shoppers are viewing, saving and adding to cart today.',
    description:
      'Trending is driven by real marketplace activity — listing views, wishlist saves and cart adds — so it changes as buyers move through the catalogue.',
    accent: 'ink',
    ordering: 'Most buyer activity first',
    defaultSort: 'recommended',
    minItems: 4,
  },
  'new-arrivals': {
    slug: 'new-arrivals',
    href: '/new-arrivals',
    title: 'Recently added',
    eyebrow: 'Just listed',
    subtitle: 'The newest listings from sellers across Nigeria.',
    description:
      'Every listing below was published recently by a GoodSale seller. New sellers start unverified and earn their badge through ID and business checks.',
    accent: 'ink',
    ordering: 'Newest first',
    defaultSort: 'newest',
    minItems: 4,
  },
  'best-deals': {
    slug: 'best-deals',
    href: '/best-deals',
    title: 'Best deals',
    eyebrow: 'Value picks',
    subtitle: 'Listings with a genuine markdown against the seller’s reference price.',
    description:
      'Best deals only includes listings where the seller set a higher reference price, so the strike-through and the saving are real rather than decorative.',
    accent: 'gold',
    ordering: 'Largest saving first',
    defaultSort: 'discount',
    minItems: 4,
  },
};

export const COLLECTION_LIST: CollectionDefinition[] = Object.values(COLLECTIONS);

export const COLLECTION_SORTS: { value: CollectionSort; label: string }[] = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'rating', label: 'Top rated' },
];

export function isCollectionSlug(value: string): value is CollectionSlug {
  return value in COLLECTIONS;
}
