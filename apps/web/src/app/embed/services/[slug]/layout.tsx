// src/app/embed/services/[slug]/layout.tsx
// Layout for embeddable services directory widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';

export default function EmbedServicesLayout({
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
