import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fredoka } from "next/font/google";
import { Providers } from "@/lib/providers";
import SiteHeader from "@/components/layout/SiteHeader";
import "./globals.css";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://floatmo.com';

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
    images: [
      {
        url: `${BASE_URL}/api/og`,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Eddy - Plan Your Missouri Float Trip",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Eddy - Missouri River Float Trip Planner",
    description: "Real-time water conditions, float times, access points, and weather for Missouri's best float rivers.",
    images: [
      {
        url: `${BASE_URL}/api/og`,
        width: 1200,
        height: 630,
      },
    ],
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
        className={`${geistSans.variable} ${geistMono.variable} ${geistHeading.variable} ${fredoka.variable} antialiased`}
      >
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
