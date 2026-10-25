import { useEffect, useSyncExternalStore } from 'react';
import { savedPlaces } from '@/lib/savedPlacesStore';
import { savedPlacesOwner } from '@/lib/savedPlaces';
import { useSession } from './useSession';

export function useSavedPlaces() {
  const { session, ready, isAnonymous } = useSession();
  const owner = savedPlacesOwner(session?.user.id, isAnonymous);
  const state = useSyncExternalStore(savedPlaces.subscribe, savedPlaces.snapshot, savedPlaces.snapshot);
  useEffect(() => { if (ready) void savedPlaces.select(owner); }, [ready, owner]);
  // Hide old-account rows during the render before the selection effect runs.
  const current = ready && state.owner === owner;
  return { ...state, owner, sessionReady: ready, ready: current && state.ready,
    places: current ? state.places : [], error: current ? state.error : null };
}
