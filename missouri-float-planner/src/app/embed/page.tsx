// src/app/embed/page.tsx
// Server wrapper for the embed workbench: owns route metadata (scoped to /embed
// only, so the widget iframe routes keep their own) and renders the client UI.

import type { Metadata } from 'next';
import EmbedWorkbench from '@/components/embed/EmbedWorkbench';

export const metadata: Metadata = {
  title: 'Embed Widgets',
  description:
    'Free, embeddable Missouri river widgets — live conditions, gauge reports, a float-trip planner, services directory and condition badges. Configure, preview and copy the code for your website.',
  alternates: { canonical: '/embed' },
  openGraph: {
    title: 'Embed Widgets | Eddy',
    description:
      'Free, embeddable Missouri river widgets — live conditions, gauge reports, a float-trip planner and more. Configure, preview and copy the embed code.',
    url: '/embed',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Embed Widgets | Eddy',
    description: 'Free, embeddable Missouri river widgets. Configure, preview and copy the embed code.',
  },
};

export default function EmbedPage() {
  return <EmbedWorkbench />;
}
