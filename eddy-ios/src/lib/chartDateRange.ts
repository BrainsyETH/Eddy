/** Display the API's UTC calendar window without shifting a day in local time. */
export function chartDateRange(from: string, to: string): string {
  const start = new Date(from);
  const end = new Date(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'Selected dates';
  const format = (date: Date, year = false) => date.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(year ? { year: 'numeric' as const } : {}), timeZone: 'UTC',
  });
  if (start.getUTCFullYear() !== end.getUTCFullYear()) return `${format(start, true)} – ${format(end, true)}`;
  if (start.getUTCMonth() === end.getUTCMonth()) {
    if (start.getUTCDate() === end.getUTCDate()) return format(start);
    return `${format(start)}–${end.getUTCDate()}`;
  }
  return `${format(start)} – ${format(end)}`;
}
