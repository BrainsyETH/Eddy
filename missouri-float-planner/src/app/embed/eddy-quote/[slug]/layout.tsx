// src/app/embed/eddy-quote/[slug]/layout.tsx
// Layout for embeddable Eddy quote – wraps in Suspense for useSearchParams

import { Suspense } from 'react';

export default function EddyQuoteEmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
