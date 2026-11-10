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
// The card reads: dam → observed flow with status and age → posted schedule
// and a visible current-time marker → dated downstream measures → footer.
// Status appears once; observed flow and the posted plan are never conflated. Megawatts, sources, the
// schedule's check time and the time zone note live in one "About this data"
// disclosure: an info popover would clip at the iframe edge, a disclosure
// expands in place and the host iframe resizes to fit it.
//
// Colors: generation ink and bars use --ew-data (Eddy teal), never the
// partner accent — a schedule bar in a host's brand red would read as alarm.

import { damWidgetSnapshot } from '@shared/dam-widget';
import { spillwayRelease, spillwayReleaseLabel } from '@shared/dam-generation';
import { readingStaleness, relativeAge, scheduleDayLabel, tailwaterMovementLabel } from '@shared/dam-schedule-copy';
import { EddyIcon, eddyIconUrl } from '@/components/ui/EddyIcon';
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
export function ScheduleBars({ day, currentHour, compact = false, label, hideVisualLabel = false }: {
  day: ScheduleDay;
  currentHour: number | null;
  compact?: boolean;
  label: string;
  /** Today's date is displayed above the next-change sentence, not again above the bars. */
  hideVisualLabel?: boolean;
}) {
  const peak = schedulePeak(day);
  const minimumFlowOnly = peak === 0 && day.hours.some((h) => h.minimumFlow === true);
  const missingHours = day.hours.filter((h) => h.megawatts == null).length;
  const height = compact ? 42 : 72;
  // Incomplete source hours must never read as confirmed idle generation.
  const note = missingHours === 24 ? 'Schedule unavailable'
    : missingHours > 0 ? 'Some hours unavailable'
    : minimumFlowOnly ? 'Minimum flow only'
    : peak === 0 ? 'No generation scheduled'
    : null;
  return (
    <div className="ew-sched" role="img" aria-label={`${label}: posted hourly generation schedule in MW, Central Time, subject to change. Outlined bars are missing hours.${currentHour != null ? ' The Now marker shows the current hour, not measured flow.' : ''}${note ? ` ${note}.` : ''}`}>
      <div className={`ew-sched-head${hideVisualLabel ? ' ew-sched-head-quiet' : ''}`}>
        {!hideVisualLabel && <span className="ew-section-title">{label}</span>}
        <span className="ew-support">{note ?? (peak > 0 ? 'Peak ' + Math.round(peak).toLocaleString('en-US') + ' MW' : 'Hourly plan · MW')}</span>
      </div>
      <div className="ew-sched-bars" style={{ height: height + 18 }}>
        {day.hours.map((hour) => {
          const selected = hour.hourEnding === currentHour;
          const on = isGenerating(hour);
          const barHeight = hour.megawatts == null ? 12 : on ? Math.max(5, (height * (hour.megawatts ?? 0)) / Math.max(peak, 1)) : hour.minimumFlow ? 5 : 3;
          const title = `${hour.label}: ${hour.megawatts == null ? 'schedule unavailable' : hour.minimumFlow ? 'minimum flow' : on ? `${Math.round(hour.megawatts ?? 0)} MW` : 'no generation'}${selected ? ' (now)' : ''}`;
          return (
            <span key={hour.hourEnding} className="ew-sched-slot" title={title}>
              {selected && <span className="ew-sched-now" aria-hidden="true" />}
              <span
                className={`ew-sched-bar${hour.megawatts == null ? ' ew-sched-bar-missing' : on ? ' ew-sched-bar-on' : hour.minimumFlow ? ' ew-sched-bar-min' : ' ew-sched-bar-idle'}`}
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
      <a href={eddyDeepLink(origin, `/dams/${data.dam.id}`, utmFor(data, options, branding))} target="_blank" rel="noopener noreferrer" className="ew-strip" aria-label={`${data.dam.name}. Observed turbine flow ${moment.turbineCfs != null ? `${Math.round(moment.turbineCfs).toLocaleString("en-US")} cfs` : "unavailable"}. ${moment.current ? compactStatus(moment) : moment.status}. ${formatObservedAge(observedIso(moment), now)}. Posted schedule: ${next.text}`}>
        <span className="ew-strip-name">
          <span className="ew-strip-river">{data.dam.name}</span>
          <span className={`ew-support ew-clip${next.stale ? ' ew-stale' : ''}`}>Schedule · {next.text}</span>
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
  // Downstream changes come only from the dam's own dated stage series.
  // Do not infer movement from turbine flow or classify wading/float safety.
  const downstream = full ? dam.metrics.tailwaterElevation ?? null : null;
  const waterTemp = full ? dam.metrics.tailwaterTempF ?? null : null;
  const downstreamAge = downstream ? readingStaleness(downstream.at, now) : null;
  const downstreamChange = downstream && downstreamAge === 'fresh'
    ? tailwaterMovementLabel(downstream.trend)
    : null;
  const downstreamDirection = downstreamChange && downstream?.trend
    ? downstream.trend.delta > 0 ? 'Rising' : 'Falling'
    : null;
  const spillway = full ? spillwayRelease(dam, now) : null;
  const pool = full ? dam.metrics.poolElevation ?? null : null;
  const poolAge = pool ? readingStaleness(pool.at, now) : null;
  const tempAge = waterTemp ? readingStaleness(waterTemp.at, now) : null;
  const release = full ? dam.metrics.release ?? null : null;
  const utm = utmFor(data, options, branding);
  const links = [{ label: 'View full report', path: `/dams/${dam.id}` }];
  if (full && data.riverPath) links.push({ label: 'River below', path: data.riverPath });
  const checked = moment.scheduleCheckedAt != null ? relativeAge(new Date(moment.scheduleCheckedAt).toISOString(), now) : null;
  const sources = dam.sources.map((s) => SOURCE_NAMES[s] ?? s);
  // Only collapse identical, near-simultaneous spot readings. Daily averages,
  // older measurements and spillway releases remain distinct facts.
  const releaseDuplicatesTurbine = Boolean(
    release && !release.dailyMean && !spillway && moment.turbineCfs != null && moment.observedAt != null
    && Math.abs(Math.round(release.value) - Math.round(moment.turbineCfs)) <= 1
    && Number.isFinite(Date.parse(release.at))
    && Math.abs(Date.parse(release.at) - moment.observedAt) <= 15 * 60_000
  );

  return (
    <EmbedFrame size={options.size} options={options} kind="dam" label={`${dam.name} generation from Eddy`}>
      <header className="ew-head">
        <EmbedBrandMark branding={branding} eddySrc={eddyIconUrl('release')} size={40} />
        <div className="ew-head-text">
          <h1 className="ew-title">{dam.name}</h1>
          <p className="ew-support">{locationLine(dam)}</p>
        </div>
        <time
          className="ew-dam-header-age"
          dateTime={observedIso(moment) ?? undefined}
          title="Turbine flow observation; other measurements may have different timestamps"
        >
          {moment.observedAt != null ? formatObservedAge(observedIso(moment), now) : 'Observation unavailable'}
        </time>
      </header>

      <div className="ew-dam-now">
        <div className="ew-dam-live">
          <div className="ew-dam-flow">
            <span className="ew-section-title">Turbine flow</span>
            <div className="ew-reading">
              <span className={'ew-reading-value' + (moment.current ? '' : ' ew-dim')}>
                {moment.turbineCfs != null ? Math.round(moment.turbineCfs).toLocaleString('en-US') : '—'}
                {moment.turbineCfs != null && <span className="ew-unit">cfs</span>}
              </span>
            </div>
          </div>
          <div className="ew-dam-state">
            <p className={'ew-dam-status ew-gen ew-gen-' + tone}>
              <BoltGlyph tone={tone} />
              {moment.current ? compactStatus(moment) : moment.status}
            </p>
          </div>
        </div>
      </div>

      <div className="ew-dam-schedule-intro">
        <time className="ew-section-title ew-dam-schedule-date" dateTime={moment.scheduleDate}>
          {scheduleDayLabel(moment.scheduleDate)} · CT
        </time>
        {packet.scheduleDays.length > 0 ? (
          next.stale ? (
            <p role="note" className="ew-note">{next.text}</p>
          ) : (
            <p className="ew-next">{next.text}</p>
          )
        ) : (
          <p className="ew-support">Today&apos;s generation schedule is unavailable.</p>
        )}
      </div>

      {today && (
        <ScheduleBars
          day={today}
          currentHour={moment.scheduleHour ?? null}
          label={`${scheduleDayLabel(today.date)} · CT`}
          hideVisualLabel
        />
      )}

      {full && (downstream || pool || waterTemp) && (
        <div className="ew-dam-details" role="group" aria-label="Dam and downstream measurements">
          {downstream && Number.isFinite(downstream.value) && (
            <section className="ew-dam-detail" aria-label="Below the dam">
              <div className="ew-dam-detail-heading">
                <EddyIcon name="gauge" size={28} />
                <h2 className="ew-dam-detail-title">Below the dam</h2>
              </div>
              {downstreamAge === 'stale' || downstreamAge === null ? (
                <p className="ew-support">No recent downstream level reading</p>
              ) : (
                <>
                  {downstreamChange && downstreamDirection ? (
                    <>
                      <div className="ew-dam-detail-figure">
                        <strong className={`ew-dam-detail-value ${downstreamDirection === 'Rising' ? 'ew-dam-value-rising' : 'ew-dam-value-falling'}`}>
                          {downstreamChange.split(' over ')[0]}
                        </strong>
                        <span className="ew-support">over {downstreamChange.split(' over ')[1]}</span>
                      </div>
                      <p className={`ew-dam-movement ew-dam-movement-${downstreamDirection.toLowerCase()}`}>
                        <span aria-hidden="true">{downstreamDirection === 'Rising' ? '↗' : '↘'}</span>
                        {downstreamDirection}
                      </p>
                      <p className="ew-support">Water elevation {downstream.value.toFixed(1)} {downstream.unit}</p>
                    </>
                  ) : (
                    <>
                      <strong className="ew-dam-detail-value">{downstream.value.toFixed(1)} {downstream.unit}</strong>
                      <p className="ew-support">{downstreamAge === 'lagging' ? 'Older reading · ' : ''}Water elevation</p>
                    </>
                  )}
                </>
              )}
            </section>
          )}
          {pool && Number.isFinite(pool.value) && (
            <section className="ew-dam-detail" aria-label="Lake level" title={formatObservedAge(pool.at, now)}>
              <div className="ew-dam-detail-heading">
                <EddyIcon name="damGauge" size={28} />
                <h2 className="ew-dam-detail-title">Lake level</h2>
              </div>
              {poolAge === 'stale' || poolAge === null ? (
                <p className="ew-support">No recent lake level reading</p>
              ) : (
                <>
                  <strong className="ew-dam-detail-value ew-dam-value-lake">
                    {pool.value.toFixed(1)} <span className="ew-dam-detail-unit">{pool.unit}</span>
                  </strong>
                  <p className="ew-support">{poolAge === 'lagging' ? 'Older reading · ' : ''}Lake elevation</p>
                </>
              )}
            </section>
          )}
          {waterTemp && Number.isFinite(waterTemp.value) && (
            <section className="ew-dam-detail" aria-label="Water temperature below the dam" title={formatObservedAge(waterTemp.at, now)}>
              <div className="ew-dam-detail-heading">
                <EddyIcon name="waterTemperature" size={28} />
                <h2 className="ew-dam-detail-title">Water temperature</h2>
              </div>
              {tempAge === 'stale' || tempAge === null ? (
                <p className="ew-support">No recent temperature reading</p>
              ) : (
                <>
                  <strong className="ew-dam-detail-value ew-dam-value-temperature">
                    {waterTemp.value.toFixed(1)} <span className="ew-dam-detail-unit">°F</span>
                  </strong>
                  <p className="ew-support">{tempAge === 'lagging' ? 'Older reading · ' : ''}Below the dam</p>
                </>
              )}
            </section>
          )}
        </div>
      )}

      {full && spillway && (
        <p className="ew-dam-spill" title={formatObservedAge(spillway.observedAt, now)}>
          <strong>{spillwayReleaseLabel(spillway)}</strong>
        </p>
      )}

      {full && release && !releaseDuplicatesTurbine && (
        <div className="ew-dam-additional" title={formatObservedAge(release.at, now)}>
          <span className="ew-section-title">{release.dailyMean ? 'Total release · daily average' : 'Total release'}</span>
          <strong className="ew-dam-additional-value">{Math.round(release.value).toLocaleString('en-US')} cfs</strong>
          {readingStaleness(release.at, now) !== 'fresh' && <span className="ew-support">Older reading</span>}
        </div>
      )}

      {full && tomorrow && (
        <ScheduleBars day={tomorrow} currentHour={null} compact label={`${scheduleDayLabel(tomorrow.date)} · CT`} />
      )}

      <details className="ew-about">
        <summary className="ew-link">About this data</summary>
        <ul className="ew-support">
          <li>Turbine flow is measured at the dam{sources.length > 0 ? ` (${sources.join(', ')})` : ''}. The header age applies to turbine flow only; downstream, lake and temperature measurements have independent timestamps.</li>
          {downstream && <li>Downstream level: {formatObservedAge(downstream.at, now)}.</li>}
          {pool && <li>Lake level: {formatObservedAge(pool.at, now)}.</li>}
          {waterTemp && <li>Water temperature below the dam: {formatObservedAge(waterTemp.at, now)}.</li>}
          {release && !releaseDuplicatesTurbine && <li>Total release: {formatObservedAge(release.at, now)}.</li>}
          {spillway && <li>Spillway release: {formatObservedAge(spillway.observedAt, now)}.</li>}
          <li>Hourly bars show posted power generation in MW, not measured river flow. The schedule may differ from observed turbine flow. Schedules are in Central time and can change.{checked ? ` Eddy checked this one ${checked}.` : ''}</li>
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
