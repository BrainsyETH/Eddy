// src/app/embed/display/layout.tsx
// Layout for the wall display — Suspense for useSearchParams, kept out of the
// index like every other /embed route. No auto-resize: the display fills the
// screen it is opened on rather than sizing an iframe to its content.

import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'River display',
  robots: { index: false },
};

export default function EmbedDisplayLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
