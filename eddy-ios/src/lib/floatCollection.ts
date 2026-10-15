export interface RiverEntry {
  riverSlug: string;
  riverName: string;
}
export function floatRiverChoices(items: readonly RiverEntry[]) {
  return [
    ...new Map(items.map(({ riverSlug, riverName }) => [riverSlug, { riverSlug, riverName }])).values(),
  ].sort((a, b) => a.riverName.localeCompare(b.riverName));
}
/** Preserve the source's recent/featured order within each river. */
export function visibleFloats<T extends RiverEntry>(
  items: readonly T[],
  river: string,
  sort: 'default' | 'river',
): T[] {
  const filtered = items.filter((item) => !river || item.riverSlug === river);
  return sort === 'river' ? filtered.sort((a, b) => a.riverName.localeCompare(b.riverName)) : filtered;
}
