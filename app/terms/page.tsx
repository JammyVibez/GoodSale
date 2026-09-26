import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The rules for buying, selling, escrow payments, and GoodDispatch delivery on GoodSale.',
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: '1. About GoodSale',
    body: [
      'GoodSale is an escrow-backed marketplace for consumer-to-consumer and merchant trade in Nigeria. We provide the marketplace, the escrow ledger, and GoodDispatch delivery coordination. We are not the seller of any item listed on the platform.',
      'By creating an account or using GoodSale you agree to these Terms. If you do not agree, do not use the service.',
    ],
  },
  {
    heading: '2. Eligibility and accounts',
    body: [
      'You must be at least 18 years old and able to enter a binding contract. You are responsible for the accuracy of your account details and for keeping your password secure.',
      'One person, one account. Accounts are personal and may not be sold, shared, or transferred. Trust levels such as Seller, Business, and Verified Seller are granted only after GoodSale reviews the required identity and business documents, and may be withdrawn if that information is false or expires.',
    ],
  },
  {
    heading: '3. Listings and seller obligations',
    body: [
      'Sellers must describe items accurately, including condition, defects, and any warranty or return terms, and must have the legal right to sell them. Prohibited items include stolen goods, counterfeit products, weapons, drugs, live animals, and anything illegal under Nigerian law.',
      'Sellers must dispatch paid orders within the stated handling window. Repeated non-dispatch, misrepresentation, or attempts to move a transaction off the platform to avoid escrow is a breach of these Terms and may result in suspension.',
    ],
  },
  {
    heading: '4. Escrow and payments',
    body: [
      'When a buyer checks out, the payment is collected through our payment partner (Paystack) and recorded as held in escrow against that order. The seller is not paid at this point.',
      'Escrow is released to the seller only when the buyer confirms delivery by entering the secret delivery PIN issued at checkout, or when a GoodDispatch courier completes the job with that PIN. On release, GoodSale deducts the published escrow fee and any applicable delivery commission before crediting the seller wallet.',
      'Partial-payment, invoicing, and cash-on-delivery options may be offered where enabled. Where they are, the balance and payment terms shown at checkout apply. Wallets are topped up only through verified payments — no balance is ever credited without a completed payment.',
    ],
  },
  {
    heading: '5. Delivery and SafeMeet',
    body: [
      'GoodDispatch jobs are fulfilled by independent couriers. Live tracking is provided as a convenience and estimate, not a guarantee of arrival time. SafeMeet handovers may require both parties to confirm arrival before escrow can move.',
      'Risk in goods passes as agreed between buyer and seller and as recorded on the order.',
    ],
  },
  {
    heading: '6. Disputes, refunds, and fraud',
    body: [
      'If an item never arrives, arrives materially different from its description, or is damaged, the buyer may open a dispute before releasing escrow. Opening a dispute freezes the escrow for that order.',
      'GoodSale reviews disputes using the order record, tracking history, and the evidence both parties provide. We may release escrow to the seller, refund the buyer, or take another remedy we consider fair. Our decision on a dispute is final for the purposes of the platform.',
      'Fraudulent payments, chargeback abuse, or fake tracking will result in account suspension and may be reported to the authorities.',
    ],
  },
  {
    heading: '7. Fees',
    body: [
      'Applicable fees, including the escrow fee, delivery commission, subscription and promotion prices, are published in the app and shown before you confirm a payment. We may change fees with reasonable notice; changes never apply retroactively to orders already paid.',
    ],
  },
  {
    heading: '8. Suspension and termination',
    body: [
      'We may suspend or terminate an account that breaches these Terms, poses a fraud or safety risk, or is required to be restricted by law. Where an account is suspended with funds legitimately owed, those funds are handled through the dispute and withdrawal processes.',
    ],
  },
  {
    heading: '9. Liability',
    body: [
      'GoodSale provides the marketplace and escrow service "as is". To the extent permitted by law, we are not liable for indirect or consequential loss, or for the quality, safety, or legality of items listed by users. Nothing in these Terms limits liability that cannot be limited under Nigerian law.',
    ],
  },
  {
    heading: '10. Changes and governing law',
    body: [
      'We may update these Terms from time to time. Material changes will be surfaced in the app before they take effect. These Terms are governed by the laws of the Federal Republic of Nigeria.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline mb-8"
        >
          ← Back to GoodSale
        </Link>

        <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-bold">
          Legal
        </p>
        <h1 className="font-display font-black text-3xl sm:text-4xl mt-2 text-slate-900 dark:text-white">
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
          Last updated: September 2026. These Terms govern your use of the GoodSale marketplace,
          escrow service, and GoodDispatch delivery network.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display font-black text-lg text-slate-900 dark:text-white">
                {section.heading}
              </h2>
              {section.body.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 mt-3">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 p-5 rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm">
          <p className="text-slate-500 dark:text-slate-400">
            Questions about these Terms? Reach us from the Help &amp; Support section in your
            account settings. Read our{' '}
            <Link href="/privacy" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
              Privacy Policy
            </Link>{' '}
            to learn how we handle your data.
          </p>
        </div>
      </div>
    </main>
  );
}
