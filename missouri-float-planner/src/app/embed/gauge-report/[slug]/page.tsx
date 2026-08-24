'use client';

// src/app/embed/gauge-report/[slug]/page.tsx
// Embeddable gauge report widget showing 7/14/30-day chart,
// current unit-aware gauge value, and Eddy Says condition report.

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS } from '@/constants';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';
import EmbedFooter from '@/components/embed/EmbedFooter';
import EmbedTrendChart from '@/components/embed/EmbedTrendChart';
import { useEmbedBranding } from '@/components/embed/useEmbedBranding';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

interface GaugeReading {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

interface GaugeHistoryResponse {
  siteId: string;
  siteName: string;
  readings: GaugeReading[];
  stats: {
    minHeight: number | null;
    maxHeight: number | null;
  };
}

interface EddyUpdate {
  quoteText: string;
  summaryText: string | null;
  conditionCode: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  generatedAt: string;
}

interface RiverBasic {
  id: string;
  name: string;
  slug: string;
  path?: string;
  currentCondition?: { code: string } | null;
}

interface ChartThresholds {
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
  unit?: 'ft' | 'cfs' | null;
}

interface GaugeThreshold {
  riverId: string;
  isPrimary: boolean;
  thresholdUnit?: string;
  levelOptimalMin?: number | null;
  levelOptimalMax?: number | null;
  levelHigh?: number | null;
  levelDangerous?: number | null;
}

interface GaugeEntry {
  usgsSiteId: string;
  name: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingSuspect?: boolean;
  qualifierNote?: string | null;
  thresholds?: GaugeThreshold[] | null;
}

const CONDITION_LABELS: Record<string, string> = CONDITION_SHORT_LABELS;

const DEFAULT_DAYS = 14;

export default function EmbedGaugeReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';
  const { branding } = useEmbedBranding();

  // Clamped like the server clamps it — this is user input off the URL, and
  // an unclamped value only mislabelled the range the server actually served.
  const rawDays = parseInt(searchParams.get('days') || '', 10) || DEFAULT_DAYS;
  const days = Math.min(Math.max(rawDays, 1), 30);
  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [update, setUpdate] = useState<EddyUpdate | null>(null);
  const [history, setHistory] = useState<GaugeHistoryResponse | null>(null);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [primarySiteId, setPrimarySiteId] = useState<string | null>(null);
  const [chartThresholds, setChartThresholds] = useState<ChartThresholds | null>(null);
  const [chartUnit, setChartUnit] = useState<'ft' | 'cfs'>('ft');
  const [qualifierNote, setQualifierNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch river + eddy update + find primary gauge
  useEffect(() => {
    async function fetchInitial() {
      try {
        const [eddyRes, riversRes, gaugesRes] = await Promise.all([
          fetch(`/api/eddy-update/${slug}`),
          fetch('/api/rivers'),
          fetch('/api/gauges'),
        ]);

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
          if (data.available && data.update) setUpdate(data.update);
        }

        // Find primary gauge for this river (fall back to any gauge linked to this river)
        if (gaugesRes.ok && riverId) {
          const gaugeData = await gaugesRes.json();
          let fallbackGauge: GaugeEntry | null = null;
          let fallbackThreshold: GaugeThreshold | null = null;
          for (const gauge of (gaugeData.gauges as GaugeEntry[])) {
            const primary = gauge.thresholds?.find((t) => t.riverId === riverId && t.isPrimary);
            if (primary) {
              setPrimarySiteId(gauge.usgsSiteId);
              if (gauge.readingSuspect && gauge.qualifierNote) setQualifierNote(gauge.qualifierNote);
              const useCfs = primary.thresholdUnit === 'cfs';
              setChartUnit(useCfs ? 'cfs' : 'ft');
              if (useCfs) {
                if (gauge.dischargeCfs != null) setCurrentValue(gauge.dischargeCfs);
              } else {
                if (gauge.gaugeHeightFt != null) setCurrentValue(gauge.gaugeHeightFt);
              }
              setChartThresholds({
                levelOptimalMin: primary.levelOptimalMin ?? null,
                levelOptimalMax: primary.levelOptimalMax ?? null,
                levelHigh: primary.levelHigh ?? null,
                levelDangerous: primary.levelDangerous ?? null,
                unit: primary.thresholdUnit === 'cfs' ? 'cfs' : 'ft',
              });
              fallbackGauge = null;
              break;
            }
            // Track first gauge linked to this river as fallback
            if (!fallbackGauge && gauge.thresholds?.some((t) => t.riverId === riverId)) {
              fallbackGauge = gauge;
              fallbackThreshold = gauge.thresholds?.find((t) => t.riverId === riverId) || null;
            }
          }
          if (fallbackGauge) {
            setPrimarySiteId(fallbackGauge.usgsSiteId);
            if (fallbackGauge.readingSuspect && fallbackGauge.qualifierNote) setQualifierNote(fallbackGauge.qualifierNote);
            const useCfs = fallbackThreshold?.thresholdUnit === 'cfs';
            setChartUnit(useCfs ? 'cfs' : 'ft');
            if (useCfs) {
              if (fallbackGauge.dischargeCfs != null) setCurrentValue(fallbackGauge.dischargeCfs);
            } else {
              if (fallbackGauge.gaugeHeightFt != null) setCurrentValue(fallbackGauge.gaugeHeightFt);
            }
            if (fallbackThreshold) {
              setChartThresholds({
                levelOptimalMin: fallbackThreshold.levelOptimalMin ?? null,
                levelOptimalMax: fallbackThreshold.levelOptimalMax ?? null,
                levelHigh: fallbackThreshold.levelHigh ?? null,
                levelDangerous: fallbackThreshold.levelDangerous ?? null,
              });
            }
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchInitial();
  }, [slug]);

  // Fetch history when primarySiteId or days change
  useEffect(() => {
    if (!primarySiteId) return;
    fetch(`/api/gauges/${primarySiteId}/history?days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setHistory(data); })
      .catch(() => {});
  }, [primarySiteId, days]);

  const palette = embedPalette(isDark);
  const { bg, textPrimary, textSecondary, cardBg } = palette;
  const borderColor = palette.border;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  const conditionCode = update?.conditionCode || river?.currentCondition?.code || 'unknown';
  const conditionColor = CONDITION_COLORS[conditionCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  // Never pair gaugeHeightFt with a cfs label: prefer the live value selected
  // for chartUnit, then fall back only to the matching Eddy snapshot field.
  const displayValue = currentValue ?? (
    chartUnit === 'cfs' ? update?.dischargeCfs : update?.gaugeHeightFt
  );

  // Age of Eddy update
  const updatedAgo = useMemo(() => {
    if (!update?.generatedAt) return null;
    const diff = Date.now() - new Date(update.generatedAt).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return 'Updated just now';
    return `Updated ${hrs}h ago`;
  }, [update?.generatedAt]);

  // Prefer summaryText (1 sentence) over full quoteText to keep widget compact
  const quoteText = update?.summaryText || null;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, background: bg }}>
        <div style={{ width: 20, height: 20, border: '2px solid #2D7889', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!river) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, background: bg, color: textSecondary, fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        River conditions temporarily unavailable
      </div>
    );
  }

  return (
    <div style={{ fontFamily: EMBED_FONTS.body, background: bg, color: textPrimary, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Header: Eddy favicon + River name + condition badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image src={EDDY_LOGO} alt="Eddy" width={32} height={32} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2, fontFamily: EMBED_FONTS.display }}>{river.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 12, backgroundColor: `${conditionColor}15`, border: `1px solid ${conditionColor}30` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: conditionColor }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: conditionColor }}>{CONDITION_LABELS[conditionCode] || 'Unknown'}</span>
        </div>
      </div>

      {/* Current gauge value (height or discharge, based on river thresholds) */}
      <div>
        {displayValue != null ? (
          <>
            <span style={{ fontSize: 28, fontWeight: 800, color: textPrimary, lineHeight: 1, fontFamily: EMBED_FONTS.mono }}>
              {chartUnit === 'cfs' ? Math.round(displayValue).toLocaleString() : displayValue.toFixed(1)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: textSecondary, marginLeft: 3 }}>{chartUnit}</span>
          </>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 600, color: textSecondary }}>No reading</span>
        )}
      </div>

      {/* Suspect-reading warning (ice-affected / estimated / sensor issues) */}
      {qualifierNote && (
        <div
          role="note"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontWeight: 500,
            color: '#b45309',
            background: isDark ? 'rgba(180, 83, 9, 0.15)' : '#fffbeb',
            border: `1px solid ${isDark ? 'rgba(180, 83, 9, 0.35)' : '#fde68a'}`,
            borderRadius: 6,
            padding: '4px 8px',
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>{qualifierNote}</span>
        </div>
      )}

      {/* Chart — the same shared-model renderer the widget embeds; this page
          used to carry its own inline SVG, index-spaced and gap-blind, which
          Release 4 of the gauge redesign retired. Compact on purpose: no
          summary, no scrubber, no expanded controls in an embed. */}
      {(() => {
        const readings = history?.readings || [];
        const useCfs = chartUnit === 'cfs';
        const chartReadings = readings
          .map(r => ({ timestamp: r.timestamp, value: useCfs ? r.dischargeCfs : r.gaugeHeightFt }))
          .filter((r): r is { timestamp: string; value: number } => r.value !== null);

        if (chartReadings.length < 2) {
          return (
            <div style={{ background: cardBg, borderRadius: 8, padding: '6px 0', border: `1px solid ${borderColor}`, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, color: textSecondary }}>No chart data</span>
            </div>
          );
        }

        return (
          <EmbedTrendChart
            data={{ readings: chartReadings, unit: chartUnit, thresholds: chartThresholds }}
            palette={palette}
            periodLabel={`${days}-day`}
          />
        );
      })()}

      {/* Eddy Says */}
      {quoteText && (
        <div style={{ background: `${conditionColor}08`, borderRadius: 8, padding: '10px 12px', border: `1px solid ${conditionColor}20` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: conditionColor }}>Eddy Says</span>
            {updatedAgo && (
              <span style={{ fontSize: 9, color: textSecondary, fontWeight: 500 }}>{updatedAgo}</span>
            )}
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: textPrimary, margin: 0 }}>
            {quoteText}
          </p>
        </div>
      )}

      {/* Footer */}
      <EmbedFooter
        origin={origin}
        widget="gauge-report"
        widgetKey={slug}
        isDark={isDark}
        partner={partner}
        branding={branding}
        links={[{ label: 'Full river guide', path: river.path || `/rivers/${river.slug}` }]}
      />
    </div>
  );
}
