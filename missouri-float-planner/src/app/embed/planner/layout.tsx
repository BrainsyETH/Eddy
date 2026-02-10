// src/app/embed/planner/layout.tsx
// Layout for embeddable planner – wraps in Suspense for useSearchParams

import { Suspense } from 'react';

export default function EmbedPlannerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense>{children}</Suspense>;
}
