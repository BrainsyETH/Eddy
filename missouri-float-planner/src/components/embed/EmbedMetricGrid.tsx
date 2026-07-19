'use client';

import type { CSSProperties } from 'react';
import { conditionChip } from '@shared/condition-system';
import { EMBED_FONTS, type EmbedPalette } from '@/lib/embed/theme';
import { TileBadgeIcon, type EmbedTileIconKey } from '@/lib/embed/tileIcons';

export interface EmbedMetric {
  label: string;
  value: string;
  detail: string;
  /** Tile identity — drives the tone (gauge, flow, optimal, weather). */
  icon?: EmbedTileIconKey;
  /** Brand image for the badge (mood otter, green flag). Weather has no image. */
  iconImageUrl?: string;
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

// Soft wash behind context tiles that carry no live condition accent (Sandbar
// Tan for the optimal range, Sunset Coral for weather). Live tiles (gauge,
// flow) always pass an accent, so they never fall back to this.
const CONTEXT_WASH: Partial<Record<EmbedTileIconKey, string>> = {
  optimal: '#B89D7214',
  weather: '#F0705214',
};

// Peel a known trailing unit off a formatted value so the tile can render the
// number large and the unit small (e.g. "1,010 cfs" → 1,010 · cfs). Values
// without a recognized unit (e.g. "Unavailable", "Not set") render whole.
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
  const { label, value, detail, icon, iconImageUrl, accent, detailColor, href, linkLabel } = metric;
  const { num, unit } = splitValueUnit(value);

  const isWeather = icon === 'weather';
  const showIcon = Boolean(iconImageUrl) || isWeather;
  // Live tiles take the canonical condition tint; context tiles take a soft
  // brand wash. Both read on light and dark surfaces.
  const tileTint = accent?.background ?? (icon ? CONTEXT_WASH[icon] : undefined) ?? 'transparent';
  const pillBg = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';

  const style = {
    '--embed-focus': palette.focus,
    '--embed-tile-shadow': isDark ? '0 4px 11px rgba(0,0,0,0.32)' : '0 4px 11px rgba(45,42,36,0.09)',
    '--embed-tile-shadow-hover': isDark ? '0 8px 16px rgba(0,0,0,0.42)' : '0 8px 16px rgba(45,42,36,0.14)',
    background: tileTint,
    borderColor: palette.border,
    animationDelay: `${index * 60}ms`,
  } as CSSProperties;

  const content = (
    <>
      <span className="embed-tile-pill" style={{ background: pillBg, borderColor: palette.border }}>
        {showIcon && (
          <span className="embed-tile-icon">
            <TileBadgeIcon imageUrl={iconImageUrl} isWeather={isWeather} />
          </span>
        )}
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
