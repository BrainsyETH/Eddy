// src/app/embed/gauge-report/[slug]/layout.tsx
// Layout for embeddable gauge report – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';

export default function GaugeReportEmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <EmbedAutoResize />
      {children}
    </Suspense>
  );
}
