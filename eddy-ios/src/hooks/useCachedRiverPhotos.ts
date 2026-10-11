import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { readBestIndex } from '@/lib/riverCache';

/** One existing cache read per screen, never a request for each photo card. */
export function useCachedRiverPhotos(): ReadonlyMap<string, string> {
  const [photos, setPhotos] = useState<ReadonlyMap<string, string>>(() => new Map());
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void readBestIndex()
        .then((index) => {
          if (!active || !index) return;
          const next = new Map<string, string>();
          for (const river of index.payload) if (river.photoUrl) next.set(river.slug, river.photoUrl);
          setPhotos(next);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );
  return photos;
}
