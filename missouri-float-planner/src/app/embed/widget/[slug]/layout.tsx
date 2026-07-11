// src/app/embed/widget/[slug]/layout.tsx
// Layout for embeddable conditions widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import type { Metadata } from 'next';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';
import EmbedImpression from '@/components/embed/EmbedImpression';

// Widget iframes are embed-only surfaces — never index them (robots.ts also
// disallows /embed/ but the meta makes it explicit per-route).
export const metadata: Metadata = {
  robots: { index: false },
};

export default function EmbedWidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <EmbedAutoResize />
      <EmbedImpression widgetType="widget" />
      {children}
    </Suspense>
  );
}
