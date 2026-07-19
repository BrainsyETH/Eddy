'use client';

// src/app/embed/eddy-quote/[slug]/page.tsx
// Embeddable Eddy AI quote widget for external sites.
// Shows the AI-generated condition update with Eddy mascot, condition badge, and
// links back to the full river page. Falls back to static quote when no AI update exists.

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { RIVER_NOTES, CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';
import EmbedFooter from '@/components/embed/EmbedFooter';
import { useEmbedBranding } from '@/components/embed/useEmbedBranding';
import ConditionBadge from '@/components/ui/ConditionBadge';
import type { ConditionCode } from '@/types/api';

interface EddyUpdate {
  quoteText: string;
  conditionCode: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  generatedAt: string;
}

interface RiverBasic {
  id?: string;
  name: string;
  slug: string;
  path?: string;
  currentCondition?: { code: ConditionCode; label: string } | null;
}

interface WeatherData {
  temp: number;
  condition: string;
  windSpeed: number;
}

interface ForecastDay {
  tempHigh: number;
  tempLow: number;
  condition: string;
  precipitation: number;
}

interface GaugeMetric {
  value: string;
  unit: 'ft' | 'cfs';
  name: string;
}

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

const EXPANDED_CONDITIONS = new Set<ConditionCode>([
  'low',
  'too_low',
  'high',
  'dangerous',
  'unknown',
]);

function splitQuote(text: string): { preview: string; detail: string } {
  const firstBreak = text.search(/[.!?](?:[”"']?)(?=\s+[A-Z0-9“"'])/);
  if (firstBreak === -1) return { preview: text, detail: '' };

  const preview = text.slice(0, firstBreak + 1).trim();
  return { preview, detail: text.slice(firstBreak + 1).trim() };
}

function formatAge(generatedAt: string): string {
  const hours = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return 'Updated just now';
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hrs ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

export default function EddyQuoteEmbedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';
  const { branding } = useEmbedBranding();

  const [update, setUpdate] = useState<EddyUpdate | null>(null);
  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [optimalRange, setOptimalRange] = useState<string | null>(null);
  const [gaugeMetric, setGaugeMetric] = useState<GaugeMetric | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [eddyRes, riversRes, gaugesRes, forecastRes] = await Promise.all([
          fetch(`/api/eddy-update/${slug}`),
          fetch('/api/rivers'),
          fetch('/api/gauges'),
          fetch(`/api/weather/${slug}/forecast`),
        ]);

        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          if (forecastData.forecast?.[0]) setForecast(forecastData.forecast[0]);
        }

        let riverId: string | null = null;
        if (riversRes.ok) {
          const data = await riversRes.json();
          const found = data.rivers?.find((r: RiverBasic) => r.slug === slug);
          if (found) {
            setRiver(found);
            riverId = found.id ?? null;
          }
        }

        if (eddyRes.ok) {
          const data = await eddyRes.json();
          if (data.available && data.update) {
            setUpdate(data.update);
          }
        }

        // Extract optimal range and primary gauge info from gauge thresholds
        if (gaugesRes.ok && riverId) {
          const gaugeData = await gaugesRes.json();
          interface GaugeThreshold { riverId: string; isPrimary: boolean; thresholdUnit?: string; levelOptimalMin?: number | null; levelOptimalMax?: number | null }
          interface GaugeEntry { name: string; gaugeHeightFt: number | null; dischargeCfs: number | null; coordinates?: { lng: number; lat: number }; thresholds?: GaugeThreshold[] | null }
          for (const gauge of (gaugeData.gauges as GaugeEntry[])) {
            const primary = gauge.thresholds?.find((t) => t.riverId === riverId && t.isPrimary);
            if (primary) {
              if (primary.levelOptimalMin != null && primary.levelOptimalMax != null) {
                const unit = primary.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
                setOptimalRange(`${primary.levelOptimalMin}\u2013${primary.levelOptimalMax} ${unit}`);
              }
              // Prefer gauge height for the at-a-glance reading, even where the
              // condition thresholds use CFS. This is display-only and never
              // participates in condition calculation.
              if (gauge.gaugeHeightFt !== null) {
                setGaugeMetric({ value: gauge.gaugeHeightFt.toFixed(1), unit: 'ft', name: gauge.name });
              } else if (gauge.dischargeCfs !== null) {
                setGaugeMetric({ value: gauge.dischargeCfs.toLocaleString(), unit: 'cfs', name: gauge.name });
              }
              // Weather at the river's primary gauge (lodging value, merged in
              // from the former River Day widget).
              if (gauge.coordinates) {
                fetch(`/api/weather?lat=${gauge.coordinates.lat}&lon=${gauge.coordinates.lng}`)
                  .then(r => (r.ok ? r.json() : null))
                  .then(data => { if (data) setWeather(data); })
                  .catch(() => {});
              }
              break;
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

  // Determine what to display
  const conditionCode = update?.conditionCode || river?.currentCondition?.code || 'unknown';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  // Build fallback text if no AI update
  const quoteText = update?.quoteText || (() => {
    const blurb = CONDITION_CARD_BLURBS[conditionCode as ConditionCode] || CONDITION_CARD_BLURBS.unknown;
    const notes = RIVER_NOTES[slug];
    const parts: string[] = [];
    if (update?.gaugeHeightFt != null) {
      parts.push(`Reading ${update.gaugeHeightFt.toFixed(1)} ft at the gauge.`);
    }
    parts.push(blurb);
    if (optimalRange) parts.push(`Optimal range is ${optimalRange}.`);
    if (notes) parts.push(notes);
    return parts.join(' ');
  })();
  const { preview: quotePreview, detail: quoteDetail } = splitQuote(quoteText);

  // Theme colors
  const palette = embedPalette(isDark);
  const { bg, textPrimary, textSecondary } = palette;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, background: bg }}>
        <div
          style={{
            width: 20,
            height: 20,
            border: '2px solid #2D7889',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!river) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
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
      {/* Identity + canonical status. ConditionBadge is the approved renderer
          backed by shared/condition-system.ts; no widget-local status mapping. */}
      <header className="flex items-start gap-3 pb-3 border-b" style={{ borderColor: palette.border }}>
        <Image
          src={EDDY_LOGO}
          alt="Eddy"
          width={36}
          height={36}
          className="w-9 h-9 object-contain rounded-full flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base leading-tight truncate" style={{ fontFamily: EMBED_FONTS.display }}>
            {river.name}
          </div>
          <div className="text-xs font-medium mt-1" style={{ color: textSecondary }}>
            {update?.generatedAt ? formatAge(update.generatedAt) : 'Current river conditions'}
          </div>
        </div>
        <ConditionBadge code={conditionCode} size="md" className="flex-shrink-0" />
      </header>

      {/* At-a-glance facts. Values come directly from gauge/weather APIs and do
          not alter or reinterpret the canonical condition. */}
      <section
        aria-label="River conditions at a glance"
        className="grid grid-cols-2 sm:grid-cols-4 overflow-hidden rounded-lg border"
        style={{ borderColor: palette.border, background: palette.cardBg }}
      >
        <Metric
          label="Gauge height"
          value={gaugeMetric ? `${gaugeMetric.value} ${gaugeMetric.unit}` : 'Unavailable'}
          detail={gaugeMetric?.name || 'Primary gauge'}
          palette={palette}
          className="border-r border-b sm:border-b-0"
        />
        <Metric
          label="Optimal range"
          value={optimalRange || 'Not set'}
          detail="Established range"
          palette={palette}
          className="border-b sm:border-b-0 sm:border-r"
        />
        <Metric
          label="Today"
          value={weather ? `${Math.round(weather.temp)}°F` : forecast ? `${Math.round(forecast.tempHigh)}°F` : 'Unavailable'}
          detail={weather?.condition || forecast?.condition || 'Weather unavailable'}
          palette={palette}
          className="border-r"
        />
        <Metric
          label="Rain chance"
          value={forecast ? `${Math.round(forecast.precipitation)}%` : 'Unavailable'}
          detail={weather && weather.windSpeed > 5 ? `Wind ${Math.round(weather.windSpeed)} mph` : 'Today’s forecast'}
          palette={palette}
        />
      </section>

      <section aria-labelledby="eddy-take-heading" className="py-1">
        <div className="flex items-center gap-2 mb-2">
          <Image
            src={EDDY_LOGO}
            alt=""
            width={24}
            height={24}
            className="w-6 h-6 object-contain rounded-full"
          />
          <h2 id="eddy-take-heading" className="m-0 text-sm font-bold" style={{ fontFamily: EMBED_FONTS.display, color: textPrimary }}>
            Eddy’s take
          </h2>
        </div>
        <p className="m-0 text-sm leading-relaxed font-medium">{quotePreview}</p>

        {quoteDetail && (
          <details
            className="mt-2 rounded-lg border px-3 py-2"
            style={{ borderColor: palette.border, background: palette.cardBg }}
            open={EXPANDED_CONDITIONS.has(conditionCode as ConditionCode)}
          >
            <summary className="cursor-pointer text-xs font-bold" style={{ color: palette.link }}>
              Read full condition update
            </summary>
            <p className="mt-2 mb-0 text-sm leading-relaxed" style={{ color: textSecondary }}>
              {quoteDetail}
            </p>
          </details>
        )}

        {update?.generatedAt && (
          <div className="text-xs mt-2" style={{ color: textSecondary }}>
            {formatAge(update.generatedAt)}
          </div>
        )}
      </section>

      {/* Footer: Links */}
      <EmbedFooter
        origin={origin}
        widget="eddy-quote"
        widgetKey={slug}
        isDark={isDark}
        partner={partner}
        branding={branding}
        links={[{ label: 'Full conditions', path: river.path || `/rivers/${river.slug}` }]}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  palette,
  className = '',
}: {
  label: string;
  value: string;
  detail: string;
  palette: ReturnType<typeof embedPalette>;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 px-3 py-3 ${className}`}
      style={{ borderColor: palette.border }}
    >
      <div className="text-xs font-medium" style={{ color: palette.textSecondary }}>{label}</div>
      <div className="mt-1 text-sm font-bold break-words" style={{ color: palette.textPrimary, fontFamily: EMBED_FONTS.mono }}>
        {value}
      </div>
      <div className="mt-1 text-xs truncate" title={detail} style={{ color: palette.textSecondary }}>{detail}</div>
    </div>
  );
}
