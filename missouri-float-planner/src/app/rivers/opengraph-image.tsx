// src/app/rivers/opengraph-image.tsx
// OG image for the River Reports index — Field Notebook card with Eddy's live
// cross-river summary and per-river status pills.

import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFredokaFont, loadEddyAvatar, loadOtterImage, OTTER_URLS } from '@/lib/og/fonts';
import { CardFrame, Pill, conditionMeta, INK_SOFT, TEAL } from '@/lib/og/cardLayout';

export const alt = 'River Reports — real-time river conditions on Eddy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export const revalidate = 300;

const FEATURED = ['current', 'meramec', 'jacks-fork', 'niangua'];

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trim() + '…';
}

function shortName(name: string): string {
  return name.replace(/\s+(River|Creek)$/i, '');
}

export default async function Image() {
  let summary: string | null = null;
  const pills: { name: string; code: string }[] = [];

  try {
    const supabase = createAdminClient();

    const { data: global } = await supabase
      .from('eddy_updates')
      .select('summary_text, quote_text')
      .eq('river_slug', 'global')
      .is('section_slug', null)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (global) summary = global.summary_text || global.quote_text || null;

    const { data: rivers } = await supabase
      .from('rivers')
      .select('id, name, slug')
      .in('slug', FEATURED);

    const bySlug = new Map(((rivers ?? []) as { id: string; name: string; slug: string }[]).map((r) => [r.slug, r]));
    const conditions = await Promise.all(
      FEATURED.map(async (slug) => {
        const river = bySlug.get(slug);
        if (!river) return null;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase.rpc as any)('get_river_condition', { p_river_id: river.id });
          const code = data?.[0]?.condition_code as string | undefined;
          if (!code || code === 'unknown') return null;
          return { name: shortName(river.name), code };
        } catch {
          return null;
        }
      }),
    );
    for (const c of conditions) if (c && pills.length < 3) pills.push(c);
  } catch {
    // Render with brand defaults if the DB is unavailable.
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const fonts = loadFredokaFont();
  const [avatar, otter] = await Promise.all([
    loadEddyAvatar().catch(() => null),
    loadOtterImage(OTTER_URLS.canoe).catch(() => null),
  ]);

  return new ImageResponse(
    (
      <CardFrame
        eyebrow={`Weekly Read · ${dateLabel}`}
        title="River Reports"
        avatar={avatar}
        otter={otter}
        accent={TEAL}
      >
        <span style={{ fontSize: 34, lineHeight: 1.3, color: INK_SOFT, maxWidth: 700 }}>
          {summary
            ? truncate(summary, 130)
            : 'Live water levels and conditions for every Ozark float river.'}
        </span>
        {pills.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 26, flexWrap: 'wrap' }}>
            {pills.map((p) => {
              const m = conditionMeta(p.code);
              return (
                <Pill key={p.name} dot={m.accent}>
                  {p.name} · {m.label}
                </Pill>
              );
            })}
          </div>
        )}
      </CardFrame>
    ),
    { ...size, fonts },
  );
}
