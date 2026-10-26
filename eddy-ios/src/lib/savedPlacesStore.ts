import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAccessPointDetail, fetchDams, fetchDam, fetchServices } from '@/api/client';
import { createSavedPlacesStore, type SavedPlace } from './savedPlaces';
import { createPlaceAutoRefresh, createSavedPlaceRefresher } from './savedPlaceRefresh';

export const savedPlaces = createSavedPlacesStore(AsyncStorage);
export const refreshSavedPlace = createSavedPlaceRefresher(savedPlaces, {
  access: (river, slug) => fetchAccessPointDetail(river, slug, undefined, false),
  dams: fetchDams,
  dam: fetchDam,
  service: async id => {
    const service = (await fetchServices())?.find(s => s.id === id);
    if (!service) throw new Error('Campground details unavailable');
    return service;
  },
});
export const autoRefreshSavedPlaces = createPlaceAutoRefresh(savedPlaces, refreshSavedPlace);
export async function toggleSavedPlace(place: SavedPlace, owner: string) {
  const token = savedPlaces.snapshot().scopeToken;
  await savedPlaces.toggle(place, owner);
  if (savedPlaces.snapshot().scopeToken === token) void refreshSavedPlace(place.id, undefined, { owner }).catch(() => {});
}
