// src/app/embed/badge/[slug]/layout.tsx
// Layout for embeddable condition badge widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import type { Metadata } from 'next';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';
import EmbedImpression from '@/components/embed/EmbedImpression';

export const metadata: Metadata = {
  robots: { index: false },
};

export default function EmbedBadgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <EmbedAutoResize />
      <EmbedImpression widgetType="badge" />
      {children}
    </Suspense>
  );
}
