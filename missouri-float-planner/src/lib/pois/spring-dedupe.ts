// src/lib/pois/spring-dedupe.ts
// Making sure a spring reaches the map exactly once.
//
// ── THREE WAYS THE SAME SPRING ARRIVES TWICE ──────────────────────────────
//
// 1. THE SOURCE SAYS IT TWICE. `floatmissouri_mile_markers.json` carries two
//    near-identical entries for the Meramec at mile 41 ("Indian Spring and
//    Lodge on right." / "Indian Spring and private lodge on right.") and names
//    Camper's Spring at both mile 88.2, where it is the far end of a park
//    boundary, and 88.5, where it actually is. Two rows, one spring.
//
// 2. THE DATABASE ALREADY HAS IT. Six springs are already curated in
//    `points_of_interest` — Round Spring, Cave Spring and Blue Spring on the
//    Current, Blue Spring and Ebb and Flow on the Jacks Fork — with
//    hand-checked coordinates. A mile-derived guess must never overwrite or sit
//    beside a surveyed position.
//
// 3. IT IS ALREADY A PUT-IN. Alley Spring, Big Spring, Bennett Spring and
//    Round Spring are access points with campgrounds, drawn by the access layer
//    at their real coordinates. This repository already has a rule for that
//    collision — `drawnAsAccessPoint` in `eddy-ios/src/map/accessLayers.ts`,
//    whose whole subject is a place seeded twice from two sources years apart —
//    and the answer there is that ONE place gets ONE marker. A springs layer
//    that redraws Alley Spring 50 m from its own put-in is the exact bug that
//    rule exists to prevent, so the access point keeps the pin.
//
// Every suppression is REPORTED rather than silent (see `DedupeResult.dropped`)
// because case 3 is a judgement that may be revisited — a future release could
// give the access point a spring mark instead of a second pin — and a decision
// nobody can see is a decision nobody can change.

export interface CandidateRow {
  riverSlug: string;
  name: string;
  mile: number;
  /**
   * The sentence the name was read out of, when the caller has it.
   *
   * Used only to choose BETWEEN duplicates — see `mentionIsAbout`. Optional so
   * the dedupe rules stay testable without dragging prose through every case.
   */
  sourceText?: string;
}

export interface ExistingPoi {
  riverSlug: string | null;
  name: string;
  mile: number | null;
}

export interface ExistingAccess {
  riverSlug: string;
  name: string;
  mile: number | null;
}

export type DropReason =
  | 'duplicate within source'
  | 'already a curated point of interest'
  | 'already drawn as an access point';

export interface DedupeResult<T extends CandidateRow> {
  kept: T[];
  dropped: { row: T; reason: DropReason; against: string }[];
}

/** How far apart two mentions of one name may be and still be one spring. */
export const SOURCE_DUPLICATE_MI = 1.5;
/** How far a candidate may sit from a same-named access point and still be it. */
export const ACCESS_MATCH_MI = 1.5;
/** Curated POIs are matched on name across the whole river; see `sameNamedPlace`. */
export const CURATED_MATCH_MI = 3;

const NOISE = new Set([
  'spring', 'springs', 'the', 'and', 'of', 'at', 'on', 'access', 'accesses',
  'campground', 'camp', 'landing', 'ramp', 'river', 'creek', 'area',
  'recreation', 'state', 'park', 'public', 'use', 'mdc', 'conservation',
  'resort', 'lodge', 'mill', 'branch',
]);

/** The distinctive words in a place name — what is left after the furniture. */
export function distinctiveTokens(name: string): Set<string> {
  const cleaned = (name || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
  return new Set(
    cleaned
      .split(' ')
      .filter((t) => t.length > 2 && !NOISE.has(t) && !/^\d+$/.test(t)),
  );
}

/**
 * Whether two names denote the same place.
 *
 * Containment rather than equality, in the direction that matters: every
 * distinctive word of the SPRING must appear in the other name. "Alley Spring"
 * is the same place as "Alley Spring Campground"; "Blue Spring" is not the same
 * place as "Blue Spring Cave", but that pair does not arise because the
 * extractor never emits a cave.
 *
 * A spring with no distinctive words ("Spring") matches nothing — it cannot be
 * shown to be the same place as anything, and guessing would suppress a real
 * spring or merge two unrelated ones.
 */
export function sameNamedPlace(springName: string, otherName: string): boolean {
  const a = distinctiveTokens(springName);
  if (a.size === 0) return false;
  const b = distinctiveTokens(otherName);
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

/**
 * Whether a mention is ABOUT the spring or merely refers to it in passing.
 *
 * The Meramec names Camper's Spring twice: at mile 88.2 as the far end of
 * something else ("State park picnic ground along left bank, from bridge to
 * Camper's Spring.") and at 88.5 as itself ("Camper's Spring on right at base
 * of bluff."). Both are the same spring, and only the second states where it
 * is — so picking the upstream one, which is what a plain sort does, files the
 * spring a third of a mile above its own bluff.
 *
 * The tell is position: a sentence that opens with the name is describing it.
 */
function mentionIsAbout(row: CandidateRow): boolean {
  const text = (row.sourceText ?? '').trim().toLowerCase();
  if (!text) return false;
  return text.startsWith(row.name.trim().toLowerCase());
}

function within(a: number, b: number | null, limit: number): boolean {
  // A null mile cannot disprove sameness — the curated rows that lack one are
  // exactly the ones nobody has placed yet — so name agreement carries it.
  if (b === null || !Number.isFinite(b)) return true;
  return Math.abs(a - b) <= limit;
}

/**
 * Reduce a batch of extracted springs to the ones that should be written.
 *
 * Order matters and is by cost of being wrong: the source's own duplicates
 * first (cheap, certain), then curated rows (a surveyed position always beats a
 * derived one), then access points (the one-place-one-pin rule).
 */
export function dedupeSprings<T extends CandidateRow>(
  candidates: readonly T[],
  curated: readonly ExistingPoi[],
  access: readonly ExistingAccess[],
): DedupeResult<T> {
  const kept: T[] = [];
  const dropped: DedupeResult<T>['dropped'] = [];

  // Mentions that DESCRIBE a spring go first, so that when two mentions of one
  // spring collide the describing one is already kept and the passing
  // reference is the one dropped. Within each group, upstream first — a stable
  // order, and the only thing left to decide once the mentions are equal.
  const ordered = [...candidates].sort((a, b) => {
    if (a.riverSlug !== b.riverSlug) return a.riverSlug.localeCompare(b.riverSlug);
    const about = Number(mentionIsAbout(b)) - Number(mentionIsAbout(a));
    if (about !== 0) return about;
    return a.mile - b.mile;
  });

  for (const row of ordered) {
    const twin = kept.find(
      (k) =>
        k.riverSlug === row.riverSlug &&
        sameNamedPlace(row.name, k.name) &&
        Math.abs(k.mile - row.mile) <= SOURCE_DUPLICATE_MI,
    );
    if (twin) {
      dropped.push({ row, reason: 'duplicate within source', against: `${twin.name} @ ${twin.mile}` });
      continue;
    }

    const curatedHit = curated.find(
      (c) =>
        c.riverSlug === row.riverSlug &&
        sameNamedPlace(row.name, c.name) &&
        within(row.mile, c.mile, CURATED_MATCH_MI),
    );
    if (curatedHit) {
      dropped.push({
        row,
        reason: 'already a curated point of interest',
        against: curatedHit.name,
      });
      continue;
    }

    const accessHit = access.find(
      (a) =>
        a.riverSlug === row.riverSlug &&
        sameNamedPlace(row.name, a.name) &&
        within(row.mile, a.mile, ACCESS_MATCH_MI),
    );
    if (accessHit) {
      dropped.push({
        row,
        reason: 'already drawn as an access point',
        against: accessHit.name,
      });
      continue;
    }

    kept.push(row);
  }

  return { kept, dropped };
}
