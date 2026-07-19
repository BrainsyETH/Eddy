'use client';

import type { CSSProperties } from 'react';
import { conditionChip } from '@shared/condition-system';
import { EMBED_FONTS, type EmbedPalette } from '@/lib/embed/theme';
import { TileIcon, type EmbedTileIconKey } from '@/lib/embed/tileIcons';

export interface EmbedMetric {
  label: string;
  value: string;
  detail: string;
  /** Which brand icon fills the tile's badge. Defaults to `gauge`. */
  icon?: EmbedTileIconKey;
  accent?: ReturnType<typeof conditionChip>;
  detailColor?: string;
  href?: string;
  linkLabel?: string;
}

interface EmbedMetricGridProps {
  ariaLabel: string;
  metrics: EmbedMetric[];
  palette: EmbedPalette;
}

// Badge color for a tile with no live condition accent. Live tiles (gauge,
// flow) inherit the condition's solid; context tiles carry a fixed brand hue —
// Sandbar Tan for the optimal range, Sunset Coral for weather (see .stitch/DESIGN.md).
const BADGE_FALLBACK: Record<EmbedTileIconKey, string> = {
  gauge: '#2D7889', // primary teal
  flow: '#2D7889',
  optimal: '#B89D72', // secondary tan
  weather: '#F07052', // accent coral
};

// Peel a known trailing unit off a formatted value so the tile can render the
// number large and the unit small (e.g. "1,010 cfs" → 1,010 · cfs). Anything
// without a recognized unit (e.g. "Unavailable", "Not set") renders whole.
const UNIT_RE = /\s*(cfs|ft|mph|in|°F|°C|%)\s*$/i;
function splitValueUnit(value: string): { num: string; unit: string | null } {
  const match = value.match(UNIT_RE);
  if (!match || match.index === undefined) return { num: value, unit: null };
  return { num: value.slice(0, match.index).trim(), unit: match[1] };
}

export default function EmbedMetricGrid({ ariaLabel, metrics, palette }: EmbedMetricGridProps) {
  // The two embed palettes are the only callers; light bg is pure white.
  const isDark = palette.bg.toLowerCase() !== '#ffffff';
  return (
    <section aria-label={ariaLabel} className="embed-tile-grid">
      {metrics.map((metric, index) => (
        <MetricTile key={metric.label} metric={metric} palette={palette} isDark={isDark} index={index} />
      ))}
    </section>
  );
}

function MetricTile({
  metric,
  palette,
  isDark,
  index,
}: {
  metric: EmbedMetric;
  palette: EmbedPalette;
  isDark: boolean;
  index: number;
}) {
  const { label, value, detail, icon = 'gauge', accent, detailColor, href, linkLabel } = metric;
  const { num, unit } = splitValueUnit(value);

  const badgeColor = accent?.solid ?? BADGE_FALLBACK[icon];
  // Live tiles take the canonical condition tint; context tiles take a soft
  // wash of their brand hue (8% alpha reads on both light and dark surfaces).
  const tileTint = accent?.background ?? `${BADGE_FALLBACK[icon]}14`;
  const pillBg = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';

  const style = {
    '--embed-focus': palette.focus,
    '--embed-tile-shadow': isDark ? '0 6px 16px rgba(0,0,0,0.35)' : '0 6px 16px rgba(45,42,36,0.10)',
    '--embed-tile-shadow-hover': isDark ? '0 12px 22px rgba(0,0,0,0.48)' : '0 12px 22px rgba(45,42,36,0.16)',
    background: tileTint,
    borderColor: palette.border,
    animationDelay: `${index * 60}ms`,
  } as CSSProperties;

  const content = (
    <>
      <span className="embed-tile-pill" style={{ background: pillBg, borderColor: palette.border }}>
        <span className="embed-tile-badge" style={{ background: badgeColor }}>
          <TileIcon icon={icon} />
        </span>
        <span className="embed-tile-label" style={{ color: palette.textPrimary }}>{label}</span>
      </span>
      <span className="embed-tile-value" style={{ color: palette.textPrimary, fontFamily: EMBED_FONTS.mono }}>
        {num}
        {unit && <span className="embed-tile-unit" style={{ color: palette.textSecondary }}>{unit}</span>}
      </span>
      <span className="embed-tile-detail" title={detail} style={{ color: detailColor || palette.textSecondary }}>
        {detail}{href ? ' →' : ''}
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="embed-tile embed-tile-link"
        style={style}
        aria-label={linkLabel || `${label}: ${value}. ${detail}. Open details.`}
      >
        {content}
      </a>
    );
  }

  return <div className="embed-tile" style={style}>{content}</div>;
}
