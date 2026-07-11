'use client';

// Shared primitives for the map chrome — font tokens, the condition/verdict
// chip, the KV + section-label + threshold building blocks, the close button,
// and reading-freshness helpers. Dependency-light so every other chrome
// module (and the rail) can import from here without cycles.

import { STAGE_VERDICTS, THEME } from '@/lib/usgs/mo-statewide-data';
import type { MoForecastEntry } from '@/app/api/usgs/mo-forecast/route';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import { conditionChip } from '@shared/condition-system';

export const MONO = 'var(--font-mono), ui-monospace, monospace';
export const SANS = 'var(--font-body), system-ui, sans-serif';
export const DISPLAY = 'var(--font-display), system-ui, sans-serif';

/** Small uppercase verdict pill in the shared system's approved surface —
 *  tint background + dark ink + mid-tint border. White text on the solid
 *  condition fills fails AA on the light levels (low/good). */
export function VerdictChipSpan({ code, label }: { code: string; label: string }) {
  const chip = conditionChip(code);
  return (
    <span
      style={{
        background: chip.background,
        color: chip.color,
        border: `1px solid ${chip.borderColor}`,
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.1em',
        padding: '1px 6px',
        borderRadius: 3,
        textTransform: 'uppercase',
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

// ─── Threshold provenance + 72h forecast peak block ────────────────────

export function ThresholdProvenance({
  thresholds,
  forecast,
  currentValueFt,
}: {
  thresholds: {
    flood_stage_ft: number | null;
    action_stage_ft: number | null;
    threshold_source: string | null;
    threshold_source_url: string | null;
  };
  forecast: MoForecastEntry | null;
  currentValueFt: number | null;
}) {
  const hasStages = thresholds.flood_stage_ft != null || thresholds.action_stage_ft != null;
  const hasForecast = forecast?.peakFt != null && forecast.peakAt != null;
  if (!hasStages && !hasForecast) return null;

  const sourceLabel = (() => {
    switch (thresholds.threshold_source) {
      case 'usgs': return 'USGS';
      case 'nws_ahps': return 'NWS AHPS';
      case 'outfitter': return 'Outfitter';
      case 'editorial': return 'Editorial';
      default: return null;
    }
  })();

  const peakFlooding =
    forecast?.peakFt != null &&
    thresholds.flood_stage_ft != null &&
    forecast.peakFt >= thresholds.flood_stage_ft;
  const peakAction =
    forecast?.peakFt != null &&
    thresholds.action_stage_ft != null &&
    forecast.peakFt >= thresholds.action_stage_ft &&
    !peakFlooding;
  const liveFlooding =
    currentValueFt != null &&
    thresholds.flood_stage_ft != null &&
    currentValueFt >= thresholds.flood_stage_ft;

  const hazardTone = STAGE_VERDICTS.dangerous.color;
  const cautionTone = STAGE_VERDICTS.high.color;

  return (
    <div
      className="mt-2 rounded-md border-2 px-3 py-2"
      style={{
        background: 'var(--color-secondary-100)',
        borderColor: 'var(--color-neutral-300)',
        fontFamily: MONO,
      }}
    >
      {hasStages && (
        <div
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
          style={{ fontSize: 10.5, color: THEME.ink }}
        >
          {thresholds.flood_stage_ft != null && (
            <span style={{ color: liveFlooding ? hazardTone : THEME.ink, fontWeight: liveFlooding ? 700 : 500 }}>
              Flood {thresholds.flood_stage_ft.toFixed(1)} ft
            </span>
          )}
          {thresholds.action_stage_ft != null && (
            <span>Action {thresholds.action_stage_ft.toFixed(1)} ft</span>
          )}
          {sourceLabel && (
            <span style={{ color: THEME.inkDim, marginLeft: 'auto' }}>
              Source:{' '}
              {thresholds.threshold_source_url ? (
                <a
                  href={thresholds.threshold_source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: THEME.primary, textDecoration: 'underline' }}
                >
                  {sourceLabel}
                </a>
              ) : (
                sourceLabel
              )}
            </span>
          )}
        </div>
      )}
      {hasForecast && (
        <div
          className="mt-1 flex items-baseline gap-2"
          style={{
            fontSize: 10,
            color: peakFlooding ? hazardTone : peakAction ? cautionTone : THEME.inkDim,
            fontWeight: peakFlooding || peakAction ? 700 : 500,
          }}
        >
          <span className="uppercase" style={{ letterSpacing: '0.1em' }}>
            72h peak
          </span>
          <span>
            {forecast!.peakFt!.toFixed(2)} ft ·{' '}
            {new Date(forecast!.peakAt!).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
            })}
          </span>
          {peakFlooding && <span style={{ marginLeft: 'auto' }}>Above flood stage</span>}
          {peakAction && !peakFlooding && (
            <span style={{ marginLeft: 'auto' }}>Above action stage</span>
          )}
        </div>
      )}
    </div>
  );
}

export function KV({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-md border-2 px-2 py-1.5"
      style={{ background: 'var(--color-secondary-100)', borderColor: 'var(--color-neutral-300)' }}
    >
      <div
        className="uppercase font-bold"
        style={{ fontSize: 9.5, letterSpacing: '0.1em', color: THEME.inkDim, fontFamily: MONO }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 font-bold"
        style={{ fontSize: 13, color: THEME.ink, fontFamily: MONO }}
      >
        {value}{sub && (
          <span style={{ fontSize: 10, fontWeight: 500, color: THEME.inkDim, marginLeft: 4 }}>{sub}</span>
        )}
      </div>
    </div>
  );
}

// Compact section header echoing the site-wide SectionTitle
// (src/components/blog/SectionTitle.tsx): a coral eyebrow over a short coral
// underline. Gives the rail cards the same brand personality as the River
// Report + Blog without the article-scale sizing.
export function RailSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        className="uppercase font-bold"
        style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em',
          color: 'var(--color-accent-700)',
        }}
      >
        {children}
      </div>
      <div
        style={{
          width: 28, height: 2, borderRadius: 1, marginTop: 5,
          background: 'var(--color-accent-500)',
        }}
      />
    </div>
  );
}

export function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="cursor-pointer rounded-md border-2 bg-white"
      style={{
        width: 26, height: 26, borderColor: THEME.cardBorder,
        fontFamily: MONO, fontSize: 14, color: THEME.ink,
        boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
      }}
    >
      ×
    </button>
  );
}

export function extractPlace(stationName: string | null): string | null {
  if (!stationName) return null;
  const m = stationName.match(/\b(?:near|at|nr|abv|blw)\s+(.+?)\s+(MO|MISSOURI)\b/i);
  if (m) return `${m[1].trim()}, MO`;
  return null;
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Coarse floatability bucket for a condition code — the client mirror of the
// server's overlayLiveConditions grouping (src/lib/social/live-conditions).
// Used to decide whether Eddy's daily AI note still agrees with the LIVE
// gauge: if the live reading has crossed into a different bucket since the
// note was written, the note is suppressed rather than shown contradicting
// the live badge (e.g. a "good, dialed in" quote next to a Flood reading).
export type FloatabilityClass = 'too_low' | 'floatable' | 'high' | 'dangerous' | 'unknown';
export function floatabilityClass(code: string): FloatabilityClass {
  switch (code) {
    case 'too_low':
      return 'too_low';
    case 'low':
    case 'good':
    case 'flowing':
    case 'optimal':
      return 'floatable';
    case 'high':
      return 'high';
    case 'dangerous':
      return 'dangerous';
    default:
      return 'unknown';
  }
}

// ─── Data age ────────────────────────────────────────────────────────────
//
// Every reading on the page discloses its age (the "N hrs ago" line always
// shows), and anything past the threshold is flagged loudly. Data honesty
// over polish: a stale number styled as live is how someone puts a canoe on
// flood water. Threshold is six hours: healthy USGS gauges sample every
// 15-60 min but NWIS distribution routinely lags a few hours, so a 2h flag
// cried wolf on normally-reporting stations — 6h marks genuine outages.

const STALE_AFTER_MS = 6 * 3600e3;

export function readingAge(iso: string | null | undefined): {
  label: string;
  stale: boolean;
} | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return { label: relativeTime(iso), stale: Date.now() - t > STALE_AFTER_MS };
}

/**
 * Soft stuck-sensor heuristic from data already on the page: the trailing
 * run of daily medians that are ALL identical (both height and discharge —
 * discharge varies naturally, so an identical run is the strong signal),
 * confirmed by the live reading still matching. Returns the run length in
 * days (≥3), or null. Deliberately descriptive, not diagnostic: a stable
 * pool CAN sit flat, so the UI says "unchanged N days", never "broken".
 * The cron logs the same condition server-side at 15-min granularity
 * (update-gauges flatline counter); this is its user-facing counterpart.
 */
export function flatlineDays(
  history: MoHistoryBundleEntry | null | undefined,
  live: { gaugeHeightFt: number | null; dischargeCfs: number | null } | null | undefined,
): number | null {
  const daily = history?.daily ?? [];
  if (daily.length < 3 || !live) return null;
  const last = daily[daily.length - 1];
  if (last.dischargeCfs == null && last.gaugeHeightFt == null) return null;
  let run = 1;
  for (let i = daily.length - 2; i >= 0; i--) {
    const d = daily[i];
    if (d.dischargeCfs === last.dischargeCfs && d.gaugeHeightFt === last.gaugeHeightFt) run++;
    else break;
  }
  if (run < 3) return null;
  const liveMatches =
    (last.dischargeCfs == null || live.dischargeCfs === last.dischargeCfs) &&
    (last.gaugeHeightFt == null || live.gaugeHeightFt === last.gaugeHeightFt);
  return liveMatches ? run : null;
}

/** Soft amber "unchanged N days" disclosure next to a reading's age. */
export function UnchangedChip({ days }: { days: number | null }) {
  if (days == null) return null;
  return (
    <span
      className="rounded-sm px-1 py-px font-bold uppercase"
      title="This gauge has reported the identical value for several days — the sensor may be stuck."
      style={{
        border: '1px solid #E5A000',
        color: '#8A6100',
        fontFamily: MONO,
        fontSize: 9.5,
        letterSpacing: '0.1em',
      }}
    >
      unchanged {days} days
    </span>
  );
}

/** Small mono age line with an amber STALE chip when the reading is old. */
export function DataAgeChip({ iso }: { iso: string | null | undefined }) {
  const age = readingAge(iso);
  if (!age) {
    return (
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: THEME.inkDim, letterSpacing: '0.06em' }}>
        no timestamp
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', color: THEME.inkDim }}>
      reading {age.label}
      {age.stale && (
        <span
          className="rounded-sm px-1 py-px font-bold uppercase"
          style={{ background: '#E5A000', color: '#3D2E00', fontSize: 9.5, letterSpacing: '0.1em' }}
        >
          Stale
        </span>
      )}
    </span>
  );
}

// ─── Context-site card ──────────────────────────────────────────────────
//
// Statewide sites are context, not product: name, live flow, freshness,
// and a link out to USGS. Deliberately NO condition dressing — they have
// no curated thresholds (see docs/mo-surface-water-observatory.md).
