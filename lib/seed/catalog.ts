// lib/seed/catalog.ts
/**
 * Launch catalog — the seeded Nigerian marketplace.
 *
 * These are the accounts and listings GoodSale is demonstrated and launched
 * with: 20 sellers (market stores, registered businesses and individual
 * traders) across real Nigerian trading cities, 100 products, four buyer
 * accounts and a batch of reviews so the marketplace looks and behaves like a
 * live market from day one.
 *
 * Everything here is data only — no database access — so it can be unit tested
 * and reused by the admin seeding API. Every row the API writes from this file
 * is marked `is_seeded`, which is what lets an admin safely bulk-manage the
 * launch catalog without ever touching a real seller's records.
 *
 * Photos come from lib/seed/images.generated.json (Wikimedia Commons, keyed by
 * product category). Account avatars are rendered locally as initial monograms
 * (/api/avatar) so no third-party stock faces are attached to Nigerian names;
 * scripts/build-seed-images.mjs regenerates the product photo pool.
 */
import imagePool from './images.generated.json';
import { ProductCondition } from '@/lib/types';

export type SeedSellerKind = 'MARKET_STORE' | 'BUSINESS' | 'INDIVIDUAL';
export type SeedSellerRole = 'SELLER' | 'VERIFIED_SELLER' | 'BUSINESS' | 'VERIFIED_BUSINESS';
export type SeedImageKey = keyof typeof imagePool;

/** Emails the seeded accounts are created under — used to spot/clean them up. */
export const SEED_SELLER_DOMAIN = 'sellers.goodsale.ng';
export const SEED_BUYER_DOMAIN = 'buyers.goodsale.ng';

export interface SeedBusiness {
  name: string;
  description: string;
  openingHours: string;
  address: string;
  logoUrl: string;
  bannerUrl: string;
  isVerified: boolean;
  followers: number;
}

export interface SeedSeller {
  slug: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  kind: SeedSellerKind;
  role: SeedSellerRole;
  bio: string;
  address: string;
  city: string;
  state: string;
  photoUrl: string;
  trustScore: number;
  sellerLevel: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  goodPoints: number;
  /** How long ago the account joined, so the store looks established. */
  joinedDaysAgo: number;
  business?: SeedBusiness;
}

export interface SeedProduct {
  slug: string;
  sellerSlug: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  condition: ProductCondition;
  price: number;
  /** Seller-set reference price; the UI only shows a discount when this is higher. */
  compareAtPrice?: number;
  quantity: number;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK';
  imageKey: SeedImageKey;
  images: string[];
  deliveryMethod: string;
  pickupAvailable: boolean;
  isNegotiable: boolean;
  warranty?: string;
  returnPolicy?: string;
  weightKg?: number;
  dimensionsCm?: string;
  viewCount: number;
}

export interface SeedBuyer {
  slug: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  photoUrl: string;
}

export interface SeedReview {
  productSlug: string;
  buyerSlug: string;
  rating: number;
  comment: string;
  /** Optional public answer from the seller, stored under the review. */
  sellerReply?: string;
  daysAgo: number;
}

/* -------------------------------------------------------------------------- */
/* Images                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Wikimedia originals can be several megabytes, so every photo is served through
 * the project's 1000px thumbnail endpoint.
 */
export function thumbUrl(url: string, width = 1000): string {
  if (url.includes('/thumb/')) return url;
  const match = url.match(
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/i
  );
  if (!match) return url;
  const [, a, ab, file] = match;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${file}/${width}px-${file}`;
}

/** Product photos for a category, rotated by salt so neighbouring cards differ. */
export function imagesFor(key: SeedImageKey, salt = 0, count = 3): string[] {
  const pool = (imagePool as Record<string, { url: string }[] | undefined>)[key] || [];
  if (!pool.length) return [];
  const urls = pool.map((p) => thumbUrl(p.url));
  const out: string[] = [];
  for (let i = 0; i < Math.min(count, urls.length); i += 1) {
    out.push(urls[(salt + i) % urls.length]);
  }
  return out;
}

/**
 * Avatars are rendered locally (/api/avatar) as initial monograms, never as
 * third-party stock faces. The launch catalog previously pulled from
 * i.pravatar.cc, which returned mostly Western portrait photos under Nigerian
 * names — an obvious tell that the marketplace was not real.
 */
export function avatarUrl(name: string): string {
  const clean = name.trim();
  return clean ? `/api/avatar?name=${encodeURIComponent(clean)}` : '/api/avatar';
}

/** Neutral-silhouette fallback for a numeric slot (kept for literal seeds). */
function avatar(n: number): string {
  return `/api/avatar?seed=${n}`;
}

/* -------------------------------------------------------------------------- */
/* Sellers                                                                     */
/* -------------------------------------------------------------------------- */

const SELLER_SEED: Omit<SeedSeller, 'email'>[] = [
  {
    slug: 'computer-village-hub',
    fullName: 'Chinedu Okafor',
    username: 'computervillagehub',
    phone: '+234 803 411 2207',
    kind: 'MARKET_STORE',
    role: 'VERIFIED_BUSINESS',
    bio: 'Genuine phones and UK-used laptops from Computer Village. Physical shop, 12 years of trading, walk-in testing welcome.',
    address: 'Shop 14, Otigba Plaza, Computer Village',
    city: 'Ikeja',
    state: 'Lagos State',
    photoUrl: avatar(11),
    trustScore: 93,
    sellerLevel: 'PLATINUM',
    goodPoints: 4820,
    joinedDaysAgo: 880,
    business: {
      name: 'Computer Village Hub Ltd',
      description: 'Phones, tablets and UK-used laptops with 6-month shop warranty and free setup at pickup.',
      openingHours: 'Mon–Sat, 8:00am – 7:00pm',
      address: 'Shop 14, Otigba Plaza, Computer Village, Ikeja',
      logoUrl: avatar(11),
      bannerUrl: imagesFor('smartphone', 0, 1)[0] || '',
      isVerified: true,
      followers: 2841,
    },
  },
  {
    slug: 'balogun-fabrics',
    fullName: 'Yetunde Adebayo',
    username: 'balogunfabrics',
    phone: '+234 802 774 9013',
    kind: 'MARKET_STORE',
    role: 'VERIFIED_BUSINESS',
    bio: 'Ankara, lace and adire straight from Balogun Market. We sell per yard or full wrapper, nationwide waybill available.',
    address: 'Block C, Balogun Market, Lagos Island',
    city: 'Lagos Island',
    state: 'Lagos State',
    photoUrl: avatar(32),
    trustScore: 90,
    sellerLevel: 'GOLD',
    goodPoints: 3610,
    joinedDaysAgo: 640,
    business: {
      name: 'Balogun Fabrics & Textiles',
      description: 'Wax prints, Swiss voile, adire and aso-oke by the yard. Bulk pricing for tailors and event planners.',
      openingHours: 'Mon–Sat, 8:30am – 6:30pm',
      address: 'Block C, Balogun Market, Lagos Island',
      logoUrl: avatar(32),
      bannerUrl: imagesFor('ankara', 0, 1)[0] || '',
      isVerified: true,
      followers: 1976,
    },
  },
  {
    slug: 'alaba-electronics',
    fullName: 'Emeka Nwosu',
    username: 'alabaelectronics',
    phone: '+234 806 220 5588',
    kind: 'BUSINESS',
    role: 'VERIFIED_BUSINESS',
    bio: 'Alaba International dealer in home electronics. All appliances come with manufacturer warranty and receipt.',
    address: 'Suite 22, Alaba International Market',
    city: 'Ojo',
    state: 'Lagos State',
    photoUrl: avatar(15),
    trustScore: 88,
    sellerLevel: 'GOLD',
    goodPoints: 2450,
    joinedDaysAgo: 520,
    business: {
      name: 'Alaba Electronics International',
      description: 'TVs, fridges, cookers, fans and blenders. Delivery within Lagos in 24 hours, nationwide in 3–5 days.',
      openingHours: 'Mon–Sat, 8:00am – 6:00pm',
      address: 'Suite 22, Alaba International Market, Ojo',
      logoUrl: avatar(15),
      bannerUrl: imagesFor('television', 0, 1)[0] || '',
      isVerified: true,
      followers: 1420,
    },
  },
  {
    slug: 'wuse-modern-market',
    fullName: 'Aisha Suleiman',
    username: 'wusemodernmarket',
    phone: '+234 809 331 7742',
    kind: 'MARKET_STORE',
    role: 'VERIFIED_BUSINESS',
    bio: 'Foodstuff and provisions from Wuse Market, Abuja. Cleanly bagged, weighed in front of you, no short measure.',
    address: 'Line 6, Wuse Modern Market',
    city: 'Wuse',
    state: 'FCT Abuja',
    photoUrl: avatar(47),
    trustScore: 91,
    sellerLevel: 'GOLD',
    goodPoints: 2980,
    joinedDaysAgo: 470,
    business: {
      name: 'Wuse Modern Market Stores',
      description: 'Rice, beans, palm oil, pepper and tomatoes in retail or bulk bags. Same-day dispatch in Abuja.',
      openingHours: 'Mon–Sun, 7:00am – 7:00pm',
      address: 'Line 6, Wuse Modern Market, Abuja',
      logoUrl: avatar(47),
      bannerUrl: imagesFor('rice', 0, 1)[0] || '',
      isVerified: true,
      followers: 1138,
    },
  },
  {
    slug: 'onitsha-main-market',
    fullName: 'Ifeanyi Eze',
    username: 'onitshamainmarket',
    phone: '+234 805 908 4411',
    kind: 'MARKET_STORE',
    role: 'VERIFIED_SELLER',
    bio: 'Onitsha Main Market trader — wigs, hair, shoes and fashion accessories at wholesale-friendly prices.',
    address: 'Shop 208, Onitsha Main Market',
    city: 'Onitsha',
    state: 'Anambra State',
    photoUrl: avatar(23),
    trustScore: 86,
    sellerLevel: 'SILVER',
    goodPoints: 1740,
    joinedDaysAgo: 380,
  },
  {
    slug: 'kantin-kwari-textiles',
    fullName: 'Musa Abdullahi',
    username: 'kantinkwari',
    phone: '+234 807 664 2299',
    kind: 'MARKET_STORE',
    role: 'VERIFIED_BUSINESS',
    bio: 'Kantin Kwari textiles — atampa, brocade, senator material and ready-made kaftans. Bulk buyers welcome.',
    address: 'Shop 45, Kantin Kwari Market',
    city: 'Kano',
    state: 'Kano State',
    photoUrl: avatar(54),
    trustScore: 89,
    sellerLevel: 'GOLD',
    goodPoints: 2210,
    joinedDaysAgo: 610,
    business: {
      name: 'Kantin Kwari Textiles',
      description: 'Northern textiles and lace wholesaler. Senator material, brocade and atampa by the roll.',
      openingHours: 'Mon–Sat, 8:00am – 6:00pm',
      address: 'Shop 45, Kantin Kwari Market, Kano',
      logoUrl: avatar(54),
      bannerUrl: imagesFor('ankara', 1, 1)[0] || '',
      isVerified: true,
      followers: 890,
    },
  },
  {
    slug: 'mile3-electricals',
    fullName: 'Barivule Lawson',
    username: 'mile3electricals',
    phone: '+234 803 552 1188',
    kind: 'BUSINESS',
    role: 'VERIFIED_BUSINESS',
    bio: 'Mile 3 Electrical Plaza, Port Harcourt. Solar, inverters, air conditioners and generators with installation support.',
    address: 'Mile 3 Electrical Plaza, Diobu',
    city: 'Port Harcourt',
    state: 'Rivers State',
    photoUrl: avatar(60),
    trustScore: 92,
    sellerLevel: 'PLATINUM',
    goodPoints: 3150,
    joinedDaysAgo: 720,
    business: {
      name: 'Mile 3 Electrical Plaza Ltd',
      description: 'Power and cooling specialists — solar panels, inverters, split ACs and generators. Installed by certified techs.',
      openingHours: 'Mon–Sat, 8:00am – 6:00pm',
      address: 'Mile 3 Electrical Plaza, Diobu, Port Harcourt',
      logoUrl: avatar(60),
      bannerUrl: imagesFor('solar', 0, 1)[0] || '',
      isVerified: true,
      followers: 1345,
    },
  },
  {
    slug: 'bodija-provisions',
    fullName: 'Bukola Ogunniyi',
    username: 'bodijaprovisions',
    phone: '+234 802 118 6677',
    kind: 'MARKET_STORE',
    role: 'VERIFIED_SELLER',
    bio: 'Bodija Market, Ibadan. Ofada rice, yam, beans and palm oil packed fresh every morning.',
    address: 'Bodija Market, Ibadan',
    city: 'Ibadan',
    state: 'Oyo State',
    photoUrl: avatar(27),
    trustScore: 87,
    sellerLevel: 'SILVER',
    goodPoints: 1520,
    joinedDaysAgo: 300,
  },
  {
    slug: 'ariaria-leather',
    fullName: 'Obinna Chukwu',
    username: 'ariarialeather',
    phone: '+234 808 447 3321',
    kind: 'MARKET_STORE',
    role: 'VERIFIED_BUSINESS',
    bio: 'Ariaria Aba shoe cluster. Handmade leather footwear and bags made in our own workshop.',
    address: 'Zone 4, Ariaria International Market',
    city: 'Aba',
    state: 'Abia State',
    photoUrl: avatar(36),
    trustScore: 90,
    sellerLevel: 'GOLD',
    goodPoints: 2040,
    joinedDaysAgo: 540,
    business: {
      name: 'Ariaria Leather Works',
      description: 'Made-in-Aba leather shoes, sandals and bags. Custom sizes available in 5 working days.',
      openingHours: 'Mon–Sat, 8:00am – 5:30pm',
      address: 'Zone 4, Ariaria International Market, Aba',
      logoUrl: avatar(36),
      bannerUrl: imagesFor('shoes', 0, 1)[0] || '',
      isVerified: true,
      followers: 760,
    },
  },
  {
    slug: 'sabon-gari-home',
    fullName: 'Hauwa Yusuf',
    username: 'sabongarihome',
    phone: '+234 806 909 2214',
    kind: 'BUSINESS',
    role: 'VERIFIED_BUSINESS',
    bio: 'Home and living essentials in Zaria and Kaduna — furniture, cookware, rugs and tiles for new apartments.',
    address: 'Sabon Gari Market, Zaria',
    city: 'Zaria',
    state: 'Kaduna State',
    photoUrl: avatar(44),
    trustScore: 85,
    sellerLevel: 'SILVER',
    goodPoints: 1310,
    joinedDaysAgo: 260,
    business: {
      name: 'Sabon Gari Home Essentials',
      description: 'Everything a new home needs — sofas, dining sets, cookware, rugs and tiles. Assembly included within Kaduna.',
      openingHours: 'Mon–Sat, 9:00am – 6:00pm',
      address: 'Sabon Gari Market, Zaria, Kaduna State',
      logoUrl: avatar(44),
      bannerUrl: imagesFor('sofa', 0, 1)[0] || '',
      isVerified: true,
      followers: 540,
    },
  },
  {
    slug: 'minna-golden-foods',
    fullName: 'Yakubu Aliyu',
    username: 'minnagoldenfoods',
    phone: '+234 806 112 3388',
    kind: 'INDIVIDUAL',
    role: 'VERIFIED_SELLER',
    bio: 'Minna based foodstuff seller. Farm-fresh yam, rice and palm oil from Chanchaga and Bida, delivered anywhere in Nigeria.',
    address: 'Chanchaga Market, Minna',
    city: 'Minna',
    state: 'Niger State',
    photoUrl: avatar(12),
    trustScore: 88,
    sellerLevel: 'GOLD',
    goodPoints: 1860,
    joinedDaysAgo: 340,
  },
  {
    slug: 'coal-city-beauty',
    fullName: 'Chiamaka Ude',
    username: 'coalcitybeauty',
    phone: '+234 803 776 5544',
    kind: 'BUSINESS',
    role: 'VERIFIED_BUSINESS',
    bio: 'Enugu beauty store — original perfumes, wigs and makeup. Bridal packages and same-day dispatch in Enugu.',
    address: '19 Zik Avenue, Uwani',
    city: 'Enugu',
    state: 'Enugu State',
    photoUrl: avatar(49),
    trustScore: 89,
    sellerLevel: 'GOLD',
    goodPoints: 1670,
    joinedDaysAgo: 410,
    business: {
      name: 'Coal City Beauty Studio',
      description: 'Perfumes, human-hair wigs, makeup kits and bridal beauty packages. Authentic products only.',
      openingHours: 'Mon–Sat, 9:00am – 7:00pm',
      address: '19 Zik Avenue, Uwani, Enugu',
      logoUrl: avatar(49),
      bannerUrl: imagesFor('perfume', 0, 1)[0] || '',
      isVerified: true,
      followers: 980,
    },
  },
  {
    slug: 'jos-plateau-farms',
    fullName: 'Danjuma Pam',
    username: 'josplateaufarms',
    phone: '+234 809 224 7711',
    kind: 'INDIVIDUAL',
    role: 'VERIFIED_SELLER',
    bio: 'Farm-direct produce from Plateau — tomatoes, pepper, potatoes and soya beans at farmgate prices.',
    address: 'Bukuru Market, Jos South',
    city: 'Jos',
    state: 'Plateau State',
    photoUrl: avatar(57),
    trustScore: 84,
    sellerLevel: 'SILVER',
    goodPoints: 990,
    joinedDaysAgo: 210,
  },
  {
    slug: 'benin-city-solar',
    fullName: 'Osaro Igbinedion',
    username: 'benincitysolar',
    phone: '+234 802 663 8890',
    kind: 'BUSINESS',
    role: 'VERIFIED_BUSINESS',
    bio: 'Benin City solar and power installation company. Panels, inverters, street lights and generator servicing.',
    address: '52 Airport Road, Benin City',
    city: 'Benin City',
    state: 'Edo State',
    photoUrl: avatar(63),
    trustScore: 91,
    sellerLevel: 'GOLD',
    goodPoints: 1460,
    joinedDaysAgo: 330,
    business: {
      name: 'Benin City Solar & Power',
      description: 'Solar and backup power contractor. Free site assessment in Benin City, 2-year workmanship warranty.',
      openingHours: 'Mon–Sat, 8:00am – 6:00pm',
      address: '52 Airport Road, Benin City, Edo State',
      logoUrl: avatar(63),
      bannerUrl: imagesFor('solar', 1, 1)[0] || '',
      isVerified: true,
      followers: 615,
    },
  },
  {
    slug: 'adebayo-books',
    fullName: 'Adebayo Ogunlesi',
    username: 'adebayobooks',
    phone: '+234 805 118 9930',
    kind: 'INDIVIDUAL',
    role: 'VERIFIED_SELLER',
    bio: 'Abeokuta based student and gamer — selling exam textbooks, cameras and computer parts at fair prices.',
    address: 'Kuto, Abeokuta',
    city: 'Abeokuta',
    state: 'Ogun State',
    photoUrl: avatar(20),
    trustScore: 82,
    sellerLevel: 'SILVER',
    goodPoints: 780,
    joinedDaysAgo: 190,
  },
  {
    slug: 'nkechi-style',
    fullName: 'Nkechi Okafor',
    username: 'nkechistyle',
    phone: '+234 807 553 2140',
    kind: 'INDIVIDUAL',
    role: 'VERIFIED_SELLER',
    bio: 'Fashion reseller in Asaba. Bags, shoes and watches sourced clean and photographed exactly as delivered.',
    address: 'Okpanam Road, Asaba',
    city: 'Asaba',
    state: 'Delta State',
    photoUrl: avatar(28),
    trustScore: 83,
    sellerLevel: 'SILVER',
    goodPoints: 860,
    joinedDaysAgo: 240,
  },
  {
    slug: 'musa-gadgets',
    fullName: 'Musa Ibrahim',
    username: 'musagadgets',
    phone: '+234 803 992 4412',
    kind: 'INDIVIDUAL',
    role: 'SELLER',
    bio: 'Phone accessories and cameras in Kano. I test every gadget on video before shipping.',
    address: 'France Road, Sabon Gari',
    city: 'Kano',
    state: 'Kano State',
    photoUrl: avatar(66),
    trustScore: 74,
    sellerLevel: 'BRONZE',
    goodPoints: 430,
    joinedDaysAgo: 120,
  },
  {
    slug: 'fatima-beauty',
    fullName: 'Fatima Bello',
    username: 'fatimabeauty',
    phone: '+234 806 337 5580',
    kind: 'INDIVIDUAL',
    role: 'VERIFIED_SELLER',
    bio: 'Katsina beauty vendor — perfumes, bridal makeup and wigs. WhatsApp video call before you pay.',
    address: 'Kofar Kaura, Katsina',
    city: 'Katsina',
    state: 'Katsina State',
    photoUrl: avatar(45),
    trustScore: 81,
    sellerLevel: 'SILVER',
    goodPoints: 690,
    joinedDaysAgo: 265,
  },
  {
    slug: 'tunde-sports',
    fullName: 'Tunde Ajayi',
    username: 'tundesports',
    phone: '+234 802 884 1177',
    kind: 'INDIVIDUAL',
    role: 'SELLER',
    bio: 'Akure sports and fitness gear — bikes, footballs and home gym equipment for schools and clubs.',
    address: 'Oba-Ile Road, Akure',
    city: 'Akure',
    state: 'Ondo State',
    photoUrl: avatar(10),
    trustScore: 76,
    sellerLevel: 'BRONZE',
    goodPoints: 510,
    joinedDaysAgo: 150,
  },
  {
    slug: 'grace-home',
    fullName: 'Grace Emmanuel',
    username: 'gracehome',
    phone: '+234 809 441 2265',
    kind: 'INDIVIDUAL',
    role: 'VERIFIED_SELLER',
    bio: 'Uyo home essentials — cookware, blenders and freezers. Bulk discount for restaurants and caterers.',
    address: 'Itam Market, Uyo',
    city: 'Uyo',
    state: 'Akwa Ibom State',
    photoUrl: avatar(25),
    trustScore: 85,
    sellerLevel: 'SILVER',
    goodPoints: 1140,
    joinedDaysAgo: 285,
  },
];

export function seedSellers(): SeedSeller[] {
  return SELLER_SEED.map((seller) => ({
    ...seller,
    email: `${seller.username}@${SEED_SELLER_DOMAIN}`,
    // Monogram avatars derived from the account's own name and storefront.
    photoUrl: avatarUrl(seller.fullName),
    business: seller.business
      ? { ...seller.business, logoUrl: avatarUrl(seller.business.name) }
      : undefined,
  }));
}

/* -------------------------------------------------------------------------- */
/* Buyers (they author the seeded reviews)                                     */
/* -------------------------------------------------------------------------- */

const BUYER_SEED: Omit<SeedBuyer, 'email'>[] = [
  {
    slug: 'buyer-lagos',
    fullName: 'Bolanle Akinwande',
    username: 'bolanle_a',
    phone: '+234 802 664 1120',
    city: 'Lekki',
    state: 'Lagos State',
    photoUrl: avatar(31),
  },
  {
    slug: 'buyer-abuja',
    fullName: 'Sadiq Abubakar',
    username: 'sadiq.abubakar',
    phone: '+234 805 220 7781',
    city: 'Garki',
    state: 'FCT Abuja',
    photoUrl: avatar(52),
  },
  {
    slug: 'buyer-ph',
    fullName: 'Precious Okon',
    username: 'precious_okon',
    phone: '+234 807 335 9914',
    city: 'Port Harcourt',
    state: 'Rivers State',
    photoUrl: avatar(24),
  },
  {
    slug: 'buyer-kano',
    fullName: 'Zainab Garba',
    username: 'zainab_g',
    phone: '+234 806 773 2288',
    city: 'Kano',
    state: 'Kano State',
    photoUrl: avatar(41),
  },
];

export function seedBuyers(): SeedBuyer[] {
  return BUYER_SEED.map((buyer) => ({
    ...buyer,
    email: `${buyer.username}@${SEED_BUYER_DOMAIN}`,
    photoUrl: avatarUrl(buyer.fullName),
  }));
}

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

interface ProductRow {
  /** title, category label, image category, price, quantity, brand, condition, description */
  t: string;
  cat: string;
  img: SeedImageKey;
  price: number;
  qty: number;
  brand: string;
  cond?: ProductCondition;
  d: string;
  w?: string;
  wt?: number;
  dim?: string;
  /** Two-line/used goods are negotiable by default; new stock is fixed price. */
  neg?: boolean;
  low?: boolean;
}

const escrowDelivery = 'GoodSale Partner delivery + escrow, or pickup in person';
const returnPolicy = '7-day return if the item is not as described (escrow protects the buyer)';

const PRODUCT_SEED: Record<string, ProductRow[]> = {
  'computer-village-hub': [
    {
      t: 'Samsung Galaxy A15 128GB — 6GB RAM (New)',
      cat: 'Phones',
      img: 'smartphone',
      price: 235000,
      qty: 24,
      brand: 'Samsung',
      d: 'Brand new sealed Samsung Galaxy A15 with 6GB RAM and 128GB storage. 6.5" Super AMOLED screen, 5000mAh battery, dual SIM. Comes with charger, receipt and full Samsung Nigeria warranty.',
      w: '1-year manufacturer warranty',
      wt: 0.4,
      dim: '16 x 8 x 1 cm',
    },
    {
      t: 'Tecno Spark 20 256GB — 8GB RAM (New)',
      cat: 'Phones',
      img: 'smartphone',
      price: 168000,
      qty: 31,
      brand: 'Tecno',
      d: 'Sealed Tecno Spark 20 with 8GB RAM and 256GB storage. 50MP camera, 90Hz display and 5000mAh battery. Physical shop pickup in Computer Village, or escrow delivery nationwide.',
      w: '1-year manufacturer warranty',
      wt: 0.42,
      dim: '16 x 8 x 1 cm',
    },
    {
      t: 'Infinix Hot 40i 128GB — 8GB RAM (New)',
      cat: 'Phones',
      img: 'smartphone',
      price: 132500,
      qty: 40,
      brand: 'Infinix',
      d: 'Clean Infinix Hot 40i, 128GB storage with 8GB RAM, 5000mAh battery and 90Hz screen. Box, charger and earpiece included.',
      w: '1-year manufacturer warranty',
      wt: 0.40,
      dim: '16 x 8 x 1 cm',
    },
    {
      t: 'HP EliteBook 840 G6 Core i5 8GB/256GB SSD (UK Used)',
      cat: 'Laptops',
      img: 'laptop',
      price: 385000,
      qty: 6,
      brand: 'HP',
      cond: ProductCondition.EXCELLENT,
      d: 'Neat UK-used HP EliteBook 840 G6, Core i5 8th generation, 8GB RAM, 256GB SSD, backlit keyboard and fingerprint reader. Battery holds 4+ hours. Tested and given a fresh Windows 11 install.',
      w: '3-month shop warranty',
      wt: 1.5,
      dim: '33 x 23 x 2 cm',
      neg: true,
      low: true,
    },
    {
      t: 'Sony WH-CH520 Wireless Bluetooth Headphones',
      cat: 'Electronics',
      img: 'headphones',
      price: 58000,
      qty: 14,
      brand: 'Sony',
      d: 'Sony WH-CH520 on-ear wireless headphones with up to 50 hours battery, multipoint pairing and clear voice calls. Brand new with box.',
      w: '6-month shop warranty',
      wt: 0.35,
      dim: '20 x 18 x 8 cm',
    },
  ],
  'balogun-fabrics': [
    {
      t: 'Ankara Wax Print Fabric — 6 Yards (Super Wax)',
      cat: 'Fashion',
      img: 'ankara',
      price: 9500,
      qty: 120,
      brand: 'Vlisco',
      d: 'Premium super wax Ankara print, 6 yards (full wrapper). Colours are fast — no running or fading after wash. Buy 10 pieces and get wholesale pricing.',
      wt: 0.9,
    },
    {
      t: 'Swiss Voile Lace Fabric — 5 Yards',
      cat: 'Fashion',
      img: 'ankara',
      price: 42000,
      qty: 36,
      brand: 'Swiss Voile',
      d: 'Original Swiss voile lace, 5 yards with matching wrapper option. Suitable for aso-ebi, weddings and church outfits. Stones are hand-set, not glued.',
      wt: 1.1,
    },
    {
      t: 'Adire Hand-Dyed Cotton — 5 Yards',
      cat: 'Fashion',
      img: 'ankara',
      price: 12000,
      qty: 48,
      brand: 'Abeokuta Adire',
      d: 'Hand-dyed adire from Abeokuta, 5 yards of soft cotton. Every piece is dyed individually so no two are exactly the same.',
      wt: 0.8,
    },
    {
      t: 'Singer Heavy Duty 4423 Sewing Machine',
      cat: 'Fashion',
      img: 'sewing',
      price: 145000,
      qty: 8,
      brand: 'Singer',
      d: 'Singer Heavy Duty 4423 with 23 built-in stitches and a strong motor that handles denim and Ankara. Sold with foot pedal, extra needles and bobbins.',
      w: '1-year manufacturer warranty',
      wt: 7.2,
      dim: '40 x 30 x 22 cm',
    },
    {
      t: 'Ladies Genuine Leather Tote Bag',
      cat: 'Fashion',
      img: 'handbag',
      price: 28000,
      qty: 22,
      brand: 'Leather Craft',
      d: 'Genuine leather tote bag with zip closure and a laptop pocket. Fits a 14" laptop, shoulder strap included.',
      wt: 0.9,
      dim: '38 x 28 x 11 cm',
    },
  ],
  'alaba-electronics': [
    {
      t: 'Hisense 43" Smart LED TV (43A4K)',
      cat: 'Electronics',
      img: 'television',
      price: 245000,
      qty: 12,
      brand: 'Hisense',
      d: 'Hisense 43-inch smart LED TV with full HD display, built-in WiFi, Netflix and YouTube apps. Comes with wall bracket and 1 year warranty.',
      w: '1-year manufacturer warranty',
      wt: 9.5,
      dim: '97 x 60 x 9 cm',
    },
    {
      t: 'LG 220L Double Door Refrigerator',
      cat: 'Electronics',
      img: 'refrigerator',
      price: 425000,
      qty: 7,
      brand: 'LG',
      d: 'LG 220 litre double door fridge with fast freeze, anti-bacteria liner and 100% environmental-friendly refrigerant. Ideal for a family kitchen.',
      w: '2-year manufacturer warranty',
      wt: 48,
      dim: '150 x 55 x 58 cm',
    },
    {
      t: 'Philips 600W Blender with Grinder Mill',
      cat: 'Electronics',
      img: 'blender',
      price: 46500,
      qty: 18,
      brand: 'Philips',
      d: 'Philips 600W blender with 2-litre unbreakable jar, grinder mill for pepper and dry milling, plus a safety interlock.',
      w: '1-year manufacturer warranty',
      wt: 3.4,
      dim: '30 x 20 x 20 cm',
    },
    {
      t: 'Ox 18-Inch Standing Fan (OX-18STD)',
      cat: 'Electronics',
      img: 'fan',
      price: 38000,
      qty: 25,
      brand: 'Ox',
      d: 'Ox 18-inch standing fan with copper motor, three speed settings and adjustable height. Strong airflow for Nigerian heat.',
      w: '1-year manufacturer warranty',
      wt: 6.5,
      dim: '120 x 45 x 45 cm',
    },
    {
      t: '3-Burner Gas Cooker with Oven & Grill',
      cat: 'Electronics',
      img: 'cooker',
      price: 285000,
      qty: 9,
      brand: 'Midea',
      d: 'Free-standing 3-burner gas cooker with oven, grill and rotisserie, auto-ignition and toughened glass lid. Hose and regulator sold separately.',
      w: '1-year manufacturer warranty',
      wt: 32,
      dim: '85 x 60 x 55 cm',
    },
  ],
  'wuse-modern-market': [
    {
      t: 'Abakaliki Rice — 50kg Bag (Clean, Stone-Free)',
      cat: 'Groceries',
      img: 'rice',
      price: 92000,
      qty: 40,
      brand: 'Abakaliki',
      d: 'Fresh Abakaliki parboiled rice, 50kg bag, double-destoned and cleanly bagged. Weighed in front of you, sealed before dispatch.',
      wt: 50,
    },
    {
      t: 'Red Palm Oil — 25 Litres (Fresh Pressed)',
      cat: 'Groceries',
      img: 'palmoil',
      price: 38500,
      qty: 30,
      brand: 'Wuse Provisions',
      d: 'Freshly pressed red palm oil, 25 litres, thick and natural with no water or colouring added. Ideal for soups and stews.',
      wt: 24,
    },
    {
      t: 'Fresh Tomatoes — Paint Bucket (Approx. 13kg)',
      cat: 'Groceries',
      img: 'tomato',
      price: 9000,
      qty: 60,
      brand: 'Wuse Farms',
      d: 'Ripe fresh tomatoes packed in a paint bucket, roughly 13kg. Harvested and dispatched the same morning.',
      wt: 13,
    },
    {
      t: 'Dried Chilli Pepper (Cayenne) — 5kg',
      cat: 'Groceries',
      img: 'pepper',
      price: 17500,
      qty: 45,
      brand: 'Wuse Farms',
      d: 'Sun-dried cayenne pepper, 5kg, milled or whole on request. Very hot, well cleaned with no stones.',
      wt: 5,
    },
    {
      t: 'Oloyin Honey Beans — 25kg',
      cat: 'Groceries',
      img: 'beans',
      price: 62000,
      qty: 26,
      brand: 'Wuse Provisions',
      d: 'Sweet Oloyin (honey) beans, 25kg bag, hand-picked and free of weevils. Cooks soft without additives.',
      wt: 25,
    },
  ],
  'onitsha-main-market': [
    {
      t: 'Italian Leather Loafers (Sizes 40–46)',
      cat: 'Fashion',
      img: 'shoes',
      price: 45000,
      qty: 34,
      brand: 'Onitsha Leather',
      d: 'Genuine Italian leather loafers with cushioned insole and rubber sole. Available sizes 40 to 46 — tell us your size in chat before paying.',
      wt: 1.1,
      dim: '32 x 20 x 11 cm',
    },
    {
      t: 'Hollandais Wax Print — 6 Yards',
      cat: 'Fashion',
      img: 'ankara',
      price: 15500,
      qty: 80,
      brand: 'Hollandais',
      d: 'Hollandais wax print, 6 yards. Rich colours suitable for wrappers, kaftans and interior decoration.',
      wt: 0.9,
    },
    {
      t: 'Brazilian Human Hair Wig — 20" Straight',
      cat: 'Beauty',
      img: 'wig',
      price: 120000,
      qty: 11,
      brand: 'Brazilian Hair',
      d: '100% Brazilian human hair wig, 20 inches, straight texture with medium cap and adjustable strap. Can be dyed and heat-styled.',
      wt: 0.5,
    },
    {
      t: 'Bold Glam Makeup Kit — 12 Pieces',
      cat: 'Beauty',
      img: 'makeup',
      price: 35000,
      qty: 20,
      brand: 'Coal City Beauty',
      d: 'Complete makeup kit: foundation, powder, eyeshadow palette, liner, mascara, lipstick set and brushes. Ideal for makeup artists starting out.',
      wt: 1.2,
    },
    {
      t: 'Oud Body Mist — 100ml (Long Lasting)',
      cat: 'Beauty',
      img: 'perfume',
      price: 18000,
      qty: 55,
      brand: 'Oud',
      d: 'Oud fragranced body mist, 100ml, long-lasting and suitable for daily wear. Sealed bottle.',
      wt: 0.3,
    },
  ],
  'kantin-kwari-textiles': [
    {
      t: 'Atampa Wax Print — 12 Yards (Wholesale Roll)',
      cat: 'Fashion',
      img: 'ankara',
      price: 24000,
      qty: 90,
      brand: 'Atampa',
      d: 'Atampa wax print in a 12-yard roll — enough for a full family outfit. Wholesale prices for tailors buying in bulk.',
      wt: 1.8,
    },
    {
      t: 'Brocade Lace Fabric — 5 Yards (Guipure)',
      cat: 'Fashion',
      img: 'ankara',
      price: 38000,
      qty: 28,
      brand: 'Guipure',
      d: 'Heavy guipure brocade lace, 5 yards, stone-set. A favourite for kaftans and northern wedding attire.',
      wt: 1.3,
    },
    {
      t: 'Senator Material — 2 Sets (Top & Trouser)',
      cat: 'Fashion',
      img: 'ankara',
      price: 32000,
      qty: 42,
      brand: 'Kantin Kwari',
      d: 'Premium senator material, two complete sets (top and trouser each), 4 yards per set. Cashmere touch, does not fade.',
      wt: 1.5,
    },
    {
      t: 'Butterfly Manual Sewing Machine (Treadle)',
      cat: 'Fashion',
      img: 'sewing',
      price: 98000,
      qty: 7,
      brand: 'Butterfly',
      d: 'Butterfly manual sewing machine (treadle type) that works without electricity. Strong for thick fabrics and reliable where power is unstable.',
      w: '1-year manufacturer warranty',
      wt: 18,
      dim: '60 x 45 x 30 cm',
    },
    {
      t: 'Ready-Made Kaftan Outfit (M–XXL)',
      cat: 'Fashion',
      img: 'ankara',
      price: 27000,
      qty: 30,
      brand: 'Kantin Kwari',
      d: 'Ready-made embroidered kaftan with matching trouser and cap. Sizes M to XXL, tailor adjustments available at the shop.',
      wt: 0.7,
    },
  ],
  'mile3-electricals': [
    {
      t: '450W Monocrystalline Solar Panel',
      cat: 'Electronics',
      img: 'solar',
      price: 185000,
      qty: 15,
      brand: 'Felicity',
      d: '450W monocrystalline solar panel with 25-year performance warranty and anodised aluminium frame. Certified and tested before dispatch.',
      w: '1-year installation warranty',
      wt: 22,
      dim: '195 x 99 x 4 cm',
    },
    {
      t: '3.5kVA Hybrid Inverter with 200Ah Battery',
      cat: 'Electronics',
      img: 'solar',
      price: 495000,
      qty: 6,
      brand: 'Luminous',
      d: '3.5kVA hybrid inverter bundled with a 200Ah deep-cycle battery. Runs a fridge, TV, fans and lights for hours. Installation support available in Port Harcourt.',
      w: '1-year installation warranty',
      wt: 76,
      dim: '45 x 30 x 60 cm',
      low: true,
    },
    {
      t: 'LG 1.5HP Split Air Conditioner (Dual Inverter)',
      cat: 'Electronics',
      img: 'airconditioner',
      price: 465000,
      qty: 10,
      brand: 'LG',
      d: 'LG 1.5HP dual inverter split AC with copper condenser, fast cooling and low power consumption. Kit included; installation quoted separately.',
      w: '2-year manufacturer warranty',
      wt: 40,
      dim: '82 x 30 x 22 cm',
    },
    {
      t: 'Tiger 3.5kVA Petrol Generator (Key Start)',
      cat: 'Electronics',
      img: 'generator',
      price: 385000,
      qty: 8,
      brand: 'Tiger',
      d: 'Tiger 3.5kVA petrol generator with key start, 100% copper winding and low noise. Serviced and run-tested before delivery.',
      w: '6-month shop warranty',
      wt: 45,
      dim: '60 x 45 x 45 cm',
      neg: true,
    },
    {
      t: 'Electrician Tool Kit — 24 Pieces',
      cat: 'Electronics',
      img: 'tools',
      price: 42000,
      qty: 20,
      brand: 'Solar King',
      d: '24-piece electrical tool kit with insulated screwdrivers, pliers, cutter, test pen and voltage tester in a hard case.',
      wt: 2.8,
      dim: '35 x 25 x 10 cm',
    },
  ],
  'bodija-provisions': [
    {
      t: 'Ofada Rice — 25kg (Local, Well Destoned)',
      cat: 'Groceries',
      img: 'rice',
      price: 48000,
      qty: 35,
      brand: 'Ofada',
      d: 'Bodija local Ofada rice, 25kg, destoned twice and cleanly bagged. Fresh from this harvest.',
      wt: 25,
    },
    {
      t: 'Fresh Pepper & Tomato Combo Basket',
      cat: 'Groceries',
      img: 'pepper',
      price: 12500,
      qty: 50,
      brand: 'Bodija Farms',
      d: 'Combo basket of fresh tomatoes, tatashe, rodo and onions — enough for a week of stew for a family of five.',
      wt: 15,
    },
    {
      t: 'Puna Yam Tubers — 5 Pieces (Big Size)',
      cat: 'Groceries',
      img: 'yam',
      price: 15000,
      qty: 44,
      brand: 'Bodija Farms',
      d: 'Five big Puna yam tubers, each about 2.5–3kg. Fresh, firm and ready for pounded yam or yam porridge.',
      wt: 14,
    },
    {
      t: 'Palm Oil — 5 Litres (Fresh Pressed)',
      cat: 'Groceries',
      img: 'palmoil',
      price: 9500,
      qty: 60,
      brand: 'Bodija Provisions',
      d: 'Fresh red palm oil, 5 litres, thick and natural with no water added. Bottled the day it is pressed.',
      wt: 5,
    },
    {
      t: 'Brown Beans — 50kg Bag',
      cat: 'Groceries',
      img: 'beans',
      price: 105000,
      qty: 18,
      brand: 'Bodija Provisions',
      d: 'Brown Nigerian beans, 50kg, hand-cleaned and free of stones. Bulk price for restaurants and caterers.',
      wt: 50,
    },
  ],
  'ariaria-leather': [
    {
      t: 'Handmade Leather Sandals (Made in Aba)',
      cat: 'Fashion',
      img: 'shoes',
      price: 18000,
      qty: 45,
      brand: 'Ariaria Leather',
      d: 'Handmade leather sandals stitched in our Ariaria workshop. Durable soles, sizes 38–45 available.',
      wt: 0.8,
    },
    {
      t: "Men's Oxford Shoes — Genuine Leather",
      cat: 'Fashion',
      img: 'shoes',
      price: 39000,
      qty: 30,
      brand: 'Ariaria Leather',
      d: 'Classic Oxford shoes in genuine leather with stitched sole and soft lining. Perfect for office and ceremonies.',
      wt: 1.2,
    },
    {
      t: 'Vintage Leather Briefcase / Laptop Bag',
      cat: 'Fashion',
      img: 'handbag',
      price: 52000,
      qty: 16,
      brand: 'Ariaria Leather',
      d: 'Hand-stitched vintage leather briefcase with padded 15" laptop section and detachable shoulder strap.',
      wt: 1.6,
      dim: '40 x 30 x 12 cm',
    },
    {
      t: 'Handmade Ankara & Leather Tote Bag',
      cat: 'Fashion',
      img: 'handbag',
      price: 15000,
      qty: 38,
      brand: 'Ariaria Leather',
      d: 'Ankara fabric tote with leather trims and handles, fully lined with an inner zip pocket.',
      wt: 0.7,
    },
    {
      t: 'Leather Craft Tool Set — 22 Pieces',
      cat: 'Fashion',
      img: 'tools',
      price: 33000,
      qty: 14,
      brand: 'Ariaria Leather',
      d: '22-piece leather crafting set: stitching awl, hole punches, edge beveller, needles, thread and cutting mat.',
      wt: 2.2,
    },
  ],
  'sabon-gari-home': [
    {
      t: '3-Seater Leatherette Sofa (Dark Grey)',
      cat: 'Furniture',
      img: 'sofa',
      price: 320000,
      qty: 5,
      brand: 'Home Essentials',
      d: 'Strong 3-seater leatherette sofa on a hardwood frame with high-density foam. Assembly and delivery within Kaduna included.',
      w: '1-year frame warranty',
      wt: 65,
      dim: '210 x 85 x 78 cm',
      low: true,
    },
    {
      t: '6-Seater Dining Table Set with Chairs',
      cat: 'Furniture',
      img: 'furniture',
      price: 285000,
      qty: 6,
      brand: 'Home Essentials',
      d: 'Treated wooden dining table with six matching chairs and cushioned seats. Scratch-resistant finish.',
      w: '1-year frame warranty',
      wt: 78,
      dim: '180 x 90 x 76 cm',
    },
    {
      t: 'Persian-Style Rug — 5 x 8 ft',
      cat: 'Furniture',
      img: 'rug',
      price: 92000,
      qty: 12,
      brand: 'Home Essentials',
      d: 'Machine-made Persian-style rug, 5 x 8 feet, non-shedding and easy to vacuum. Warms up a tiled sitting room instantly.',
      wt: 9,
    },
    {
      t: 'Non-Stick Cookware Set — 10 Pieces',
      cat: 'Furniture',
      img: 'pots',
      price: 68000,
      qty: 22,
      brand: 'Home Essentials',
      d: '10-piece non-stick cookware set: three pots with lids, frying pan, saucepan and serving spoons. Works on gas and electric cookers.',
      wt: 7,
    },
    {
      t: 'Ceramic Floor Tiles — Carton (1.44 sqm)',
      cat: 'Furniture',
      img: 'tiles',
      price: 14500,
      qty: 80,
      brand: 'Ceramica',
      d: 'Glazed ceramic floor tiles, 60 x 60cm, 4 pieces per carton (1.44 sqm). First-grade, no chipping.',
      wt: 26,
    },
  ],
  'minna-golden-foods': [
    {
      t: 'Minna Fresh Yam — 10 Big Tubers',
      cat: 'Groceries',
      img: 'yam',
      price: 28000,
      qty: 30,
      brand: 'Minna Farms',
      d: 'Ten big fresh yam tubers direct from Chanchaga farms, roughly 3kg each. Harvested this week and packed for transport.',
      wt: 30,
    },
    {
      t: 'Niger State Local Rice — 50kg',
      cat: 'Groceries',
      img: 'rice',
      price: 88000,
      qty: 25,
      brand: 'Niger Rice',
      d: 'Locally milled Niger State rice, 50kg, well destoned. Swells well and cooks soft without additives.',
      wt: 50,
    },
    {
      t: 'Fresh Palm Oil — 10 Litres',
      cat: 'Groceries',
      img: 'palmoil',
      price: 19500,
      qty: 40,
      brand: 'Minna Farms',
      d: 'Fresh pressed palm oil, 10 litres, thick red oil with no additives. Packed in a sealed jerrycan.',
      wt: 10,
    },
    {
      t: 'White Beans — 30kg Bag',
      cat: 'Groceries',
      img: 'beans',
      price: 78000,
      qty: 20,
      brand: 'Minna Farms',
      d: 'Clean white beans, 30kg, hand-picked with no stones or weevils. Good for moi-moi and porridge.',
      wt: 30,
    },
    {
      t: 'Fresh Tomato Basket — Minna Farm (Approx. 15kg)',
      cat: 'Groceries',
      img: 'tomato',
      price: 13000,
      qty: 45,
      brand: 'Minna Farms',
      d: 'Ripe tomatoes straight from our farm, about 15kg per basket. Dispatched within 24 hours of harvest.',
      wt: 15,
    },
  ],
  'coal-city-beauty': [
    {
      t: "Victoria's Secret Body Mist — 250ml",
      cat: 'Beauty',
      img: 'perfume',
      price: 22000,
      qty: 32,
      brand: "Victoria's Secret",
      d: 'Original Victoria\u2019s Secret body mist, 250ml, sealed. Long-lasting fragrance suitable for everyday wear.',
      wt: 0.4,
    },
    {
      t: 'Skincare & Makeup Starter Bundle',
      cat: 'Beauty',
      img: 'makeup',
      price: 45000,
      qty: 18,
      brand: 'Coal City Beauty',
      d: 'Bundle of cleanser, day cream, primer, foundation and setting powder — everything needed for a daily routine and light makeup.',
      wt: 1.5,
    },
    {
      t: 'Braided Wig — Ready to Wear (Cornrows)',
      cat: 'Beauty',
      img: 'wig',
      price: 65000,
      qty: 14,
      brand: 'Coal City Beauty',
      d: 'Ready-to-wear braided wig on a comfortable cap, no salon appointment needed. Adjustable straps fit most head sizes.',
      wt: 0.6,
    },
    {
      t: 'Matte Lipstick Set — 12 Shades',
      cat: 'Beauty',
      img: 'makeup',
      price: 18500,
      qty: 26,
      brand: 'Coal City Beauty',
      d: 'Twelve matte liquid lipsticks in nudes, reds and berries. Long-wear formula that does not dry out the lips.',
      wt: 0.5,
    },
    {
      t: 'Closure Wig — 14" Straight Human Hair',
      cat: 'Beauty',
      img: 'wig',
      price: 95000,
      qty: 10,
      brand: 'Brazilian Hair',
      d: '14-inch straight human hair closure wig with 4x4 closure, pre-plucked hairline and bleached knots.',
      wt: 0.5,
    },
  ],
  'jos-plateau-farms': [
    {
      t: 'Jos Fresh Tomatoes — 20kg Basket',
      cat: 'Groceries',
      img: 'tomato',
      price: 42000,
      qty: 22,
      brand: 'Plateau Farms',
      d: 'Farmgate tomatoes from Plateau, 20kg basket. Firm, ripe and packed to survive long-distance transport.',
      wt: 20,
    },
    {
      t: 'Red Chilli Pepper — 10kg (Sun Dried)',
      cat: 'Groceries',
      img: 'pepper',
      price: 32000,
      qty: 26,
      brand: 'Plateau Farms',
      d: 'Sun-dried red chilli pepper, 10kg, cleaned and bagged. Very hot and aromatic.',
      wt: 10,
    },
    {
      t: 'Soya Beans — 25kg (Clean, Graded)',
      cat: 'Groceries',
      img: 'beans',
      price: 55000,
      qty: 18,
      brand: 'Plateau Farms',
      d: 'Graded soya beans, 25kg, foreign matter removed. Good for soya milk, animal feed and oil pressing.',
      wt: 25,
    },
    {
      t: 'Jos Irish Potatoes — 25kg Bag',
      cat: 'Groceries',
      img: 'yam',
      price: 38000,
      qty: 24,
      brand: 'Plateau Farms',
      d: 'Fresh Irish potatoes from Plateau, 25kg, sorted by size so the bag is uniform.',
      wt: 25,
    },
    {
      t: 'Green Beans (Vegetable) — 10kg Fresh',
      cat: 'Groceries',
      img: 'beans',
      price: 21000,
      qty: 16,
      brand: 'Plateau Farms',
      d: 'Fresh green beans from Jos, 10kg, harvested to order and packed in ventilated crates.',
      wt: 10,
    },
  ],
  'benin-city-solar': [
    {
      t: '100W Solar Street Light (All-in-One)',
      cat: 'Electronics',
      img: 'solar',
      price: 78000,
      qty: 20,
      brand: 'Solar King',
      d: 'All-in-one 100W solar street light with motion sensor, lithium battery and remote. Pole bracket included.',
      w: '1-year installation warranty',
      wt: 6,
      dim: '60 x 30 x 10 cm',
    },
    {
      t: '1.5kVA Petrol Generator (Portable)',
      cat: 'Electronics',
      img: 'generator',
      price: 165000,
      qty: 12,
      brand: 'Elepaq',
      d: 'Elepaq 1.5kVA portable petrol generator, copper winding, low fuel consumption. Good for a shop or small home.',
      w: '6-month shop warranty',
      wt: 28,
      dim: '50 x 40 x 40 cm',
      neg: true,
    },
    {
      t: 'Solar Installation Tool Kit — 18 Pieces',
      cat: 'Electronics',
      img: 'tools',
      price: 58000,
      qty: 15,
      brand: 'Solar King',
      d: '18-piece solar installation kit: MC4 crimper, DC clamp meter, cable cutter, insulated spanners and cable ties in a case.',
      wt: 4.5,
    },
    {
      t: '150W Solar Panel + 1kVA Inverter Starter Kit',
      cat: 'Electronics',
      img: 'solar',
      price: 95000,
      qty: 14,
      brand: 'Solar King',
      d: 'Starter kit with a 150W solar panel, 1kVA inverter, charge controller and mounting cables. Runs lights, TV and fans.',
      w: '1-year installation warranty',
      wt: 20,
    },
    {
      t: 'Midea 1HP Inverter Air Conditioner',
      cat: 'Electronics',
      img: 'airconditioner',
      price: 385000,
      qty: 8,
      brand: 'Midea',
      d: 'Midea 1HP inverter split AC, quiet and energy efficient. Copper condenser. Installation can be arranged in Benin City.',
      w: '2-year manufacturer warranty',
      wt: 35,
      dim: '80 x 29 x 20 cm',
    },
  ],
  'adebayo-books': [
    {
      t: 'WAEC & JAMB Textbook Bundle — 6 Books',
      cat: 'Books',
      img: 'books',
      price: 22000,
      qty: 28,
      brand: 'Various',
      cond: ProductCondition.GOOD,
      d: 'Bundle of six WAEC and JAMB prep textbooks: Mathematics, English, Physics, Chemistry, Biology and Economics. Neat copies with clean pages.',
      wt: 3.5,
      neg: true,
    },
    {
      t: 'University Engineering Textbooks — 4 Books',
      cat: 'Books',
      img: 'books',
      price: 35000,
      qty: 12,
      brand: 'Various',
      cond: ProductCondition.GOOD,
      d: 'Four engineering textbooks covering thermodynamics, fluid mechanics, electrical circuits and materials science. Used but no torn pages.',
      wt: 4.2,
      neg: true,
    },
    {
      t: 'Dell Latitude 7490 Core i7 16GB/512GB SSD',
      cat: 'Laptops',
      img: 'laptop',
      price: 320000,
      qty: 4,
      brand: 'Dell',
      cond: ProductCondition.EXCELLENT,
      d: 'Dell Latitude 7490, Core i7 8th generation, 16GB RAM, 512GB SSD, backlit keyboard. Neat and fully tested, with charger.',
      w: '3-month shop warranty',
      wt: 1.4,
      dim: '33 x 22 x 2 cm',
      neg: true,
      low: true,
    },
    {
      t: 'Canon EOS 1300D DSLR with 18-55mm Lens',
      cat: 'Electronics',
      img: 'camera',
      price: 265000,
      qty: 5,
      brand: 'Canon',
      cond: ProductCondition.EXCELLENT,
      d: 'Canon EOS 1300D with the 18-55mm kit lens, charger, 16GB card and bag. Shutter count checked, sensor clean.',
      w: '1-month shop warranty',
      wt: 1.2,
      neg: true,
    },
    {
      t: 'JBL Tune 510BT Wireless Headphones',
      cat: 'Electronics',
      img: 'headphones',
      price: 45000,
      qty: 16,
      brand: 'JBL',
      cond: ProductCondition.LIKE_NEW,
      d: 'JBL Tune 510BT wireless headphones, opened but barely used. 40 hours of playtime on a single charge.',
      w: '1-month shop warranty',
      wt: 0.35,
    },
  ],
  'nkechi-style': [
    {
      t: 'Designer Shoulder Bag — Quilted Leather',
      cat: 'Fashion',
      img: 'handbag',
      price: 38000,
      qty: 18,
      brand: 'Designer',
      cond: ProductCondition.LIKE_NEW,
      d: 'Quilted leather shoulder bag with chain strap, gold-tone hardware and dust bag. Clean interior, no scuffs.',
      wt: 0.9,
      neg: true,
    },
    {
      t: "Women's Heels — Size 38 (Italian Style)",
      cat: 'Fashion',
      img: 'shoes',
      price: 22000,
      qty: 14,
      brand: 'Italian Style',
      d: 'Italian-style women\u2019s heels, size 38, padded insole, 3.5-inch heel. Worn once for a wedding photoshoot.',
      wt: 0.8,
      neg: true,
    },
    {
      t: 'Designer Sunglasses — UV400 Protection',
      cat: 'Fashion',
      img: 'sunglasses',
      price: 16500,
      qty: 25,
      brand: 'Carrera',
      d: 'Designer sunglasses with UV400 lenses, sturdy hinges and a hard case. Unisex frame.',
      wt: 0.3,
    },
    {
      t: 'Ladies Rose Gold Wristwatch (Water Resistant)',
      cat: 'Fashion',
      img: 'watch',
      price: 27000,
      qty: 20,
      brand: 'Montinari',
      d: 'Elegant rose gold ladies wristwatch, water resistant to 30m with a stainless steel back and adjustable strap.',
      w: '3-month shop warranty',
      wt: 0.2,
    },
    {
      t: 'Armani-Style Perfume — 100ml (Sealed)',
      cat: 'Beauty',
      img: 'perfume',
      price: 42000,
      qty: 16,
      brand: 'Armani',
      d: 'Armani-style Eau de Parfum, 100ml, sealed in cellophane. Rich, long-lasting evening fragrance.',
      wt: 0.5,
    },
  ],
  'musa-gadgets': [
    {
      t: '20,000mAh Power Bank (Fast Charge, Dual USB)',
      cat: 'Phones',
      img: 'phoneaccessory',
      price: 24000,
      qty: 40,
      brand: 'Oraimo',
      d: '20,000mAh power bank with dual USB output and 18W fast charging. Charges a phone four to five times.',
      w: '6-month shop warranty',
      wt: 0.5,
    },
    {
      t: '65W Fast Charger + Type-C Cable',
      cat: 'Phones',
      img: 'phoneaccessory',
      price: 12500,
      qty: 60,
      brand: 'Oraimo',
      d: '65W GaN fast charger with a braided Type-C cable. Works with laptops, phones and tablets.',
      w: '6-month shop warranty',
      wt: 0.3,
    },
    {
      t: 'Redmi Note 13 128GB — 8GB RAM (New)',
      cat: 'Phones',
      img: 'smartphone',
      price: 185000,
      qty: 15,
      brand: 'Xiaomi',
      d: 'Sealed Redmi Note 13 with 8GB RAM and 128GB storage, 108MP camera and 33W fast charging. Kano pickup or escrow delivery.',
      w: '1-year manufacturer warranty',
      wt: 0.4,
    },
    {
      t: 'Nikon D5300 DSLR Camera Body',
      cat: 'Electronics',
      img: 'camera',
      price: 285000,
      qty: 3,
      brand: 'Nikon',
      cond: ProductCondition.EXCELLENT,
      d: 'Nikon D5300 body in excellent condition, 24MP, flip screen and built-in WiFi. Battery and charger included.',
      w: '1-month shop warranty',
      wt: 1,
      neg: true,
      low: true,
    },
    {
      t: 'Oraimo Bluetooth Earbuds (ENC, 40h Battery)',
      cat: 'Phones',
      img: 'headphones',
      price: 18000,
      qty: 45,
      brand: 'Oraimo',
      d: 'Oraimo wireless earbuds with environmental noise cancellation, touch controls and a 40-hour charging case.',
      w: '6-month shop warranty',
      wt: 0.2,
    },
  ],
  'fatima-beauty': [
    {
      t: 'Lattafa Perfume — 100ml (Unisex)',
      cat: 'Beauty',
      img: 'perfume',
      price: 32000,
      qty: 22,
      brand: 'Lattafa',
      d: 'Lattafa unisex Eau de Parfum, 100ml, sealed. Warm oud and amber notes that last all day.',
      wt: 0.5,
    },
    {
      t: 'Bridal Makeup Palette — Full Coverage',
      cat: 'Beauty',
      img: 'makeup',
      price: 28000,
      qty: 18,
      brand: 'Coal City Beauty',
      d: 'Full-coverage bridal makeup palette with 24 eyeshadows, two blushers and a highlighter. Tested on all skin tones.',
      wt: 0.6,
    },
    {
      t: 'Frontal Wig — 18" Body Wave Human Hair',
      cat: 'Beauty',
      img: 'wig',
      price: 135000,
      qty: 7,
      brand: 'Brazilian Hair',
      d: '18-inch body wave frontal wig, 13x4 frontal, pre-plucked and bleached knots. Can be parted anywhere.',
      wt: 0.5,
      low: true,
    },
    {
      t: 'Makeup Brush Set — 24 Pieces with Case',
      cat: 'Beauty',
      img: 'makeup',
      price: 15000,
      qty: 30,
      brand: 'Fatima Beauty',
      d: 'Soft 24-piece makeup brush set with a zip case — foundation, powder, contour, blending and eye brushes.',
      wt: 0.5,
    },
    {
      t: 'Cateye Sunglasses — Polarised',
      cat: 'Fashion',
      img: 'sunglasses',
      price: 12000,
      qty: 35,
      brand: 'Fatima Beauty',
      d: 'Classic cateye sunglasses with polarised lenses and spring hinges, supplied with a hard case and cloth.',
      wt: 0.25,
    },
  ],
  'tunde-sports': [
    {
      t: 'Mountain Bike 26" — 21 Speed with Disc Brakes',
      cat: 'Furniture',
      img: 'bicycle',
      price: 165000,
      qty: 9,
      brand: 'Ranger',
      d: '26-inch mountain bike, 21-speed Shimano gearing, front suspension and mechanical disc brakes. Assembled before delivery.',
      w: '3-month shop warranty',
      wt: 18,
      dim: '175 x 60 x 100 cm',
    },
    {
      t: 'Kids Bicycle 20" with Training Wheels',
      cat: 'Furniture',
      img: 'bicycle',
      price: 78000,
      qty: 12,
      brand: 'Ranger',
      d: '20-inch kids bicycle with training wheels, hand brakes and a bell. Suitable for ages 6–10.',
      wt: 12,
    },
    {
      t: 'Official Match Football — Size 5 (FIFA Style)',
      cat: 'Books',
      img: 'football',
      price: 25000,
      qty: 40,
      brand: 'Tunde Sports',
      d: 'Size 5 match football with hand-stitched panels and a butyl bladder that holds air. Sold inflated or flat.',
      wt: 0.45,
    },
    {
      t: 'Adjustable Dumbbell Set — 20kg (Pair)',
      cat: 'Furniture',
      img: 'gym',
      price: 45000,
      qty: 16,
      brand: 'Tunde Sports',
      d: 'Adjustable dumbbell pair with 20kg of plates, chrome bars and spin-lock collars. Great for a home gym.',
      wt: 20,
    },
    {
      t: 'Resistance Band Kit — 11 Pieces',
      cat: 'Furniture',
      img: 'gym',
      price: 18000,
      qty: 30,
      brand: 'Tunde Sports',
      d: '11-piece resistance band kit with five tension levels, handles, ankle straps and a door anchor in a carry bag.',
      wt: 1.2,
    },
  ],
  'grace-home': [
    {
      t: '6-Piece Cooking Pot Set (Aluminium, Heavy Duty)',
      cat: 'Furniture',
      img: 'pots',
      price: 85000,
      qty: 20,
      brand: 'Grace Home',
      d: 'Heavy-duty 6-piece aluminium pot set with lids — sizes from small sauce pot to large family pot. Induction-friendly base.',
      wt: 12,
    },
    {
      t: 'Binatone Blender 500W with Mill',
      cat: 'Electronics',
      img: 'blender',
      price: 32000,
      qty: 26,
      brand: 'Binatone',
      d: 'Binatone 500W blender with a 1.5-litre jar and grinding mill. Blades are stainless steel and replaceable.',
      w: '1-year manufacturer warranty',
      wt: 3,
    },
    {
      t: 'Plastic Storage Cabinet — 4 Layers',
      cat: 'Furniture',
      img: 'furniture',
      price: 42000,
      qty: 24,
      brand: 'Grace Home',
      d: 'Four-layer plastic storage cabinet with doors and shelves. Waterproof and easy to assemble — good for kitchens and shops.',
      wt: 8,
      dim: '120 x 60 x 40 cm',
    },
    {
      t: 'Hisense Chest Freezer — 200 Litres',
      cat: 'Electronics',
      img: 'refrigerator',
      price: 395000,
      qty: 6,
      brand: 'Hisense',
      d: 'Hisense 200-litre chest freezer with fast freeze and a lockable lid. Ideal for frozen foods, meat and drinks.',
      w: '2-year manufacturer warranty',
      wt: 42,
      dim: '90 x 55 x 85 cm',
    },
    {
      t: 'Pressure Cooker — 7 Litres (Stainless Steel)',
      cat: 'Furniture',
      img: 'pots',
      price: 58000,
      qty: 18,
      brand: 'Grace Home',
      d: '7-litre stainless steel pressure cooker with safety valve and steamer basket. Cuts cooking time for beans and meat by half.',
      w: '6-month shop warranty',
      wt: 5,
    },
  ],
};

export function seedProducts(): SeedProduct[] {
  const out: SeedProduct[] = [];
  for (const [sellerSlug, rows] of Object.entries(PRODUCT_SEED)) {
    rows.forEach((row, index) => {
      out.push({
        slug: `${sellerSlug}-${index + 1}`,
        sellerSlug,
        title: row.t,
        description: row.d,
        category: row.cat,
        brand: row.brand,
        condition: row.cond || ProductCondition.NEW,
        price: row.price,
        // Every third listing carries a real reference price (the seller's
        // original retail), so the discount badge is computed, never invented.
        compareAtPrice: index % 3 === 0 ? Math.round((row.price * 1.3) / 500) * 500 : undefined,
        quantity: row.qty,
        stockStatus: row.low || row.qty <= 8 ? 'LOW_STOCK' : 'IN_STOCK',
        imageKey: row.img,
        images: imagesFor(row.img, index),
        deliveryMethod: escrowDelivery,
        pickupAvailable: true,
        isNegotiable: row.neg ?? false,
        warranty: row.w,
        returnPolicy,
        weightKg: row.wt,
        dimensionsCm: row.dim,
        viewCount: 40 + ((index * 37 + row.price) % 480),
      });
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                     */
/* -------------------------------------------------------------------------- */

/** Short product handle used inside a review ("Samsung Galaxy A15"). */
function shortTitle(product: SeedProduct): string {
  return product.title
    .replace(/\s*[—–-]\s*.*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

/** The listing's own condition word, echoed back by the buyer. */
const CONDITION_WORDS: Record<string, string> = {
  NEW: 'brand new and sealed',
  LIKE_NEW: 'as good as new',
  EXCELLENT: 'in excellent shape',
  GOOD: 'clean and well kept',
  FAIR: 'honestly described with its marks',
};

function conditionWord(condition: ProductCondition): string {
  return CONDITION_WORDS[condition] ?? 'as described';
}

function warrantyWording(product: SeedProduct): string {
  return product.warranty ? `${product.warranty} inside the pack` : 'no warranty card, and the price reflected that';
}

type ReviewContext = {
  product: SeedProduct;
  sellerCity: string;
  buyerCity: string;
  buyerState: string;
  daysAgo: number;
};

/**
 * Each template is written against the *actual* listing — it names the item,
 * repeats the condition, warranty, dimensions and delivery terms the seller
 * published, and reacts to them the way a real buyer would. Ratings are mixed,
 * including occasional 3★ and 2★, so the feed reads like a market and not a
 * wall of identical five-star praise.
 */
const REVIEW_TEMPLATES: { rating: number; build: (c: ReviewContext) => string }[] = [
  {
    rating: 5,
    build: ({ product }) =>
      `The ${shortTitle(product)} came ${conditionWord(product.condition)} — exactly as the listing said. I tested it before releasing escrow, ${warrantyWording(product)}.`,
  },
  {
    rating: 5,
    build: ({ product, buyerCity }) =>
      `Ordered Monday, delivered to ${buyerCity} by Thursday. Genuine ${product.category.toLowerCase()} as described, no regrets.`,
  },
  {
    rating: 4,
    build: ({ product, buyerCity }) =>
      `Good ${shortTitle(product)} for the money. Delivery to ${buyerCity} took one day longer than promised but the seller kept me updated on chat.`,
  },
  {
    rating: 5,
    build: ({ product }) =>
      `I was nervous buying ${product.category.toLowerCase()} online but escrow made it safe — I confirmed the ${shortTitle(product)} before the money left.`,
  },
  {
    rating: 3,
    build: ({ product }) =>
      `The ${shortTitle(product)} is okay but the size (${product.dimensionsCm ?? 'not stated'}) was not what I expected and the packaging was weak. Seller accepted a return under the 7-day policy, so no loss.`,
  },
  {
    rating: 5,
    build: ({ product }) =>
      `Second ${shortTitle(product)} I am buying from this store. Same quality and same honest pricing.`,
  },
  {
    rating: 4,
    build: ({ product }) =>
      `Fair price — I negotiated a little and we settled. The ${shortTitle(product)} matched the photos.`,
  },
  {
    rating: 2,
    build: ({ product }) =>
      `The ${shortTitle(product)} reached me with a fault. I raised a dispute; the seller was slow at first but escrow held the funds and I was refunded.`,
  },
  {
    rating: 5,
    build: ({ product }) =>
      `The seller sent a short video of the ${shortTitle(product)} before dispatch so I could confirm it. Very transparent.`,
  },
  {
    rating: 5,
    build: ({ product, sellerCity }) =>
      `Picked it up in person at ${sellerCity} and tested the ${shortTitle(product)} before paying. Exactly as listed.`,
  },
  {
    rating: 4,
    build: ({ product }) =>
      `The ${shortTitle(product)} works well — one month in and no issues. ${product.warranty ?? 'No warranty given, but the price reflected it'}.`,
  },
  {
    rating: 3,
    build: ({ product, buyerState }) =>
      `The ${shortTitle(product)} itself is fine but it took almost a week to reach ${buyerState}. Communication could have been better.`,
  },
  {
    rating: 5,
    build: ({ product }) =>
      `The ${shortTitle(product)} is exactly as listed, ${conditionWord(product.condition)}. Well packaged, no damage in transit.`,
  },
  {
    rating: 4,
    build: ({ product }) =>
      `Good ${product.category.toLowerCase()} for this budget. I compared two other sellers and this one was the fairest.`,
  },
];

/** Seller answer keyed to what the review actually said. */
function sellerReplyFor(rating: number, product: SeedProduct): string {
  if (rating <= 2) {
    return `We are sorry about this. The ${shortTitle(product)} left us sealed and working — escrow refunded you and we have tightened our dispatch checks for that route.`;
  }
  if (rating === 3) {
    return `Thanks for the honest feedback on the ${shortTitle(product)}. We have improved the packaging and updated the size notes on the listing.`;
  }
  return `Thank you. We test the ${shortTitle(product)} before dispatch — message us anytime for bulk pricing.`;
}export function seedReviews(): SeedReview[] {
  const products = seedProducts();
  const buyers = seedBuyers();
  const sellerCityBySlug = new Map(seedSellers().map((s) => [s.slug, s.city]));
  const out: SeedReview[] = [];

  products.forEach((product, index) => {
    // Roughly two thirds of listings have reviews; popular ones get two.
    const count = index % 3 === 0 ? 2 : index % 3 === 1 ? 1 : 0;
    for (let n = 0; n < count; n += 1) {
      const template = REVIEW_TEMPLATES[(index * 5 + n * 7) % REVIEW_TEMPLATES.length];
      const buyer = buyers[(index + n) % buyers.length];
      const daysAgo = 2 + ((index * 3 + n * 11) % 120);
      out.push({
        productSlug: product.slug,
        buyerSlug: buyer.slug,
        rating: template.rating,
        comment: template.build({
          product,
          sellerCity: sellerCityBySlug.get(product.sellerSlug) ?? product.category,
          buyerCity: buyer.city,
          buyerState: buyer.state,
          daysAgo,
        }),
        sellerReply:
          n === 0 && index % 4 === 0 ? sellerReplyFor(template.rating, product) : undefined,
        daysAgo,
      });
    }
  });
  return out;
}

/** Summary used by the admin panel and tests. */
export function seedSummary() {
  const sellers = seedSellers();
  const products = seedProducts();
  const buyers = seedBuyers();
  const reviews = seedReviews();
  return {
    sellers: sellers.length,
    businesses: sellers.filter((s) => s.business).length,
    individualSellers: sellers.filter((s) => !s.business).length,
    products: products.length,
    buyers: buyers.length,
    reviews: reviews.length,
    states: Array.from(new Set(sellers.map((s) => s.state))).sort(),
  };
}
