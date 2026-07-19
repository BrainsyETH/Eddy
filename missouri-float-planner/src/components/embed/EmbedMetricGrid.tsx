'use client';

import type { CSSProperties } from 'react';
import { conditionChip } from '@shared/condition-system';
import { EMBED_FONTS, type EmbedPalette } from '@/lib/embed/theme';

export interface EmbedMetric {
  label: string;
  value: string;
  detail: string;
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

const CELL_BORDERS = [
  'border-r border-b sm:border-b-0',
  'border-b sm:border-b-0 sm:border-r',
  'border-r',
  '',
] as const;

export default function EmbedMetricGrid({ ariaLabel, metrics, palette }: EmbedMetricGridProps) {
  return (
    <section
      aria-label={ariaLabel}
      className="grid grid-cols-2 sm:grid-cols-4 overflow-hidden rounded-lg border"
      style={{ borderColor: palette.border, background: palette.cardBg }}
    >
      {metrics.map((metric, index) => (
        <MetricCell
          key={metric.label}
          metric={metric}
          palette={palette}
          className={CELL_BORDERS[index] || ''}
        />
      ))}
    </section>
  );
}

function MetricCell({
  metric,
  palette,
  className,
}: {
  metric: EmbedMetric;
  palette: EmbedPalette;
  className: string;
}) {
  const { label, value, detail, accent, detailColor, href, linkLabel } = metric;
  const content = (
    <>
      <div
        className="flex items-center justify-center gap-1.5 text-[11px] font-semibold leading-4"
        style={{ color: palette.textSecondary }}
      >
        {accent && (
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: accent.solid }}
          />
        )}
        {label}
      </div>
      <div
        className="mt-0.5 break-words text-center text-[15px] font-bold leading-5 tabular-nums"
        style={{ color: palette.textPrimary, fontFamily: EMBED_FONTS.mono }}
      >
        {value}
      </div>
      <div
        className="embed-metric-detail mt-0.5 text-center text-[11px] leading-4"
        title={detail}
        style={{ color: detailColor || palette.textSecondary }}
      >
        {detail}{href ? ' →' : ''}
      </div>
    </>
  );

  const style = {
    '--embed-border': palette.border,
    '--embed-hover': accent?.background || palette.hoverBg,
    '--embed-focus': palette.focus,
    borderColor: palette.border,
    borderTopColor: accent?.solid || palette.border,
    background: accent?.background,
  } as CSSProperties;
  const classes = `min-w-0 border-t-2 px-2 py-2 text-center ${className}`;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`embed-metric-link ${classes} no-underline`}
        style={style}
        aria-label={linkLabel || `${label}: ${value}. ${detail}. Open details.`}
      >
        {content}
      </a>
    );
  }

  return <div className={classes} style={style}>{content}</div>;
}
