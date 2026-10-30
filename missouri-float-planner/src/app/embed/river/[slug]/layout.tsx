// src/app/embed/river/[slug]/layout.tsx
// Embed-only surface: never indexed, self-sizing in the host iframe, counted.

import { Suspense } from 'react';
import type { Metadata } from 'next';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';
import EmbedImpression from '@/components/embed/EmbedImpression';

export const metadata: Metadata = {
  robots: { index: false },
};

export default function EmbedRiverLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <EmbedAutoResize />
      <EmbedImpression widgetType="river" sized />
      {children}
    </Suspense>
  );
}
