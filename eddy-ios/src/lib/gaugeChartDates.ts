export interface ChartDateErrors { from?: string; to?: string }
type DateResult = { errors: ChartDateErrors; window?: undefined; days?: undefined }
  | { errors?: undefined; window: { from: string; to: string }; days: number };

/** The existing API contract is a UTC calendar window. Keep that explicit
 * until the native date-picker follow-up defines a different calendar zone. */
export function validateChartDates(fromText: string, toText: string, now: number): DateResult {
  const fromDate = fromText.trim();
  const toDate = toText.trim();
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T23:59:59Z`);
  const validDate = (value: string, time: number) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  const errors: ChartDateErrors = {};
  if (!validDate(fromDate, from)) errors.from = 'Enter a valid start date as YYYY-MM-DD.';
  if (!validDate(toDate, to)) errors.to = 'Enter a valid end date as YYYY-MM-DD.';
  if (errors.from || errors.to) return { errors };
  if (from > now) errors.from = 'Start date must be today or earlier.';
  if (to <= from) errors.to = 'End date must be on or after the start date.';
  else if (to - from > 366 * 86_400_000) errors.to = 'Choose a date range of 366 days or less.';
  if (errors.from || errors.to) return { errors };
  const end = Math.min(to, now);
  return { window: { from: new Date(from).toISOString(), to: new Date(end).toISOString() }, days: Math.max(1, Math.ceil((end - from) / 86_400_000)) };
}
