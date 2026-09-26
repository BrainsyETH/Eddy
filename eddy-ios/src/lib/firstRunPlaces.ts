import type { RiverListItem } from '@eddy/types';
import { DAM_CATALOG, type DamCatalogEntry } from './damCatalog';
import { pickFirstRunRivers } from './firstRunRivers';

export type FirstRunPlace =
  | { kind: 'river'; key: string; river: RiverListItem }
  | { kind: 'dam'; key: string; dam: DamCatalogEntry };

const FEATURED_DAMS = ['swl-table-rock-dam', 'swl-bull-shoals-dam', 'ameren-bagnell-dam'];
const normalize = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function firstRunPlaces(rivers: RiverListItem[]): FirstRunPlace[] {
  return [
    ...rivers.map(river => ({ kind: 'river' as const, key: `river:${river.id}`, river })),
    ...DAM_CATALOG.map(dam => ({ kind: 'dam' as const, key: `dam:${dam.id}`, dam })),
  ];
}

/** Search covers the entire catalog, independent of suggestions or permission. */
export function visibleFirstRunPlaces({ rivers, query, browseAll, selected, riverDistances, damDistances }: {
  rivers: RiverListItem[];
  query: string;
  browseAll: boolean;
  selected: ReadonlySet<string>;
  riverDistances?: Map<string, number> | null;
  damDistances?: Map<string, number> | null;
}): FirstRunPlace[] {
  const all = firstRunPlaces(rivers);
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length) return all.filter(place => {
    const searchable = place.kind === 'river'
      ? `${place.river.name} ${place.river.slug} ${place.river.region ?? ''} ${place.river.state}`
      : `${place.dam.name} ${place.dam.lakeName ?? ''} ${place.dam.state}`;
    const text = normalize(searchable);
    return words.every(word => text.includes(word));
  });
  if (browseAll) return all;
  const riverKeys = new Set(pickFirstRunRivers(rivers, riverDistances).map(river => `river:${river.id}`));
  const damIds = damDistances?.size
    ? [...DAM_CATALOG].sort((a, b) => (damDistances.get(a.id) ?? Infinity) - (damDistances.get(b.id) ?? Infinity)).slice(0, 3).map(dam => dam.id)
    : FEATURED_DAMS;
  const byKey = new Map(all.map(place => [place.key, place]));
  // Mix both kinds into the first rows so dams are discoverable before scrolling.
  const keys = [...riverKeys].flatMap((key, index) =>
    damIds[index] ? [key, `dam:${damIds[index]}`] : [key]);
  for (const id of damIds) if (!keys.includes(`dam:${id}`)) keys.push(`dam:${id}`);
  for (const key of selected) if (!keys.includes(key)) keys.push(key);
  return keys.flatMap(key => { const place = byKey.get(key); return place ? [place] : []; });
}

export function firstRunFavorites(places: FirstRunPlace[], selected: ReadonlySet<string>) {
  return places.filter(place => selected.has(place.key)).map(place => ({
    kind: place.kind,
    entityId: place.kind === 'river' ? place.river.id : place.dam.id,
    name: place.kind === 'river' ? place.river.name : place.dam.name,
    slug: place.kind === 'river' ? place.river.slug : '',
    usgsSiteId: null,
  }));
}
