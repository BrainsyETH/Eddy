// src/components/embed/v2/RiverEmbed.tsx
// The river widget, in four sizes. Server component: the page hands it the
// assembled data and it returns finished HTML — no fetch waterfall, no
// skeleton, no client state except the partner-logo fallback.
//
// The card reads top to bottom in one pass:
//   river name + condition → gauge location → reading + trend → the ladder
//   → Eddy's take → weather → "Full report" and the credit.
// One condition badge, one Eddy illustration, one observation time. The
// reading is in the unit the river is RATED in; the other unit rides on the
// gauge line as context. The trend is plain text — it is a direction, not a
// condition, and must not wear a condition's colors.

import { conditionChip } from '@shared/condition-system';
import { getEddyImageForCondition, EDDY_IMAGES } from '@/constants';
import { eddyIconUrl } from '@/components/ui/EddyIcon';
import ConditionBadge from '@/components/ui/ConditionBadge';
import EmbedTrendChart from '@/components/embed/EmbedTrendChart';
import { eddyDeepLink } from '@/lib/embed/branding';
import type { EmbedBrandingRecord } from '@/lib/embed/cards';
import { embedVarPalette } from '@/lib/embed/theme';
import {
  formatObservedAge,
  formatReading,
  headlineReading,
  impressionType,
  shortAge,
  TREND_GLYPH,
  type EmbedOptions,
} from '@/lib/embed/options';
import type { EmbedGauge, RiverEmbedData } from '@/lib/embed/river-data';
import EmbedBrandMark from './EmbedBrandMark';
import EmbedCredit from './EmbedCredit';
import EmbedFrame from './EmbedFrame';
import RangeMeter from './RangeMeter';

const TAKE_AGE_NOTE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Inline chip colors, plus the dark-surface ink the frame swaps in. */
function chipStyle(chip: ReturnType<typeof conditionChip>): React.CSSProperties {
  return { color: chip.color, background: chip.background, borderColor: chip.borderColor, '--chip-ink-dark': chip.borderColor } as React.CSSProperties;
}
const TREND_WORD = { rising: 'Rising', falling: 'Falling', steady: 'Steady' } as const;

interface Props {
  data: RiverEmbedData;
  options: EmbedOptions;
  branding: EmbedBrandingRecord | null;
  origin: string;
  now: number;
}

function utmFor(data: RiverEmbedData, options: EmbedOptions, branding: EmbedBrandingRecord | null) {
  return {
    widget: impressionType('river', options.size),
    key: data.river.slug,
    partner: branding?.businessName || options.embedId || options.partner || undefined,
  };
}

// ── badge ───────────────────────────────────────────────────────────────────

function Badge({ data, options, branding, origin }: Props) {
  const chip = conditionChip(data.river.conditionCode);
  return (
    <EmbedFrame size="badge" options={options} kind="river" label={`${data.river.name}: ${chip.longLabel}`}>
      <a
        href={eddyDeepLink(origin, data.river.path, utmFor(data, options, branding))}
        target="_blank"
        rel="noopener noreferrer"
        className="ew-badge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EDDY_IMAGES.favicon} alt="" width={18} height={18} style={{ width: 18, height: 18, borderRadius: '50%' }} />
        <span className="ew-badge-text">{data.river.name}</span>
        <span className="ew-badge-status ew-chip" style={chipStyle(chip)}>
          <span className="ew-dot" style={{ background: chip.solid }} aria-hidden="true" />
          {chip.label}
        </span>
      </a>
    </EmbedFrame>
  );
}

// ── strip ───────────────────────────────────────────────────────────────────

export function StripRow({ data, options, branding, origin, now, standalone = true }: Props & { standalone?: boolean }) {
  const chip = conditionChip(data.river.conditionCode);
  const reading = headlineReading(data);
  const trend = data.primary?.trend ?? null;
  const age = shortAge(data.primary?.readingTimestamp, now);
  const row = (
    <a
      href={eddyDeepLink(origin, data.river.path, utmFor(data, options, branding))}
      target="_blank"
      rel="noopener noreferrer"
      className="ew-strip"
      aria-label={`${data.river.name}: ${chip.longLabel}${reading.value != null ? `, ${formatReading(reading.value, reading.unit)} ${reading.unit}` : ''}${trend ? `, ${trend}` : ''}`}
    >
      <span className="ew-strip-name">
        <span className="ew-strip-river">{data.river.name}</span>
        {data.primary && <span className="ew-support ew-clip">{data.primary.name}</span>}
      </span>
      <span className="ew-strip-reading">
        {formatReading(reading.value, reading.unit)}
        {reading.value != null && <span className="ew-unit">{reading.unit}</span>}
        {trend && <span className="ew-trend" aria-hidden="true">{TREND_GLYPH[trend]}</span>}
      </span>
      <span className="ew-strip-status ew-chip" style={chipStyle(chip)}>
        {chip.label}
      </span>
      {age && <span className="ew-support ew-strip-age" aria-label={formatObservedAge(data.primary?.readingTimestamp, now)}>{age}</span>}
    </a>
  );
  if (!standalone) return row;
  return (
    <EmbedFrame size="strip" options={options} kind="river" label={`${data.river.name} live conditions`}>
      {row}
    </EmbedFrame>
  );
}

// ── card / full ─────────────────────────────────────────────────────────────

function GaugeRow({ gauge }: { gauge: EmbedGauge }) {
  const chip = conditionChip(gauge.conditionCode);
  const value = gauge.unit === 'cfs' ? gauge.dischargeCfs : gauge.gaugeHeightFt;
  return (
    <li className="ew-row">
      <span className="ew-row-label">{gauge.name}</span>
      <span className="ew-row-value">
        {formatReading(value, gauge.unit)}
        {value != null && <span className="ew-unit">{gauge.unit}</span>}
      </span>
      <span className="ew-strip-status ew-chip" style={chipStyle(chip)}>
        {chip.label}
      </span>
    </li>
  );
}

function weatherLine(weather: NonNullable<RiverEmbedData['weather']>, full: boolean): string | null {
  const parts: string[] = [];
  if (weather.tempF != null) parts.push(`${weather.tempF}°F`);
  else if (weather.highF != null) parts.push(`High ${weather.highF}°F`);
  if (weather.condition) parts.push(weather.condition);
  if (weather.precipitation != null) parts.push(`${weather.precipitation}% rain`);
  if (full && weather.tempF != null && weather.highF != null && weather.lowF != null) parts.push(`H ${weather.highF}° · L ${weather.lowF}°`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function Card(props: Props) {
  const { data, options, branding, origin, now } = props;
  const full = options.size === 'full';
  const primary = data.primary;
  const reading = headlineReading(data);
  const trend = primary?.trend ?? null;
  const take = data.take;
  const takeAgeMs = take?.generatedAt ? now - Date.parse(take.generatedAt) : null;
  const weather = data.weather ? weatherLine(data.weather, full) : null;
  const utm = utmFor(data, options, branding);
  const links = [{ label: 'Full report', path: data.river.path }];
  if (full) links.push({ label: 'Plan a float', path: `/plan?river=${data.river.slug}` });
  const gaugeLine = [
    primary?.name,
    reading.secondary ? `${formatReading(reading.secondary.value, reading.secondary.unit)} ${reading.secondary.unit}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <EmbedFrame size={options.size} options={options} kind="river" label={`${data.river.name} live conditions from Eddy`}>
      <header className="ew-head">
        <EmbedBrandMark branding={branding} eddySrc={getEddyImageForCondition(data.river.conditionCode)} size={44} />
        <div className="ew-head-text">
          <h1 className="ew-title">{data.river.name}</h1>
          {gaugeLine && <p className="ew-support">{gaugeLine}</p>}
        </div>
        <a href={eddyDeepLink(origin, data.river.path, utm)} target="_blank" rel="noopener noreferrer" className="ew-head-status"
          style={{ '--chip-ink-dark': conditionChip(data.river.conditionCode).borderColor } as React.CSSProperties}>
          <ConditionBadge code={data.river.conditionCode} size="md" className="ew-chip" />
        </a>
      </header>

      <div className="ew-reading">
        <span className="ew-reading-value">
          {formatReading(reading.value, reading.unit)}
          {reading.value != null && <span className="ew-unit">{reading.unit}</span>}
        </span>
        {trend && (
          <span className="ew-trend-text"><span aria-hidden="true">{TREND_GLYPH[trend]}</span> {TREND_WORD[trend]}</span>
        )}
        <span className="ew-support ew-reading-age">{formatObservedAge(primary?.readingTimestamp, now)}</span>
      </div>

      {primary && (
        <RangeMeter ladder={primary.ladder} value={reading.value} conditionCode={primary.conditionCode} unit={reading.unit} />
      )}

      {primary?.readingSuspect && primary.qualifierNote && (
        <p role="note" className="ew-note">{primary.qualifierNote}</p>
      )}

      {take && (
        <section className="ew-take" aria-label="Eddy’s take">
          <p className="ew-body">{take.text}</p>
          {take.generatedAt && takeAgeMs != null && takeAgeMs > TAKE_AGE_NOTE_AFTER_MS && (
            <p className="ew-support" style={{ marginTop: 4 }}>Eddy’s take from {shortAge(take.generatedAt, now)} ago</p>
          )}
        </section>
      )}

      {weather && (
        <p className="ew-weather">
          {/* Decorative: the line itself carries the forecast. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={eddyIconUrl('weather')} alt="" width={18} height={18} style={{ width: 18, height: 18 }} />
          <span>{weather}</span>
        </p>
      )}

      {full && data.chart && (
        <EmbedTrendChart
          data={{ readings: data.chart.readings, unit: data.chart.unit, thresholds: data.chart.thresholds }}
          palette={embedVarPalette()}
          periodLabel={`${data.chart.days}-day`}
        />
      )}

      {full && data.secondary.length > 0 && (
        <section aria-labelledby="ew-other-gauges">
          <h2 id="ew-other-gauges" className="ew-section-title">Other gauges</h2>
          <ul className="ew-rows">
            {data.secondary.map((gauge) => <GaugeRow key={gauge.id} gauge={gauge} />)}
          </ul>
        </section>
      )}

      <EmbedCredit
        origin={origin}
        widget={utm.widget}
        widgetKey={data.river.slug}
        links={links}
        partner={options.partner}
        branding={branding}
        embedId={options.embedId}
      />
    </EmbedFrame>
  );
}

export default function RiverEmbed(props: Props) {
  switch (props.options.size) {
    case 'badge':
      return <Badge {...props} />;
    case 'strip':
      return <StripRow {...props} />;
    default:
      return <Card {...props} />;
  }
}

/** Several rivers as stacked rows — the regional / multi-river overview. */
export function RiverStack({
  rivers,
  options,
  branding,
  origin,
  now,
  title = 'River conditions',
}: {
  rivers: RiverEmbedData[];
  options: EmbedOptions;
  branding: EmbedBrandingRecord | null;
  origin: string;
  now: number;
  title?: string;
}) {
  const key = rivers[0]?.river.slug ?? 'all';
  const utm = { widget: 'rivers', key, partner: branding?.businessName || options.embedId || options.partner || undefined };
  return (
    <EmbedFrame size="card" options={options} kind="river" label={`${title} from Eddy`}>
      <header className="ew-head">
        <EmbedBrandMark branding={branding} eddySrc={EDDY_IMAGES.favicon} size={36} />
        <div className="ew-head-text">
          <h1 className="ew-title">{title}</h1>
        </div>
      </header>
      <div className="ew-stack">
        {rivers.map((data) => (
          <StripRow key={data.river.slug} data={data} options={{ ...options, size: 'strip' }} branding={branding} origin={origin} now={now} standalone={false} />
        ))}
      </div>
      <EmbedCredit
        origin={origin}
        widget={utm.widget}
        widgetKey={key}
        links={[{ label: 'All river reports', path: '/rivers' }]}
        partner={options.partner}
        branding={branding}
        embedId={options.embedId}
      />
    </EmbedFrame>
  );
}
