import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { SeoShell } from '@/components/seo/SeoShell';
import { breadcrumbLd, webPageLd } from '@/lib/seo/structured';
import { absoluteUrl, truncate } from '@/lib/seo/site';

const title = 'Trust, safety and buyer protection';
const description =
  'How GoodSale protects buyers and sellers: escrow payments, verified seller checks, real reviews, tracked delivery, disputes and support.';

export const metadata: Metadata = {
  title,
  description: truncate(description, 155),
  alternates: { canonical: '/trust-safety' },
  openGraph: {
    title: `${title} | GoodSale`,
    description: truncate(description, 155),
    url: absoluteUrl('/trust-safety'),
    siteName: 'GoodSale',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: `${title} | GoodSale`, description: truncate(description, 155) },
};

const faqs = [
  {
    question: 'How does GoodSale escrow work?',
    answer:
      'When a buyer pays, GoodSale holds the money instead of sending it straight to the seller. The seller ships the order, and the funds are released after the buyer confirms delivery. If something goes wrong, the buyer can raise a dispute before release.',
  },
  {
    question: 'How are sellers verified on GoodSale?',
    answer:
      'Sellers can complete identity and business verification. Verified sellers and registered businesses show a verification badge on their storefront and listings. Buyers should always check the badge and seller reviews before ordering.',
  },
  {
    question: 'Are GoodSale reviews real?',
    answer:
      'Yes. Ratings and reviews are generated from completed orders and real buyer feedback. GoodSale does not create reviews, ratings or prices for listings. When a product has no reviews, no rating is shown.',
  },
  {
    question: 'What happens if an order is not delivered as described?',
    answer:
      'Buyers can open a dispute from the order before escrow is released. GoodSale support reviews the order, delivery evidence and both parties’ messages, then decides whether to refund, partially refund or release the payment.',
  },
  {
    question: 'Where can I get help with an order?',
    answer:
      'Use the Help and Support section inside GoodSale to open a support ticket linked to your order. Signed-in buyers and sellers can track replies there, and urgent escrow issues are prioritized.',
  },
];

export default function TrustSafetyPage() {
  const breadcrumbs = [
    { name: 'Home', path: '/' },
    { name: 'Trust & Safety', path: '/trust-safety' },
  ];
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <SeoShell>
      <JsonLd data={[webPageLd(title, description, '/trust-safety'), breadcrumbLd(breadcrumbs), faqLd]} />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <Breadcrumbs items={breadcrumbs} />
        <header className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b8912c]">GoodSale buyer protection</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#032214] sm:text-4xl">Trust, safety and escrow</h1>
          <p className="mt-3 text-[15px] leading-7 text-emerald-950/70">
            GoodSale is built around one rule: a seller should not receive your money until you receive what you paid
            for. Here is how that works in practice, along with the checks and tools that protect both sides of every
            order.
          </p>
        </header>

        <section aria-labelledby="escrow" className="mt-8 rounded-3xl border border-emerald-950/10 bg-white p-6">
          <h2 id="escrow" className="text-xl font-bold text-[#032214]">Escrow-protected payments</h2>
          <p className="mt-2 text-sm leading-7 text-emerald-950/70">
            Checkout payments are held by GoodSale rather than paid directly to the seller. The seller is prompted to
            dispatch, delivery is tracked, and the buyer confirms receipt before funds are released. If the item does
            not arrive or is not as described, the buyer can dispute the order before release so support can review it.
          </p>
        </section>

        <section aria-labelledby="verification" className="mt-5 rounded-3xl border border-emerald-950/10 bg-white p-6">
          <h2 id="verification" className="text-xl font-bold text-[#032214]">Seller verification</h2>
          <p className="mt-2 text-sm leading-7 text-emerald-950/70">
            Sellers can verify their identity, and registered businesses can submit business details. Verified accounts
            display a badge on their storefront and listings. Verification is not a guarantee of every listing, so buyers
            should still read the item description, condition, return policy and genuine buyer reviews.
          </p>
          <p className="mt-3 text-sm">
            <Link href="/sellers" className="font-semibold text-emerald-800 underline">Browse verified seller storefronts →</Link>
          </p>
        </section>

        <section aria-labelledby="reviews" className="mt-5 rounded-3xl border border-emerald-950/10 bg-white p-6">
          <h2 id="reviews" className="text-xl font-bold text-[#032214]">Real reviews only</h2>
          <p className="mt-2 text-sm leading-7 text-emerald-950/70">
            Reviews come from buyers who completed an order. GoodSale never invents ratings, testimonials or review
            counts, and products without feedback show no rating at all. This keeps the ratings you see on product and
            seller pages tied to actual transactions.
          </p>
        </section>

        <section aria-labelledby="delivery" className="mt-5 rounded-3xl border border-emerald-950/10 bg-white p-6">
          <h2 id="delivery" className="text-xl font-bold text-[#032214]">Delivery and disputes</h2>
          <p className="mt-2 text-sm leading-7 text-emerald-950/70">
            Sellers choose supported delivery or pickup options per listing. Delivery status and handover are recorded
            in the order. If a delivery fails or the item is materially different from the listing, open a dispute from
            the order before confirming release so the escrow payment can be reviewed.
          </p>
        </section>

        <section aria-labelledby="faq" className="mt-8">
          <h2 id="faq" className="text-2xl font-bold text-[#032214]">Frequently asked questions</h2>
          <div className="mt-4 space-y-3">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-2xl border border-emerald-950/10 bg-white p-5">
                <summary className="cursor-pointer list-none text-base font-semibold text-[#032214]">
                  {faq.question}
                </summary>
                <p className="mt-2 text-sm leading-7 text-emerald-950/70">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl bg-[#032214] px-6 py-8 text-white">
          <h2 className="text-2xl font-bold">Ready to shop safely?</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-50/75">
            Browse live listings, check seller verification and pay through escrow.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/categories" className="rounded-full bg-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#032214] hover:bg-[#e6c35a]">
              Shop categories
            </Link>
            <Link href="/" className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold hover:bg-white/10">
              Open marketplace
            </Link>
            <Link href="/terms" className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold hover:bg-white/10">
              Terms of service
            </Link>
          </div>
        </section>
      </div>
    </SeoShell>
  );
}
