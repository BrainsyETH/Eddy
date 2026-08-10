// eddy-ios/src/components/map-sheet/siteList.ts
// Turning a facility's sites into the list a person scrolls.
//
// Pure, and run from the web suite for the reason availability.ts is.
//
// ── The size problem this exists to solve ─────────────────────────────────
//
// Meramec has 197 sites. Every tab in the map sheet is already inside an
// Animated.ScrollView, so a FlatList here would nest VirtualizedLists — a real
// warning and a real scroll bug — and the answer is not virtualization but
// having fewer rows. On a busy weekend the OPEN list is eight rows, and "+22
// taken" says more than twenty-two dimmed ones. That is the default; the filter
// row keeps everything reachable.

import { decodeCampsiteNights, type CampsiteNightState, type CampsiteSite } from '@eddy/types';

/** A site, resolved to the one night the reader has selected. */
export interface SiteOnNight {
  site: CampsiteSite;
  state: CampsiteNightState;
  /** The short, human labels a row shows: `Tent`, `Electric`, `Sleeps 8`. */
  tags: string[];
}

/**
 * Eddy's words for the providers' vocabulary.
 *
 * Recreation.gov says `STANDARD NONELECTRIC` and `WALK TO`; a person says tent
 * and walk-in. Matched on substrings rather than an exact map because the list
 * is open-ended and a type Eddy has never seen should degrade to "no tags"
 * rather than to a shouted database string in the middle of a sentence.
 */
const TYPE_TAGS: { match: string; tag: string }[] = [
  { match: 'ELECTRIC', tag: 'Electric' },
  { match: 'NONELECTRIC', tag: 'No hookup' },
  // Missouri State Parks' word for the same thing recreation.gov calls
  // NONELECTRIC. Both mean "bring everything"; that they are two words for one
  // fact is the entire premise of this table. Without it the largest single
  // category in the state-park feed — 168 sites — carries no tag at all.
  { match: 'BASIC', tag: 'No hookup' },
  { match: 'TENT', tag: 'Tent' },
  { match: 'RV', tag: 'RV' },
  { match: 'WALK', tag: 'Walk-in' },
  { match: 'BOAT', tag: 'Boat-in' },
  { match: 'GROUP', tag: 'Group' },
  { match: 'EQUESTRIAN', tag: 'Equestrian' },
  { match: 'CABIN', tag: 'Cabin' },
  { match: 'YURT', tag: 'Yurt' },
];

/**
 * The filters offered above the list.
 *
 * Keyed by tag so the chip and the row say the same word — a filter reading
 * "Tent" that matches rows labelled "TENT ONLY" is two vocabularies for one
 * idea.
 */
/**
 * ── `No hookup` WAS MISSING, AND HAD BEEN SINCE THIS FILE WAS WRITTEN ─────
 *
 * `NONELECTRIC → 'No hookup'` has been in the table above from the start and
 * was never offered as a filter — so 581 recreation.gov sites across 28
 * facilities have always worn a tag nothing could select. Adding `BASIC` brings
 * another 168 state-park sites in behind it, which makes 749 sites carrying a
 * label with no chip, and on Meramec it is the second-largest kind. A filter row
 * that offers everything except the thing most of the list IS reads as broken.
 */
export const SITE_FILTERS = [
  'Tent',
  'RV',
  'Electric',
  'No hookup',
  'Walk-in',
  'Group',
] as const;
export type SiteFilter = (typeof SITE_FILTERS)[number];

/**
 * `NONELECTRIC` contains `ELECTRIC`, so the longer match has to win.
 *
 * ── FED BY siteKind, NOT BY site_type ────────────────────────────────────
 *
 * This read `site.siteType` directly, which is null for every one of the 631
 * sites Missouri State Parks publishes. So `filterCounts` came back all zeros,
 * `SITE_FILTERS.filter(count > 0)` came back empty, and the chip row VANISHED —
 * on Meramec's 197 sites, Montauk's 141, St. Francois' 109 and three more. The
 * six biggest campgrounds Eddy has were the six with no way to filter them.
 *
 * `siteKind` already knew those sites are "Basic", "Electric" and "Walk-in": it
 * returns `siteType` when the feed gives one and reads the name when it does
 * not. It was only ever used for display. Asking it here means a name-derived
 * kind produces tags exactly as a declared type does, and recreation.gov —
 * which types every site — is untouched.
 */
function typeTags(site: { name: string | null; siteType: string | null }): string[] {
  const kind = siteKind(site);
  if (!kind) return [];
  const upper = kind.toUpperCase();
  const tags: string[] = [];

  for (const { match, tag } of TYPE_TAGS) {
    if (!upper.includes(match)) continue;
    // 'Electric' must not also fire on 'NONELECTRIC'.
    if (match === 'ELECTRIC' && upper.includes('NONELECTRIC')) continue;
    tags.push(tag);
  }

  return tags;
}

/** Every site resolved to one night, with its display tags. */
export function sitesOnNight(
  sites: CampsiteSite[],
  windowNights: string[],
  date: string,
): SiteOnNight[] {
  const index = windowNights.indexOf(date);
  if (index < 0) return [];

  return sites.map((site) => {
    const tags = typeTags(site);
    if (site.maxOccupancy && site.maxOccupancy > 0) tags.push(`Sleeps ${site.maxOccupancy}`);

    return {
      site,
      state: decodeCampsiteNights(site.nights)[index] ?? 'unknown',
      tags,
    };
  });
}

/** Sites a reader can actually book or walk up to tonight. */
export function isBookable(entry: SiteOnNight): boolean {
  return entry.state === 'open' || entry.state === 'walk_up';
}

/** One loop's worth of the list. */
export interface LoopGroup {
  /** Null becomes this, so a facility with no loops still renders one group. */
  loop: string | null;
  open: SiteOnNight[];
  /**
   * Booked, closed and unreleased. Never rendered as rows — nobody scrolls
   * those — but KEPT rather than only counted, because the per-kind summary
   * needs a denominator: "Basic 12 of 40" is a different claim from "Basic 12",
   * and the 28 it does not mention are exactly these.
   */
  taken: SiteOnNight[];
}

/**
 * Natural order, so `Loop 2` precedes `Loop 10`.
 *
 * A plain string sort puts `Site 100` between `Site 10` and `Site 11`, which in
 * a list of campsite numbers reads as broken data rather than as a sort.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Group by loop, filter, and sort — the whole list, in one pass.
 *
 * `filters` is OR within itself: somebody who taps Tent and Electric wants
 * either, the way the river-report chips already behave. An empty array means
 * no filter rather than no results.
 */
export function groupSites(
  entries: SiteOnNight[],
  filters: SiteFilter[] = [],
): LoopGroup[] {
  const byLoop = new Map<string, LoopGroup>();

  for (const entry of entries) {
    const key = entry.site.loop ?? '';
    const group = byLoop.get(key) ?? { loop: entry.site.loop, open: [], taken: [] };

    // ── The filter decides what the WHOLE group is about ──────────────────
    // Both halves are filtered, or the row lies. Filtering to RV and counting
    // every booked tent site as "+22 taken" tells a reader there are 22 RV
    // sites they just missed. The list and the count have to be describing the
    // same set of sites, and that set is whatever the chips say.
    const matches = filters.length === 0 || filters.some((f) => entry.tags.includes(f));
    if (!matches) continue;

    if (isBookable(entry)) {
      group.open.push(entry);
    } else if (entry.state !== 'unknown') {
      // Booked, closed and unreleased are all "not tonight" to a reader
      // scrolling for somewhere to sleep, and none of them is worth a row.
      group.taken.push(entry);
    }

    byLoop.set(key, group);
  }

  const groups = [...byLoop.values()];
  for (const group of groups) {
    group.open.sort((a, b) =>
      naturalCompare(a.site.name ?? a.site.id, b.site.name ?? b.site.id),
    );
  }

  return groups
    .filter((group) => group.open.length > 0 || group.taken.length > 0)
    .sort((a, b) => {
      // A site with no loop sorts last: it is the residue, not the headline.
      if (a.loop === null) return 1;
      if (b.loop === null) return -1;
      return naturalCompare(a.loop, b.loop);
    });
}

/**
 * What KIND of site this is, when the feed did not say.
 *
 * ── Why the name has to be read at all ───────────────────────────────────
 *
 * `site_type` is how a site declares itself and recreation.gov fills it in.
 * Missouri State Parks does not: every one of Onondaga's 64 sites and every one
 * of Meramec's 197 arrives with a null type and a name like "Basic #001" or
 * "Electric #012". So the type filters counted zero, every chip disappeared, and
 * the list rendered as dozens of rows distinguishable only by a number.
 *
 * The kind is in the name for those feeds, and reading it is the difference
 * between a wall of numbers and "Basic — 12 open". Derived, never stored: this
 * is a presentation guess about one source's naming, and a guess belongs at the
 * point of display rather than in the database.
 *
 * Returns null when the name is only a number, which is what recreation.gov's
 * own sites look like — those have a real `siteType` and never reach here.
 */
export function siteKind(site: { name: string | null; siteType: string | null }): string | null {
  if (site.siteType) return site.siteType;
  const name = site.name?.trim();
  if (!name) return null;
  // Everything before the first digit or '#', which is where the number starts.
  const head = name.split(/[#\d]/)[0]?.trim();
  return head && head.length > 1 ? head : null;
}

/** One kind of site, and how much of it is left. */
export interface KindSummary {
  kind: string;
  open: number;
  total: number;
}

/**
 * The inventory as a handful of counts rather than a list of numbers.
 *
 * ── When a row stops being worth drawing ─────────────────────────────────
 *
 * A site row exists to be TAPPED — it deep-links to that exact site's booking
 * page. UseDirect, which is every Missouri State Park, has no per-unit URL at
 * all (see bookingUrl in the web tree), so those rows link nowhere: sixty-four
 * numbers in a sheet, none of them a control, above the link that could actually
 * book any of them.
 *
 * Counts per kind are what is left that is true and useful — "Basic 12 of 40" is
 * the whole of what Eddy knows about that feed, said in one line instead of
 * forty. CampsiteList picks this path when nothing in the group is tappable.
 */
export function summariseByKind(entries: SiteOnNight[]): KindSummary[] {
  const byKind = new Map<string, KindSummary>();

  for (const entry of entries) {
    if (entry.state === 'unknown') continue;
    const kind = siteKind(entry.site) ?? 'Sites';
    const summary = byKind.get(kind) ?? { kind, open: 0, total: 0 };
    summary.total++;
    if (isBookable(entry)) summary.open++;
    byKind.set(kind, summary);
  }

  // Most inventory first, so the kind somebody is most likely to get leads.
  return [...byKind.values()].sort(
    (a, b) => b.total - a.total || naturalCompare(a.kind, b.kind),
  );
}

/** How many bookable sites each filter would leave, for the chip's count. */
export function filterCounts(entries: SiteOnNight[]): Record<SiteFilter, number> {
  const counts = Object.fromEntries(SITE_FILTERS.map((f) => [f, 0])) as Record<
    SiteFilter,
    number
  >;

  for (const entry of entries) {
    if (!isBookable(entry)) continue;
    for (const filter of SITE_FILTERS) {
      if (entry.tags.includes(filter)) counts[filter]++;
    }
  }

  return counts;
}

/** What a row says about a walk-up site, which is bookable nowhere. */
export function stateLabel(state: CampsiteNightState): string | null {
  switch (state) {
    case 'walk_up':
      return 'First come';
    case 'open':
      return null;
    default:
      return null;
  }
}

/**
 * What the site list has to say, when it has no rows to say it with.
 *
 * ── THREE WAYS TO HAVE NO GROUPS, AND THEY ARE NOT ONE FACT ───────────────
 *
 * CampsiteList used to return null whenever `groupSites` came back empty, so
 * every one of these drew a heading — now naming a date — above nothing at all.
 * They are different facts and only one of them is about the campground:
 *
 *   unmeasured    nothing is KNOWN about this night. Either the date falls
 *                 outside the site feed's own window (sitesOnNight returns
 *                 empty on `indexOf(date) < 0`, and that window comes from the
 *                 server while the chips are built from the DEVICE's day), or
 *                 every site decoded to 'unknown' — which groupSites drops into
 *                 neither half, leaving the group empty and filtered away.
 *   filtered_out  the night is measured and the chips excluded all of it.
 *   none_open     the night is measured, the inventory is real, and every last
 *                 site of it is taken. The only one that means "come back and
 *                 look for a cancellation".
 *
 * Saying "Nothing open" for the first two is the same class of error as
 * printing "0" on a closed night: a claim about the campground made from an
 * absence of data about it.
 */
export type ListOutcome = 'sites' | 'none_open' | 'filtered_out' | 'unmeasured';

export function listOutcome(
  entries: SiteOnNight[],
  groups: LoopGroup[],
  filters: SiteFilter[] = [],
): ListOutcome {
  if (groups.length > 0) {
    return groups.some((group) => group.open.length > 0) ? 'sites' : 'none_open';
  }

  // No groups, but something here was measured — so the filters are what
  // emptied it. groupSites puts every non-'unknown' entry into open or taken,
  // and keeps any group holding either, so a measured night cannot come back
  // empty unless a filter excluded it.
  if (entries.some((entry) => entry.state !== 'unknown')) return 'filtered_out';

  return 'unmeasured';
}

/**
 * Whether the list will draw site ROWS rather than kind summaries.
 *
 * ── WHAT THE FILTER CHIPS ARE FOR, AND WHEN THEY ARE NOTHING ──────────────
 *
 * The list has two shapes. Where sites deep-link to their own booking page it
 * draws a row each, and on a busy facility that is a hundred and ninety-seven
 * of them — a filter row is how somebody finds the eight that take a camper.
 * Where they do not, `Loop` collapses the whole loop into summariseByKind:
 * "Basic — 12 of 40 open", one line per kind.
 *
 * In that second shape the chips are a second copy of the summary. Both split
 * the same sites by the same kinds and print the same counts, and filtering to
 * Electric leaves the Electric line the reader was already looking at. The chips
 * are the version you have to operate.
 *
 * This is the same question `Loop` asks itself as `tappable`, asked across every
 * group at once so the row above the list can be gated on it. It is a property
 * of the NIGHT and not of the facility: a fully booked night has nothing in
 * `open`, so it collapses to summaries even at a campground whose sites all
 * carry booking links.
 */
export function listsRows(entries: SiteOnNight[]): boolean {
  return entries.some((entry) => isBookable(entry) && Boolean(entry.site.bookingUrl));
}
