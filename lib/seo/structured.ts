import { absoluteUrl, siteUrl } from './site';
import type { SeoProduct, SeoStore } from './data';

type Ld = Record<string, unknown>;

export function organizationLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl()}/#organization`,
    name: 'GoodSale',
    url: siteUrl(),
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/goodsale-mark.svg'),
      width: 512,
      height: 512,
    },
    description:
      'GoodSale is a Nigerian online marketplace for verified sellers, protected escrow payments and nationwide delivery.',
    areaServed: { '@type': 'Country', name: 'Nigeria' },
    knowsLanguage: 'en-NG',
  };
}

export function websiteLd(): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl()}/#website`,
    name: 'GoodSale',
    url: siteUrl(),
    publisher: { '@id': `${siteUrl()}/#organization` },
    inLanguage: 'en-NG',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl()}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListLd(name: string, products: SeoProduct[], path: string): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: absoluteUrl(path),
    numberOfItems: products.length,
    itemListElement: products.slice(0, 50).map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/products/${product.id}`),
      name: product.title,
    })),
  };
}

function imageUrl(src: string): string {
  if (!src) return absoluteUrl('/goodsale-mark.svg');
  return /^https?:\/\//i.test(src) ? src : absoluteUrl(src);
}

function conditionLd(condition: string): string {
  const value = condition.toUpperCase();
  if (value === 'NEW') return 'https://schema.org/NewCondition';
  if (value.includes('REFURB')) return 'https://schema.org/RefurbishedCondition';
  return 'https://schema.org/UsedCondition';
}

export function availabilityLd(product: SeoProduct): string {
  if (product.inStock) return 'https://schema.org/InStock';
  if (product.stockStatus === 'DISCONTINUED') return 'https://schema.org/Discontinued';
  return 'https://schema.org/OutOfStock';
}

export function productLd(product: SeoProduct): Ld {
  const url = absoluteUrl(`/products/${product.id}`);
  const data: Ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.title,
    description: product.description || `${product.title} listed on GoodSale.`,
    image: product.images.length ? product.images.slice(0, 6).map(imageUrl) : [absoluteUrl('/goodsale-mark.svg')],
    sku: `GS-${product.id}`,
    category: product.category,
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'NGN',
      price: product.price,
      availability: availabilityLd(product),
      itemCondition: conditionLd(product.condition),
      seller: {
        '@type': 'Organization',
        name: product.sellerName,
        url: absoluteUrl(`/sellers/${product.sellerId}`),
      },
    },
  };
  if (product.brand) data.brand = { '@type': 'Brand', name: product.brand };
  if (product.rating !== null && product.reviewCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
    data.review = product.reviews.slice(0, 5).map((review) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
      author: { '@type': 'Person', name: review.author },
      datePublished: review.createdAt.slice(0, 10),
      reviewBody: review.comment,
    }));
  }
  return data;
}

export function storeLd(store: SeoStore, products: SeoProduct[]): Ld {
  const url = absoluteUrl(`/sellers/${store.id}`);
  const name = store.businessName || store.name;
  const data: Ld = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${url}#store`,
    name,
    url,
    description:
      store.businessDescription || store.bio || `${name} sells on GoodSale, Nigeria's escrow-protected marketplace.`,
    image: store.logoUrl ? imageUrl(store.logoUrl) : absoluteUrl('/goodsale-mark.svg'),
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'NG',
      addressLocality: store.city || store.state || 'Nigeria',
      addressRegion: store.state || undefined,
      streetAddress: store.businessAddress || undefined,
    },
    areaServed: 'Nigeria',
  };
  if (store.rating !== null && store.reviewCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: store.rating,
      reviewCount: store.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  if (products.length) {
    data.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: `${name} listings on GoodSale`,
      numberOfItems: products.length,
      itemListElement: products.slice(0, 20).map((product) => ({
        '@type': 'Offer',
        url: absoluteUrl(`/products/${product.id}`),
        priceCurrency: 'NGN',
        price: product.price,
        availability: availabilityLd(product),
        itemOffered: { '@type': 'Product', name: product.title, url: absoluteUrl(`/products/${product.id}`) },
      })),
    };
  }
  return data;
}

export function collectionPageLd(name: string, description: string, path: string, products: SeoProduct[]): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { '@id': `${siteUrl()}/#website` },
    mainEntity: itemListLd(name, products, path),
  };
}

export function webPageLd(name: string, description: string, path: string): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { '@id': `${siteUrl()}/#website` },
    publisher: { '@id': `${siteUrl()}/#organization` },
  };
}
