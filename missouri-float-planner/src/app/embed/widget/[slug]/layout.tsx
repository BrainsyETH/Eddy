// src/app/embed/widget/[slug]/layout.tsx
// Layout for embeddable conditions widget – wraps in Suspense for useSearchParams

import { Suspense } from 'react';

export default function EmbedWidgetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
