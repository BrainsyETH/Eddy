import type { DamSnapshot, RiverListItem } from '@eddy/types';
import { DAM_CATALOG, type DamCatalogEntry } from './damCatalog';
import { pickFirstRunRivers } from './firstRunRivers';

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
