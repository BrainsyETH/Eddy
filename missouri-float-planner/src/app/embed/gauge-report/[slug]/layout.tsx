// src/app/embed/gauge-report/[slug]/layout.tsx
// Layout for embeddable gauge report – wraps in Suspense for useSearchParams

import { Suspense } from 'react';

export default function GaugeReportEmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
