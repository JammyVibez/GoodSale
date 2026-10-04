import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How GoodSale collects, uses, and protects your personal data across the marketplace and escrow service.',
};

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: '1. What we collect',
    body: [
      'Account data: your name, username, email address, phone number, chosen role, and password (stored only as a secure hash by our authentication provider).',
      'Transaction data: orders, escrow records, payment references, wallet balances, withdrawal bank details, and delivery addresses and PINs needed to complete a trade.',
      'Identity data: when you apply for verification, the government ID, selfie, and business documents you upload. These are used only to review your application.',
      'Usage and device data: approximate location you provide for delivery and dispatch, device and log information, and cookies needed to keep you signed in and to keep the service secure.',
    ],
  },
  {
    heading: '2. How we use it',
    body: [
      'To operate the marketplace: create your account, show listings, process escrow payments, release funds after PIN confirmation, coordinate GoodDispatch delivery, and let buyers and sellers communicate.',
      'To keep people safe: verify identities, detect and prevent fraud, investigate disputes, and enforce our Terms of Service.',
      'To support you: respond to help requests and send essential service messages such as order, escrow, dispute, and payout notifications.',
    ],
  },
  {
    heading: '3. Sharing',
    body: [
      'We share only what is needed to run a transaction. Payments are processed by Paystack, which handles your card and bank details under its own PCI-compliant systems — GoodSale never sees your full card number or ATM PIN.',
      'Delivery details are shared with the courier assigned to your order. Public listing and seller profile information is visible to other users. We do not sell your personal data to third-party marketers.',
      'We may disclose information where required by law, to enforce our Terms, or to protect the rights and safety of our users.',
    ],
  },
  {
    heading: '4. Storage and security',
    body: [
      'Data is stored with our cloud/Postgres infrastructure provider. Access is governed by row-level security, and server-side actions that move money require service-level credentials that are never exposed to the browser.',
      'Identity documents are held in a private storage bucket. We retain records for as long as your account is active and for a reasonable period afterward where required for legal, tax, and dispute purposes.',
    ],
  },
  {
    heading: '5. Your rights',
    body: [
      'You can review and update your profile and business details in Settings at any time. You can request a copy of your data, ask us to correct it, or ask us to delete your account from the Account Controls section.',
      'Where you ask us to delete data we are legally required to keep (for example completed transaction and tax records), we will delete everything else and explain what we must retain.',
    ],
  },
  {
    heading: '6. Cookies',
    body: [
      'We use strictly necessary cookies to authenticate you and to protect the service. We do not use advertising cookies. You can clear cookies in your browser, but you will be signed out.',
    ],
  },
  {
    heading: '7. Children',
    body: [
      'GoodSale is for adults aged 18 and over. We do not knowingly collect data from children. If we learn that we have, we will delete it.',
    ],
  },
  {
    heading: '8. Changes',
    body: [
      'We may update this policy as the service evolves. Material changes will be surfaced in the app. This policy is governed by the laws of the Federal Republic of Nigeria.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-ink-50 dark:bg-ink-950 text-ink-800 dark:text-ink-200">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-jade-600 dark:text-jade-400 hover:underline mb-8"
        >
          ← Back to GoodSale
        </Link>

        <p className="text-xs font-mono uppercase tracking-widest text-jade-600 dark:text-jade-400 font-bold">
          Legal
        </p>
        <h1 className="font-display font-black text-3xl sm:text-4xl mt-2 text-ink-900 dark:text-white">
          Privacy Policy
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400 mt-3">
          Last updated: September 2026. This policy explains what personal data GoodSale collects,
          why we collect it, and the choices you have.
        </p>

        <div className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display font-black text-lg text-ink-900 dark:text-white">
                {section.heading}
              </h2>
              {section.body.map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-ink-600 dark:text-ink-400 mt-3">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 p-5 rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 text-sm">
          <p className="text-ink-500 dark:text-ink-400">
            Questions about your data? Contact us from Help &amp; Support in your account settings.
            See our{' '}
            <Link href="/terms" className="text-jade-600 dark:text-jade-400 font-bold hover:underline">
              Terms of Service
            </Link>{' '}
            for the rules that govern the marketplace.
          </p>
        </div>
      </div>
    </main>
  );
}
