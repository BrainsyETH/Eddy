export interface ChartDateErrors { from?: string; to?: string }
type DateResult = { errors: ChartDateErrors; window?: undefined; days?: undefined }
  | { errors?: undefined; window: { from: string; to: string }; days: number };

export function localChartDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Parse a calendar date without Date's UTC interpretation of YYYY-MM-DD. */
export function parseLocalChartDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) && localChartDate(date) === value ? date : null;
}

/** Local calendar days at the UI boundary; absolute ISO instants on the wire. */
export function validateChartDates(fromText: string, toText: string, now: number): DateResult {
  const from = parseLocalChartDate(fromText.trim());
  const to = parseLocalChartDate(toText.trim());
  const errors: ChartDateErrors = {};
  if (!from) errors.from = 'Choose a valid start date.';
  if (!to) errors.to = 'Choose a valid end date.';
  if (!from || !to) return { errors };
  // Calendar arithmetic, not elapsed 24-hour blocks: DST days can be 23/25h.
  const ordinal = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  const days = ordinal(to) - ordinal(from) + 1;
  if (from.getTime() > now) errors.from = 'Start date must be today or earlier.';
  if (days < 1) errors.to = 'End date must be on or after the start date.';
  else if (days > 366) errors.to = 'Choose a date range of 366 days or less.';
  if (errors.from || errors.to) return { errors };
  to.setHours(23, 59, 59, 0);
  const end = new Date(Math.min(to.getTime(), now));
  return { window: { from: from.toISOString(), to: end.toISOString() }, days: Math.max(1, ordinal(end) - ordinal(from) + 1) };
}

/** Moving Start past End keeps a valid one-day range instead of an invalid picker value. */
export function chartEndAfterStartChange(fromText: string, toText: string): string {
  const from = parseLocalChartDate(fromText);
  const to = parseLocalChartDate(toText);
  return from && to && from > to ? fromText : toText;
}
