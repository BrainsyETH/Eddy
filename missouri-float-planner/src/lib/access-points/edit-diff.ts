// src/lib/access-points/edit-diff.ts
// What an admin edit form should send when it saves.
//
// A form that submits every field it loaded turns a stale tab into an
// overwrite: fields the operator never touched are written back with whatever
// they held when the page opened, undoing changes made elsewhere since. Sending
// only what changed keeps an untouched field out of the request, and the
// update route only writes fields it is given.

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // '' and null/undefined are the same "empty" for a text field.
  const empty = (value: unknown) => value === null || value === undefined || value === '';
  if (empty(a) && empty(b)) return true;
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * The subset of `current` whose values differ from `original`, limited to
 * `editableKeys`. Keys outside that list (ids, derived names, server-owned
 * fields) are never sent.
 */
export function changedFields<T extends object>(
  original: Partial<T>,
  current: Partial<T>,
  editableKeys: ReadonlyArray<keyof T & string>,
): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of editableKeys) {
    if (!same(original[key], current[key])) changes[key] = current[key];
  }
  return changes;
}

export interface StagedMove {
  kind: 'access-point' | 'poi';
  name: string;
  from: { lng: number; lat: number };
  to: { lng: number; lat: number };
  /** Version of the record the move was staged against, when known. */
  expectedUpdatedAt?: string | null;
}

/** ~11 m at Ozark latitudes: below this a drag is a slipped click, not a move. */
export const MIN_MOVE_DEGREES = 0.0001;

/**
 * Applies a drag to the staged set without touching anything on the server.
 * Dragging back onto the saved position un-stages the move; `from` always
 * stays the saved position, however many times the marker is dragged.
 */
export function stageMove(
  staged: ReadonlyMap<string, StagedMove>,
  id: string,
  move: StagedMove,
): Map<string, StagedMove> {
  const next = new Map(staged);
  const distance = Math.hypot(move.to.lng - move.from.lng, move.to.lat - move.from.lat);
  if (distance < MIN_MOVE_DEGREES) next.delete(id);
  else next.set(id, move);
  return next;
}
