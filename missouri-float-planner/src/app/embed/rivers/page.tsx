'use client';

// src/app/embed/rivers/page.tsx
// Multi-river overview widget — compact live-condition rows for several
// rivers at once. Built for outfitters that serve more than one river and
// regional tourism sites. Each row shows the live condition and the current
// air temperature at the river.
//
// ?rivers=current,jacks-fork,eleven-point selects and orders the rows;
// omitted, the widget shows all active rivers (capped).

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { eddyDeepLink } from '@/lib/embed/branding';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';
import EmbedFooter from '@/components/embed/EmbedFooter';
import { useEmbedBranding } from '@/components/embed/useEmbedBranding';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

// Keep the widget compact on sidebars even when no rivers= filter is set.
const MAX_ROWS = 8;

interface RiverRow {
  id?: string;
  slug: string;
  name: string;
  path?: string;
  currentCondition?: { code: string; label: string } | null;
}

interface GaugeEntry {
  coordinates?: { lng: number; lat: number };
  thresholds?: { riverId: string; isPrimary?: boolean }[] | null;
}

export default function EmbedRiversPage() {
  const searchParams = useSearchParams();
  const theme = searchParams.get('theme') || 'light';
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';
  const { branding } = useEmbedBranding();

  const riversParam = searchParams.get('rivers') || '';
  const requested = riversParam
    ? riversParam.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const [rivers, setRivers] = useState<RiverRow[]>([]);
  const [temps, setTemps] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch('/api/rivers'), fetch('/api/gauges')])
      .then(async ([rr, gr]) => {
        const rdata = rr.ok ? await rr.json() : { rivers: [] };
        const gdata = gr.ok ? await gr.json() : { gauges: [] };
        const all: RiverRow[] = rdata.rivers || [];
        let display: RiverRow[];
        if (requested.length > 0) {
          // Preserve the order the embedder asked for.
          const bySlug = new Map(all.map(r => [r.slug, r]));
          display = requested.map(slug => bySlug.get(slug)).filter((r): r is RiverRow => Boolean(r)).slice(0, MAX_ROWS);
        } else {
          display = all.slice(0, MAX_ROWS);
        }
        if (cancelled) return;
        setRivers(display);
        setLoading(false);

        // Air temperature per river, from its primary gauge's coordinates.
        const gauges: GaugeEntry[] = gdata.gauges || [];
        for (const river of display) {
          if (!river.id) continue;
          const gauge = gauges.find(g => g.coordinates && g.thresholds?.some(t => t.riverId === river.id && t.isPrimary))
            || gauges.find(g => g.coordinates && g.thresholds?.some(t => t.riverId === river.id));
          if (!gauge?.coordinates) continue;
          fetch(`/api/weather?lat=${gauge.coordinates.lat}&lon=${gauge.coordinates.lng}`)
            .then(r => (r.ok ? r.json() : null))
            .then(w => { if (w && !cancelled && typeof w.temp === 'number') setTemps(prev => ({ ...prev, [river.slug]: Math.round(w.temp) })); })
            .catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // riversParam is the string form of `requested`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riversParam]);

  const palette = embedPalette(isDark);
  const { bg, textPrimary, textSecondary, cardBg } = palette;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';
  const utmKey = requested[0] || 'all';

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, background: bg }}>
        <div style={{ width: 20, height: 20, border: '2px solid #2D7889', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (rivers.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: EMBED_FONTS.body, fontSize: 14 }}>
        River conditions temporarily unavailable
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: EMBED_FONTS.body,
        background: bg,
        color: textPrimary,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src={EDDY_LOGO}
          alt="Eddy"
          width={32}
          height={32}
          style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2, fontFamily: EMBED_FONTS.display }}>
            River Conditions
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>
            Live status for {rivers.length} {rivers.length === 1 ? 'river' : 'rivers'}
          </div>
        </div>
      </div>

      {/* River rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rivers.map(river => {
          const code = river.currentCondition?.code || 'unknown';
          const color = CONDITION_COLORS[code as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
          const label = CONDITION_SHORT_LABELS[code] || 'Unknown';
          return (
            <a
              key={river.slug}
              href={eddyDeepLink(origin, river.path || `/rivers/${river.slug}`, {
                widget: 'rivers',
                key: river.slug,
                partner: branding?.businessName || partner,
              })}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 8,
                background: cardBg,
                border: `1px solid ${palette.border}`,
                textDecoration: 'none',
                color: textPrimary,
              }}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {river.name}
              </span>
              {temps[river.slug] != null && (
                <span style={{ fontSize: 11, color: textSecondary, flexShrink: 0, fontFamily: EMBED_FONTS.mono }}>
                  {temps[river.slug]}°F
                </span>
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color,
                  padding: '2px 7px',
                  borderRadius: 4,
                  backgroundColor: `${color}15`,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </a>
          );
        })}
      </div>

      {/* Footer */}
      <EmbedFooter
        origin={origin}
        widget="rivers"
        widgetKey={utmKey}
        isDark={isDark}
        partner={partner}
        branding={branding}
        links={[{ label: 'All river reports', path: '/rivers' }]}
      />
    </div>
  );
}
