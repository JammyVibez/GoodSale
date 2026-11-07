import type { MetadataRoute } from 'next';
import { getPublicCategories, getPublicProducts, getPublicStores } from '@/lib/seo/data';
import { absoluteUrl, siteUrl } from '@/lib/seo/site';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, stores] = await Promise.all([
    getPublicProducts(),
    getPublicCategories(),
    getPublicStores(),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: siteUrl(), lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/categories'), lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/sellers'), lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/promotions'), lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: absoluteUrl('/track'), lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/trust-safety'), lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/privacy'), lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
    { url: absoluteUrl('/terms'), lastModified: new Date(), changeFrequency: 'yearly', priority: 0.3 },
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => {
    const latest = products
      .filter((product) => product.categorySlug === category.slug)
      .reduce((max, product) => (product.updatedAt > max ? product.updatedAt : max), '');
    return {
      url: absoluteUrl(`/categories/${category.slug}`),
      lastModified: latest || new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    };
  });

  const sellerPages: MetadataRoute.Sitemap = stores.map((store) => {
    const latest = products
      .filter((product) => product.sellerId === store.id)
      .reduce((max, product) => (product.updatedAt > max ? product.updatedAt : max), store.joinedAt);
    return {
      url: absoluteUrl(`/sellers/${store.id}`),
      lastModified: latest || store.joinedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
    };
  });

  const productPages: MetadataRoute.Sitemap = products
    .filter((product) => product.stockStatus !== 'UNAVAILABLE')
    .map((product) => ({
      url: absoluteUrl(`/products/${product.id}`),
      lastModified: product.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
      images: product.images
        .filter((image) => /^https?:\/\//i.test(image))
        .slice(0, 5),
    }));

  return [...staticPages, ...categoryPages, ...sellerPages, ...productPages];
}
