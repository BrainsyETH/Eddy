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
            Last updated: July 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Agreement to Terms</h2>
          <p className="text-neutral-700 leading-relaxed">
            Welcome to Eddy (eddy.guide). By accessing or using this website and its related
            services, you agree to be bound by these Terms of Service. If you do not agree with
            any part of these terms, please do not use Eddy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">What Eddy Is</h2>
          <p className="text-neutral-700 leading-relaxed">
            Eddy is a free, informational river float trip planning tool for Missouri and the
            Ozarks. It aggregates public gauge data, weather, and river information to help you
            plan paddling trips. Eddy is a planning aid only &mdash; it is not a substitute for
            your own judgment, local knowledge, professional guidance, or official safety
            authorities.
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
              River condition ratings, float recommendations, and estimated float times shown on
              Eddy are automated interpretations for general guidance only. They may not reflect
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
