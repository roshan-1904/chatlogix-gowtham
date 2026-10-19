import { Link } from 'react-router-dom';
import { MarketingLayout } from '../components/MarketingLayout';
import { usePageMeta } from '@chatlogix/hooks';
import { legalContact, privacyLastUpdated, privacyMeta } from '../copy';
import { site } from '../lib/site';

export function Privacy() {
  usePageMeta({
    ...privacyMeta,
    canonical: site.urls.privacy,
    robots: 'index, follow',
  });

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">Privacy Policy</h1>
        <p className="mt-3 text-sm text-gray-500">Last updated: {privacyLastUpdated}</p>

        <div className="prose prose-gray mt-10 max-w-none text-gray-700">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">1. Introduction</h2>
            <p className="mt-3 leading-relaxed">
              ChatLogix (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This
              Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
              WhatsApp Commerce Management Platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">2. Information We Collect</h2>
            <h3 className="mt-4 text-lg font-medium text-gray-900">2.1 WhatsApp Data</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Phone numbers and contact information</li>
              <li>Message content (text, images, audio, documents)</li>
              <li>Message timestamps and delivery status</li>
              <li>Customer conversation history</li>
            </ul>
            <h3 className="mt-4 text-lg font-medium text-gray-900">2.2 Business Data</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Business information and contact details</li>
              <li>Product catalogs and order information</li>
              <li>Customer insights and analytics</li>
              <li>Usage statistics and performance metrics</li>
            </ul>
            <h3 className="mt-4 text-lg font-medium text-gray-900">2.3 Payment and settlement data</h3>
            <p className="mt-2 leading-relaxed">
              When a shop opts in to ChatLogix collecting order payments, we also process:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Razorpay payment identifiers, amounts, and payment status</li>
              <li>Route transfer and settlement status for the shop&apos;s linked account</li>
              <li>Shop legal name, PAN, GSTIN (or exemption declaration), and masked settlement bank details</li>
              <li>Refund and dispute records needed for the settlement ledger and tax reporting</li>
            </ul>
            <p className="mt-3 leading-relaxed">
              Razorpay is our payment processor. We collect payout bank details to pay shops. Card numbers and UPI PINs
              are never stored by ChatLogix. Customers enter them only on Razorpay&apos;s page.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">3. How We Use Your Information</h2>
            <p className="mt-3">We use the collected information to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Provide and maintain our WhatsApp Commerce services</li>
              <li>Process and manage customer conversations</li>
              <li>Generate automated responses using AI technology</li>
              <li>Analyze customer interactions and provide insights</li>
              <li>Manage orders and transactions</li>
              <li>Collect order payments, settle funds to shops through Razorpay Route, and process refunds</li>
              <li>Meet tax and regulatory reporting obligations where applicable</li>
              <li>Improve our services and develop new features</li>
              <li>Ensure compliance with applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">4. Data Sharing and Disclosure</h2>
            <p className="mt-3">We do not sell, trade, or rent your personal information. We may share information only:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>With your explicit consent</li>
              <li>To comply with legal obligations</li>
              <li>With trusted service providers who assist in our operations</li>
              <li>To protect our rights, property, or safety</li>
            </ul>
            <p className="mt-3 leading-relaxed">Key processors include:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <strong>Razorpay</strong> — payment collection, Route linked-account settlement, refunds, and
                disputes (India)
              </li>
              <li>
                <strong>Meta</strong> — WhatsApp Business messaging
              </li>
              <li>
                <strong>Cloud and database providers</strong> — hosting and storage for the platform
              </li>
            </ul>
            <p className="mt-3 leading-relaxed">
              When you pay a shop through ChatLogix, Razorpay processes your payment; the shop receives order and
              contact details needed to fulfil the order.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">5. Data Security</h2>
            <p className="mt-3 leading-relaxed">
              We implement appropriate technical and organizational security measures to protect your information against
              unauthorized access, alteration, disclosure, or destruction. This includes encryption, secure servers, and
              regular security audits.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">6. Data Retention</h2>
            <p className="mt-3 leading-relaxed">
              We retain your information only as long as necessary to provide our services and comply with legal
              obligations. Customer conversation data is typically retained for business purposes and may be deleted upon
              request.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">7. Your Rights</h2>
            <p className="mt-3">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Access your personal information</li>
              <li>Correct inaccurate information</li>
              <li>Delete your information</li>
              <li>Restrict processing of your information</li>
              <li>Data portability</li>
              <li>Object to processing</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">8. WhatsApp Integration</h2>
            <p className="mt-3 leading-relaxed">
              Our platform integrates with WhatsApp Business API. By using our services, you acknowledge that your data may
              be processed by WhatsApp according to their terms and privacy policy. We are not responsible for
              WhatsApp&apos;s data practices.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">9. Changes to This Policy</h2>
            <p className="mt-3 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
              Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">10. Contact Us</h2>
            <p className="mt-3 leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us at:
            </p>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <p>
                <strong>Email:</strong>{' '}
                <a href={`mailto:${legalContact.privacyEmail}`} className="text-primary-500 hover:opacity-80">
                  {legalContact.privacyEmail}
                </a>
              </p>
              <p className="mt-1">
                <strong>Contact page:</strong>{' '}
                <Link to="/contact" className="text-primary-500 hover:opacity-80">
                  {site.urls.contact}
                </Link>
              </p>
              <p className="mt-1">
                <strong>Website:</strong>{' '}
                <a href={site.urls.home} className="text-primary-500 hover:opacity-80">
                  {site.urls.home}
                </a>
              </p>
            </div>
          </section>
        </div>

        <p className="mt-10">
          <Link to="/" className="text-sm font-medium text-primary-500 hover:opacity-80">
            Back to home
          </Link>
        </p>
      </article>
    </MarketingLayout>
  );
}
