// src/app/privacy/page.tsx
// Privacy Policy page for Eddy

import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for Eddy - Missouri River Float Trip Planner',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-primary-800 border-b-2 border-neutral-900">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-primary-200 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-white">Privacy Policy</h1>
          <p className="text-primary-200 mt-2">Last updated: February 2026</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="prose prose-neutral max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Overview</h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              Eddy (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, and safeguard information when you use 
              our Missouri River float trip planning service at eddy.guide.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Information We Collect</h2>
            
            <h3 className="text-lg font-semibold text-neutral-800 mt-6 mb-3">Automatically Collected Information</h3>
            <p className="text-neutral-700 leading-relaxed mb-4">
              When you visit Eddy, we may automatically collect:
            </p>
            <ul className="list-disc list-inside space-y-2 text-neutral-700 ml-4 mb-4">
              <li>Device type and browser information</li>
              <li>IP address (anonymized)</li>
              <li>Pages visited and time spent</li>
              <li>Referring website</li>
            </ul>

            <h3 className="text-lg font-semibold text-neutral-800 mt-6 mb-3">Information You Provide</h3>
            <p className="text-neutral-700 leading-relaxed mb-4">
              When you submit feedback or report an issue, we collect:
            </p>
            <ul className="list-disc list-inside space-y-2 text-neutral-700 ml-4 mb-4">
              <li>Your email address (for follow-up)</li>
              <li>Your name (optional)</li>
              <li>The content of your message</li>
              <li>Any images you choose to upload</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">How We Use Your Information</h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-neutral-700 ml-4 mb-4">
              <li>Provide and improve the Eddy service</li>
              <li>Respond to your feedback and support requests</li>
              <li>Understand how users interact with our service</li>
              <li>Maintain the security of our service</li>
            </ul>
            <p className="text-neutral-700 leading-relaxed">
              We do <strong>not</strong> sell your personal information to third parties.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Third-Party Services</h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              Eddy uses the following third-party services:
            </p>
            <ul className="list-disc list-inside space-y-2 text-neutral-700 ml-4 mb-4">
              <li><strong>USGS Water Services</strong> - For real-time river gauge data (no personal data shared)</li>
              <li><strong>Mapbox/MapLibre</strong> - For map display (subject to their privacy policy)</li>
              <li><strong>Vercel</strong> - For hosting and analytics</li>
              <li><strong>Supabase</strong> - For data storage</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Data Retention</h2>
            <p className="text-neutral-700 leading-relaxed">
              We retain feedback submissions for as long as necessary to address your inquiry and improve 
              our service. Analytics data is retained in aggregate form. You may request deletion of your 
              personal data by contacting us.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Cookies</h2>
            <p className="text-neutral-700 leading-relaxed">
              Eddy uses essential cookies to maintain session state and remember your preferences 
              (such as selected rivers). We do not use tracking cookies for advertising purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Your Rights</h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-neutral-700 ml-4 mb-4">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of analytics tracking</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Children&apos;s Privacy</h2>
            <p className="text-neutral-700 leading-relaxed">
              Eddy is not directed at children under 13. We do not knowingly collect personal 
              information from children under 13. If you believe we have collected such information, 
              please contact us immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Changes to This Policy</h2>
            <p className="text-neutral-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes 
              by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-4">Contact Us</h2>
            <p className="text-neutral-700 leading-relaxed">
              If you have questions about this Privacy Policy or wish to exercise your rights, 
              please use the feedback form on any river page to contact us.
            </p>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-primary-200">
            Eddy &middot; Missouri River Float Trip Planner
          </p>
        </div>
      </footer>
    </div>
  );
}
