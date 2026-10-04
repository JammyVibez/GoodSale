import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://goodsale.ng';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'GoodSale — Premium Secure Escrow Marketplace',
    template: '%s | GoodSale',
  },
  description:
    "Nigeria's premier trust-driven C2C marketplace with escrow payments, identity verification, and AI-assisted shopping safety.",
  applicationName: 'GoodSale',
  keywords: [
    'GoodSale',
    'Nigeria marketplace',
    'escrow',
    'C2C',
    'secure payments',
    'Paystack',
  ],
  authors: [{ name: 'GoodSale' }],
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: appUrl,
    siteName: 'GoodSale',
    title: 'GoodSale — Premium Secure Escrow Marketplace',
    description:
      'Buy and sell with escrow protection, verified sellers, and SafeMeet delivery across Nigeria.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GoodSale — Premium Secure Escrow Marketplace',
    description:
      'Buy and sell with escrow protection, verified sellers, and SafeMeet delivery across Nigeria.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Pre-paint theme: apply the saved mode before first render to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('goodsale_theme');var d=m==='dark'||((!m||m==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');else document.documentElement.classList.remove('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
