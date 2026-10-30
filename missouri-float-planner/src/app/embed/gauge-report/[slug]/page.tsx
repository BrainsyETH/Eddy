// src/app/embed/gauge-report/[slug]/page.tsx
// Legacy alias — "Gauge Report". Pasted iframes keep working; this is the
// `full` size of the river embed family with its ?days=7|14|30 chart window.
// The canonical URL is /embed/river/[slug]?size=full&days=….

import { RiverEmbedPage, type EmbedSearchParams } from '@/components/embed/v2/EmbedPages';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<EmbedSearchParams>;
}) {
  const { slug } = await params;
  return <RiverEmbedPage slug={slug} searchParams={searchParams} defaultSize="full" lockSize />;
}
