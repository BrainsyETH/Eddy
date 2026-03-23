// src/app/embed/badge/[slug]/layout.tsx
// Layout for embeddable condition badge widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';

export default function EmbedBadgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
