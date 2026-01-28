// src/app/gauges/layout.tsx
// Layout with metadata for the gauges dashboard page

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'River Gauges | Eddy',
  description: 'Real-time water levels and flow trends from USGS gauge stations across Missouri rivers. Check conditions before your float trip.',
  openGraph: {
    title: 'River Gauges | Eddy',
    description: 'Real-time water levels and flow trends from USGS gauge stations across Missouri rivers.',
    images: [
      {
        url: '/api/og/gauges',
        width: 1200,
        height: 630,
        alt: 'Eddy River Gauges Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'River Gauges | Eddy',
    description: 'Real-time water levels and flow trends from USGS gauge stations across Missouri rivers.',
    images: ['/api/og/gauges'],
  },
};

export default function GaugesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
