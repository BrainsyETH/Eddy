'use client';

// src/app/embed/river-day/[slug]/page.tsx
// "River Day" — the lodging widget for Airbnbs, cabins and campgrounds. Gives a
// guest today's river at a glance: Eddy's plain-language read (the same AI
// source as the Daily Quote widget), the current gauge reading, and the
// weather at the river. Every line is real data — nothing is invented.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { RIVER_NOTES, CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import { embedPalette, embedShadow, EMBED_FONTS } from '@/lib/embed/theme';
import EmbedFooter from '@/components/embed/EmbedFooter';
import { useEmbedBranding } from '@/components/embed/useEmbedBranding';
import type { ConditionCode } from '@/types/api';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

interface EddyUpdate {
  quoteText: string;
  conditionCode: string;
  generatedAt: string;
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

interface GaugeThreshold {
  riverId: string;
  isPrimary: boolean;
  thresholdUnit?: string;
}

interface GaugeEntry {
  name: string;
  coordinates?: { lng: number; lat: number };
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholds?: GaugeThreshold[] | null;
}

function formatAge(generatedAt: string): string {
  const hours = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return 'Updated just now';
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hrs ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
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
  const [update, setUpdate] = useState<EddyUpdate | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [gaugeReading, setGaugeReading] = useState<string | null>(null);
  const [gaugeName, setGaugeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [eddyRes, riversRes, gaugesRes] = await Promise.all([
          fetch(`/api/eddy-update/${slug}`),
          fetch('/api/rivers'),
          fetch('/api/gauges'),
        ]);

        let found: RiverBasic | null = null;
        if (riversRes.ok) {
          const data = await riversRes.json();
          found = data.rivers?.find((r: RiverBasic) => r.slug === slug) || null;
          setRiver(found);
        }

        // Eddy's AI read for this river — same source as the Daily Quote widget.
        if (eddyRes.ok) {
          const data = await eddyRes.json();
          if (data.available && data.update) setUpdate(data.update);
        }

        // Primary gauge → header reading + weather coordinates.
        if (found?.id && gaugesRes.ok) {
          const gaugeData = await gaugesRes.json();
          const gauges = (gaugeData.gauges as GaugeEntry[] | undefined) || [];
          const primaryGauge =
            gauges.find(g => g.thresholds?.some(t => t.riverId === found!.id && t.isPrimary)) ||
            gauges.find(g => g.thresholds?.some(t => t.riverId === found!.id));
          if (primaryGauge) {
            const primary = primaryGauge.thresholds!.find(t => t.riverId === found!.id);
            const useCfs = primary?.thresholdUnit === 'cfs';
            const val = useCfs ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
            if (val != null) {
              setGaugeReading(useCfs ? `${val.toLocaleString()} cfs` : `${val.toFixed(1)} ft`);
              setGaugeName(primaryGauge.name);
            }
            if (primaryGauge.coordinates) {
              fetch(`/api/weather?lat=${primaryGauge.coordinates.lat}&lon=${primaryGauge.coordinates.lng}`)
                .then(r => (r.ok ? r.json() : null))
                .then(data => { if (data) setWeather(data); })
                .catch(() => {});
            }
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

  const code = update?.conditionCode || river.currentCondition?.code || 'unknown';
  const conditionColor = CONDITION_COLORS[code as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const conditionLabel = CONDITION_SHORT_LABELS[code] || 'Unknown';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  // Eddy's read, with the same static fallback the Daily Quote widget uses when
  // no AI update exists yet — never fabricated prose.
  const readText = update?.quoteText || (() => {
    const blurb = CONDITION_CARD_BLURBS[code as ConditionCode] || CONDITION_CARD_BLURBS.unknown;
    const notes = RIVER_NOTES[slug];
    return notes ? `${blurb} ${notes}` : blurb;
  })();

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
      {/* Header: logo + river name + gauge reading + condition pill */}
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
          <div style={{ fontSize: 10, fontWeight: 500, color: textSecondary, marginTop: 2 }}>
            {gaugeReading && gaugeName
              ? `${gaugeReading} at ${gaugeName}`
              : update?.generatedAt
                ? formatAge(update.generatedAt)
                : 'Today on the river'}
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 10px',
            borderRadius: 6,
            backgroundColor: `${conditionColor}15`,
            border: `1.5px solid ${conditionColor}55`,
            boxShadow: embedShadow(palette),
            flexShrink: 0,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: conditionColor }} />
          <span style={{ fontWeight: 700, fontSize: 11, color: conditionColor, whiteSpace: 'nowrap' }}>
            {conditionLabel}
          </span>
        </div>
      </div>

      {/* Weather row (the lodging-specific value) */}
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

      {/* Eddy's take — the real AI read (or static fallback) */}
      <div style={{ background: `${conditionColor}0F`, borderRadius: 8, padding: '10px 12px', border: `1px solid ${conditionColor}30` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: conditionColor }}>Eddy&apos;s take</span>
          {update?.generatedAt && (
            <span style={{ fontSize: 9, color: textSecondary, fontWeight: 500 }}>{formatAge(update.generatedAt)}</span>
          )}
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: textPrimary, margin: 0 }}>
          {readText}
        </p>
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
