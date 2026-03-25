'use client';

// src/app/embed/gauge-report/[slug]/page.tsx
// Embeddable gauge report widget showing 7/14/30-day chart,
// current gauge height, and Eddy Says condition report.

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS } from '@/constants';

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
  currentCondition?: { code: string } | null;
}

interface ChartThresholds {
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
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
  thresholds?: GaugeThreshold[] | null;
}

const CONDITION_LABELS: Record<string, string> = {
  flowing: 'Flowing',
  good: 'Good',
  low: 'Low',
  too_low: 'Too Low',
  high: 'High',
  dangerous: 'Flood',
  unknown: 'Unknown',
};

const DEFAULT_DAYS = 14;

export default function EmbedGaugeReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const partner = searchParams.get('partner') || '';
  const isDark = theme === 'dark';

  const days = parseInt(searchParams.get('days') || '', 10) || DEFAULT_DAYS;
  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [update, setUpdate] = useState<EddyUpdate | null>(null);
  const [history, setHistory] = useState<GaugeHistoryResponse | null>(null);
  const [currentHeight, setCurrentHeight] = useState<number | null>(null);
  const [primarySiteId, setPrimarySiteId] = useState<string | null>(null);
  const [chartThresholds, setChartThresholds] = useState<ChartThresholds | null>(null);
  const [chartUnit, setChartUnit] = useState<'ft' | 'cfs'>('ft');
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
              const useCfs = primary.thresholdUnit === 'cfs';
              setChartUnit(useCfs ? 'cfs' : 'ft');
              if (useCfs) {
                if (gauge.dischargeCfs != null) setCurrentHeight(gauge.dischargeCfs);
              } else {
                if (gauge.gaugeHeightFt != null) setCurrentHeight(gauge.gaugeHeightFt);
              }
              setChartThresholds({
                levelOptimalMin: primary.levelOptimalMin ?? null,
                levelOptimalMax: primary.levelOptimalMax ?? null,
                levelHigh: primary.levelHigh ?? null,
                levelDangerous: primary.levelDangerous ?? null,
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
            const useCfs = fallbackThreshold?.thresholdUnit === 'cfs';
            setChartUnit(useCfs ? 'cfs' : 'ft');
            if (useCfs) {
              if (fallbackGauge.dischargeCfs != null) setCurrentHeight(fallbackGauge.dischargeCfs);
            } else {
              if (fallbackGauge.gaugeHeightFt != null) setCurrentHeight(fallbackGauge.gaugeHeightFt);
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

  const bg = isDark ? '#1a1a1a' : '#ffffff';
  const textPrimary = isDark ? '#e5e5e5' : '#1a1a1a';
  const textSecondary = isDark ? '#888' : '#777';
  const borderColor = isDark ? '#333' : '#e5e5e5';
  const cardBg = isDark ? '#222' : '#f9fafb';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  const conditionCode = update?.conditionCode || river?.currentCondition?.code || 'unknown';
  const conditionColor = CONDITION_COLORS[conditionCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const displayHeight = update?.gaugeHeightFt ?? currentHeight;

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
        River not found
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: bg, color: textPrimary, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Header: Eddy favicon + River name + condition badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image src={EDDY_LOGO} alt="Eddy" width={32} height={32} style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{river.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 12, backgroundColor: `${conditionColor}15`, border: `1px solid ${conditionColor}30` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: conditionColor }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: conditionColor }}>{CONDITION_LABELS[conditionCode] || 'Unknown'}</span>
        </div>
      </div>

      {/* Gauge height */}
      <div>
        {displayHeight != null ? (
          <>
            <span style={{ fontSize: 28, fontWeight: 800, color: textPrimary, lineHeight: 1 }}>
              {chartUnit === 'cfs' ? Math.round(displayHeight).toLocaleString() : displayHeight.toFixed(1)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: textSecondary, marginLeft: 3 }}>{chartUnit}</span>
          </>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 600, color: textSecondary }}>No reading</span>
        )}
      </div>

      {/* Chart */}
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

        const W = 540;
        const H = 160;
        const PAD_L = 40;
        const PAD_R = 8;
        const PAD_T = 6;
        const PAD_B = 18;
        const chartW = W - PAD_L - PAD_R;
        const chartH = H - PAD_T - PAD_B;

        const values = chartReadings.map(r => r.value);
        const minVal = Math.min(...values);
        const maxVal = Math.max(...values);
        const range = maxVal - minVal || 1;
        const padded_min = minVal - range * 0.05;
        const padded_max = maxVal + range * 0.05;
        const padded_range = padded_max - padded_min;

        const toX = (i: number) => PAD_L + (i / (chartReadings.length - 1)) * chartW;
        const toY = (v: number) => PAD_T + (1 - (v - padded_min) / padded_range) * chartH;

        const pathPoints = chartReadings.map((r, i) => `${toX(i).toFixed(1)},${toY(r.value).toFixed(1)}`);
        const linePath = `M${pathPoints.join('L')}`;
        const areaPath = `${linePath}L${toX(chartReadings.length - 1).toFixed(1)},${(PAD_T + chartH).toFixed(1)}L${PAD_L.toFixed(1)},${(PAD_T + chartH).toFixed(1)}Z`;

        // Threshold lines
        const thresholdLines: { y: number; color: string; label: string }[] = [];
        if (chartThresholds) {
          const t = chartThresholds;
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
        const midIdx = Math.floor(chartReadings.length / 2);
        const dateLabels = [
          { x: PAD_L, label: formatDate(chartReadings[0].timestamp) },
          { x: toX(midIdx), label: formatDate(chartReadings[midIdx].timestamp) },
          { x: W - PAD_R, label: formatDate(chartReadings[chartReadings.length - 1].timestamp) },
        ];

        // Y-axis labels
        const yLabels = [
          { y: PAD_T, label: useCfs ? Math.round(padded_max).toLocaleString() : padded_max.toFixed(1) },
          { y: PAD_T + chartH, label: useCfs ? Math.round(padded_min).toLocaleString() : padded_min.toFixed(1) },
        ];

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {days}-Day Trend ({chartUnit})
              </div>
            </div>
            <div style={{ background: cardBg, borderRadius: 8, border: `1px solid ${borderColor}`, padding: '6px 4px 2px', overflow: 'hidden' }}>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block' }}>
                {/* Area fill */}
                <defs>
                  <linearGradient id="grAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2D7889" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#2D7889" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#grAreaGrad)" />

                {/* Threshold lines */}
                {thresholdLines.map((t, i) => (
                  <line key={i} x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y} stroke={t.color} strokeWidth="0.7" strokeDasharray="3,2" opacity="0.6" />
                ))}

                {/* Data line */}
                <path d={linePath} fill="none" stroke="#2D7889" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

                {/* Current value dot */}
                <circle cx={toX(chartReadings.length - 1)} cy={toY(chartReadings[chartReadings.length - 1].value)} r="3" fill="#2D7889" stroke={isDark ? '#222' : '#fff'} strokeWidth="1.5" />

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: partner ? 'space-between' : 'space-between', borderTop: `1px solid ${borderColor}`, paddingTop: 8, marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href={`${origin}/rivers/${river.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2D7889', textDecoration: 'none', fontWeight: 600 }}>
            Full river guide &rarr;
          </a>
          {partner && (
            <span style={{ fontSize: 10, color: textSecondary, fontWeight: 500 }}>via {partner}</span>
          )}
        </div>
        <a href={origin} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: textSecondary, textDecoration: 'none' }}>
          <Image src={EDDY_LOGO} alt="Eddy" width={16} height={16} style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%' }} />
          Powered by Eddy
        </a>
      </div>
    </div>
  );
}
