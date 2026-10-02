import type { Metadata } from 'next';
import LegalPolicyPage from '@/components/legal/LegalPolicyPage';
import { getLegalMetadata } from '@/lib/legal-metadata';
import { getSpanishLegalCopy } from '@/lib/spanish-legal-copy';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return getLegalMetadata('privacy', locale);
}

interface Props {
  params: Promise<{ locale: string }>;
}

// 2026-10-02: Google Ads measurement for visitors who arrive from an ad
// (lib/ads-tracking.ts) replaced the "no Google tag was found" statement.
// Not exported: a page file may only export what Next.js knows.
const PRIVACY_UPDATED = 'October 2, 2026';

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  const isEs = locale === 'es';
  const spanishCopy = getSpanishLegalCopy('privacy', locale);

  return (
    <LegalPolicyPage
      locale={locale}
      path="/privacy"
      title={spanishCopy?.title ?? 'Privacy Policy'}
      updated={spanishCopy?.updated ?? PRIVACY_UPDATED}
      intro={spanishCopy?.intro ?? [
        isEs
          ? 'Naples Estate Jewelry, operated by Naples Antiques LLC, respects your privacy. This policy explains how we collect and use information when you visit our website, create an account, submit an item, make an inquiry, subscribe for updates, or place an online order.'
          : 'Naples Estate Jewelry, operated by Naples Antiques LLC, respects your privacy. This policy explains how we collect and use information when you visit our website, create an account, submit an item, make an inquiry, subscribe for updates, or place an online order.',
        isEs
          ? 'This policy is written for our current small-business website. It does not claim compliance with any certification or privacy framework that we have not separately obtained.'
          : 'This policy is written for our current small-business website. It does not claim compliance with any certification or privacy framework that we have not separately obtained.',
      ]}
      sections={spanishCopy?.sections ?? [
        {
          title: isEs ? 'Información que recopilamos' : 'Information We Collect',
          bullets: [
            'Contact information, including name, email address, phone number, and mailing or shipping address when you provide it.',
            'Account information, including login email, profile details, saved favorites, saved cart data, marketing preference, and policy acceptance records.',
            'Item and listing information, including photos, descriptions, notes, inventory details, and messages you submit for evaluation or inquiry.',
            'Purchase and order history, including cart items, order totals, shipping method, order notes, and payment status. We do not currently store full card numbers on this site.',
            'Technical information such as IP address, browser type, device information, pages visited, timestamps, security logs, and hosting or analytics information generated when the site is used.',
            'For visitors who arrive from one of our Google ads, the ad click identifier Google adds to the address, which is saved with any form you send us.',
          ],
        },
        {
          title: isEs ? 'Cómo usamos la información' : 'How We Use Information',
          bullets: [
            'Create and manage customer accounts, profiles, carts, favorites, and account security.',
            'Respond to calls, texts, item submissions, product inquiries, contact requests, and customer-support messages.',
            'Process orders, prepare invoices, arrange pickup or shipping, and maintain purchase records.',
            'Prevent fraud, protect inventory, secure the website, troubleshoot errors, enforce our terms, and comply with legal obligations.',
            'Send service messages, order communications, and marketing updates where you have opted in or where permitted by law.',
            'Understand site performance and improve our website, shop, services, and customer experience.',
          ],
        },
        {
          title: isEs ? 'Cookies, almacenamiento local y medición publicitaria' : 'Cookies, Local Storage, and Advertising Measurement',
          body: [
            'The site uses essential cookies and browser storage for authentication, language routing, cart behavior, favorites, cookie notice preferences, and basic security. We also use normal hosting logs.',
            'We advertise on Google. If you arrive at this site by clicking one of our Google ads, the Google tag loads for your visit and sets Google Ads cookies in your browser, so Google can measure whether the ad led to a tap on our phone number, a directions request, or a form submission. Every call link still dials our regular number, and the ad click identifier is saved with any form you send us. We keep ad personalization turned off for this tag: it measures results and is not used to build advertising audiences. Visitors who do not arrive from an ad do not load the Google tag.',
            'You can switch this measurement off at any time on the Cookie Preferences page, and we honor the Global Privacy Control signal. We do not use Google Analytics, Meta Pixel, Microsoft Clarity, Hotjar, or similar behavioral tracking tools.',
          ],
        },
        {
          title: isEs ? 'Terceros que nos ayudan' : 'Service Providers',
          bullets: [
            'Supabase for account authentication, database records, profiles, favorites, carts, inquiries, products, and admin data.',
            'Netlify for website hosting, deployment, serverless/runtime infrastructure, forms, and related logs.',
            'Resend for transactional and administrative email, including inquiry and order notices.',
            'Google Maps for the embedded showroom map on our home and contact pages. The map loads from Google when you scroll to it, and Google may receive your IP address and set its own cookies under its own terms. Nothing you enter on our site is sent to it, and every address, hour, and directions link is also shown as plain text without it.',
            'Google Ads for measuring the results of our advertising, as described above, only for visitors who arrive from one of our ads. Google processes that data under its own terms.',
            'TradingView for the live gold, silver, and platinum price charts on our gold, silver, bullion, and live-prices pages. The charts load from TradingView, which may receive your IP address and set its own cookies under its own terms. Nothing you enter on our site is sent to it.',
            'Payment processors if online payment processing is enabled; payment information is handled by the processor under its own terms.',
            'Shipping providers when shipment or insured delivery is arranged.',
            'Professional advisers, fraud-prevention services, or authorities when reasonably necessary for legal, security, accounting, tax, or compliance purposes.',
          ],
        },
        {
          title: isEs ? 'Cuándo compartimos información' : 'When We Share Information',
          body: [
            'We do not sell personal information. We share information only as needed to operate the website and business, complete requested services, process orders, communicate with you, protect the site, comply with law, or complete a business transfer such as a merger or sale of business assets.',
          ],
        },
        {
          title: isEs ? 'Sus opciones y derechos' : 'Your Choices and Rights',
          bullets: [
            'You may request a copy of account or contact information we maintain about you.',
            'You may request corrections to inaccurate account, order, or contact information.',
            'You may request deletion of personal information, subject to legal, tax, fraud-prevention, inventory, transaction, and record-keeping obligations.',
            'You may opt out of marketing emails at any time by using an unsubscribe link where available or contacting us directly.',
            'If you opted in to text alerts, you may stop them at any time by replying STOP to any message or contacting us directly. We do not share mobile numbers or text-message consent with third parties or affiliates for their marketing purposes.',
            'You may use Cookie Preferences to reset the site cookie notice and to switch Google Ads measurement off or on. Essential cookies and storage are required for core site functions.',
          ],
        },
        {
          title: isEs ? 'Retención y seguridad' : 'Retention and Security',
          body: [
            'We keep information only as long as reasonably needed for the purposes described above, including customer service, transaction records, legal obligations, security, fraud prevention, and business administration.',
            'We use commercially reasonable security measures, including hosted authentication, HTTPS on production, database access controls, and limited admin access. No website or transmission method is perfectly secure.',
          ],
        },
        {
          title: isEs ? 'Privacidad de menores' : "Children's Privacy",
          body: [
            'Our website is not directed toward children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take reasonable steps to delete that information.',
          ],
        },
        {
          title: isEs ? 'Cambios a esta política' : 'Changes to This Policy',
          body: [
            'We may update this policy as the website, shop, legal requirements, or service providers change. The updated version will be posted on this page with a new effective date.',
          ],
        },
        {
          title: isEs ? 'Contacto' : 'Contact',
          body: [
            'Privacy questions or requests may be directed to Naples Estate Jewelry, operated by Naples Antiques LLC, by calling or texting (239) 404-8505 or using the Contact Us page.',
          ],
        },
      ]}
    />
  );
}
