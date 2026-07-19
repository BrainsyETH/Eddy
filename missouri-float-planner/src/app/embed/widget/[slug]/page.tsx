'use client';

// src/app/embed/widget/[slug]/page.tsx
// Embeddable widget for displaying river conditions + per-gauge status in an iframe
// Designed to be lightweight, compact, and self-contained for external sites
// SiteHeader is hidden via pathname check in SiteHeader component

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS } from '@/constants';
import { computeCondition, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import { eddyDeepLink } from '@/lib/embed/branding';
import { embedPalette, EMBED_FONTS } from '@/lib/embed/theme';
import EmbedFooter from '@/components/embed/EmbedFooter';
import { useEmbedBranding } from '@/components/embed/useEmbedBranding';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { conditionChip } from '@shared/condition-system';
import type { ConditionCode, RiverListItem } from '@/types/api';

interface GaugeThreshold {
  riverId: string;
  riverName: string;
  isPrimary: boolean;
  thresholdUnit: 'ft' | 'cfs';
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

interface GaugeStation {
  id: string;
  usgsSiteId: string;
  name: string;
  coordinates: { lng: number; lat: number };
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  readingSuspect?: boolean;
  qualifierNote?: string | null;
  thresholds: GaugeThreshold[] | null;
}

interface GaugeWithCondition {
  id: string;
  name: string;
  usgsSiteId: string;
  isPrimary: boolean;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  value: string;
  unit: string;
  optimalRange: string | null;
  conditionCode: ConditionCode;
  conditionLabel: string;
  conditionColor: string;
  readingAgeHours: number | null;
  readingSuspect: boolean;
  qualifierNote: string | null;
}

interface WeatherData {
  temp: number;
  condition: string;
  windSpeed: number;
  humidity: number;
}

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

function formatReadingAge(hours: number | null): string {
  if (hours === null) return 'Observation time unavailable';
  if (hours < 1 / 30) return 'Observed just now';
  if (hours < 1) return `Observed ${Math.max(1, Math.round(hours * 60))} min ago`;
  if (hours < 2) return 'Observed 1 hr ago';
  if (hours < 24) return `Observed ${Math.round(hours)} hrs ago`;
  return `Observed ${Math.floor(hours / 24)}d ago`;
}

function formatRange(min: number | null, max: number | null, unit: string): string | null {
  if (min === null || max === null) return null;
  return `${min.toLocaleString()}\u2013${max.toLocaleString()} ${unit}`;
}

// Compute a simple trend by comparing two gauge readings (#22)
// We fetch recent history to determine if the gauge is rising, falling, or steady
function getTrendArrow(trend: 'rising' | 'falling' | 'steady' | null): string {
  switch (trend) {
    case 'rising': return '↑';
    case 'falling': return '↓';
    case 'steady': return '→';
    default: return '';
  }
}

function getTrendColor(trend: 'rising' | 'falling' | 'steady' | null, isDark: boolean): string {
  switch (trend) {
    case 'rising': return '#f97316';
    case 'falling': return '#3b82f6';
    case 'steady': return isDark ? '#888' : '#777';
    default: return 'transparent';
  }
}

export default function EmbedWidgetPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';
  const { branding } = useEmbedBranding();

  const [river, setRiver] = useState<RiverListItem | null>(null);
  const [gauges, setGauges] = useState<GaugeWithCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [gaugeTrends, setGaugeTrends] = useState<Record<string, 'rising' | 'falling' | 'steady' | null>>({});
  const [chartData, setChartData] = useState<{ readings: { timestamp: string; value: number }[]; unit: string; thresholds: ChartThresholds | null } | null>(null);
  const [showAllGauges, setShowAllGauges] = useState(false);

  interface ChartThresholds {
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
  }

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch rivers and gauges in parallel
        const [riversRes, gaugesRes] = await Promise.all([
          fetch('/api/rivers'),
          fetch('/api/gauges'),
        ]);

        if (riversRes.ok) {
          const riversData = await riversRes.json();
          const found = riversData.rivers?.find((r: RiverListItem) => r.slug === slug);
          setRiver(found || null);

          if (found && gaugesRes.ok) {
            const gaugesData = await gaugesRes.json();
            const riverGauges: GaugeWithCondition[] = [];
            let firstGaugeCoords: { lat: number; lng: number } | null = null;
            const trends: Record<string, 'rising' | 'falling' | 'steady' | null> = {};

            for (const gauge of (gaugesData.gauges || []) as GaugeStation[]) {
              // Find threshold entry for this river
              const threshold = gauge.thresholds?.find(
                (t: GaugeThreshold) => t.riverId === found.id
              );
              if (!threshold) continue;

              // Capture first gauge coords for weather (#21)
              if (!firstGaugeCoords && gauge.coordinates) {
                firstGaugeCoords = gauge.coordinates;
              }

              // Compute per-gauge condition
              const thresholdsForCompute: ConditionThresholds = {
                levelTooLow: threshold.levelTooLow,
                levelLow: threshold.levelLow,
                levelOptimalMin: threshold.levelOptimalMin,
                levelOptimalMax: threshold.levelOptimalMax,
                levelHigh: threshold.levelHigh,
                levelDangerous: threshold.levelDangerous,
                thresholdUnit: threshold.thresholdUnit,
              };
              const result = computeCondition(gauge.gaugeHeightFt, thresholdsForCompute, gauge.dischargeCfs);
              const useCfs = threshold.thresholdUnit === 'cfs';
              const primaryValue = useCfs ? gauge.dischargeCfs : gauge.gaugeHeightFt;

              riverGauges.push({
                id: gauge.id,
                name: gauge.name,
                usgsSiteId: gauge.usgsSiteId,
                isPrimary: threshold.isPrimary,
                gaugeHeightFt: gauge.gaugeHeightFt,
                dischargeCfs: gauge.dischargeCfs,
                value: primaryValue !== null
                  ? useCfs
                    ? primaryValue.toLocaleString()
                    : primaryValue.toFixed(2)
                  : '--',
                unit: useCfs ? 'cfs' : 'ft',
                optimalRange: formatRange(
                  threshold.levelOptimalMin,
                  threshold.levelOptimalMax,
                  threshold.thresholdUnit
                ),
                conditionCode: result.code,
                conditionLabel: getConditionShortLabel(result.code),
                conditionColor: CONDITION_COLORS[result.code] || '#9ca3af',
                readingAgeHours: gauge.readingAgeHours,
                readingSuspect: gauge.readingSuspect ?? false,
                qualifierNote: gauge.qualifierNote ?? null,
              });

              // Initialize trends as null - will fetch history below
              trends[gauge.usgsSiteId] = null;
            }

            // Sort: primary first, then alphabetically
            riverGauges.sort((a, b) => {
              if (a.isPrimary && !b.isPrimary) return -1;
              if (!a.isPrimary && b.isPrimary) return 1;
              return a.name.localeCompare(b.name);
            });

            setGauges(riverGauges);

            // Fetch weather if we have coordinates (#21)
            if (firstGaugeCoords) {
              fetch(`/api/weather?lat=${firstGaugeCoords.lat}&lon=${firstGaugeCoords.lng}`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data) setWeather(data);
                })
                .catch(() => {});
            }

            // Fetch gauge history for trends (#22)
            for (const gauge of riverGauges) {
              fetch(`/api/gauges/${gauge.usgsSiteId}/history?hours=6`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data?.readings && data.readings.length >= 2) {
                    const latest = data.readings[0];
                    const previous = data.readings[data.readings.length - 1];
                    const latestVal = latest.gaugeHeightFt ?? latest.dischargeCfs;
                    const prevVal = previous.gaugeHeightFt ?? previous.dischargeCfs;
                    if (latestVal !== null && prevVal !== null) {
                      const delta = latestVal - prevVal;
                      const threshold = latestVal * 0.02; // 2% change threshold
                      let trend: 'rising' | 'falling' | 'steady' = 'steady';
                      if (delta > threshold) trend = 'rising';
                      else if (delta < -threshold) trend = 'falling';
                      setGaugeTrends(prev => ({ ...prev, [gauge.usgsSiteId]: trend }));
                    }
                  }
                })
                .catch(() => {});
            }

            // Fetch 14-day chart for primary gauge
            const primaryGauge = riverGauges.find(g => g.isPrimary) || riverGauges[0];
            if (primaryGauge) {
              const primaryThreshold = (gaugesData.gauges || [])
                .find((g: GaugeStation) => g.usgsSiteId === primaryGauge.usgsSiteId)
                ?.thresholds?.find((t: GaugeThreshold) => t.riverId === found.id);

              fetch(`/api/gauges/${primaryGauge.usgsSiteId}/history?days=14`)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                  if (data?.readings && data.readings.length > 0) {
                    const useCfs = primaryThreshold?.thresholdUnit === 'cfs';
                    const readings = data.readings
                      .map((r: { timestamp: string; gaugeHeightFt: number | null; dischargeCfs: number | null }) => ({
                        timestamp: r.timestamp,
                        value: useCfs ? r.dischargeCfs : r.gaugeHeightFt,
                      }))
                      .filter((r: { value: number | null }) => r.value !== null);
                    // API returns oldest-first, which is correct for left-to-right chart
                    setChartData({
                      readings,
                      unit: useCfs ? 'cfs' : 'ft',
                      thresholds: primaryThreshold ? {
                        levelOptimalMin: primaryThreshold.levelOptimalMin,
                        levelOptimalMax: primaryThreshold.levelOptimalMax,
                        levelHigh: primaryThreshold.levelHigh,
                        levelDangerous: primaryThreshold.levelDangerous,
                      } : null,
                    });
                  }
                })
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
  const borderColor = palette.border;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180, background: bg }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180, background: bg, color: textSecondary, padding: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        River conditions temporarily unavailable
      </div>
    );
  }

  const conditionCode = river.currentCondition?.code;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';
  const utm = { widget: 'widget', key: slug, partner: branding?.businessName || partner };
  const riverHref = eddyDeepLink(origin, river.path || `/rivers/${river.slug}`, utm);
  const weatherHref = eddyDeepLink(origin, `/gauges?river=${river.slug}`, utm);
  const suspectGauge = gauges.find(g => g.readingSuspect && g.qualifierNote);

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
      {/* Identity + canonical live condition. */}
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
            Live Conditions · {river.lengthMiles} mi · {river.accessPointCount} access points
          </div>
        </div>
        <a
          href={riverHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 no-underline"
          aria-label={`Open full ${river.name} report`}
        >
          <ConditionBadge code={conditionCode || 'unknown'} size="md" />
        </a>
      </header>

      {/* Gauge stations — primary shown, others toggleable */}
      {gauges.length > 0 && (() => {
        const primaryGauge = gauges.find(g => g.isPrimary) || gauges[0];
        const secondaryGauges = gauges.filter(g => g.id !== primaryGauge.id);
        const primaryTrend = gaugeTrends[primaryGauge.usgsSiteId] ?? null;
        const primaryConditionStyle = conditionChip(primaryGauge.conditionCode);

        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 px-0.5">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide" style={{ color: textSecondary }}>
                  Live gauge
                </div>
                <div className="text-xs truncate mt-0.5" title={primaryGauge.name} style={{ color: textSecondary }}>
                  {primaryGauge.name}
                </div>
              </div>
              <div className="text-xs text-right flex-shrink-0" style={{ color: textSecondary }}>
                {formatReadingAge(primaryGauge.readingAgeHours)}
              </div>
            </div>

            <section
              aria-label={`${primaryGauge.name} current readings`}
              className="grid grid-cols-2 sm:grid-cols-4 overflow-hidden rounded-lg border"
              style={{ borderColor: palette.border, background: palette.cardBg }}
            >
              <LiveMetric
                label="Gauge height"
                value={primaryGauge.gaugeHeightFt != null ? `${primaryGauge.gaugeHeightFt.toFixed(1)} ft` : 'Unavailable'}
                detail={primaryTrend ? `${getTrendArrow(primaryTrend)} ${primaryTrend}` : primaryGauge.conditionLabel}
                palette={palette}
                className="border-r border-b sm:border-b-0"
                accent={primaryConditionStyle}
                detailColor={primaryTrend ? getTrendColor(primaryTrend, isDark) : undefined}
              />
              <LiveMetric
                label="Flow now"
                value={primaryGauge.dischargeCfs != null ? `${primaryGauge.dischargeCfs.toLocaleString()} cfs` : 'Unavailable'}
                detail={primaryGauge.conditionLabel}
                palette={palette}
                className="border-b sm:border-b-0 sm:border-r"
                accent={primaryConditionStyle}
              />
              <LiveMetric
                label="Optimal range"
                value={primaryGauge.optimalRange || 'Not set'}
                detail="Established range"
                palette={palette}
                className="border-r"
              />
              <LiveMetric
                label="Weather"
                value={weather ? `${Math.round(weather.temp)}°F` : 'Unavailable'}
                detail={weather
                  ? `${weather.condition}${weather.windSpeed > 5 ? ` · Wind ${Math.round(weather.windSpeed)} mph` : ''}`
                  : 'Weather unavailable'}
                palette={palette}
                href={weatherHref}
              />
            </section>

            {secondaryGauges.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllGauges(prev => !prev)}
                aria-expanded={showAllGauges}
                className="self-start inline-flex items-center gap-1 px-1 py-1 text-xs font-bold bg-transparent border-0 cursor-pointer"
                style={{ color: palette.link }}
              >
                {showAllGauges ? 'Hide' : 'Show'} {secondaryGauges.length} additional gauge{secondaryGauges.length === 1 ? '' : 's'}
                <span aria-hidden="true" style={{ transform: showAllGauges ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              </button>
            )}

            {/* Secondary gauges (toggled by arrow) */}
            {secondaryGauges.length > 0 && (
              <>
                {showAllGauges && secondaryGauges.map((gauge) => {
                  const trend = gaugeTrends[gauge.usgsSiteId] ?? null;
                  return (
                    <div
                      key={gauge.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 10px',
                        borderRadius: 8,
                        background: cardBg,
                        border: `1px solid ${borderColor}`,
                        fontSize: 11,
                      }}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: gauge.conditionColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {gauge.name}
                      </div>
                      <span style={{ fontWeight: 700, fontFamily: EMBED_FONTS.mono, flexShrink: 0 }}>
                        {gauge.value}
                        <span style={{ fontWeight: 400, fontSize: 9, color: textSecondary, marginLeft: 2 }}>{gauge.unit}</span>
                      </span>
                      {trend && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: getTrendColor(trend, isDark) }}>
                          {getTrendArrow(trend)}
                        </span>
                      )}
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: gauge.conditionColor,
                          padding: '1px 5px',
                          borderRadius: 3,
                          backgroundColor: `${gauge.conditionColor}15`,
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {gauge.conditionLabel}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })()}

      {/* Suspect-reading warning (ice-affected / estimated / sensor issues) */}
      {suspectGauge && (
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
          <span>{suspectGauge.qualifierNote}</span>
        </div>
      )}

      {/* 14-day trend chart for primary gauge */}
      {chartData && chartData.readings.length > 1 && (() => {
        const W = 540;
        const H = 100;
        const PAD_L = 36;
        const PAD_R = 8;
        const PAD_T = 6;
        const PAD_B = 18;
        const chartW = W - PAD_L - PAD_R;
        const chartH = H - PAD_T - PAD_B;

        const values = chartData.readings.map(r => r.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal || 1;
        const padded_min = minVal - range * 0.05;
        const padded_max = maxVal + range * 0.05;
        const padded_range = padded_max - padded_min;

        const toX = (i: number) => PAD_L + (i / (chartData.readings.length - 1)) * chartW;
        const toY = (v: number) => PAD_T + (1 - (v - padded_min) / padded_range) * chartH;

        // Build SVG path
        const pathPoints = chartData.readings.map((r, i) => `${toX(i).toFixed(1)},${toY(r.value).toFixed(1)}`);
        const linePath = `M${pathPoints.join('L')}`;

        // Area fill path
        const areaPath = `${linePath}L${toX(chartData.readings.length - 1).toFixed(1)},${(PAD_T + chartH).toFixed(1)}L${PAD_L.toFixed(1)},${(PAD_T + chartH).toFixed(1)}Z`;

        // Threshold lines
        const thresholdLines: { y: number; color: string; label: string }[] = [];
        if (chartData.thresholds) {
          const t = chartData.thresholds;
          if (t.levelOptimalMin !== null && t.levelOptimalMin >= padded_min && t.levelOptimalMin <= padded_max) {
            thresholdLines.push({ y: toY(t.levelOptimalMin), color: CONDITION_COLORS.flowing, label: 'Flowing' });
          }
          if (t.levelOptimalMax !== null && t.levelOptimalMax >= padded_min && t.levelOptimalMax <= padded_max) {
            thresholdLines.push({ y: toY(t.levelOptimalMax), color: CONDITION_COLORS.flowing, label: 'Flowing' });
          }
          if (t.levelHigh !== null && t.levelHigh >= padded_min && t.levelHigh <= padded_max) {
            thresholdLines.push({ y: toY(t.levelHigh), color: CONDITION_COLORS.high, label: 'High' });
          }
          if (t.levelDangerous !== null && t.levelDangerous >= padded_min && t.levelDangerous <= padded_max) {
            thresholdLines.push({ y: toY(t.levelDangerous), color: CONDITION_COLORS.dangerous, label: 'Flood' });
          }
        }

        // Date labels (first, middle, last)
        const formatDate = (ts: string) => {
          const d = new Date(ts);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        };
        const midIdx = Math.floor(chartData.readings.length / 2);
        const dateLabels = [
          { x: PAD_L, label: formatDate(chartData.readings[0].timestamp) },
          { x: toX(midIdx), label: formatDate(chartData.readings[midIdx].timestamp) },
          { x: W - PAD_R, label: formatDate(chartData.readings[chartData.readings.length - 1].timestamp) },
        ];

        // Y-axis labels
        const yLabels = [
          { y: PAD_T, label: chartData.unit === 'cfs' ? Math.round(padded_max).toLocaleString() : padded_max.toFixed(1) },
          { y: PAD_T + chartH, label: chartData.unit === 'cfs' ? Math.round(padded_min).toLocaleString() : padded_min.toFixed(1) },
        ];

        return (
          <div style={{ marginTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                14-Day Trend ({chartData.unit})
              </div>
            </div>
            <div style={{ background: cardBg, borderRadius: 8, border: `1px solid ${borderColor}`, padding: '6px 4px 2px', overflow: 'hidden' }}>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block' }}>
                {/* Area fill */}
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={palette.link} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={palette.link} stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#areaGrad)" />

                {/* Threshold lines */}
                {thresholdLines.map((t, i) => (
                  <line key={i} x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y} stroke={t.color} strokeWidth="0.7" strokeDasharray="3,2" opacity="0.6" />
                ))}

                {/* Data line */}
                <path d={linePath} fill="none" stroke={palette.link} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

                {/* Current value dot */}
                <circle cx={toX(chartData.readings.length - 1)} cy={toY(chartData.readings[chartData.readings.length - 1].value)} r="3" fill={palette.link} stroke={palette.cardBg} strokeWidth="1.5" />

                {/* Y-axis labels */}
                {yLabels.map((yl, i) => (
                  <text key={i} x={PAD_L - 4} y={yl.y + (i === 0 ? 8 : -2)} fill={textSecondary} opacity="0.8" fontSize="8" textAnchor="end" fontFamily="ui-monospace, monospace">
                    {yl.label}
                  </text>
                ))}

                {/* Date labels */}
                {dateLabels.map((dl, i) => (
                  <text key={i} x={dl.x} y={H - 2} fill={textSecondary} opacity="0.8" fontSize="8" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontFamily="system-ui, sans-serif">
                    {dl.label}
                  </text>
                ))}
              </svg>
            </div>
          </div>
        );
      })()}

      {/* Bottom: Links (#10 friendlier language) */}
      <EmbedFooter
        origin={origin}
        widget="widget"
        widgetKey={slug}
        isDark={isDark}
        partner={partner}
        branding={branding}
        links={[
          { label: 'Full River Report', path: river.path || `/rivers/${river.slug}` },
          { label: 'Plan a Float', path: `/plan?river=${river.slug}` },
        ]}
      />
    </div>
  );
}

function LiveMetric({
  label,
  value,
  detail,
  palette,
  className = '',
  accent,
  detailColor,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  palette: ReturnType<typeof embedPalette>;
  className?: string;
  accent?: ReturnType<typeof conditionChip>;
  detailColor?: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium" style={{ color: palette.textSecondary }}>
        {accent && (
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: accent.solid }}
          />
        )}
        {label}
      </div>
      <div
        className="mt-0.5 text-sm font-bold break-words tabular-nums text-center"
        style={{ color: palette.textPrimary, fontFamily: EMBED_FONTS.mono }}
      >
        {value}
      </div>
      <div
        className="mt-0.5 text-xs truncate capitalize text-center"
        title={detail}
        style={{ color: detailColor || palette.textSecondary }}
      >
        {detail}{href ? ' →' : ''}
      </div>
    </>
  );
  const style = {
    borderColor: palette.border,
    borderTopColor: accent?.solid || palette.border,
    background: accent?.background,
  };
  const classes = `min-w-0 px-2 py-2 text-center border-t-2 ${href ? 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]' : ''} ${className}`;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${classes} no-underline transition-colors`}
        style={style}
        aria-label={`${label}: ${value}. ${detail}. Open weather and levels.`}
      >
        {content}
      </a>
    );
  }

  return <div className={classes} style={style}>{content}</div>;
}
