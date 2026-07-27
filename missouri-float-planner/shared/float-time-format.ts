// shared/float-time-format.ts
// How a float time is WORDED. Not how it is calculated.
//
// The model lives in src/lib/calculations/floatTime.ts and stays there — it
// needs vessel speeds and threshold ladders out of the database, which is a
// server concern. What moved here is the handful of pure string functions on
// the end of it, because eddy-ios needs to word a float time too and could not
// import a single line of them from under the website's src/.
//
// LIVES IN shared/ FOR THE SAME REASON condition-system.ts DOES: eddy-ios
// reaches this folder through the `@eddy/conditions` file: dependency, which
// declares no `exports` map, so `@eddy/conditions/float-time-format` resolves
// straight to this file. Keep it free of imports for that reason.
//
// THE ROUNDING IS THE POINT. Every value is snapped to a quarter hour before it
// is printed. An estimate built from a vessel speed and a flow exponent has no
// business rendering "3 hours 7 minutes" — the false precision reads as a
// measurement, and someone plans a shuttle around it.

/** Rounds a minute count to the nearest quarter hour (no false precision on estimates). */
export function roundToQuarterHour(minutes: number): number {
  return Math.max(15, Math.round(minutes / 15) * 15);
}

/**
 * Formats float time as a human-readable string. Rounds to the nearest quarter
 * hour so we never imply minute-level precision on an estimate.
 */
export function formatFloatTime(minutes: number): string {
  const rounded = roundToQuarterHour(minutes);
  if (rounded < 60) {
    return `~${rounded} minutes`;
  }

  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  if (remainingMinutes === 0) {
    return `~${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `~${hours} ${hours === 1 ? 'hour' : 'hours'} ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Formats an estimate as a range, e.g. "~2 hours 30 minutes – ~4 hours".
 * Collapses to a single value when the rounded ends coincide.
 */
export function formatFloatTimeRange(minMinutes: number, maxMinutes: number): string {
  const lo = roundToQuarterHour(minMinutes);
  const hi = roundToQuarterHour(maxMinutes);
  if (lo >= hi) {
    return formatFloatTime(lo);
  }
  return `${formatFloatTime(lo)} – ${formatFloatTime(hi)}`;
}

/**
 * Compact abbreviated float time, e.g. "11h 30m", "4h", or "45m". Built for
 * tight stat displays where the verbose "~11 hours 30 minutes" wraps badly.
 */
export function formatFloatTimeCompact(minutes: number): string {
  const rounded = roundToQuarterHour(minutes);
  if (rounded < 60) {
    return `${rounded}m`;
  }
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

/**
 * Compact estimate range for narrow stat columns, e.g. "~11h 30m–18h 30m".
 * A single "~" leads the range and the units are abbreviated so the value
 * stays on one or two lines instead of wrapping to three. Collapses to a
 * single value when the rounded ends coincide.
 */
export function formatFloatTimeRangeCompact(minMinutes: number, maxMinutes: number): string {
  const lo = roundToQuarterHour(minMinutes);
  const hi = roundToQuarterHour(maxMinutes);
  if (lo >= hi) {
    return `~${formatFloatTimeCompact(lo)}`;
  }
  return `~${formatFloatTimeCompact(lo)}–${formatFloatTimeCompact(hi)}`;
}

/**
 * The float time as a CEILING: "Up to ~4 hours".
 *
 * A range asks the reader to do arithmetic before they can answer the only
 * question they have — will I be off the water before dark? The upper bound
 * answers it directly, and it is the end that matters: nobody was ever caught
 * out by finishing early.
 *
 * Pass the LONG end of the range. On the estimate path that is
 * `movingMinutes * RANGE_MAX_FACTOR` — a relaxed pace WITH stops, not a
 * paddling-only figure. Do not caption it "no stops"; see
 * `floatTimeCeilingBasisNote` for wording that is actually true.
 */
export function formatFloatTimeCeiling(maxMinutes: number): string {
  return `Up to ${formatFloatTime(maxMinutes)}`;
}

/** Compact ceiling for buttons and stat tiles, e.g. "up to ~4h". */
export function formatFloatTimeCeilingCompact(maxMinutes: number): string {
  return `up to ~${formatFloatTimeCompact(maxMinutes)}`;
}

/**
 * The one-line caveat that belongs under a ceiling.
 *
 * `isEstimate === false` means a published outfitter time, whose upper bound is
 * whatever the outfitter measured — we cannot claim a pace for it, so we say
 * nothing about one. Everything else is ours, and the honest description of the
 * long end is a relaxed pace that stops on gravel bars.
 */
export function floatTimeCeilingBasisNote(isEstimate: boolean | undefined): string {
  return isEstimate === false ? 'Published time' : 'Estimated · relaxed pace, some stops';
}
