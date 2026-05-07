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
  thresholds: GaugeThreshold[] | null;
}

interface GaugeWithCondition {
  id: string;
  name: string;
  usgsSiteId: string;
  isPrimary: boolean;
  value: string;
  unit: string;
  conditionCode: ConditionCode;
  conditionLabel: string;
  conditionColor: string;
  readingAgeHours: number | null;
}

interface WeatherData {
  temp: number;
  condition: string;
  windSpeed: number;
  humidity: number;
}

// Condition helper text for first-time floaters (#9)
const CONDITION_HELPERS: Record<string, string> = {
  flowing: 'Great day to float',
  good: 'Good conditions',
  low: 'Shallow — expect scraping',
  too_low: 'Too low to float',
  high: 'Fast water — use caution',
  dangerous: 'Do not float',
  unknown: 'Check locally',
};

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

function formatReadingAge(hours: number | null): string {
  if (hours === null) return '';
  if (hours < 1) return 'Updated just now';
  if (hours < 2) return 'Updated 1 hr ago';
  if (hours < 24) return `Updated ${Math.round(hours)} hrs ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
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

  const [river, setRiver] = useState<RiverListItem | null>(null);
  const [gauges, setGauges] = useState<GaugeWithCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [oldestReadingAge, setOldestReadingAge] = useState<number | null>(null);
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
            let maxAge: number | null = null;
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

              // Track oldest reading age (#8)
              if (gauge.readingAgeHours !== null) {
                if (maxAge === null || gauge.readingAgeHours > maxAge) {
                  maxAge = gauge.readingAgeHours;
                }
              }

              riverGauges.push({
                id: gauge.id,
                name: gauge.name,
                usgsSiteId: gauge.usgsSiteId,
                isPrimary: threshold.isPrimary,
                value: primaryValue !== null
                  ? useCfs
                    ? primaryValue.toLocaleString()
                    : primaryValue.toFixed(2)
                  : '--',
                unit: useCfs ? 'cfs' : 'ft',
                conditionCode: result.code,
                conditionLabel: getConditionShortLabel(result.code),
                conditionColor: CONDITION_COLORS[result.code] || '#9ca3af',
                readingAgeHours: gauge.readingAgeHours,
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
            setOldestReadingAge(maxAge);

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

  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';
  const cardBg = isDark ? '#222' : '#f9fafb';

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
        River not found
      </div>
    );
  }

  const conditionCode = river.currentCondition?.code;
  const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] : '#9ca3af';
  const conditionHelper = conditionCode ? CONDITION_HELPERS[conditionCode] : CONDITION_HELPERS.unknown;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: bg,
        color: textPrimary,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxSizing: 'border-box',
      }}
    >
      {/* Top: Eddy favicon + River name + overall condition */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src={EDDY_LOGO}
          alt="Eddy"
          width={32}
          height={32}
          style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {river.name}
          </div>
          <div style={{ fontSize: 11, color: textSecondary, marginTop: 1 }}>
            {river.lengthMiles} mi &middot; {river.accessPointCount} access points
          </div>
        </div>
        {/* Overall condition pill - clickable for more info (#9) */}
        <a
          href={`${origin}/plan?river=${river.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', flexShrink: 0 }}
        >
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '5px 12px',
              borderRadius: 8,
              backgroundColor: `${conditionColor}15`,
              border: `1.5px solid ${conditionColor}35`,
              boxShadow: `0 1px 3px ${conditionColor}15`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: conditionColor }} />
              <span style={{ fontWeight: 700, fontSize: 11, color: conditionColor, whiteSpace: 'nowrap' }}>
                {conditionCode ? getConditionShortLabel(conditionCode) : 'Unknown'}
              </span>
            </div>
            <span style={{ fontSize: 9, color: conditionColor, opacity: 0.8, whiteSpace: 'nowrap', fontWeight: 500 }}>
              {conditionHelper}
            </span>
          </div>
        </a>
      </div>

      {/* Weather line (#21) */}
      {weather && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: textSecondary,
            padding: '4px 8px',
            borderRadius: 6,
            background: cardBg,
          }}
        >
          <span>{Math.round(weather.temp)}°F</span>
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

      {/* Gauge stations — primary shown, others toggleable */}
      {gauges.length > 0 && (() => {
        const primaryGauge = gauges.find(g => g.isPrimary) || gauges[0];
        const secondaryGauges = gauges.filter(g => g.id !== primaryGauge.id);
        const primaryTrend = gaugeTrends[primaryGauge.usgsSiteId] ?? null;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Primary Gauge
              </div>
              {oldestReadingAge !== null && (
                <div style={{ fontSize: 9, color: textSecondary, fontWeight: 500 }}>
                  {formatReadingAge(oldestReadingAge)}
                </div>
              )}
            </div>

            {/* Primary gauge — always visible */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 8,
                background: cardBg,
                border: `1px solid ${borderColor}`,
                boxShadow: `0 1px 2px ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)'}`,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: primaryGauge.conditionColor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {primaryGauge.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                  {primaryGauge.value}
                  <span style={{ fontWeight: 400, fontSize: 10, color: textSecondary, marginLeft: 2 }}>{primaryGauge.unit}</span>
                </span>
                {primaryTrend && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: getTrendColor(primaryTrend, isDark) }}>
                    {getTrendArrow(primaryTrend)}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: primaryGauge.conditionColor,
                  padding: '2px 6px',
                  borderRadius: 4,
                  backgroundColor: `${primaryGauge.conditionColor}15`,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {primaryGauge.conditionLabel}
              </div>
              {/* Expand arrow for secondary gauges */}
              {secondaryGauges.length > 0 && (
                <button
                  onClick={() => setShowAllGauges(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    borderRadius: 4,
                    color: textSecondary,
                    transition: 'color 0.15s',
                  }}
                  title={showAllGauges ? 'Hide gauges' : `Show ${secondaryGauges.length} more`}
                >
                  <span style={{ fontSize: 10, transform: showAllGauges ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', lineHeight: 1 }}>▼</span>
                </button>
              )}
            </div>

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
                      <span style={{ fontWeight: 700, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
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
            thresholdLines.push({ y: toY(t.levelOptimalMin), color: '#059669', label: 'Flowing' });
          }
          if (t.levelOptimalMax !== null && t.levelOptimalMax >= padded_min && t.levelOptimalMax <= padded_max) {
            thresholdLines.push({ y: toY(t.levelOptimalMax), color: '#059669', label: 'Flowing' });
          }
          if (t.levelHigh !== null && t.levelHigh >= padded_min && t.levelHigh <= padded_max) {
            thresholdLines.push({ y: toY(t.levelHigh), color: '#f97316', label: 'High' });
          }
          if (t.levelDangerous !== null && t.levelDangerous >= padded_min && t.levelDangerous <= padded_max) {
            thresholdLines.push({ y: toY(t.levelDangerous), color: '#ef4444', label: 'Flood' });
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
                    <stop offset="0%" stopColor="#2D7889" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#2D7889" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#areaGrad)" />

                {/* Threshold lines */}
                {thresholdLines.map((t, i) => (
                  <line key={i} x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y} stroke={t.color} strokeWidth="0.7" strokeDasharray="3,2" opacity="0.6" />
                ))}

                {/* Data line */}
                <path d={linePath} fill="none" stroke="#2D7889" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

                {/* Current value dot */}
                <circle cx={toX(chartData.readings.length - 1)} cy={toY(chartData.readings[chartData.readings.length - 1].value)} r="3" fill="#2D7889" stroke={isDark ? '#222' : '#fff'} strokeWidth="1.5" />

                {/* Y-axis labels */}
                {yLabels.map((yl, i) => (
                  <text key={i} x={PAD_L - 4} y={yl.y + (i === 0 ? 8 : -2)} fill={isDark ? '#666' : '#aaa'} fontSize="8" textAnchor="end" fontFamily="ui-monospace, monospace">
                    {yl.label}
                  </text>
                ))}

                {/* Date labels */}
                {dateLabels.map((dl, i) => (
                  <text key={i} x={dl.x} y={H - 2} fill={isDark ? '#666' : '#aaa'} fontSize="8" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fontFamily="system-ui, sans-serif">
                    {dl.label}
                  </text>
                ))}
              </svg>
            </div>
          </div>
        );
      })()}

      {/* Bottom: Links (#10 friendlier language) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${borderColor}`,
          paddingTop: 8,
          marginTop: 2,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <a
            href={`${origin}/plan?river=${river.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}
          >
            Open in Eddy &rarr;
          </a>
          <a
            href={`${origin}/gauges?river=${river.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}
          >
            Water levels &rarr;
          </a>
          <a
            href={`${origin}/plan?river=${river.slug}#services`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}
          >
            Find outfitters &rarr;
          </a>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {partner && (
            <span style={{ fontSize: 10, color: textSecondary, fontWeight: 500 }}>
              via {partner}
            </span>
          )}
          <a
            href={origin}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: textSecondary,
              textDecoration: 'none',
            }}
          >
            <Image
              src={EDDY_LOGO}
              alt="Eddy"
              width={16}
              height={16}
              style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }}
            />
            Powered by Eddy
          </a>
        </div>
      </div>
    </div>
  );
}
