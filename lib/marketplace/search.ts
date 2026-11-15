// lib/marketplace/search.ts — Natural-language smart search parser & matcher
import { NIGERIAN_STATES } from '@/lib/geo';
import { effectiveProductPrice } from '@/lib/productPricing';
import { ProductCondition, type Product } from '@/lib/types';

export interface SmartSearchChip {
  key: string;
  label: string;
}

export interface ParsedSmartSearch {
  rawQuery: string;
  textTerms: string[];
  minPrice?: number;
  maxPrice?: number;
  inferredState?: string;
  inferredCondition?: ProductCondition;
  sameDayRequested: boolean;
  safeMeetRequested: boolean;
  splitPayRequested: boolean;
  videoRequested: boolean;
  dealsRequested: boolean;
  chips: SmartSearchChip[];
}

const STATE_ALIASES: Array<[RegExp, string]> = [
  [/\b(?:abj|fct|abuja)\b/i, 'Abuja (FCT)'],
  [/\b(?:ph|port\s*harcourt)\b/i, 'Rivers'],
  [/\b(?:lagos|lekki|ikeja|yaba|ikoyi|vi)\b/i, 'Lagos'],
  [/\b(?:ibadan|oyo)\b/i, 'Oyo'],
  [/\b(?:kano)\b/i, 'Kano'],
  [/\b(?:enugu)\b/i, 'Enugu'],
  [/\b(?:benin|edo)\b/i, 'Edo'],
  [/\b(?:abeokuta|ogun)\b/i, 'Ogun'],
];

const CATEGORY_SYNONYMS: Array<[string, string[]]> = [
  ['phone', ['phones', 'mobile', 'smartphone', 'iphone', 'samsung', 'pixel', 'android', 'gadgets']],
  ['iphone', ['phones', 'apple', 'ios', 'mobile']],
  ['samsung', ['phones', 'galaxy', 'android', 'mobile']],
  ['laptop', ['computing', 'macbook', 'dell', 'hp', 'lenovo', 'pc', 'computer']],
  ['macbook', ['computing', 'laptop', 'apple']],
  ['shoe', ['fashion', 'sneakers', 'footwear', 'kicks']],
  ['sneaker', ['fashion', 'shoes', 'footwear']],
  ['car', ['vehicles', 'automotive', 'toyota', 'lexus', 'honda', 'benz']],
  ['tv', ['electronics', 'television', 'oled', 'qled', 'smart tv']],
  ['watch', ['watches', 'accessories', 'luxury', 'rolex', 'smartwatch']],
  ['generator', ['power', 'inverter', 'solar', 'home']],
  ['solar', ['power', 'inverter', 'battery', 'energy']],
];

function parseMagnitude(numRaw: string, suffix?: string): number {
  const cleaned = Number(numRaw.replace(/,/g, ''));
  if (!Number.isFinite(cleaned) || cleaned <= 0) return 0;
  const s = (suffix || '').toLowerCase();
  if (s === 'm' || s === 'million') return Math.round(cleaned * 1_000_000);
  if (s === 'k') return Math.round(cleaned * 1_000);
  return Math.round(cleaned);
}

export function parseSmartSearchQuery(rawQuery: string): ParsedSmartSearch {
  const trimmed = (rawQuery || '').trim();
  if (!trimmed) {
    return {
      rawQuery: '',
      textTerms: [],
      sameDayRequested: false,
      safeMeetRequested: false,
      splitPayRequested: false,
      videoRequested: false,
      dealsRequested: false,
      chips: [],
    };
  }

  let working = ` ${trimmed} `;
  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  let inferredState: string | undefined;
  let inferredCondition: ProductCondition | undefined;
  let sameDayRequested = false;
  let safeMeetRequested = false;
  let splitPayRequested = false;
  let videoRequested = false;
  let dealsRequested = false;
  const chips: SmartSearchChip[] = [];

  // 1. Price ceiling: "under 500k", "below ₦200,000", "max 1.5m", "<= 80k"
  const maxRegex = /\b(?:under|below|less\s+than|max|up\s*to|<=?)\s*(?:₦|ngn|naira)?\s*([\d,.]+)\s*(k|m|million)?\b/i;
  const maxMatch = working.match(maxRegex);
  if (maxMatch) {
    const val = parseMagnitude(maxMatch[1], maxMatch[2]);
    if (val > 0) {
      maxPrice = val;
      chips.push({ key: 'maxPrice', label: `Under ₦${val.toLocaleString()}` });
      working = working.replace(maxMatch[0], ' ');
    }
  }

  // 2. Price floor: "above 50k", "over 100k", "from ₦20k", "> 50k"
  const minRegex = /\b(?:above|over|more\s+than|min|>=?)\s*(?:₦|ngn|naira)?\s*([\d,.]+)\s*(k|m|million)?\b/i;
  const minMatch = working.match(minRegex);
  if (minMatch) {
    const val = parseMagnitude(minMatch[1], minMatch[2]);
    if (val > 0) {
      minPrice = val;
      chips.push({ key: 'minPrice', label: `₦${val.toLocaleString()}+` });
      working = working.replace(minMatch[0], ' ');
    }
  }

  // 3. Nigerian states & major city hubs
  for (const [pattern, stateName] of STATE_ALIASES) {
    const m = working.match(pattern);
    if (m) {
      inferredState = stateName;
      chips.push({ key: 'state', label: stateName.replace(/\s*\(FCT\)/, '') });
      working = working.replace(m[0], ' ');
      break;
    }
  }
  if (!inferredState) {
    for (const state of NIGERIAN_STATES) {
      const bare = state.replace(/\s*\(FCT\)/i, '');
      const stateRegex = new RegExp(`\\b${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const m = working.match(stateRegex);
      if (m) {
        inferredState = state;
        chips.push({ key: 'state', label: bare });
        working = working.replace(m[0], ' ');
        break;
      }
    }
  }

  // 4. Speed & Escrow intent tokens
  if (/\b(same\s*-?\s*day|express\s*dispatch|today)\b/i.test(working)) {
    sameDayRequested = true;
    chips.push({ key: 'sameDay', label: 'Same-day' });
    working = working.replace(/\b(same\s*-?\s*day|express\s*dispatch|today)\b/gi, ' ');
  }
  if (/\b(safemeet|safe\s*meet|in\s*-?\s*person\s*pickup|pickup\s*hub)\b/i.test(working)) {
    safeMeetRequested = true;
    chips.push({ key: 'safeMeet', label: 'SafeMeet™' });
    working = working.replace(/\b(safemeet|safe\s*meet|in\s*-?\s*person\s*pickup|pickup\s*hub)\b/gi, ' ');
  }
  if (/\b(split(?:\s*-?\s*pay)?|deposit\s*pay|installment)\b/i.test(working)) {
    splitPayRequested = true;
    chips.push({ key: 'splitPay', label: 'Split-pay' });
    working = working.replace(/\b(split(?:\s*-?\s*pay)?|deposit\s*pay|installment)\b/gi, ' ');
  }
  if (/\b(video\s*demo|proof\s*video|with\s*video)\b/i.test(working)) {
    videoRequested = true;
    chips.push({ key: 'video', label: 'Video proof' });
    working = working.replace(/\b(video\s*demo|proof\s*video|with\s*video)\b/gi, ' ');
  }
  if (/\b(flash\s*deal|hot\s*deal|discount)\b/i.test(working)) {
    dealsRequested = true;
    chips.push({ key: 'deals', label: 'Deals' });
    working = working.replace(/\b(flash\s*deal|hot\s*deal|discount)\b/gi, ' ');
  }

  // 5. Condition phrases
  if (/\bbrand\s*new\b/i.test(working)) {
    inferredCondition = ProductCondition.NEW;
    chips.push({ key: 'condition', label: 'Brand new' });
    working = working.replace(/\bbrand\s*new\b/gi, ' ');
  } else if (/\b(like\s*new|open\s*box|uk\s*used)\b/i.test(working)) {
    inferredCondition = ProductCondition.LIKE_NEW;
    chips.push({ key: 'condition', label: 'Like new' });
    working = working.replace(/\b(like\s*new|open\s*box|uk\s*used)\b/gi, ' ');
  }

  // Clean filler prepositions left over from stripped intent tokens
  const fillerRemoved = working
    .replace(/\b(?:in|at|with|for)\b(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const textTerms = fillerRemoved
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9+.#-]/g, ''))
    .filter((t) => t.length >= 2);

  return {
    rawQuery: trimmed,
    textTerms,
    minPrice,
    maxPrice,
    inferredState,
    inferredCondition,
    sameDayRequested,
    safeMeetRequested,
    splitPayRequested,
    videoRequested,
    dealsRequested,
    chips,
  };
}

export function matchesSmartSearchTerms(
  product: Product,
  terms: string[],
  sellerState = ''
): boolean {
  if (!terms.length) return true;
  const haystack = `${product.title} ${product.description} ${product.category} ${product.brand} ${sellerState}`.toLowerCase();

  return terms.every((term) => {
    if (haystack.includes(term)) return true;
    const synonymMatch = CATEGORY_SYNONYMS.find(([key]) => term.includes(key));
    if (synonymMatch) {
      return synonymMatch[1].some((syn) => haystack.includes(syn));
    }
    return false;
  });
}

export function matchesParsedPriceRange(
  product: Product,
  parsed: Pick<ParsedSmartSearch, 'minPrice' | 'maxPrice'>
): boolean {
  const price = effectiveProductPrice(product);
  if (typeof parsed.maxPrice === 'number' && price > parsed.maxPrice) return false;
  if (typeof parsed.minPrice === 'number' && price < parsed.minPrice) return false;
  return true;
}
