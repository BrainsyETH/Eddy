// src/app/embed/card/[embedId]/layout.tsx
// Layout for the location-pinned "Floatable From Here" card — mounts the
// auto-resize reporter so host iframes size to content like other widgets,
// plus the impression beacon (the page itself is server-rendered).

import { Suspense } from 'react';
import EmbedAutoResize from '@/components/embed/EmbedAutoResize';
import EmbedImpression from '@/components/embed/EmbedImpression';

export default function EmbedCardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <EmbedAutoResize />
      <EmbedImpression widgetType="card" />
      {children}
    </Suspense>
  );
}
