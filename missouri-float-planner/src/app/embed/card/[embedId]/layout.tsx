// src/app/embed/card/[embedId]/layout.tsx
// Layout for the location-pinned "Floatable From Here" card — mounts the
// auto-resize reporter so host iframes size to content like other widgets.

import { Suspense } from 'react';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';

export default function EmbedCardLayout({
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
