// src/app/embed/services/[slug]/layout.tsx
// Layout for embeddable services directory widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';

export default function EmbedServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
