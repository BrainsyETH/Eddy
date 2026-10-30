// src/app/embed/badge/[slug]/page.tsx
// Legacy alias — "Condition Badge". Pasted iframes keep working; this is the
// `badge` size of the river embed family. The canonical URL is
// /embed/river/[slug]?size=badge, and /embed/img/river/[slug]/badge.png is
// the same pill as an image for hosts that strip iframes.

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
  return <RiverEmbedPage slug={slug} searchParams={searchParams} defaultSize="badge" lockSize />;
}
