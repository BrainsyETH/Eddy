// src/app/embed/dam/[damId]/layout.tsx

import { Suspense } from 'react';
import type { Metadata } from 'next';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';
import EmbedImpression from '@/components/embed/EmbedImpression';

export const metadata: Metadata = {
  robots: { index: false },
};

export default function EmbedDamLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <EmbedAutoResize />
      <EmbedImpression widgetType="dam" sized />
      {children}
    </Suspense>
  );
}
