// src/components/embed/v2/DamEmbed.tsx
// The dam widget — the web twin of the iOS "Dam generation" Home Screen
// widget (eddy-ios/modules/eddy-live-activity/widget/EddyReportWidgets.swift).
//
// It draws the SAME packet the phone draws: shared/dam-widget.ts assembles
// observed turbine flow, the generation state, the next-change sentence and
// today's 24 hour-ending schedule bars, and both renderers read that. The
// rules that matter to a wading angler live there and in
// shared/dam-generation.ts, not here:
//   - a missing hour is hollow, never a zero bar;
//   - a minimum-flow hour is a low baseline, never a generation bar;
//   - a schedule Eddy checked more than 90 minutes ago stops promising a
//     next transition, and says so visibly;
//   - a reading older than the lagging window loses the present tense.
//
// The card reads: dam → status and turbine flow → next scheduled change →
// today's timeline → footer. Status appears once. Megawatts, sources, the
// schedule's check time and the time zone note live in one "About this data"
// disclosure: an info popover would clip at the iframe edge, a disclosure
// expands in place and the host iframe resizes to fit it.
//
// Colors: generation ink and bars use --ew-data (Eddy teal), never the
// partner accent — a schedule bar in a host's brand red would read as alarm.

import { damWidgetSnapshot } from '@shared/dam-widget';
import { buildTailwaterStatus } from '@shared/tailwater-status';
import { relativeAge, scheduleDayLabel } from '@shared/dam-schedule-copy';
import { eddyIconUrl } from '@/components/ui/EddyIcon';
import { EDDY_IMAGES } from '@/constants';
import { eddyDeepLink } from '@/lib/embed/branding';
import type { EmbedBrandingRecord } from '@/lib/embed/cards';
import { formatObservedAge, impressionType, shortAge, type EmbedOptions } from '@/lib/embed/options';
import type { DamEmbedData } from '@/lib/embed/dam-data';
import EmbedBrandMark from './EmbedBrandMark';
import EmbedCredit from './EmbedCredit';
import EmbedFrame from './EmbedFrame';

type Packet = ReturnType<typeof damWidgetSnapshot>;
type Moment = Packet['entries'][number];
type ScheduleDay = Packet['scheduleDays'][number];

interface Props {
  data: DamEmbedData;
  options: EmbedOptions;
  branding: EmbedBrandingRecord | null;
  origin: string;
  now: number;
}

const SOURCE_NAMES: Record<string, string> = {
  'USACE CWMS': 'U.S. Army Corps of Engineers',
  SWPA: 'Southwestern Power Administration',
};

/** The iOS widget's compactStatus, verbatim. */
function compactStatus(moment: Moment): string {
  if (!moment.current) return moment.turbineCfs == null ? 'Unavailable' : 'Older reading';
  if (moment.generationKind === 'generating') return 'Generating';
  if (moment.generationKind === 'not-generating') return moment.minimumFlow ? 'Minimum flow' : 'No generation';
  return moment.status;
}

function statusTone(moment: Moment): 'on' | 'off' | 'min' | 'unknown' {
  if (!moment.current) return 'unknown';
  if (moment.generationKind === 'generating') return 'on';
  if (moment.generationKind === 'not-generating') return moment.minimumFlow ? 'min' : 'off';
  return 'unknown';
}

function BoltGlyph({ tone }: { tone: ReturnType<typeof statusTone> }) {
  // Inline SVG so the widget stays dependency-light inside a third-party iframe.
  if (tone === 'on') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
      </svg>
    );
  }
  if (tone === 'min') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.7 6.5 10a6.5 6.5 0 1 0 11 0L12 2.7z" />
      </svg>
    );
  }
  if (tone === 'off') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
        <path d="M2 2l20 20" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" />
    </svg>
  );
}

function isGenerating(hour: ScheduleDay['hours'][number]): boolean {
  return (hour.megawatts ?? 0) > 0 && hour.minimumFlow !== true;
}

function schedulePeak(day: ScheduleDay): number {
  return Math.max(0, ...day.hours.filter(isGenerating).map((h) => h.megawatts ?? 0));
}

/** A posted day as 24 bars — the iOS DamScheduleChart in HTML. */
export function ScheduleBars({ day, currentHour, compact = false, label }: {
  day: ScheduleDay;
  currentHour: number | null;
  compact?: boolean;
  label: string;
}) {
  const peak = schedulePeak(day);
  const minimumFlowOnly = peak === 0 && day.hours.some((h) => h.minimumFlow === true);
  const height = compact ? 28 : 40;
  // Only a day with nothing to draw earns a word beside the label.
  const note = minimumFlowOnly ? 'Minimum flow only' : peak === 0 ? 'No generation scheduled' : null;
  return (
    <div className="ew-sched" role="img" aria-label={`${label}: posted generation schedule, Central Time, subject to change.${note ? ` ${note}.` : ''}`}>
      <div className="ew-sched-head">
        <span className="ew-section-title">{label}</span>
        {note && <span className="ew-support">{note}</span>}
      </div>
      <div className="ew-sched-bars" style={{ height: height + 8 }}>
        {day.hours.map((hour) => {
          const selected = hour.hourEnding === currentHour;
          const on = isGenerating(hour);
          const barHeight = hour.megawatts == null ? height : on ? Math.max(5, (height * (hour.megawatts ?? 0)) / Math.max(peak, 1)) : 3;
          const title = `${hour.label}: ${hour.megawatts == null ? 'schedule unavailable' : hour.minimumFlow ? 'minimum flow' : on ? `${Math.round(hour.megawatts ?? 0)} MW` : 'no generation'}${selected ? ' (now)' : ''}`;
          return (
            <span key={hour.hourEnding} className="ew-sched-slot" title={title}>
              {selected && <span className="ew-sched-now" aria-hidden="true" />}
              <span
                className={`ew-sched-bar${hour.megawatts == null ? ' ew-sched-bar-missing' : on ? ' ew-sched-bar-on' : ' ew-sched-bar-idle'}`}
                style={{ height: barHeight }}
              />
            </span>
          );
        })}
      </div>
      <div className="ew-sched-axis" aria-hidden="true">
        <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span>
      </div>
    </div>
  );
}

function pickToday(packet: Packet, moment: Moment): ScheduleDay | null {
  if (!moment.scheduleDate) return null;
  return packet.scheduleDays.find((d) => d.date === moment.scheduleDate) ?? null;
}

function utmFor(data: DamEmbedData, options: EmbedOptions, branding: EmbedBrandingRecord | null) {
  return {
    widget: impressionType('dam', options.size),
    key: data.dam.id,
    partner: branding?.businessName || options.embedId || options.partner || undefined,
  };
}

function observedIso(moment: Moment): string | null {
  return moment.observedAt != null ? new Date(moment.observedAt).toISOString() : null;
}

/** The next-change sentence, or the visible stale notice that replaces it. */
function nextChange(moment: Moment): { text: string; stale: boolean } {
  if (moment.scheduleCurrent) return { text: moment.scheduleSummary, stale: false };
  return {
    text: moment.scheduleSummary.replace('Open Eddy to check the latest schedule.', 'The schedule may have changed. Check the full report.'),
    stale: true,
  };
}

function locationLine(dam: DamEmbedData['dam']): string {
  return dam.lakeName ? `${dam.lakeName}, ${dam.state}` : dam.state;
}

// ── badge / strip ───────────────────────────────────────────────────────────

function Badge({ data, options, branding, origin, now }: Props) {
  const moment = damWidgetSnapshot(data.dam, now).entries[0];
  const tone = statusTone(moment);
  const status = compactStatus(moment);
  return (
    <EmbedFrame size="badge" options={options} kind="dam" label={`${data.dam.name}: ${status}`}>
      <a href={eddyDeepLink(origin, `/dams/${data.dam.id}`, utmFor(data, options, branding))} target="_blank" rel="noopener noreferrer" className="ew-badge">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={EDDY_IMAGES.favicon} alt="" width={18} height={18} style={{ width: 18, height: 18, borderRadius: '50%' }} />
        <span className="ew-badge-text">{data.dam.name}</span>
        <span className={`ew-badge-status ew-gen ew-gen-${tone}`}>
          <BoltGlyph tone={tone} />
          {status}
        </span>
      </a>
    </EmbedFrame>
  );
}

function Strip({ data, options, branding, origin, now }: Props) {
  const moment = damWidgetSnapshot(data.dam, now).entries[0];
  const tone = statusTone(moment);
  const age = shortAge(observedIso(moment), now);
  const next = nextChange(moment);
  return (
    <EmbedFrame size="strip" options={options} kind="dam" label={`${data.dam.name} generation`}>
      <a href={eddyDeepLink(origin, `/dams/${data.dam.id}`, utmFor(data, options, branding))} target="_blank" rel="noopener noreferrer" className="ew-strip" aria-label={`${data.dam.name}: ${moment.status}. ${next.text}`}>
        <span className="ew-strip-name">
          <span className="ew-strip-river">{data.dam.name}</span>
          <span className={`ew-support ew-clip${next.stale ? ' ew-stale' : ''}`}>{next.text}</span>
        </span>
        <span className="ew-strip-reading">
          {moment.turbineCfs != null ? Math.round(moment.turbineCfs).toLocaleString('en-US') : '—'}
          {moment.turbineCfs != null && <span className="ew-unit">cfs</span>}
        </span>
        <span className={`ew-strip-status ew-gen-chip ew-gen ew-gen-${tone}`}>
          <BoltGlyph tone={tone} />
          {compactStatus(moment)}
        </span>
        {age && <span className="ew-support ew-strip-age" aria-label={formatObservedAge(observedIso(moment), now)}>{age}</span>}
      </a>
    </EmbedFrame>
  );
}

// ── card / full ─────────────────────────────────────────────────────────────

function Row({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string | null }) {
  return (
    <div className="ew-row ew-row-stacked">
      <dt className="ew-row-label">{label}</dt>
      <dd className="ew-row-value">
        {value}
        {detail && <span className="ew-support ew-row-detail">{detail}</span>}
      </dd>
    </div>
  );
}

function Card(props: Props) {
  const { data, options, branding, origin, now } = props;
  const full = options.size === 'full';
  const dam = data.dam;
  const packet = damWidgetSnapshot(dam, now);
  const moment = packet.entries[0];
  const tone = statusTone(moment);
  const today = pickToday(packet, moment);
  const tomorrow = full && moment.scheduleDate
    ? packet.scheduleDays.find((d) => d.date > moment.scheduleDate!) ?? null
    : null;
  const next = nextChange(moment);
  const tailwater = full ? buildTailwaterStatus(dam, now) : null;
  const pool = full ? dam.metrics.poolElevation ?? null : null;
  const release = full ? dam.metrics.release ?? null : null;
  const utm = utmFor(data, options, branding);
  const links = [{ label: 'Full report', path: `/dams/${dam.id}` }];
  if (full && dam.tailwater?.riverSlug) links.push({ label: 'River below', path: `/rivers/${dam.tailwater.riverSlug}` });
  const peak = today ? schedulePeak(today) : 0;
  const checked = moment.scheduleCheckedAt != null ? relativeAge(new Date(moment.scheduleCheckedAt).toISOString(), now) : null;
  const sources = dam.sources.map((s) => SOURCE_NAMES[s] ?? s);

  return (
    <EmbedFrame size={options.size} options={options} kind="dam" label={`${dam.name} generation from Eddy`}>
      <header className="ew-head">
        <EmbedBrandMark branding={branding} eddySrc={eddyIconUrl('release')} size={40} />
        <div className="ew-head-text">
          <h1 className="ew-title">{dam.name}</h1>
          <p className="ew-support">{locationLine(dam)}</p>
        </div>
      </header>

      <div className="ew-dam-now">
        <span className="ew-section-title">Turbine flow</span>
        <div className="ew-reading">
          <span className={`ew-reading-value${moment.current ? '' : ' ew-dim'}`}>
            {moment.turbineCfs != null ? Math.round(moment.turbineCfs).toLocaleString('en-US') : '—'}
            {moment.turbineCfs != null && <span className="ew-unit">cfs</span>}
          </span>
          <span className="ew-support ew-reading-age">
            {moment.observedAt != null ? formatObservedAge(observedIso(moment), now) : null}
          </span>
        </div>
        <p className={`ew-dam-status ew-gen ew-gen-${tone}`}>
          <BoltGlyph tone={tone} />
          {moment.status}
        </p>
      </div>

      {next.stale ? (
        <p role="note" className="ew-note">{next.text}</p>
      ) : (
        <p className="ew-next">{next.text}</p>
      )}

      {today ? (
        <ScheduleBars day={today} currentHour={moment.scheduleHour ?? null} label="Today · CT" />
      ) : (
        <div className="ew-sched">
          <span className="ew-section-title">Today · CT</span>
          <p className="ew-support">{packet.scheduleDays.length === 0 && moment.scheduleCurrent ? 'Open schedule' : 'No schedule posted for today'}</p>
        </div>
      )}

      {full && (tailwater || release || pool) && (
        <dl className="ew-rows">
          {tailwater && (
            <Row label="Below the dam" value={tailwater.headline} detail={tailwater.supporting.join(' · ') || null} />
          )}
          {release && (
            <Row
              label={release.dailyMean ? 'Total release (daily avg)' : 'Total release'}
              value={<span className="ew-num">{Math.round(release.value).toLocaleString('en-US')} cfs</span>}
              detail={relativeAge(release.at, now)}
            />
          )}
          {pool && (
            <Row
              label="Lake level"
              value={<span className="ew-num">{pool.value.toFixed(1)} {pool.unit}</span>}
              detail={[
                dam.metrics.pctFloodPool ? `${Math.round(dam.metrics.pctFloodPool.value)}% of flood pool` : null,
                relativeAge(pool.at, now),
              ].filter(Boolean).join(' · ') || null}
            />
          )}
        </dl>
      )}

      {full && tomorrow && (
        <ScheduleBars day={tomorrow} currentHour={null} compact label={`${scheduleDayLabel(tomorrow.date)} · CT`} />
      )}

      <details className="ew-about">
        <summary className="ew-link">About this data</summary>
        <ul className="ew-support">
          <li>Turbine flow is observed at the dam{sources.length > 0 ? ` (${sources.join(', ')})` : ''}.</li>
          <li>Schedules are posted in Central time and can change.{checked ? ` Eddy checked this one ${checked}.` : ''}</li>
          {peak > 0 && <li>Today’s scheduled peak is {Math.round(peak).toLocaleString('en-US')} MW.</li>}
        </ul>
      </details>

      <EmbedCredit
        origin={origin}
        widget={utm.widget}
        widgetKey={dam.id}
        links={links}
        partner={options.partner}
        branding={branding}
        embedId={options.embedId}
      />
    </EmbedFrame>
  );
}

export default function DamEmbed(props: Props) {
  switch (props.options.size) {
    case 'badge':
      return <Badge {...props} />;
    case 'strip':
      return <Strip {...props} />;
    default:
      return <Card {...props} />;
  }
}
