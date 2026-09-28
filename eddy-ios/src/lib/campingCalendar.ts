/** Calendar geometry uses date-only UTC arithmetic, independent of the phone's zone. */
export function campingMonths(nights: string[]): string[] {
  return [...new Set(nights.map((date) => date.slice(0, 7)))];
}
export function calendarDays(month: string): (string | null)[] {
  const first = new Date(`${month}-01T12:00:00Z`);
  if (!Number.isFinite(first.getTime())) return [];
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const days: (string | null)[] = Array.from(
    { length: first.getUTCDay() },
    () => null,
  );
  for (let day = 1; day <= count; day++)
    days.push(`${month}-${String(day).padStart(2, '0')}`);
  while (days.length % 7) days.push(null);
  return days;
}
export function monthSelection(
  month: string,
  nights: string[],
): string | undefined {
  return nights.find((date) => date.startsWith(month));
}
