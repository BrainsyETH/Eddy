import { useRef } from 'react';
import { Alert } from 'react-native';
import { useSavedPlaces } from './useSavedPlaces';
import { toggleSavedPlace } from '@/lib/savedPlacesStore';
import type { SavedPlace } from '@/lib/savedPlaces';
import { selectionFeedback } from '@/lib/haptics';

export function usePlaceFavorite(place: SavedPlace | null) {
  const { places } = useSavedPlaces();
  const busy = useRef(false);
  const starred = !!place && places.some(p => p.id === place.id);
  const toggle = async () => {
    if (!place || busy.current) return;
    busy.current = true;
    selectionFeedback();
    try {
      await toggleSavedPlace(place);
    } catch { Alert.alert('Couldn’t save changes', 'Try again.'); }
    finally { busy.current = false; }
  };
  return { starred, toggle };
}
