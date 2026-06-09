// src/app/embed/badge/[slug]/layout.tsx
// Layout for embeddable condition badge widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';

export default function EmbedBadgeLayout({
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
