import { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'River Window',
  robots: { index: false, follow: false },
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p>Opening the river window…</p>}>{children}</Suspense>;
}
