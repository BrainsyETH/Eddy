/** UTC evaluator for the minute/hour/weekday cron syntax used by Eddy.
 * Reject unsupported calendar syntax instead of silently inventing a deadline.
 */
function fieldValues(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) throw new Error('Unsupported cron field');
    const step = match[2] ? Number(match[2]) : 1;
    const range =
      match[1] === '*' ? [min, max] : match[1].split('-').map(Number);
    const [start, end] = [range[0], range[1] ?? range[0]];
    if (step < 1 || start < min || end > max || start > end)
      throw new Error('Invalid cron field');
    for (let n = start; n <= end; n += step) values.add(n);
  }
  return values;
}

/** First scheduled minute strictly after a recorded start or rollout baseline. */
export function nextScheduledAt(schedules: string[], after: number): number {
  if (!Number.isFinite(after) || schedules.length === 0)
    throw new Error('Missing schedule baseline');
  const parsed = schedules.map((schedule) => {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5 || parts[2] !== '*' || parts[3] !== '*')
      throw new Error('Unsupported calendar schedule');
    return {
      minutes: fieldValues(parts[0], 0, 59),
      hours: fieldValues(parts[1], 0, 23),
      weekdays: fieldValues(parts[4], 0, 7),
    };
  });
  const start = Math.floor(after / 60000) * 60000 + 60000;
  // A supported weekly expression must have an occurrence in the next seven days.
  for (let minute = 0; minute <= 7 * 24 * 60; minute++) {
    const at = start + minute * 60000;
    const date = new Date(at);
    if (
      parsed.some(
        (p) =>
          p.minutes.has(date.getUTCMinutes()) &&
          p.hours.has(date.getUTCHours()) &&
          (p.weekdays.has(date.getUTCDay()) ||
            (date.getUTCDay() === 0 && p.weekdays.has(7))),
      )
    )
      return at;
  }
  throw new Error('No next scheduled occurrence');
}
