import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fredoka } from "next/font/google";
import { Providers } from "@/lib/providers";
import SiteHeader from "@/components/layout/SiteHeader";
import "./globals.css";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// Font configuration - Geist for body/headings, Geist Mono for code
// Both body and heading use the same font (Geist) but with different CSS variables
// for flexibility if we want to swap heading font later
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});

// Fun rounded display font for Eddy branding
const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const EDDY_FAVICON_URL = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  icons: {
    icon: EDDY_FAVICON_URL,
    apple: EDDY_FAVICON_URL,
  },
  title: {
    default: "Eddy - Missouri River Float Trip Planner",
    template: "%s | Eddy",
  },
  description: "Plan your float trip on Missouri rivers with real-time water conditions, access points, float time estimates, and weather forecasts for the Ozarks.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Eddy",
    title: "Eddy - Missouri River Float Trip Planner",
    description: "Real-time water conditions, float times, access points, and weather for Missouri's best float rivers. Check before you go!",
    url: BASE_URL,
    // OG image is auto-discovered from opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "Eddy - Missouri River Float Trip Planner",
    description: "Real-time water conditions, float times, access points, and weather for Missouri's best float rivers.",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} antialiased`}
        style={{
          // Map our single font to both body and heading CSS variables
          '--font-body': 'var(--font-geist-sans)',
          '--font-heading': 'var(--font-geist-sans)',
        } as React.CSSProperties}
      >
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
