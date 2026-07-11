// src/app/embed/eddy-quote/[slug]/layout.tsx
// Layout for embeddable Eddy quote – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import type { Metadata } from 'next';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';
import EmbedImpression from '@/components/embed/EmbedImpression';

export const metadata: Metadata = {
  robots: { index: false },
};

export default function EddyQuoteEmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <EmbedAutoResize />
      <EmbedImpression widgetType="eddy-quote" />
      {children}
    </Suspense>
  );
}
