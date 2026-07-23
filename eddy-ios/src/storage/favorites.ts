import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StarredRiversResponse } from '@eddy/types';
import { apiFetch } from '@/lib/api';

const KEY = 'eddy.favorite-river-slugs.v1';

export async function getLocalFavorites(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) as string[] : [];
}

export async function toggleLocalFavorite(slug: string): Promise<string[]> {
  const values = new Set(await getLocalFavorites());
  values.has(slug) ? values.delete(slug) : values.add(slug);
  const next = Array.from(values);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function syncLocalFavorites(): Promise<string[]> {
  const local = await getLocalFavorites();
  const remote = await apiFetch<StarredRiversResponse>('/api/me/starred-rivers', {}, true);
  const merged = Array.from(new Set([...local, ...remote.starred.map((river) => river.riverSlug)]));
  await Promise.all(merged.map((riverSlug) => apiFetch('/api/me/starred-rivers', {
    method: 'POST', body: JSON.stringify({ riverSlug }),
  }, true)));
  await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}
