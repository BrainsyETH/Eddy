// src/components/embed/v2/EmbedPages.tsx
// The two server pages behind every route in the embed family. A route is a
// slug plus a default size; everything else (theme, bg, accent, days, partner
// credit, co-branding) is read off the query string by parseEmbedOptions, so
// the canonical /embed/river/[slug]?size=… route and the legacy aliases
// (/embed/widget, /embed/eddy-quote, /embed/gauge-report, /embed/badge)
// render through the same code.

import { parseEmbedOptions, type EmbedOptions, type EmbedSize } from '@/lib/embed/options';
import { loadEmbedBranding, loadRiverEmbed, loadRiverEmbeds } from '@/lib/embed/river-data';
import { loadDamEmbed } from '@/lib/embed/dam-data';
import { EmbedUnavailable } from './EmbedFrame';
import RiverEmbed, { RiverStack } from './RiverEmbed';
import DamEmbed from './DamEmbed';

export type EmbedSearchParams = Record<string, string | string[] | undefined>;

/** Production origin for the deep links, so a preview deploy still sends readers to the live site. */
export function embedOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';
}

async function resolve(searchParams: Promise<EmbedSearchParams>, defaults: Partial<EmbedOptions>) {
  const options = parseEmbedOptions(await searchParams, defaults);
  const branding = await loadEmbedBranding(options.embedId);
  return { options, branding, origin: embedOrigin(), now: Date.now() };
}

export async function RiverEmbedPage({
  slug,
  searchParams,
  defaultSize,
  lockSize = false,
}: {
  slug: string;
  searchParams: Promise<EmbedSearchParams>;
  defaultSize: EmbedSize;
  /** Legacy aliases keep their size regardless of ?size=, so a pasted iframe never changes shape. */
  lockSize?: boolean;
}) {
  const ctx = await resolve(searchParams, { size: defaultSize });
  if (lockSize) ctx.options.size = defaultSize;
  const data = await loadRiverEmbed(slug, ctx.options.days).catch((error) => {
    console.error(`[embed/river] ${slug} failed:`, error);
    return null;
  });
  if (!data) {
    return <EmbedUnavailable size={ctx.options.size} options={ctx.options} kind="river" message="River conditions temporarily unavailable" />;
  }
  return <RiverEmbed data={data} {...ctx} />;
}

export async function RiverStackPage({ searchParams }: { searchParams: Promise<EmbedSearchParams> }) {
  const params = await searchParams;
  const ctx = await resolve(Promise.resolve(params), { size: 'card' });
  const raw = Array.isArray(params.rivers) ? params.rivers[0] : params.rivers;
  const slugs = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rivers = await loadRiverEmbeds(slugs).catch(() => []);
  if (rivers.length === 0) {
    return <EmbedUnavailable size="card" options={ctx.options} kind="river" message="River conditions temporarily unavailable" />;
  }
  return <RiverStack rivers={rivers} {...ctx} />;
}

export async function DamEmbedPage({
  damId,
  searchParams,
  defaultSize = 'card',
}: {
  damId: string;
  searchParams: Promise<EmbedSearchParams>;
  defaultSize?: EmbedSize;
}) {
  const ctx = await resolve(searchParams, { size: defaultSize });
  const data = await loadDamEmbed(damId).catch((error) => {
    console.error(`[embed/dam] ${damId} failed:`, error);
    return null;
  });
  if (!data) {
    return <EmbedUnavailable size={ctx.options.size} options={ctx.options} kind="dam" message="Dam status temporarily unavailable" />;
  }
  if (!data.powerhouse) {
    // A flood-control project has no turbines; the widget would be inventing
    // a question. The dam report still exists for its lake level.
    return <EmbedUnavailable size={ctx.options.size} options={ctx.options} kind="dam" message={`${data.dam.name} has no powerhouse to report`} />;
  }
  return <DamEmbed data={data} {...ctx} />;
}
