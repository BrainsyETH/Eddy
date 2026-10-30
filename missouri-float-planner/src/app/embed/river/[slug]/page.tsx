// src/app/embed/river/[slug]/page.tsx
// The canonical river embed: /embed/river/<slug>?size=badge|strip|card|full
// &theme=light|dark|auto&bg=transparent&accent=%23hex&days=7|14|30
// &partner=…&e=emb_… — see src/lib/embed/options.ts.

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
  return <RiverEmbedPage slug={slug} searchParams={searchParams} defaultSize="card" />;
}
