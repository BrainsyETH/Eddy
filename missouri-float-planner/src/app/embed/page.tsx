// src/app/embed/page.tsx
// Server wrapper for the embed workbench: owns route metadata (scoped to /embed
// only, so the widget iframe routes keep their own) and renders the client UI.

import type { Metadata } from 'next';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';
import EmbedWorkbench from '@/components/embed/EmbedWorkbench';

export const metadata: Metadata = publicPageMetadata(
  'Widgets',
  'Free Missouri river widgets — live conditions, gauge reports, a float-trip planner and more. Configure, preview and copy the code for your site.',
  '/embed',
  SHARE_IMAGES.site,
);

export default function EmbedPage() {
  return <EmbedWorkbench />;
}
