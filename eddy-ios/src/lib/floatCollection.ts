export interface RiverEntry {
  riverSlug: string;
  riverName: string;
}

/** Loading the local collection and backing it up are separate outcomes. */
export function floatCollectionStatus(archive: {
  ready: boolean;
  error: string | null;
  owner: string | null;
  syncing: boolean;
  rows: readonly { dirty: boolean; backupError?: string }[];
}) {
  const load = archive.ready ? 'ready' : archive.error ? 'error' : 'loading';
  const backup =
    load === 'error'
      ? 'Your collection could not be opened'
      : load === 'loading'
        ? 'Loading your collection…'
        : archive.error || archive.rows.some((row) => row.backupError)
          ? archive.owner === 'guest'
            ? 'Your floats need attention'
            : 'Backup needs attention'
          : archive.owner === 'guest'
            ? 'Saved on this phone'
            : archive.syncing
              ? 'Backing up…'
              : archive.rows.some((row) => row.dirty)
                ? 'Waiting to back up'
                : 'Backed up to your account';
  return { load, backup };
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
