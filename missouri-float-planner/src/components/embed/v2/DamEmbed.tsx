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
//     next transition;
//   - a reading older than the lagging window loses the present tense.
//
// Who this is for: fly shops, trout guides, marinas and lake resorts below
// Bull Shoals, Norfork, Table Rock, Greers Ferry, Beaver and the rest — pages
// whose first question is "is it generating, how much, and when does it stop".

import { damWidgetSnapshot } from '@shared/dam-widget';
import { buildTailwaterStatus } from '@shared/tailwater-status';
import { relativeAge, scheduleDayLabel } from '@shared/dam-schedule-copy';
import { eddyIconUrl } from '@/components/ui/EddyIcon';
import { EDDY_IMAGES } from '@/constants';
import { eddyDeepLink } from '@/lib/embed/branding';
import type { EmbedBrandingRecord } from '@/lib/embed/cards';
import { EMBED_FONTS } from '@/lib/embed/theme';
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

/** Today's posted schedule as 24 bars — the iOS DamScheduleChart in HTML. */
export function ScheduleBars({ day, currentHour, compact = false, label = 'Schedule · CT' }: {
  day: ScheduleDay;
  currentHour: number | null;
  compact?: boolean;
  label?: string;
}) {
  const generating = (h: ScheduleDay['hours'][number]) => (h.megawatts ?? 0) > 0 && h.minimumFlow !== true;
  const peak = Math.max(0, ...day.hours.filter(generating).map((h) => h.megawatts ?? 0));
  const minimumFlowOnly = peak === 0 && day.hours.some((h) => h.minimumFlow === true);
  const height = compact ? 30 : 42;
  return (
    <div className="ew-sched" role="img" aria-label={`${label}: today's posted generation schedule, Central Time, subject to change${peak > 0 ? `, peak ${Math.round(peak)} megawatts` : ''}`}>
      <div className="ew-sched-head">
        <span className="ew-kicker" style={{ margin: 0 }}>{label}</span>
        <span className="ew-sched-peak">
          {minimumFlowOnly ? 'Minimum flow' : peak > 0 ? `${Math.round(peak).toLocaleString()} MW peak` : 'No generation posted'}
        </span>
      </div>
      <div className="ew-sched-bars" style={{ height: height + 8 }}>
        {day.hours.map((hour) => {
          const selected = hour.hourEnding === currentHour;
          const isGen = generating(hour);
          const barHeight = hour.megawatts == null
            ? height
            : isGen ? Math.max(5, (height * (hour.megawatts ?? 0)) / Math.max(peak, 1)) : 3;
          const title = `${hour.label}: ${hour.megawatts == null ? 'schedule unavailable' : hour.minimumFlow ? 'minimum flow' : `${Math.round(hour.megawatts)} MW`}${selected ? ' (now)' : ''}`;
          return (
            <span key={hour.hourEnding} className={`ew-sched-slot${selected ? ' ew-sched-slot-now' : ''}`} title={title}>
              {selected && <span className="ew-sched-now" aria-hidden="true" />}
              <span
                className={`ew-sched-bar${hour.megawatts == null ? ' ew-sched-bar-missing' : isGen ? ' ew-sched-bar-on' : ' ew-sched-bar-idle'}`}
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

// ── badge / strip ───────────────────────────────────────────────────────────

function Badge({ data, options, branding, origin, now }: Props) {
  const packet = damWidgetSnapshot(data.dam, now);
  const moment = packet.entries[0];
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
  const packet = damWidgetSnapshot(data.dam, now);
  const moment = packet.entries[0];
  const tone = statusTone(moment);
  const age = shortAge(observedIso(moment), now);
  return (
    <EmbedFrame size="strip" options={options} kind="dam" label={`${data.dam.name} generation`}>
      <a href={eddyDeepLink(origin, `/dams/${data.dam.id}`, utmFor(data, options, branding))} target="_blank" rel="noopener noreferrer" className="ew-strip" aria-label={`${data.dam.name}: ${moment.status}`}>
        <span className={`ew-gen ew-gen-${tone}`} style={{ display: 'inline-flex' }}><BoltGlyph tone={tone} /></span>
        <span className="ew-strip-name">
          <span className="ew-strip-river" style={{ fontFamily: EMBED_FONTS.display }}>{data.dam.name}</span>
          <span className="ew-strip-station">{moment.scheduleSummary}</span>
        </span>
        <span className="ew-strip-reading" style={{ fontFamily: EMBED_FONTS.mono }}>
          {moment.turbineCfs != null ? Math.round(moment.turbineCfs).toLocaleString() : '—'}
          <span className="ew-unit">{moment.turbineCfs != null ? 'cfs' : ''}</span>
        </span>
        <span className={`ew-strip-status ew-gen ew-gen-${tone}`}>{compactStatus(moment)}</span>
        {age && <span className="ew-strip-age" aria-label={formatObservedAge(observedIso(moment), now)}>{age}</span>}
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
  const tailwater = full ? buildTailwaterStatus(dam, now) : null;
  const pool = full ? dam.metrics.poolElevation ?? null : null;
  const release = full ? dam.metrics.release ?? null : null;
  const utm = utmFor(data, options, branding);
  const links = [{ label: 'Full dam report', path: `/dams/${dam.id}` }];
  if (full && dam.tailwater?.riverSlug) links.push({ label: 'River below the dam', path: `/rivers/${dam.tailwater.riverSlug}` });

  return (
    <EmbedFrame size={options.size} options={options} kind="dam" label={`${dam.name} generation from Eddy`}>
      <header className="ew-head">
        <EmbedBrandMark branding={branding} eddySrc={eddyIconUrl('release')} size={36} />
        <div className="ew-head-text">
          <h1 className="ew-title" style={{ fontFamily: EMBED_FONTS.display }}>{dam.name}</h1>
          <p className="ew-subtitle">
            {dam.lakeName ? `${dam.lakeName} · ` : ''}{dam.state}
            {data.tailwaterFishery === 'trout' ? ' · Trout tailwater' : ''}
          </p>
        </div>
        <span className={`ew-gen-pill ew-gen ew-gen-${tone}`}>
          <BoltGlyph tone={tone} />
          {compactStatus(moment)}
        </span>
      </header>

      <div className="ew-dam-grid">
        <div className="ew-dam-flow">
          <span className="ew-kicker">Turbine flow</span>
          <span className={`ew-reading-value${moment.current ? '' : ' ew-dim'}`} style={{ fontFamily: EMBED_FONTS.mono }}>
            {moment.turbineCfs != null ? Math.round(moment.turbineCfs).toLocaleString() : '—'}
            {moment.turbineCfs != null && <span className="ew-unit">cfs</span>}
          </span>
          <span className={`ew-dam-status ew-gen ew-gen-${tone}`}>{moment.status}</span>
          <span className="ew-reading-age">
            {moment.observedAt != null ? formatObservedAge(observedIso(moment), now) : 'Release status unavailable'}
          </span>
        </div>
        <div className="ew-dam-sched">
          {today ? (
            <ScheduleBars day={today} currentHour={moment.scheduleHour ?? null} />
          ) : (
            <div className="ew-sched">
              <div className="ew-sched-head"><span className="ew-kicker" style={{ margin: 0 }}>Today’s schedule · CT</span></div>
              <p className="ew-sched-empty">{packet.scheduleDays.length === 0 && moment.scheduleCurrent ? 'Open schedule' : 'Not posted today'}</p>
            </div>
          )}
        </div>
      </div>

      {/* The next-change sentence the phone packs into its status line. */}
      <p className={`ew-next${moment.scheduleCurrent ? '' : ' ew-next-stale'}`}>
        {(moment.scheduleCurrent ? moment.scheduleSummary : moment.scheduleSummary.replace('Open Eddy to check', 'Check the dam report for')).replace(/\.\s*$/, '')}
        {moment.scheduleCheckedAt != null && (
          <span className="ew-next-checked"> · schedule checked {relativeAge(new Date(moment.scheduleCheckedAt).toISOString(), now) ?? 'recently'}</span>
        )}
      </p>

      {full && (tailwater || pool || release) && (
        <dl className="ew-facts">
          {tailwater && (
            <div className="ew-fact">
              <dt>Below the dam</dt>
              <dd>
                {tailwater.headline}
                {tailwater.supporting.map((line) => <span key={line} className="ew-fact-sub">{line}</span>)}
              </dd>
            </div>
          )}
          {release && (
            <div className="ew-fact">
              <dt>{release.dailyMean ? 'Total release (daily avg)' : 'Total release'}</dt>
              <dd>
                <span style={{ fontFamily: EMBED_FONTS.mono }}>{Math.round(release.value).toLocaleString()} cfs</span>
                <span className="ew-fact-sub">{relativeAge(release.at, now) ?? 'time unavailable'}</span>
              </dd>
            </div>
          )}
          {pool && (
            <div className="ew-fact">
              <dt>{dam.lakeName ? `${dam.lakeName} level` : 'Lake level'}</dt>
              <dd>
                <span style={{ fontFamily: EMBED_FONTS.mono }}>{pool.value.toFixed(1)} {pool.unit}</span>
                {dam.metrics.pctFloodPool && (
                  <span className="ew-fact-sub">{Math.round(dam.metrics.pctFloodPool.value)}% of flood pool</span>
                )}
                <span className="ew-fact-sub">{relativeAge(pool.at, now) ?? 'time unavailable'}</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      {full && tomorrow && (
        <ScheduleBars day={tomorrow} currentHour={null} compact label={`${scheduleDayLabel(tomorrow.date)} · CT`} />
      )}

      <p className="ew-fineprint">At the dam · Central time · Schedule may change · {dam.sources.length > 0 ? dam.sources.join(' · ') : 'USACE'}</p>

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
