import type { DamSnapshot, RiverListItem } from '@eddy/types';
import { generationNow, generationStatusLabel, nowNextClauses, scheduleOutlook } from '@eddy/conditions/dam-generation';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';
import { DAM_CATALOG, type DamCatalogEntry } from './damCatalog';
import { pickFirstRunRivers } from './firstRunRivers';
import { formatReading } from './readingCopy';

export type FirstRunPlace =
  | { kind: 'river'; key: string; river: RiverListItem }
  | { kind: 'dam'; key: string; dam: DamCatalogEntry };

const FEATURED_DAMS = [
  'swl-table-rock-dam',
  'swl-bull-shoals-dam',
  'ameren-bagnell-dam',
];

function normalize(text: string): string {
  return text.toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function firstRunPlaces(rivers: RiverListItem[]): FirstRunPlace[] {
  return [
    ...rivers.map(river => ({ kind: 'river' as const, key: `river:${river.id}`, river })),
    ...DAM_CATALOG.map(dam => ({ kind: 'dam' as const, key: `dam:${dam.id}`, dam })),
  ];
}

interface PickerOptions {
  rivers: RiverListItem[];
  query: string;
  browseAll: boolean;
  selected: ReadonlySet<string>;
  riverDistances?: Map<string, number> | null;
  damDistances?: Map<string, number> | null;
}

/** Search covers the entire catalog, independent of suggestions or permission. */
export function visibleFirstRunPlaces({
  rivers, query, browseAll, selected, riverDistances, damDistances,
}: PickerOptions): FirstRunPlace[] {
  const all = firstRunPlaces(rivers);
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length) {
    return all.filter(place => {
      const searchable = place.kind === 'river'
        ? `${place.river.name} ${place.river.slug} ${place.river.region ?? ''} ${place.river.state}`
        : `${place.dam.name} ${place.dam.lakeName ?? ''} ${place.dam.state}`;
      const text = normalize(searchable);
      return words.every(word => text.includes(word));
    });
  }
  if (browseAll) return all;

  const riverKeys = pickFirstRunRivers(rivers, riverDistances)
    .map(river => `river:${river.id}`);
  let damIds = FEATURED_DAMS;
  if (damDistances?.size) {
    damIds = [...DAM_CATALOG]
      .sort((a, b) => (damDistances.get(a.id) ?? Infinity) - (damDistances.get(b.id) ?? Infinity))
      .slice(0, 3)
      .map(dam => dam.id);
  }

  // Mix both kinds into the first rows. Preserve chosen destinations when
  // nearby suggestions change, without moving a tapped card to a new position.
  const keys = new Set<string>();
  riverKeys.forEach((key, index) => {
    keys.add(key);
    if (damIds[index]) keys.add(`dam:${damIds[index]}`);
  });
  damIds.forEach(id => keys.add(`dam:${id}`));
  selected.forEach(key => keys.add(key));

  const byKey = new Map(all.map(place => [place.key, place]));
  const places: FirstRunPlace[] = [];
  for (const key of keys) {
    const place = byKey.get(key);
    if (place) places.push(place);
  }
  return places;
}

/** Keep the same dam context as the detail screen, without requiring network. */
export function firstRunFavorites(
  places: FirstRunPlace[],
  selected: ReadonlySet<string>,
  dams: Pick<DamSnapshot, 'id' | 'tailwater'>[] = [],
) {
  const damsById = new Map(dams.map(dam => [dam.id, dam]));
  return places.filter(place => selected.has(place.key)).map(place => {
    if (place.kind === 'river') {
      return {
        kind: place.kind,
        entityId: place.river.id,
        name: place.river.name,
        slug: place.river.slug,
        usgsSiteId: null,
      };
    }
    return {
      kind: place.kind,
      entityId: place.dam.id,
      name: place.dam.name,
      slug: damsById.get(place.dam.id)?.tailwater?.riverSlug ?? '',
      usgsSiteId: null,
    };
  });
}

/** No snapshot is not necessarily a failed fetch. */
export function damPlaceholder(requestState: 'idle' | 'loading' | 'ready' | 'error'): string {
  if (requestState === 'idle' || requestState === 'loading') return 'Loading…';
  if (requestState === 'error') return 'Couldn’t load readings';
  return 'Reading unavailable';
}

/** What a dam's picker card says, line by line. Every line is optional but the status. */
export interface FirstRunDamCard {
  status: string;
  /** A measured number with its unit, set in the reading face. */
  reading: string | null;
  /** The next move in the posted generation schedule, as a sentence. */
  outlook: string | null;
  age: string | null;
}

/**
 * The picker card for a dam: lead with what somebody would follow it FOR.
 *
 * ── Why an idle dam shows no turbine number ──────────────────────────────────
 * It used to print "Not generating at last reading / 20 cfs turbine flow", and
 * the 20 cfs is leakage through idle units (see generationNow's header) — a
 * true number with nothing to say, on the card a new user meets second. When
 * the units are off, the useful fact is when they come back on, so the posted
 * schedule's next move takes that line. Total release stands in only when it
 * is above the dam's own "units are off" floor, so it cannot be leakage again.
 *
 * ── Why a stale schedule is dropped here and labelled elsewhere ──────────────
 * The dam screen keeps a stale next-change sentence and dates it, because it
 * is the most load-bearing line on that page. A first-run card has no room for
 * provenance and is not where anybody plans a wade, so it says nothing rather
 * than a forward claim it cannot date.
 */
export function firstRunDamCard(
  dam: DamSnapshot | null,
  requestState: 'idle' | 'loading' | 'ready' | 'error',
  now: number,
): FirstRunDamCard {
  if (!dam) return { status: damPlaceholder(requestState), reading: null, outlook: null, age: null };

  const generation = generationNow(dam, now);
  const posted = scheduleOutlook(dam.schedule, dam.generationReference, now);
  const scheduled = posted && !posted.stale
    ? nowNextClauses(generation, dam.schedule, dam.generationReference, now).scheduled
    : null;
  const outlook = scheduled ? scheduled.replace(/\.$/, '') : null;
  const release = dam.metrics.release;
  const releaseValue = release && Number.isFinite(release.value)
    ? `${Math.round(release.value).toLocaleString('en-US')} ${release.unit}` : null;

  if (generation.kind === 'generating') {
    return {
      status: generationStatusLabel(generation) ?? 'Generating',
      reading: `${formatReading(generation.turbineCfs, 'cfs')} turbine flow`,
      outlook,
      age: relativeAge(generation.observedAt, now),
    };
  }
  if (generation.kind === 'not-generating') {
    const floor = dam.generationFloorCfs ?? 0;
    // When release stands in, the card's one age line sits under it and must
    // date IT: release and turbine flow are separate series with separate
    // clocks, and a day-old daily mean stamped with a 20-minute-old turbine
    // reading reads as live. The measurement type travels with it too.
    if (!outlook && release && releaseValue && release.value > floor) {
      return {
        status: generationStatusLabel(generation) ?? 'No turbine generation observed',
        reading: `${releaseValue} ${release.dailyMean ? 'daily mean release' : 'total release'}`,
        outlook,
        age: relativeAge(release.at, now),
      };
    }
    return {
      status: generationStatusLabel(generation) ?? 'No turbine generation observed',
      reading: null,
      outlook,
      age: relativeAge(generation.observedAt, now),
    };
  }
  if (release) {
    return {
      status: release.dailyMean ? 'Daily mean release' : 'Reported release',
      reading: releaseValue,
      outlook,
      age: relativeAge(release.at, now),
    };
  }
  return { status: 'Reading unavailable', reading: null, outlook, age: null };
}
