// src/app/embed/dam/[damId]/page.tsx
// The dam embed: /embed/dam/<damId>?size=badge|strip|card|full&theme=…
// The web twin of the iOS "Dam generation" widget; damId is the registry
// slug ('swl-bull-shoals-dam'), the same id /api/dams/[damId] takes.

import { DamEmbedPage, type EmbedSearchParams } from '@/components/embed/v2/EmbedPages';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ damId: string }>;
  searchParams: Promise<EmbedSearchParams>;
}) {
  const { damId } = await params;
  return <DamEmbedPage damId={damId} searchParams={searchParams} />;
}
