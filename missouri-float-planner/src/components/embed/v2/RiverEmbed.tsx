// src/components/embed/v2/RiverEmbed.tsx
// The river widget, in four sizes. Server component: the page hands it the
// assembled data and it returns finished HTML — no fetch waterfall, no
// skeleton, no client state except the partner-logo fallback and the chart.
//
// What each size leads with is the same fact: the live condition and the
// reading IN THE UNIT THE RIVER IS RATED IN. The other unit is context.
// One mascot, one observation time, one call to action.

import { conditionChip } from '@shared/condition-system';
import { getEddyImageForCondition, EDDY_IMAGES } from '@/constants';
import { eddyIconUrl } from '@/components/ui/EddyIcon';
import ConditionBadge from '@/components/ui/ConditionBadge';
import EmbedTrendChart from '@/components/embed/EmbedTrendChart';
import { eddyDeepLink } from '@/lib/embed/branding';
import type { EmbedBrandingRecord } from '@/lib/embed/cards';
import { embedVarPalette, EMBED_FONTS } from '@/lib/embed/theme';
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
        <span className="ew-badge-status" style={{ color: chip.color, background: chip.background, borderColor: chip.borderColor }}>
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
      className={`ew-strip${standalone ? '' : ' ew-strip-in-stack'}`}
      aria-label={`${data.river.name}: ${chip.longLabel}${reading.value != null ? `, ${formatReading(reading.value, reading.unit)} ${reading.unit}` : ''}`}
    >
      <span className="ew-dot ew-dot-lg" style={{ background: chip.solid }} aria-hidden="true" />
      <span className="ew-strip-name">
        <span className="ew-strip-river" style={{ fontFamily: EMBED_FONTS.display }}>{data.river.name}</span>
        {data.primary && <span className="ew-strip-station">{data.primary.name}</span>}
      </span>
      <span className="ew-strip-reading" style={{ fontFamily: EMBED_FONTS.mono }}>
        {formatReading(reading.value, reading.unit)}
        <span className="ew-unit">{reading.value != null ? reading.unit : ''}</span>
        {trend && <span className="ew-trend" aria-label={trend}>{TREND_GLYPH[trend]}</span>}
      </span>
      <span className="ew-strip-status" style={{ color: chip.color, background: chip.background, borderColor: chip.borderColor }}>
        {chip.label}
      </span>
      {age && <span className="ew-strip-age" aria-label={formatObservedAge(data.primary?.readingTimestamp, now)}>{age}</span>}
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

function SecondaryGauge({ gauge }: { gauge: EmbedGauge }) {
  const chip = conditionChip(gauge.conditionCode);
  const value = gauge.unit === 'cfs' ? gauge.dischargeCfs : gauge.gaugeHeightFt;
  return (
    <li className="ew-gauge-row">
      <span className="ew-dot" style={{ background: chip.solid }} aria-hidden="true" />
      <span className="ew-gauge-name">{gauge.name}</span>
      <span className="ew-gauge-value" style={{ fontFamily: EMBED_FONTS.mono }}>
        {formatReading(value, gauge.unit)}
        <span className="ew-unit">{value != null ? gauge.unit : ''}</span>
      </span>
      <span className="ew-strip-status" style={{ color: chip.color, background: chip.background, borderColor: chip.borderColor }}>
        {chip.label}
      </span>
    </li>
  );
}

function Card(props: Props) {
  const { data, options, branding, origin, now } = props;
  const full = options.size === 'full';
  const primary = data.primary;
  const reading = headlineReading(data);
  const chip = conditionChip(data.river.conditionCode);
  const trend = primary?.trend ?? null;
  const take = data.take;
  const takeAgeMs = take?.generatedAt ? now - Date.parse(take.generatedAt) : null;
  const showTakeAge = takeAgeMs != null && takeAgeMs > TAKE_AGE_NOTE_AFTER_MS;
  const weather = data.weather;
  const utm = utmFor(data, options, branding);
  const links = [{ label: 'Full river report', path: data.river.path }];
  if (full) links.push({ label: 'Plan a float', path: `/plan?river=${data.river.slug}` });

  return (
    <EmbedFrame size={options.size} options={options} kind="river" label={`${data.river.name} live conditions from Eddy`}>
      {/* Identity: one mascot, in the live condition's mood, or the partner's mark. */}
      <header className="ew-head">
        <EmbedBrandMark branding={branding} eddySrc={getEddyImageForCondition(data.river.conditionCode)} size={40} />
        <div className="ew-head-text">
          <h1 className="ew-title" style={{ fontFamily: EMBED_FONTS.display }}>{data.river.name}</h1>
          <p className="ew-subtitle">
            Live conditions{primary ? ` · ${primary.name}` : ''}
          </p>
        </div>
        <a href={eddyDeepLink(origin, data.river.path, utm)} target="_blank" rel="noopener noreferrer" className="ew-head-badge" aria-label={`${chip.longLabel}. Open the full ${data.river.name} report.`}>
          <ConditionBadge code={data.river.conditionCode} size="md" />
        </a>
      </header>

      {/* The reading, in the river's own unit, with the one timestamp that belongs to it. */}
      <div className="ew-reading">
        <div className="ew-reading-main">
          <span className="ew-reading-value" style={{ fontFamily: EMBED_FONTS.mono }}>
            {formatReading(reading.value, reading.unit)}
            {reading.value != null && <span className="ew-unit">{reading.unit}</span>}
          </span>
          {trend && (
            <span className="ew-trend-pill" style={{ color: chip.color, background: chip.background, borderColor: chip.borderColor }}>
              <span aria-hidden="true">{TREND_GLYPH[trend]}</span> {trend}
            </span>
          )}
          <span className="ew-reading-age">{formatObservedAge(primary?.readingTimestamp, now)}</span>
        </div>
        {reading.secondary && (
          <p className="ew-reading-secondary">
            {formatReading(reading.secondary.value, reading.secondary.unit)} {reading.secondary.unit} at the gauge
          </p>
        )}
        {primary && (
          <RangeMeter ladder={primary.ladder} value={reading.value} conditionCode={primary.conditionCode} unit={reading.unit} />
        )}
      </div>

      {primary?.readingSuspect && primary.qualifierNote && (
        <p role="note" className="ew-note">{primary.qualifierNote}</p>
      )}

      {take && (
        <section className="ew-take" aria-labelledby="ew-take-heading">
          <h2 id="ew-take-heading" className="ew-kicker">
            Eddy’s take
            {showTakeAge && takeAgeMs != null && (
              <span className="ew-kicker-note"> · from {shortAge(take.generatedAt, now)} ago</span>
            )}
          </h2>
          <p className="ew-take-text">{take.text}</p>
        </section>
      )}

      {weather && (weather.tempF != null || weather.highF != null) && (
        <p className="ew-weather">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={eddyIconUrl('weather')} alt="" width={18} height={18} style={{ width: 18, height: 18 }} />
          <span>
            {weather.tempF != null ? `${weather.tempF}°F` : weather.highF != null ? `High ${weather.highF}°F` : ''}
            {weather.condition ? ` · ${weather.condition}` : ''}
            {weather.precipitation != null ? ` · ${weather.precipitation}% rain` : ''}
            {weather.tempF != null && weather.highF != null && weather.lowF != null ? ` · H ${weather.highF}° L ${weather.lowF}°` : ''}
          </span>
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
        <section aria-label="Other gauges on this river">
          <h2 className="ew-kicker">Other gauges</h2>
          <ul className="ew-gauge-list">
            {data.secondary.map((gauge) => <SecondaryGauge key={gauge.id} gauge={gauge} />)}
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

/** Several rivers as stacked strips — the regional / multi-river overview. */
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
        <EmbedBrandMark branding={branding} eddySrc={EDDY_IMAGES.favicon} size={32} />
        <div className="ew-head-text">
          <h1 className="ew-title" style={{ fontFamily: EMBED_FONTS.display }}>{title}</h1>
          <p className="ew-subtitle">Live status for {rivers.length} {rivers.length === 1 ? 'river' : 'rivers'}</p>
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
