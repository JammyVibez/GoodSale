import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://goodsale.ng';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/uploads/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
