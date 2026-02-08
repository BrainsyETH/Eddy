// src/app/gauges/layout.tsx
// Layout with metadata for the gauges dashboard page

import type { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'River Gauges | Eddy',
  description: 'Real-time water levels and flow trends from USGS gauge stations across Missouri rivers. Check conditions before your float trip.',
  openGraph: {
    title: 'River Gauges | Eddy',
    description: 'Real-time water levels and flow trends from USGS gauge stations across Missouri rivers.',
    // OG image is auto-discovered from opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'River Gauges | Eddy',
    description: 'Real-time water levels and flow trends from USGS gauge stations across Missouri rivers.',
    // Twitter image is auto-discovered from twitter-image.tsx
  },
};

export default function GaugesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
