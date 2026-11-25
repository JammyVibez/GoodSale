import type { Metadata, Viewport } from 'next';
import './globals.css';
import { JsonLd } from '@/components/seo/JsonLd';
import { organizationLd, websiteLd } from '@/lib/seo/structured';
import NetworkStatus from '@/components/ui/NetworkStatus';
import FeedbackHost from '@/components/ui/FeedbackHost';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import ThemeController from '@/components/ThemeController';

// Fonts are linked at runtime rather than fetched at build time. `next/font/google`
// needs network access to a font CDN while bundling, which fails the build (and
// Turbopack entirely) in offline/CI sandboxes. The CSS stacks in globals.css are
// the fallback, so the app renders immediately even if Google Fonts is blocked.
const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://goodsale.ng';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0c110e' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'GoodSale — Premium Secure Escrow Marketplace',
    template: '%s | GoodSale',
  },
  description:
    "GoodSale is Nigeria's escrow-protected marketplace for buying and selling from verified sellers, with tracked delivery and real buyer reviews.",
  applicationName: 'GoodSale',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GoodSale',
  },
  formatDetection: {
    telephone: false,
  },
  keywords: [
    'GoodSale',
    'Nigeria marketplace',
    'buy and sell in Nigeria',
    'escrow',
    'verified sellers',
    'secure payments',
    'online shopping Nigeria',
  ],
  authors: [{ name: 'GoodSale', url: appUrl }],
  creator: 'GoodSale',
  publisher: 'GoodSale',
  category: 'shopping',
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/goodsale-mark.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: appUrl,
    siteName: 'GoodSale',
    title: 'GoodSale — Premium Secure Escrow Marketplace',
    description:
      'Buy and sell with escrow protection, verified sellers, and tracked delivery across Nigeria.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GoodSale — Premium Secure Escrow Marketplace',
    description:
      'Buy and sell with escrow protection, verified sellers, and tracked delivery across Nigeria.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
        <JsonLd data={[organizationLd(), websiteLd()]} />
        {/* Pre-paint theme: apply the saved mode before first render to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('goodsale_theme');var d=m==='dark'||((!m||m==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <NetworkStatus />
        <FeedbackHost />
        <ServiceWorkerRegistrar />
        <ThemeController />
      </body>
    </html>
  );
}
