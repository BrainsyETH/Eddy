// src/app/embed/rivers/page.tsx
// Multi-river overview — a stack of river strips for outfitters serving more
// than one river and regional tourism pages. ?rivers=current,jacks-fork
// selects and orders the rows (max 8); omitted, the first eight rivers.

import { RiverStackPage, type EmbedSearchParams } from '@/components/embed/v2/EmbedPages';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<EmbedSearchParams> }) {
  return <RiverStackPage searchParams={searchParams} />;
}
