import { Link } from 'react-router-dom';
import { MarketingLayout } from '../components/MarketingLayout';
import { usePageMeta } from '@chatlogix/hooks';
import { legalContact, legalLastUpdated, termsMeta } from '../copy';
import { site } from '../lib/site';

export function Terms() {
  usePageMeta({
    ...termsMeta,
    canonical: site.urls.terms,
    robots: 'index, follow',
  });

  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">Terms of Service</h1>
        <p className="mt-3 text-sm text-gray-500">Last updated: {legalLastUpdated}</p>

        <div className="prose prose-gray mt-10 max-w-none text-gray-700">
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">1. Who we are</h2>
            <p className="mt-3 leading-relaxed">
              ChatLogix (&quot;we,&quot; &quot;us&quot;) provides software that helps shops manage WhatsApp conversations,
              catalogs, and orders. These terms are between ChatLogix and the shop that registers (&quot;you,&quot; the
              &quot;shop&quot;).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">2. The service</h2>
            <p className="mt-3 leading-relaxed">
              ChatLogix is software. We help you respond to customers, manage products, and process orders through
              WhatsApp. You remain responsible for your goods, pricing, fulfilment, customer service, and compliance
              with applicable laws (including GST on the goods you sell).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">3. When ChatLogix collects order payments</h2>
            <p className="mt-3 leading-relaxed">
              When a shop opts in, ChatLogix collects that order through Razorpay and pays the shop after a 48-hour
              hold, minus the gateway cost and the admin-set platform fee. The platform fee includes GST. Where the law
              requires it, ChatLogix also withholds GST TCS and TDS. The rest goes to the shop&apos;s Razorpay linked
              account.
            </p>
            <p className="mt-3 leading-relaxed">
              A new shop — the first 30 days after collection starts, or the first 20 captured orders, whichever ends
              later — is held for 7 days instead of 48 hours. When the hold ends, ChatLogix releases the transfer and
              Razorpay settles it to the shop&apos;s bank. ChatLogix does not promise when the money arrives in the bank.
            </p>
            <p className="mt-3 leading-relaxed">
              ChatLogix may hold or delay a release for a refund, a dispute, a settlement-bank change, or suspected
              fraud.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">4. Refunds and amounts you owe</h2>
            <p className="mt-3 leading-relaxed">
              When you approve a customer refund, the customer is refunded on the original payment instrument (UPI, card,
              or netbanking) once the refund is sent through Razorpay. The platform fee is not returned on a refund. You
              bear the gateway cost on refunded amounts as described in our{' '}
              <Link to="/refunds" className="text-primary-500 hover:opacity-80">
                Refund and cancellation policy
              </Link>
              .
            </p>
            <p className="mt-3 leading-relaxed">
              If your held settlement balance cannot cover a refund you approve, you must fund the shortfall before the
              refund is sent. ChatLogix does not front refunds from its own funds. Anything you owe ChatLogix (including
              after a lost payment dispute) may be recovered from later order payments or invoiced to you.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">5. Cash on delivery</h2>
            <p className="mt-3 leading-relaxed">
              Cash on delivery (COD) orders are between you and your customer. ChatLogix does not collect or settle COD
              payments through Razorpay.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">6. AI wallet (separate from order settlement)</h2>
            <p className="mt-3 leading-relaxed">
              Your AI usage wallet is separate from order settlement. Topping up the AI wallet pays for messaging and
              platform usage as described in our billing documentation. Order payments do not credit the AI wallet.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">7. Acceptable use</h2>
            <p className="mt-3 leading-relaxed">
              You must use ChatLogix lawfully, provide accurate business and KYC information when collecting payments,
              and not use the service for prohibited goods or fraudulent activity. We may suspend access for abuse,
              non-payment of amounts owed, or risk to customers or the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">8. Changes</h2>
            <p className="mt-3 leading-relaxed">
              We may update these terms. We will post the revised terms on this page and update the &quot;Last updated&quot;
              date. Continued use after changes constitutes acceptance where permitted by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900">9. Contact</h2>
            <p className="mt-3 leading-relaxed">
              Questions about these terms:{' '}
              <a href={`mailto:${legalContact.privacyEmail}`} className="text-primary-500 hover:opacity-80">
                {legalContact.privacyEmail}
              </a>
              . See also our{' '}
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
