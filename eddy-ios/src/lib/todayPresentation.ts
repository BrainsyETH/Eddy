/** A finite device-local deadline; corrupt storage never hides alerts. */
export function snoozeDeadline(duration: 'hour' | 'today' | 'day', now = Date.now()): number {
  if (duration === 'today') {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }
  return now + (duration === 'hour' ? 1 : 24) * 3_600_000;
}
export function parseSnooze(value: string | null, now = Date.now()): number {
  const until = Number(value);
  return Number.isFinite(until) && until > now && until <= now + 25 * 3_600_000 ? until : 0;
}
/** Plain-text opening of the authorized report; never substitute the free summary. */
export function premiumExcerpt(fullRead: string): string {
  const text = fullRead.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\s*_-]+/gm, '').replace(/[*_\x60]/g, '').replace(/\s+/g, ' ').trim();
  if (text.length <= 320) return text;
  return text.slice(0, 320).replace(/\s+\S*$/, '') + '…';
}

