// src/app/support/page.tsx
// The Support URL App Store Connect requires.
//
// ASC's "Support URL" field must be a reachable web page — a mailto: is not
// accepted there, which is why the in-app link in eddy-ios/app/(tabs)/profile.tsx
// is not sufficient on its own. This is that page.
//
// The address here and the one in the privacy policy and the iOS app must stay
// the same. Support arriving at two inboxes is how a request goes unanswered
// while everyone assumes someone else has it.

import Link from 'next/link';
import type { Metadata } from 'next';
import SiteFooter from '@/components/ui/SiteFooter';

export const metadata: Metadata = {
  title: 'Support | Eddy',
  description: 'Get help with Eddy — report a wrong reading, a missing access point, or a problem with your subscription.',
  alternates: { canonical: '/support' },
};

const SUPPORT_EMAIL = 'eddy@eddy.guide';

const heading = 'text-2xl font-bold text-neutral-900 mb-3';
const body = 'text-neutral-700 leading-relaxed';
const link = 'text-primary-600 hover:text-primary-700 font-medium';

export default function SupportPage() {
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
            Support
          </h1>
          <p className="text-white/80">A real person reads these.</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <section>
          <h2 className={heading}>Get in touch</h2>
          <p className={body}>
            Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>
              {SUPPORT_EMAIL}
            </a>{' '}
            with anything at all — a question, a problem, or something Eddy got wrong.
          </p>
        </section>

        <section>
          <h2 className={heading}>Something on the river is wrong</h2>
          <p className={body}>
            A gauge reading that does not match the water, a missing or moved access point, a
            hazard that is no longer there — these are the most useful things you can send us,
            and the ones we act on fastest.
          </p>
          <p className={`${body} mt-3`}>
            In the app, the river and gauge screens each have their own report button, and it
            arrives with the thing it is about already attached. That is quicker than describing
            it in an email, and it means we can find it.
          </p>
        </section>

        <section>
          <h2 className={heading}>Conditions are a planning aid, not a guarantee</h2>
          <p className={body}>
            Readings come from USGS gauges and can trail the river by up to about an hour, and
            hazards move. Always judge the water in front of you. If Eddy showed you something
            that did not match what you found, we want to know — that is exactly the report worth
            sending.
          </p>
        </section>

        <section>
          <h2 className={heading}>Subscriptions</h2>
          <p className={body}>
            Eddy Premium is billed through your Apple ID. Manage or cancel it in Settings on your
            iPhone — deleting the app does not cancel it. If you have been charged for something
            you did not expect, Apple handles refunds, but email us anyway and we will help you
            find the right place.
          </p>
          <p className={`${body} mt-3`}>
            To restore a purchase on a new phone, open Profile in the app and tap Restore
            purchases.
          </p>
        </section>

        <section>
          <h2 className={heading}>Your account and your data</h2>
          <p className={body}>
            You can delete your account, and everything owned by it, from Profile in the app. It
            is immediate and cannot be undone. What we collect and why is in the{' '}
            <Link href="/privacy" className={link}>
              privacy policy
            </Link>
            ; the terms are{' '}
            <Link href="/terms" className={link}>
              here
            </Link>
            .
          </p>
        </section>
      </div>

      <SiteFooter maxWidth="max-w-3xl" className="mt-16" />
    </div>
  );
}
