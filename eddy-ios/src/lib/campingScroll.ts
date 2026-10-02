/** Include partially visible nights, but not the next column at an exact edge. */
export function visibleCampingColumns(
  offset: number,
  viewportWidth: number,
  dateWidth: number,
  count: number,
) {
  'worklet';
  if (count <= 0 || dateWidth <= 0) return { first: 0, last: 0 };
  const width = Math.max(0, viewportWidth);
  const x = Math.min(Math.max(0, offset), Math.max(0, count * dateWidth - width));
  const first = Math.min(count - 1, Math.floor(x / dateWidth));
  const last = Math.min(count - 1, Math.max(first, Math.ceil((x + width) / dateWidth) - 1));
  return { first, last };
}

/** Calendar dates stay in UTC for formatting; device time zones must not shift a month. */
export function campingVisibleMonthLabel(first?: string, last = first) {
  if (!first || !last) return { label: '', accessibilityLabel: '' };
  const start = new Date(first + 'T12:00:00Z');
  const end = new Date(last + 'T12:00:00Z');
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const format = (date: Date, month: 'short' | 'long', year = true) =>
    date.toLocaleDateString('en-US', {
      month,
      ...(year ? { year: 'numeric' as const } : {}),
      timeZone: 'UTC',
    });
  return {
    label: sameMonth
      ? format(start, 'short')
      : `${format(start, 'short', !sameYear)}–${format(end, 'short')}`,
    accessibilityLabel: sameMonth
      ? format(start, 'long')
      : `${format(start, 'long')} to ${format(end, 'long')}`,
  };
}

/** A pan ending over a row must never activate its detail sheet. */
export function createCampingTapGuard() {
  let origin = { x: 0, y: 0 };
  let moved = false;
  return {
    start(x: number, y: number) {
      origin = { x, y };
      moved = false;
    },
    move(x: number, y: number) {
      if (Math.abs(x - origin.x) > 8 || Math.abs(y - origin.y) > 8)
        moved = true;
    },
    cancel() {
      moved = true;
    },
    allowed() {
      return !moved;
    },
  };
}
