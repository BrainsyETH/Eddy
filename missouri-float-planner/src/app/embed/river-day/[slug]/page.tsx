'use client';

// src/app/embed/river-day/[slug]/page.tsx
// "River Day" — the lodging widget. Answers a guest's morning questions in
// one glance: is the river floatable today, what's the weather, and what
// should we pack? Built for Airbnbs, cabins and campgrounds near a river.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { embedPalette, embedShadow, EMBED_FONTS } from '@/lib/embed/theme';
import EmbedFooter from '@/components/embed/EmbedFooter';
import { useEmbedBranding } from '@/components/embed/useEmbedBranding';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

const VERDICT_TEXT: Record<string, string> = {
  flowing: 'Yes — great day to float',
  good: 'Yes — good to float',
  high: 'Floatable — use caution',
  low: 'Marginal — expect scraping',
  too_low: 'Not a float day',
  dangerous: 'No — stay off the water',
  unknown: 'Check locally',
};

// Rule-based "what to pack / expect" line from condition + air temp.
function packLine(code: string, tempF: number | null): string {
  if (code === 'dangerous') return 'Flood conditions — enjoy the trails or a lazy morning instead.';
  if (code === 'too_low') return 'Too shallow to float — a good day for fishing, hiking or swimming holes.';
  if (code === 'high') return 'Fast water: life jackets are non-negotiable, keep kids and coolers close.';
  const floatable = code === 'flowing' || code === 'good' || code === 'low';
  if (!floatable) return 'Ask your host or a local outfitter for the latest word on the water.';
  const scrape = code === 'low' ? ' Sturdy water shoes — you may drag in the shallows.' : '';
  if (tempF == null) return `Pack water shoes, sunscreen and a dry bag for phones.${scrape}`;
  if (tempF >= 75) return `Pack sunscreen, water shoes and a dry bag — perfect swimming weather.${scrape}`;
  if (tempF >= 60) return `Bring a layer for after the water — Ozark rivers run cold.${scrape}`;
  return `Chilly one: dress for the water, not the air, and pack a full change of clothes.${scrape}`;
}

interface RiverBasic {
  id?: string;
  name: string;
  slug: string;
  path?: string;
  currentCondition?: { code: string; label: string } | null;
}

interface WeatherData {
  temp: number;
  condition: string;
  windSpeed: number;
}

interface GaugeEntry {
  coordinates?: { lng: number; lat: number };
  thresholds?: { riverId: string }[] | null;
}

export default function RiverDayEmbedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';
  const { branding } = useEmbedBranding();

  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [riversRes, gaugesRes] = await Promise.all([
          fetch('/api/rivers'),
          fetch('/api/gauges'),
        ]);

        let found: RiverBasic | null = null;
        if (riversRes.ok) {
          const data = await riversRes.json();
          found = data.rivers?.find((r: RiverBasic) => r.slug === slug) || null;
          setRiver(found);
        }

        // Weather at the river's first gauge (same pattern as Live Conditions).
        if (found?.id && gaugesRes.ok) {
          const gaugeData = await gaugesRes.json();
          const gauge = (gaugeData.gauges as GaugeEntry[] | undefined)?.find(
            g => g.coordinates && g.thresholds?.some(t => t.riverId === found!.id)
          );
          if (gauge?.coordinates) {
            fetch(`/api/weather?lat=${gauge.coordinates.lat}&lon=${gauge.coordinates.lng}`)
              .then(r => (r.ok ? r.json() : null))
              .then(data => { if (data) setWeather(data); })
              .catch(() => {});
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  const palette = embedPalette(isDark);
  const { bg, textPrimary, textSecondary, cardBg } = palette;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, background: bg }}>
        <div style={{ width: 20, height: 20, border: '2px solid #2D7889', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!river) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: EMBED_FONTS.body, fontSize: 14 }}>
        River conditions temporarily unavailable
      </div>
    );
  }

  const code = river.currentCondition?.code || 'unknown';
  const conditionColor = CONDITION_COLORS[code as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const conditionLabel = CONDITION_SHORT_LABELS[code] || 'Unknown';
  const verdict = VERDICT_TEXT[code] || VERDICT_TEXT.unknown;
  const pack = packLine(code, weather ? Math.round(weather.temp) : null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

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
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: EMBED_FONTS.display }}>
            {river.name}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>
            Your river day, at a glance
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '11px 14px',
          borderRadius: 10,
          background: `${conditionColor}12`,
          border: `1.5px solid ${conditionColor}55`,
          boxShadow: embedShadow(palette),
        }}
      >
        <span
          role="img"
          aria-label={`Condition: ${conditionLabel}`}
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: conditionColor,
            flexShrink: 0,
            boxShadow: `0 0 0 4px ${conditionColor}25`,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2, fontFamily: EMBED_FONTS.display }}>
            {verdict}
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: conditionColor,
            padding: '3px 8px',
            borderRadius: 5,
            backgroundColor: `${conditionColor}18`,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {conditionLabel}
        </div>
      </div>

      {/* Weather row */}
      {weather && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: textSecondary,
            padding: '6px 10px',
            borderRadius: 8,
            background: cardBg,
            border: `1px solid ${palette.border}`,
          }}
        >
          <span style={{ fontWeight: 700, color: textPrimary, fontFamily: EMBED_FONTS.mono }}>
            {Math.round(weather.temp)}°F
          </span>
          <span>&middot;</span>
          <span>{weather.condition}</span>
          {weather.windSpeed > 5 && (
            <>
              <span>&middot;</span>
              <span>Wind {Math.round(weather.windSpeed)} mph</span>
            </>
          )}
        </div>
      )}

      {/* What to pack / expect */}
      <div
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          color: textPrimary,
          padding: '9px 12px',
          borderRadius: 8,
          background: cardBg,
          border: `1px solid ${palette.border}`,
        }}
      >
        <span style={{ fontWeight: 700, color: palette.link }}>Eddy&apos;s tip:</span> {pack}
      </div>

      {/* Footer */}
      <EmbedFooter
        origin={origin}
        widget="river-day"
        widgetKey={slug}
        isDark={isDark}
        partner={partner}
        branding={branding}
        links={[
          { label: 'Full conditions', path: river.path || `/rivers/${river.slug}` },
          { label: 'Plan a float', path: `/plan?river=${river.slug}` },
        ]}
      />
    </div>
  );
}
