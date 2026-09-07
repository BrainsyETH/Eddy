import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FavoriteFloatSummary } from '@eddy/types';

const KEY = 'eddy.favoriteFloats.v1';

interface StoredFloats {
  fetchedAt: string;
  floats: FavoriteFloatSummary[];
}

export async function readFavoriteFloats(): Promise<FavoriteFloatSummary[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFloats>;
    return Array.isArray(parsed.floats) ? parsed.floats : null;
  } catch {
    return null;
  }
}

export function writeFavoriteFloats(floats: FavoriteFloatSummary[]): void {
  const stored: StoredFloats = { fetchedAt: new Date().toISOString(), floats };
  void AsyncStorage.setItem(KEY, JSON.stringify(stored)).catch(() => {});
}
