import { Link } from 'react-router-dom';
import { MarketingLayout } from '../components/MarketingLayout';
import { usePageMeta } from '@chatlogix/hooks';
import { legalContact, legalLastUpdated, refundsMeta } from '../copy';
import { site } from '../lib/site';

export function Refunds() {
  usePageMeta({
    ...refundsMeta,
    canonical: site.urls.refunds,
    robots: 'index, follow',
  });

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
          Refund and Cancellation Policy
        </h1>
        <p className="mt-3 text-sm text-gray-500">Last updated: {legalLastUpdated}</p>

        <div className="prose prose-gray mt-10 max-w-none text-gray-700">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">1. Scope</h2>
            <p className="mt-3 leading-relaxed">
              The customer is refunded on the original UPI or card once the shop approves and funds the refund.
              ChatLogix keeps the platform fee. The shop bears the gateway fee. Cash on delivery is between the customer
              and the shop.
            </p>
            <p className="mt-3 leading-relaxed">
              This policy covers orders ChatLogix collected through Razorpay. A normal refund takes several business
              days after it is sent. ChatLogix does not send a refund the shop has not funded.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">2. Who decides refunds</h2>
            <p className="mt-3 leading-relaxed">
              The shop you ordered from decides whether to accept a cancellation or return and approve a refund. ChatLogix
              provides the software and payment routing; the shop is responsible for the goods and for honouring its
              refund decisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">3. How an online refund is sent</h2>
            <p className="mt-3 leading-relaxed">
              Once the shop approves a refund and has enough held settlement balance to cover it (or pays any shortfall
              through the shop dashboard), ChatLogix instructs Razorpay to refund the customer on the{' '}
              <strong>original payment instrument</strong> (the same UPI, card, or bank account used to pay). Refund timing
              after that depends on the customer&apos;s bank or wallet; it is usually a few business days.
            </p>
            <p className="mt-3 leading-relaxed">
              ChatLogix does not ask customers for card numbers, CVV, or UPI PIN to process a refund. Refunds go back to
              the original instrument automatically.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">4. What is not refunded</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                ChatLogix keeps the platform fee. It is not returned, including on a partial refund. The fee includes
                GST.
              </li>
              <li>
                The shop bears the gateway fee. Razorpay keeps that fee, and it is not added back to the shop.
              </li>
              <li>
                Cash on delivery is between the customer and the shop. ChatLogix does not refund that cash.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">5. If the shop cannot fund a refund yet</h2>
            <p className="mt-3 leading-relaxed">
              If the shop&apos;s held money cannot cover the refund, the shop pays the shortfall before the refund is
              sent. ChatLogix does not send a refund the shop has not funded. Until then, the shop confirms the request.
              A refund is not complete until it has been sent to Razorpay.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">6. Order cancellation before payment</h2>
            <p className="mt-3 leading-relaxed">
              If you have not paid yet, you or the shop may cancel the order in chat or through the shop&apos;s usual
              process. No refund is needed because no online payment was captured.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">7. Disputes and chargebacks</h2>
            <p className="mt-3 leading-relaxed">
              If you dispute a charge with your bank, the shop and ChatLogix follow Razorpay&apos;s dispute process. A lost
              dispute may be recovered from the shop&apos;s settlement as described in our{' '}
              <Link to="/terms" className="text-primary-500 hover:opacity-80">
                Terms of Service
              </Link>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">8. Contact</h2>
            <p className="mt-3 leading-relaxed">
              For help with an order, contact the shop first on WhatsApp. For platform or payment-routing questions,
              email{' '}
              <a href={`mailto:${legalContact.privacyEmail}`} className="text-primary-500 hover:opacity-80">
                {legalContact.privacyEmail}
              </a>{' '}
              or use our{' '}
              <Link to="/contact" className="text-primary-500 hover:opacity-80">
                Contact
              </Link>{' '}
              page.
            </p>
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
