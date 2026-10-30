// src/app/embed/img/[kind]/[key]/[file]/route.tsx
// The badge and strip as images, for hosts that strip iframes and scripts:
//
//   /embed/img/river/current/badge.png      /embed/img/river/current/strip.svg
//   /embed/img/dam/swl-bull-shoals-dam/strip.png
//   ?theme=light|dark  &bg=transparent  &accent=%23hex
//
// PNG is drawn by Satori with the brand fonts embedded (Fredoka + Geist Mono,
// the OG-image pipeline), so it looks the same in a newsletter as on the site.
// SVG is hand built (src/lib/embed/image-svg.ts) and asks for Fredoka with a
// system fallback, pinned by textLength. Both share one model
// (src/lib/embed/image-model.ts), so they never disagree on a word or a color.
//
// Cached five minutes at the CDN — the reading cadence — so a popular
// newsletter does not become a database load. An impression is counted per
// origin fetch with the Referer host, which undercounts cached views; the
// dashboard labels image rows accordingly.

import { ImageResponse } from 'next/og';
import { NextResponse, after, type NextRequest } from 'next/server';
import { loadOgFonts, loadEddyAvatar } from '@/lib/og/fonts';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseEmbedOptions } from '@/lib/embed/options';
import { loadRiverEmbed } from '@/lib/embed/river-data';
import { loadDamEmbed } from '@/lib/embed/dam-data';
import {
  badgeLayout,
  damImageModel,
  riverImageModel,
  STRIP_HEIGHT,
  STRIP_WIDTH,
  type EmbedImageModel,
} from '@/lib/embed/image-model';
import { badgeSvg, stripSvg } from '@/lib/embed/image-svg';

export const dynamic = 'force-dynamic';

const FILE_RE = /^(badge|strip)\.(png|svg)$/;
const CACHE = 'public, max-age=300, s-maxage=300, stale-while-revalidate=900';

function countImpression(request: NextRequest, type: string, key: string, theme: string) {
  after(async () => {
    try {
      let referrerHost = 'direct';
      const referer = request.headers.get('referer');
      if (referer) {
        try { referrerHost = new URL(referer).hostname.slice(0, 100) || 'direct'; } catch { /* keep direct */ }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (createAdminClient().rpc as any)('log_embed_impression', {
        p_widget_type: type,
        p_widget_key: key,
        p_referrer_host: referrerHost,
        p_theme: theme,
        p_partner: null,
      });
    } catch {
      // Analytics never fail an image.
    }
  });
}

function BadgePng({ model, avatar, transparent }: { model: EmbedImageModel; avatar: string | null; transparent: boolean }) {
  const L = badgeLayout(model);
  const t = model.tokens;
  return (
    <div
      style={{
        width: L.width,
        height: L.height,
        display: 'flex',
        alignItems: 'center',
        gap: L.gap,
        padding: `0 ${L.padX}px`,
        boxSizing: 'border-box',
        borderRadius: L.height / 2,
        border: `1.5px solid ${t.border}`,
        background: transparent ? 'transparent' : t.bg,
        color: t.text,
        fontFamily: 'Fredoka',
      }}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" width={L.mark} height={L.mark} style={{ width: L.mark, height: L.mark, borderRadius: L.mark / 2 }} />
      ) : (
        <div style={{ width: L.mark, height: L.mark, borderRadius: L.mark / 2, background: t.link, display: 'flex' }} />
      )}
      <div style={{ display: 'flex', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{model.title}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px 2px 6px',
          borderRadius: 999,
          border: `1px solid ${model.statusBorder}`,
          background: model.statusBg,
          color: model.statusInk,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: 4, background: model.dot, display: 'flex' }} />
        {model.status}
      </div>
    </div>
  );
}

function StripPng({ model, avatar, transparent }: { model: EmbedImageModel; avatar: string | null; transparent: boolean }) {
  const t = model.tokens;
  return (
    <div
      style={{
        width: STRIP_WIDTH,
        height: STRIP_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 14px',
        boxSizing: 'border-box',
        borderRadius: 12,
        border: `1.5px solid ${t.border}`,
        background: transparent ? 'transparent' : t.bg,
        color: t.text,
        fontFamily: 'Fredoka',
      }}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" width={28} height={28} style={{ width: 28, height: 28, borderRadius: 14 }} />
      ) : (
        <div style={{ width: 28, height: 28, borderRadius: 14, background: t.link, display: 'flex' }} />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>{model.title}</div>
        {model.subtitle && (
          <div style={{ display: 'flex', fontSize: 11, color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden' }}>{model.subtitle}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontFamily: 'Geist Mono', fontSize: 22, fontWeight: 700 }}>
        {model.reading ?? '—'}
        {model.unit && <span style={{ fontFamily: 'Fredoka', fontSize: 11, color: t.muted }}>{model.unit}</span>}
        {model.trend && <span style={{ fontFamily: 'Fredoka', fontSize: 13, color: t.muted }}>{model.trend}</span>}
      </div>
      <div
        style={{
          display: 'flex',
          padding: '3px 9px',
          borderRadius: 6,
          border: `1px solid ${model.statusBorder}`,
          background: model.statusBg,
          color: model.statusInk,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {model.status}
      </div>
      {model.age && <div style={{ display: 'flex', fontSize: 11, color: t.muted }}>{model.age}</div>}
    </div>
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; key: string; file: string }> },
) {
  const { kind, key, file } = await params;
  const match = file.match(FILE_RE);
  if (!match || (kind !== 'river' && kind !== 'dam') || !/^[a-z0-9-]{1,60}$/.test(key)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const [, size, format] = match as [string, 'badge' | 'strip', 'png' | 'svg'];
  const options = parseEmbedOptions(request.nextUrl.searchParams, { size });
  // Images have no media queries: auto renders light.
  const imageTheme = options.theme === 'dark' ? 'dark' : 'light';
  const styling = { theme: imageTheme as 'light' | 'dark', accent: options.accent };

  let model: EmbedImageModel | null = null;
  try {
    if (kind === 'river') {
      const data = await loadRiverEmbed(key, 7);
      if (data) model = riverImageModel(data, styling);
    } else {
      const data = await loadDamEmbed(key);
      if (data && data.powerhouse) model = damImageModel(data.dam, styling);
    }
  } catch (error) {
    console.error(`[embed/img] ${kind}/${key} failed:`, error);
  }
  if (!model) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  countImpression(request, `${kind}-${size}-image`, key, imageTheme);

  if (format === 'svg') {
    const svg = size === 'badge' ? badgeSvg(model, options.transparent) : stripSvg(model, options.transparent);
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': CACHE,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const fonts = loadOgFonts();
  const avatar = await loadEddyAvatar().catch(() => null);
  const element = size === 'badge'
    ? <BadgePng model={model} avatar={avatar} transparent={options.transparent} />
    : <StripPng model={model} avatar={avatar} transparent={options.transparent} />;
  const dims = size === 'badge'
    ? { width: badgeLayout(model).width, height: badgeLayout(model).height }
    : { width: STRIP_WIDTH, height: STRIP_HEIGHT };
  return new ImageResponse(element, { ...dims, fonts, headers: { 'Cache-Control': CACHE } });
}
