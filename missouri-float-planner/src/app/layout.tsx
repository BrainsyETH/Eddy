import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import '@fontsource-variable/fredoka';
import { Providers } from "@/lib/providers";
import SiteHeader from "@/components/layout/SiteHeader";
import OfflineBanner from "@/components/ui/OfflineBanner";
import AnalyticsListener from "@/components/AnalyticsListener";
import { SOCIAL_SAME_AS } from "@/constants/social";
import { jsonLdString } from '@/lib/json-ld';

import "./globals.css";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// Using local Geist fonts with CSS variables that match the design system
// In production, these can be swapped for Google Fonts (Space Grotesk, Inter, JetBrains Mono)
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-body",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

// Heading font uses body font for now - in production can use Space Grotesk
const geistHeading = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-heading",
  weight: "100 900",
});

const EDDY_FAVICON_URL = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

// Validate GA tracking ID format to prevent script injection via misconfigured env vars
const rawGaId = process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const GA_TRACKING_ID = rawGaId && /^(G-[A-Z0-9]+|UA-\d+-\d+)$/.test(rawGaId) ? rawGaId : undefined;

// Tint the iOS/Android browser chrome (status bar, URL bar) the same dark
// teal as the site header — without this the OS paints it with the light
// page background, leaving a gray band above the nav on phones.
export const viewport: Viewport = {
  themeColor: "#163F4A",
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  icons: {
    icon: EDDY_FAVICON_URL,
    apple: EDDY_FAVICON_URL,
  },
  title: {
    default: "Eddy - Your River Guide",
    template: "%s | Eddy",
  },
  description: "Plan your next float trip with live water conditions, access points, float times & weather. Check river levels before you go.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Eddy",
    title: "Eddy - Your River Guide",
    description: "Live water conditions, float times, access points & weather for your favorite float rivers. Check before you go!",
    url: BASE_URL,
    // OG image is auto-discovered from opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "Eddy - Your River Guide",
    description: "Live water conditions, float times, access points & weather for your favorite float rivers.",
    // Twitter image is auto-discovered from twitter-image.tsx
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': `${BASE_URL}/#organization`,
                  name: 'Eddy',
                  url: BASE_URL,
                  logo: EDDY_FAVICON_URL,
                  sameAs: SOCIAL_SAME_AS,
                },
                {
                  '@type': 'WebSite',
                  '@id': `${BASE_URL}/#website`,
                  name: 'Eddy',
                  url: BASE_URL,
                  description: 'Plan your next float trip with live water conditions, access points, float times & weather.',
                  publisher: { '@id': `${BASE_URL}/#organization` },
                },
              ],
            }),
          }}
        />
        {GA_TRACKING_ID ? (
          <>
            <Script
              async
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
            />
            <Script id="ga4">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_TRACKING_ID}');
              `}
            </Script>
          </>
        ) : null}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${geistHeading.variable} antialiased`}
      >
        <Providers>
          <AnalyticsListener />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-md focus:bg-white focus:text-primary-800 focus:shadow-lg focus:outline focus:outline-2 focus:outline-primary-500"
          >
            Skip to main content
          </a>
          <OfflineBanner />
          <SiteHeader />
          <main id="main-content">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
