import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Eddy',
  description: 'Privacy policy for Eddy, your Ozark float trip companion.',
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-white/80">
            Last updated: February 2026
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Overview</h2>
          <p className="text-neutral-700 leading-relaxed">
            Eddy (eddy.guide) is a Missouri river float trip planning tool. We are committed
            to keeping your experience simple and your data private. This policy explains what
            information we collect and how we use it.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Information We Collect</h2>
          <div className="space-y-4 text-neutral-700 leading-relaxed">
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">Usage Data</h3>
              <p>
                We collect basic, anonymous usage data to understand how people use Eddy and to
                improve the service. This may include pages visited, rivers viewed, and general
                interaction patterns. This data is not tied to any personal identity.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">No Account Required</h3>
              <p>
                Eddy does not require you to create an account, log in, or provide any personal
                information to use the service. You can plan your float trips without sharing
                your name, email, or any other personal details.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">Shared Float Plans</h3>
              <p>
                When you share a float plan via a shareable link, the plan details (put-in,
                take-out, river, and conditions at the time of sharing) are stored so the link
                can be accessed by others. No personal information is attached to shared plans.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Cookies &amp; Local Storage</h2>
          <p className="text-neutral-700 leading-relaxed">
            Eddy may use cookies or browser local storage for basic functionality such as
            remembering your last selected river or vessel type preference. We do not use
            cookies for advertising or cross-site tracking.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Third-Party Services</h2>
          <div className="space-y-3 text-neutral-700 leading-relaxed">
            <p>
              Eddy uses the following third-party services that may collect their own data
              according to their respective privacy policies:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>Vercel</strong> &mdash; Hosting and analytics.{' '}
                <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium">
                  Privacy Policy
                </a>
              </li>
              <li>
                <strong>USGS Water Services</strong> &mdash; Gauge data is fetched server-side;
                no user data is sent to USGS.
              </li>
              <li>
                <strong>Google Maps</strong> &mdash; Used for shuttle route and navigation links.
                Clicking these links takes you to Google&apos;s services.{' '}
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Data We Do Not Collect</h2>
          <ul className="list-disc list-inside space-y-2 text-neutral-700 ml-4">
            <li>We do not collect your name, email, phone number, or address</li>
            <li>We do not collect your precise location (GPS)</li>
            <li>We do not sell or share any data with advertisers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Changes to This Policy</h2>
          <p className="text-neutral-700 leading-relaxed">
            We may update this privacy policy from time to time. Any changes will be reflected
            on this page with an updated date.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-3">Contact</h2>
          <p className="text-neutral-700 leading-relaxed">
            If you have questions about this privacy policy, feel free to reach out through
            our website at{' '}
            <Link href="/" className="text-primary-600 hover:text-primary-700 font-medium">
              eddy.guide
            </Link>.
          </p>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 mt-16">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-primary-200 mb-2">
            <Link href="/" className="hover:text-white transition-colors">
              Eddy
            </Link>{' '}
            &middot; Missouri River Float Trip Planner
          </p>
          <p className="text-sm text-primary-300">
            Water data from USGS &middot; Always check local conditions before floating
          </p>
        </div>
      </footer>
    </div>
  );
}
