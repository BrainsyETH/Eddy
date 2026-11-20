// scripts/ingestion/ladder-guard.ts
// Stops a dossier re-ingest from changing an active river's float levels.
//
// WHY. ingest-dossier.ts writes every level column from the dossier, null
// where the dossier has no anchor, so that a re-ingest is idempotent. That is
// right while a river is being set up. On a live river it means a dossier
// that was not edited when a migration recalibrated the ladder quietly puts
// the old ladder back. On 2026-11-19 the North Fork's dossier still held a
// danger line of 8,440 cfs that 00177 had corrected to 2,200 because it
// under-warned, and no Too Low floor at all, on the day the owner set one.
//
// The script already refuses one kind of change on an active river: a
// rating-mode change needs "a separate reviewed migration". Float levels are
// the same kind of decision. They decide the badge, and they are changed by
// migrations that record who approved the number and why.
//
// So: on an active river, a gauge that already has levels keeps them. The
// re-ingest goes ahead when the dossier agrees with what is stored, and is
// refused, before anything is written, when it would change a level or the
// rating unit. A gauge with no levels yet may be given its first ladder.
//
// Pure, so it can be tested without a database.

export const LADDER_COLUMNS = [
  'level_too_low', 'level_low', 'level_optimal_min', 'level_optimal_max', 'level_high', 'level_dangerous',
] as const;
export type LadderColumn = (typeof LADDER_COLUMNS)[number];

/** A river_gauges row's levels as stored (numeric columns arrive as strings) or as planned. */
export type Ladder = Partial<Record<LadderColumn, number | string | null>> & { threshold_unit?: string | null };

const value = (raw: number | string | null | undefined): number | null => {
  if (raw == null || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
const shown = (raw: number | string | null | undefined) => value(raw) ?? '(none)';

/**
 * What a re-ingest would change on a gauge that already has levels, one entry
 * per column, or [] when it would change nothing. A gauge with no stored
 * levels has nothing to protect and returns [].
 */
export function ladderChanges(stored: Ladder | null | undefined, planned: Ladder): string[] {
  if (!stored || LADDER_COLUMNS.every((column) => value(stored[column]) == null)) return [];
  const changes: string[] = [];
  if ((stored.threshold_unit ?? null) !== (planned.threshold_unit ?? null)) {
    changes.push(`threshold_unit ${stored.threshold_unit ?? '(none)'} → ${planned.threshold_unit ?? '(none)'}`);
  }
  for (const column of LADDER_COLUMNS) {
    if (value(stored[column]) !== value(planned[column])) changes.push(`${column} ${shown(stored[column])} → ${shown(planned[column])}`);
  }
  return changes;
}

/** The refusal, naming every gauge and level that would change. */
export function ladderRefusal(slug: string, changesBySite: ReadonlyMap<string, string[]>): string {
  const lines = [...changesBySite].map(([siteId, changes]) => `  ${siteId}: ${changes.join('; ')}`);
  return [
    `${slug} is active, and this dossier would change its float levels:`,
    ...lines,
    'An active river\'s levels change through a reviewed migration, not a re-ingest.',
    'Bring the dossier\'s thresholds in line with river_gauges, or change the ladder in a migration first. Nothing was written.',
  ].join('\n');
}
