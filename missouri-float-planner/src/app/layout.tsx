import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/lib/providers";
import SiteHeader from "@/components/layout/SiteHeader";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Float MO",
  description: "Plan your float trip on Missouri rivers with real-time conditions and route information.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${geistHeading.variable} antialiased`}
      >
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
