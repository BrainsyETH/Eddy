// src/app/embed/services/[slug]/layout.tsx
// Layout for embeddable services directory widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import type { Metadata } from 'next';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';
import EmbedImpression from '@/components/embed/EmbedImpression';

export const metadata: Metadata = {
  robots: { index: false },
};

export default function EmbedServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <EmbedAutoResize />
      <EmbedImpression widgetType="services" />
      {children}
    </Suspense>
  );
}
