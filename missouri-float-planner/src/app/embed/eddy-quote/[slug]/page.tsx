// src/app/embed/eddy-quote/[slug]/page.tsx
// Legacy alias — "Eddy's Daily Quote". Pasted iframes keep working; this is
// the `card` size of the river embed family (src/components/embed/v2): the
// live condition, the reading in the river's rated unit on its ladder, Eddy's
// take in full (no mid-sentence split), weather, one timestamp, one link.
// The canonical URL is /embed/river/[slug]?size=card.

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
  return <RiverEmbedPage slug={slug} searchParams={searchParams} defaultSize="card" lockSize />;
}
