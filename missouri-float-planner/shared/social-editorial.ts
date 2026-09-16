/** Pure editorial constraints shared by captions and video layouts. */
export const DIGEST_PAGE_SIZE = 5;
export function digestPages<T>(rows: readonly T[]): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += DIGEST_PAGE_SIZE) pages.push(rows.slice(i, i + DIGEST_PAGE_SIZE));
  return pages.length ? pages : [[]];
}
export function shortSummary(text?: string | null): string {
  if (!text) return '';
  const sentence = text.trim().split(/(?<=[.!?])\s/)[0];
  return sentence.length <= 140 ? sentence : sentence.slice(0, 137).replace(/\s+\S*$/, '') + '…';
}
export function trendMeaning(direction: 'rising' | 'falling' | 'flat', condition?: string): string {
  if (condition === 'dangerous') return 'Water remains dangerous. Do not launch.';
  if (condition === 'high') return direction === 'falling' ? 'Dropping, but still high. Check the latest conditions before launching.' : 'High water. Check the latest conditions before launching.';
  if (condition === 'low' || condition === 'too_low') return direction === 'falling' ? 'Dropping from an already low level; expect more shallow spots.' : 'Water is low; check your route for shallow spots.';
  return direction === 'flat' ? 'Little net change. Check current conditions for your route.' : `${direction === 'rising' ? 'Rising' : 'Falling'} water does not by itself tell us whether a route is suitable. Check current conditions.`;
}
export function reportStamp(date = new Date()): string {
  return date.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export function splitTrendSeries<T extends { hoursAgo: number; gaugeHeightFt: number | null }>(series: readonly T[]): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  for (const point of series) {
    if (point.gaugeHeightFt === null) { if (current.length) groups.push(current); current = []; continue; }
    if (current.length && point.hoursAgo - current[current.length - 1].hoursAgo > 12) {
      groups.push(current); current = [];
    }
    current.push(point);
  }
  if (current.length) groups.push(current);
  return groups;
}
