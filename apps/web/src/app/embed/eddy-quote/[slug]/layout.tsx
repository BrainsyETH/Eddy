// src/app/embed/eddy-quote/[slug]/layout.tsx
// Layout for embeddable Eddy quote – wraps in Suspense for useSearchParams

import { Suspense } from 'react';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';

export default function EddyQuoteEmbedLayout({
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
