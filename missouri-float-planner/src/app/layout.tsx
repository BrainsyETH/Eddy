import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { Fredoka } from "next/font/google";
import { Providers } from "@/lib/providers";
import SiteHeader from "@/components/layout/SiteHeader";
import ChatPanel from "@/components/chat/ChatPanel";
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

// Fun rounded display font for Eddy branding
const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const EDDY_FAVICON_URL = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';
const GA_TRACKING_ID =
  process.env.NEXT_PUBLIC_GA_ID ||
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  icons: {
    icon: EDDY_FAVICON_URL,
    apple: EDDY_FAVICON_URL,
  },
  title: {
    default: "Eddy — Missouri Float Trip Planner",
    template: "%s | Eddy",
  },
  description: "Plan your Missouri float trip with live water conditions, access points, float times & weather. Current River, Jacks Fork, Eleven Point & more.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Eddy",
    title: "Eddy — Missouri Float Trip Planner",
    description: "Live water conditions, float times, access points & weather for Missouri's best float rivers. Check before you go!",
    url: BASE_URL,
    // OG image is auto-discovered from opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "Eddy — Missouri Float Trip Planner",
    description: "Live water conditions, float times, access points & weather for Missouri's best float rivers.",
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
        className={`${geistSans.variable} ${geistMono.variable} ${geistHeading.variable} ${fredoka.variable} antialiased`}
      >
        <Providers>
          <SiteHeader />
          {children}
          <ChatPanel />
        </Providers>
      </body>
    </html>
  );
}
