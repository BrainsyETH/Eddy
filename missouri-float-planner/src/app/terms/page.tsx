import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/ui/SiteFooter';

export const metadata: Metadata = {
  title: 'Terms of Service | Eddy',
  description: 'Terms of Service for Eddy, your river float trip companion.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <section
        className="relative py-12 md:py-16 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1
            className="text-4xl md:text-5xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            Terms of Service
          </h1>
          <p className="text-white/80">
            Last updated: July 26, 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Agreement to Terms</h2>
          <p className="text-neutral-700 leading-relaxed">
            Welcome to Eddy. These Terms of Service cover the Eddy website (eddy.guide), the
            Eddy mobile application, and all related services. By accessing or using any of
            them, you agree to be bound by these terms. If you do not agree with any part of
            them, please do not use Eddy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">What Eddy Is</h2>
          <p className="text-neutral-700 leading-relaxed">
            Eddy is an informational river float trip planning tool for Missouri and the
            Ozarks. It aggregates public gauge data, weather, and river information to help you
            plan paddling trips. Eddy is a planning aid only &mdash; it is not a substitute for
            your own judgment, local knowledge, professional guidance, or official safety
            authorities.
          </p>
          <p className="text-neutral-700 leading-relaxed mt-3">
            Viewing river conditions, gauge readings, hazard information, and access points is
            free and always will be. Eddy also offers an optional paid subscription
            (&ldquo;Eddy+&rdquo;) which adds convenience features such as push notifications when
            a river changes condition and downloadable offline maps. A paid subscription never
            unlocks safety information that free users cannot see.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">
            Assumption of Risk &amp; Safety
          </h2>
          <div className="space-y-4 text-neutral-700 leading-relaxed">
            <div className="p-4 bg-secondary-50 border border-secondary-200 rounded-lg">
              <p>
                <strong className="text-neutral-900">
                  Paddling, floating, and other water activities are inherently dangerous and can
                  result in serious injury or death.
                </strong>{' '}
                Water levels, flow rates, and hazards can change rapidly and without warning.
                By using Eddy, you acknowledge and voluntarily assume all risks associated with
                your activities on or near the water.
              </p>
            </div>
            <p>You are solely responsible for your own safety and the safety of your party. Before any trip, you should:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Consult local outfitters, park rangers, and current official advisories</li>
              <li>Verify conditions independently &mdash; do not rely on Eddy alone</li>
              <li>Wear a properly fitted life jacket and never float alone</li>
              <li>Assess your own skill level, equipment, and the current weather</li>
              <li>Be aware that low-head dams, strainers, and cold water pose serious hazards</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Accuracy of Information</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p>
              Eddy displays data drawn from third-party sources, including{' '}
              <strong>USGS Water Services</strong> gauge readings and public weather providers.
              This data is provided &ldquo;as is,&rdquo; may be delayed, incomplete, or
              inaccurate, and can be interrupted or removed at any time by its source.
            </p>
            <p>
              River condition ratings, float recommendations, estimated float times, hazard
              listings, and condition alerts shown by Eddy are automated interpretations for
              general guidance only. They may not reflect
              actual conditions on the water. We make no guarantee as to the accuracy, timeliness,
              or completeness of any information on the site.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">No Warranty</h2>
          <p className="text-neutral-700 leading-relaxed">
            Eddy is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis
            without warranties of any kind, whether express or implied, including but not limited
            to warranties of merchantability, fitness for a particular purpose, and
            non-infringement. We do not warrant that the service will be uninterrupted, secure,
            or error-free.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Limitation of Liability</h2>
          <p className="text-neutral-700 leading-relaxed">
            To the fullest extent permitted by law, Eddy and its creators shall not be liable for
            any direct, indirect, incidental, consequential, or special damages &mdash; including
            personal injury, death, or property damage &mdash; arising out of or related to your
            use of, or inability to use, this website or any information it provides. Your use of
            Eddy is entirely at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Accounts</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p>
              You can use most of Eddy without creating an account. When you first open the
              mobile app, Eddy creates an <strong>anonymous account</strong> for your device
              automatically so that saved rivers and preferences can be kept and restored. This
              account has no email address, name, or password attached to it, and you are not
              asked to sign up.
            </p>
            <p>
              If you later sign in with Apple, that same account is upgraded rather than
              replaced, so anything you saved beforehand carries over. Some features &mdash;
              including push notifications and paid subscriptions &mdash; require a signed-in
              account, because they are tied to a payment and a device rather than to a
              browsing session.
            </p>
            <p>
              You are responsible for activity that occurs under your account. Contact us to
              request deletion of an account and its associated data.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Eddy+ Subscriptions</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p>
              Eddy+ is an auto-renewing subscription sold through the Apple App Store. Payment is
              charged to your Apple ID account at confirmation of purchase.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                Your subscription renews automatically for the same period unless you turn off
                auto-renewal at least 24 hours before the end of the current period.
              </li>
              <li>
                Your account is charged for renewal within 24 hours prior to the end of the
                current period, at the price then in effect for your subscription.
              </li>
              <li>
                <strong>You manage and cancel your subscription in your Apple ID settings,
                not through Eddy.</strong> We cannot cancel a subscription on your behalf.
              </li>
              <li>
                Deleting the app does not cancel a subscription.
              </li>
              <li>
                If a free trial is offered, any unused portion is forfeited when you purchase a
                subscription.
              </li>
            </ul>
            <p>
              Refunds are handled by Apple under the App Store terms, not by Eddy. We may change
              subscription pricing or the features included in Eddy+; changes to price take
              effect at your next renewal and Apple will ask for your consent where required.
            </p>
            <p>
              If your subscription lapses, you keep full access to river conditions, readings,
              hazards, and access points. You lose only the paid convenience features.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Alerts and Notifications</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p className="font-semibold text-neutral-900">
              Do not rely on Eddy notifications for safety-critical decisions.
            </p>
            <p>
              Condition alerts are generated from public gauge readings that Eddy checks on a
              schedule. Because those readings are themselves reported on a delay, an alert can
              trail the actual river by roughly 20 to 75 minutes, and sometimes longer if a gauge
              or an upstream service is unavailable. Eddy does not promise real-time or
              instantaneous notification, and does not guarantee that any particular notification
              will be generated or delivered at all.
            </p>
            <p>
              Notification delivery depends on Apple&apos;s push service, your network, and your
              device settings, none of which Eddy controls. A missed, delayed, duplicated, or
              incorrect notification is not a breach of these terms. Emergency information should
              come from the National Weather Service, local authorities, and your own observation
              of the water.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Offline Maps</h2>
          <p className="text-neutral-700 leading-relaxed">
            Downloaded maps are stored on your device and reflect the map data and river
            information available at the time of download. They do <strong>not</strong> update
            themselves, and they do not contain live conditions. A downloaded map may become
            inaccurate as access points, hazards, or river channels change. Storage limits are
            imposed by the map provider and by your device; Eddy may decline a download or ask
            you to remove another river to stay within them.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Community Content</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p>
              If you submit a report, photograph, or other content to Eddy, you confirm that you
              have the right to do so and that it does not infringe anyone else&apos;s rights or
              privacy. You retain ownership of what you submit, and you grant Eddy a
              non-exclusive, worldwide, royalty-free licence to store, reproduce, adapt, and
              display it in connection with operating and promoting the service.
            </p>
            <p>
              Submissions are reviewed before they appear publicly, and we may edit, decline, or
              remove any submission for any reason &mdash; including inaccuracy, safety concerns,
              or the presence of identifiable people, vehicles, or private property. Do not
              submit content depicting children, faces, licence plates, or private information.
            </p>
            <p>
              Community reports are user opinion, not verified fact. Treat them as you would a
              tip from a stranger at a put-in.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Acceptable Use</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Use Eddy for any unlawful purpose or in violation of these terms</li>
              <li>Scrape, harvest, or systematically extract data from the site at scale</li>
              <li>Attempt to disrupt, overload, or gain unauthorized access to the service</li>
              <li>Misrepresent shared float plans or use them to endanger others</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Third-Party Links &amp; Services</h2>
          <p className="text-neutral-700 leading-relaxed">
            Eddy links to third-party services such as Google Maps for navigation and shuttle
            routes, and to outfitter and information websites. We do not control these services
            and are not responsible for their content, availability, or practices. Following an
            external link is at your own discretion and subject to that party&apos;s terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Intellectual Property</h2>
          <p className="text-neutral-700 leading-relaxed">
            The Eddy name, branding, original content, and site design are the property of their
            respective owners. Underlying gauge and weather data belongs to its public sources
            (such as the USGS) and remains subject to their respective terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Apple App Store</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p>
              The following applies to the Eddy iOS application obtained through the Apple App
              Store. These terms are between you and Eddy only, <strong>not with Apple</strong>.
              Apple is not responsible for the app or its content.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                Apple has no obligation to furnish any maintenance or support for the app.
              </li>
              <li>
                To the maximum extent permitted by law, Apple has no warranty obligation
                whatsoever with respect to the app. In the event of any failure of the app to
                conform to any applicable warranty, you may notify Apple, and Apple will refund
                the purchase price of the app to you; Apple has no other warranty obligation.
              </li>
              <li>
                Apple is not responsible for addressing any claim by you or a third party
                relating to the app, including product liability, legal or regulatory
                non-compliance, and consumer protection claims.
              </li>
              <li>
                Apple is not responsible for the investigation, defence, settlement, or discharge
                of any third-party claim that the app infringes intellectual property rights.
              </li>
              <li>
                You represent that you are not located in a country subject to a U.S. Government
                embargo or designated as a &ldquo;terrorist supporting&rdquo; country, and that
                you are not on any U.S. Government list of prohibited or restricted parties.
              </li>
              <li>
                Apple and its subsidiaries are third-party beneficiaries of these terms and, upon
                your acceptance, will have the right to enforce them against you.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Changes to These Terms</h2>
          <p className="text-neutral-700 leading-relaxed">
            We may update these Terms of Service from time to time. Any changes will be reflected
            on this page with an updated date. Your continued use of Eddy after changes are posted
            constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Governing Law</h2>
          <p className="text-neutral-700 leading-relaxed">
            These terms are governed by the laws of the State of Missouri, without regard to its
            conflict-of-law provisions. Any disputes arising from your use of Eddy shall be
            subject to the exclusive jurisdiction of the courts located in Missouri.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Contact</h2>
          <p className="text-neutral-700 leading-relaxed">
            If you have questions about these Terms of Service, feel free to reach out through
            our website at{' '}
            <Link href="/" className="text-primary-600 hover:text-primary-700 font-medium">
              eddy.guide
            </Link>.
          </p>
        </section>
      </div>

      <SiteFooter maxWidth="max-w-3xl" className="mt-16" />
    </div>
  );
}
