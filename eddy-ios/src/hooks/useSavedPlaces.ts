import { useEffect, useSyncExternalStore } from 'react';
import { savedPlaces } from '@/lib/savedPlacesStore';

export function useSavedPlaces() {
  const state = useSyncExternalStore(savedPlaces.subscribe, savedPlaces.snapshot, savedPlaces.snapshot);
  useEffect(() => { void savedPlaces.load(); }, []);
  return state;
}
