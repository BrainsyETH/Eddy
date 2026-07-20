import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/ui/SiteFooter';

export const metadata: Metadata = {
  title: 'Privacy Policy | Eddy',
  description: 'How Eddy collects, uses, shares, and protects information.',
  alternates: { canonical: '/privacy' },
};

const heading = 'text-2xl font-bold text-neutral-900 mb-3';
const body = 'text-neutral-700 leading-relaxed';
const list = 'list-disc space-y-2 text-neutral-700 ml-6';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
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
          <p className="text-white/80">Last updated: July 20, 2026</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <section>
          <h2 className={heading}>Overview</h2>
          <p className={body}>
            Eddy is a river-conditions and float-trip planning service. You can browse rivers
            and create a plan without an account. Some optional features—such as feedback,
            alerts, shared plans, and community reports—require or store additional information.
            This policy describes that information and the choices available to you.
          </p>
        </section>

        <section>
          <h2 className={heading}>Information We Collect</h2>
          <ul className={list}>
            <li>
              <strong>Usage and device data.</strong> Pages viewed, rivers and features used,
              referral information, approximate location derived from network information,
              browser/device details, and diagnostic events. Hosting and security logs may
              include an IP address.
            </li>
            <li>
              <strong>Feedback and correspondence.</strong> Email address, optional name,
              message, attachments, page or river context, and emails you send to an
              <code className="mx-1">@eddy.guide</code> address.
            </li>
            <li>
              <strong>Email subscriptions.</strong> Your email address and the page or form
              where you subscribed. We use this to provide the requested updates.
            </li>
            <li>
              <strong>Shared float plans.</strong> River, put-in, take-out, vessel, calculated
              trip details, and the condition snapshot stored for the shareable link. Shared
              links are accessible to anyone who has the link.
            </li>
            <li>
              <strong>Community reports and photos.</strong> Report type, description, river
              and coordinates, optional display name, selected access/gauge context, and an
              uploaded photo. Uploaded photos are held privately for review and only become
              publicly visible if a moderator approves the report; rejected photos are
              deleted from storage. Eddy decodes and re-encodes community photos before
              storage to remove embedded camera metadata, including EXIF location metadata.
            </li>
            <li>
              <strong>Location you choose to use.</strong> If you use a “nearest me” feature,
              your browser may ask for location permission. The feature uses the coordinates
              needed to calculate nearby results; Eddy does not continuously track your device.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={heading}>How We Use Information</h2>
          <ul className={list}>
            <li>Provide river conditions, planning, sharing, widgets, and support.</li>
            <li>Review community submissions and correct inaccurate or unsafe information.</li>
            <li>Send updates you requested and respond to messages.</li>
            <li>Measure reliability and usage, troubleshoot errors, prevent abuse, and secure Eddy.</li>
            <li>Comply with law and protect users, partners, and the service.</li>
          </ul>
          <p className={`${body} mt-3`}>
            Eddy does not sell personal information or use it for third-party behavioral advertising.
          </p>
        </section>

        <section>
          <h2 className={heading}>Cookies and Local Storage</h2>
          <p className={body}>
            Eddy uses browser storage for functional preferences such as the selected river,
            vessel, map filters, recent UI state, and administrative sessions. Analytics providers
            may use cookies or similar identifiers when analytics is enabled. Browser controls can
            clear or block storage, although some preferences or features may stop working.
          </p>
        </section>

        <section>
          <h2 className={heading}>Service Providers and External Links</h2>
          <p className={`${body} mb-3`}>
            Eddy uses service providers to operate the site. They process information under their
            own terms and our configuration:
          </p>
          <ul className={list}>
            <li><strong>Vercel</strong> for hosting, delivery, logs, and site analytics.</li>
            <li><strong>Supabase</strong> for the database, authentication infrastructure, and media storage.</li>
            <li><strong>Google Analytics/Tag Manager</strong> for usage measurement when configured.</li>
            <li><strong>Resend</strong> for subscription, inbound email, and reply delivery.</li>
            <li><strong>USGS and weather providers</strong> for river and forecast data. Gauge requests are generally made server-side.</li>
            <li><strong>Map, routing, and navigation providers</strong> for tiles, shuttle estimates, and links you choose to open.</li>
          </ul>
          <p className={`${body} mt-3`}>
            External navigation, outfitter, campground, and source links take you to third-party
            sites governed by their policies. Eddy&apos;s chat feature is currently unavailable. If
            it returns, this policy and the chat interface will identify the AI processor and
            message-retention behavior before messages are accepted.
          </p>
        </section>

        <section>
          <h2 className={heading}>Retention and Public Information</h2>
          <p className={body}>
            Subscription information is kept until you unsubscribe or request deletion. Feedback,
            correspondence, security logs, and community reports are retained while needed to
            respond, moderate, maintain an audit trail, prevent abuse, and meet legal obligations.
            Shared plans remain available while their links are supported. Approved community
            content and its display name, description, river location, and photo may be public.
            Backups may retain deleted information for a limited recovery period.
          </p>
        </section>

        <section>
          <h2 className={heading}>Your Choices</h2>
          <ul className={list}>
            <li>Do not grant browser location permission if you do not want to use location features.</li>
            <li>Use an unlisted shared-plan link only with people you trust.</li>
            <li>Do not include faces, license plates, children, or private details in community photos.</li>
            <li>Use the unsubscribe option in an email or contact us to stop email updates.</li>
            <li>Ask to access, correct, or delete information associated with your email or submission.</li>
          </ul>
        </section>

        <section>
          <h2 className={heading}>Security and Children</h2>
          <p className={body}>
            Eddy uses technical and organizational safeguards, but no internet service can promise
            absolute security. Eddy is intended for general audiences and is not directed to children
            under 13. Please contact us if you believe a child submitted personal information.
          </p>
        </section>

        <section>
          <h2 className={heading}>Changes and Contact</h2>
          <p className={body}>
            We may update this policy as Eddy changes and will revise the date above. For privacy
            questions or an access, correction, or deletion request, email{' '}
            <a
              href="mailto:hello@eddy.guide"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              hello@eddy.guide
            </a>{' '}
            or use the feedback form available from <Link href="/" className="text-primary-600 hover:text-primary-700 font-medium">eddy.guide</Link>.
          </p>
        </section>
      </div>

      <SiteFooter maxWidth="max-w-3xl" className="mt-16" />
    </div>
  );
}
