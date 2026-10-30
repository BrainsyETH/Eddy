// src/app/embed/widget/[slug]/page.tsx
// Legacy alias — "Live Conditions". Pasted iframes keep working; this is the
// `full` size of the river embed family (src/components/embed/v2). The
// canonical URL is /embed/river/[slug]?size=full.

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
