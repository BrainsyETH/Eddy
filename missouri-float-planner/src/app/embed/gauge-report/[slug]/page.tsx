'use client';

// src/app/embed/gauge-report/[slug]/page.tsx
// Embeddable gauge report widget showing 7/14/30-day chart,
// current gauge height, and Eddy Says condition report.

import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useParams, useSearchParams } from 'next/navigation';
import { CONDITION_COLORS } from '@/constants';

const EDDY_LOGO = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

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

interface GaugeThreshold {
  riverId: string;
  isPrimary: boolean;
  thresholdUnit?: string;
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

const DAY_OPTIONS = [7, 14, 30] as const;

// Simple SVG area chart
function MiniChart({
  readings,
  width,
  height,
  color,
  isDark,
}: {
  readings: GaugeReading[];
  width: number;
  height: number;
  color: string;
  isDark: boolean;
}) {
  const points = useMemo(() => {
    const valid = readings.filter(r => r.gaugeHeightFt != null);
    if (valid.length < 2) return null;

    const values = valid.map(r => r.gaugeHeightFt!);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padY = 8;
    const chartH = height - padY * 2;

    return valid.map((r, i) => {
      const x = (i / (valid.length - 1)) * width;
      const y = padY + chartH - ((r.gaugeHeightFt! - min) / range) * chartH;
      return { x, y };
    });
  }, [readings, width, height]);

  if (!points || points.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill={isDark ? '#555' : '#ccc'} fontSize={11}>
          No chart data
        </text>
      </svg>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={isDark ? 0.3 : 0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#chartFill)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function EmbedGaugeReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const theme = searchParams.get('theme') || 'light';
  const partner = searchParams.get('partner') || '';
  const defaultDays = parseInt(searchParams.get('days') || '7', 10);
  const isDark = theme === 'dark';

  const [days, setDays] = useState<number>(DAY_OPTIONS.includes(defaultDays as 7 | 14 | 30) ? defaultDays : 7);
  const [river, setRiver] = useState<RiverBasic | null>(null);
  const [update, setUpdate] = useState<EddyUpdate | null>(null);
  const [history, setHistory] = useState<GaugeHistoryResponse | null>(null);
  const [currentHeight, setCurrentHeight] = useState<number | null>(null);
  const [primarySiteId, setPrimarySiteId] = useState<string | null>(null);
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
          for (const gauge of (gaugeData.gauges as GaugeEntry[])) {
            const primary = gauge.thresholds?.find((t) => t.riverId === riverId && t.isPrimary);
            if (primary) {
              setPrimarySiteId(gauge.usgsSiteId);
              if (gauge.gaugeHeightFt != null) setCurrentHeight(gauge.gaugeHeightFt);
              fallbackGauge = null;
              break;
            }
            // Track first gauge linked to this river as fallback
            if (!fallbackGauge && gauge.thresholds?.some((t) => t.riverId === riverId)) {
              fallbackGauge = gauge;
            }
          }
          if (fallbackGauge) {
            setPrimarySiteId(fallbackGauge.usgsSiteId);
            if (fallbackGauge.gaugeHeightFt != null) setCurrentHeight(fallbackGauge.gaugeHeightFt);
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
      {/* Header: River name + condition badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{river.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 12, backgroundColor: `${conditionColor}15`, border: `1px solid ${conditionColor}30` }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: conditionColor }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: conditionColor }}>{CONDITION_LABELS[conditionCode] || 'Unknown'}</span>
        </div>
      </div>

      {/* Gauge height + chart period toggle */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          {displayHeight != null ? (
            <>
              <span style={{ fontSize: 28, fontWeight: 800, color: textPrimary, lineHeight: 1 }}>
                {displayHeight.toFixed(1)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: textSecondary, marginLeft: 3 }}>ft</span>
            </>
          ) : (
            <span style={{ fontSize: 16, fontWeight: 600, color: textSecondary }}>No reading</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {DAY_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                fontWeight: days === d ? 700 : 500,
                color: days === d ? '#fff' : textSecondary,
                backgroundColor: days === d ? '#2D7889' : (isDark ? '#333' : '#f0f0f0'),
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: cardBg, borderRadius: 8, padding: '6px 0', border: `1px solid ${borderColor}`, height: 160 }}>
        <MiniChart
          readings={history?.readings || []}
          width={400}
          height={160}
          color={conditionColor}
          isDark={isDark}
        />
      </div>

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
