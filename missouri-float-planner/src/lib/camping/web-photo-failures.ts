// Keep a broken image's fallback across card/calendar remounts, while allowing
// a later visit to retry transient failures. Browser sessions own this cache.
const failures = new Map<string, number>();
export function recentlyFailedPhoto(src: string) {
  return (failures.get(src) ?? 0) > Date.now();
}
export function rememberPhotoFailure(src: string) {
  const now = Date.now();
  for (const [url, until] of failures) if (until <= now) failures.delete(url);
  failures.delete(src);
  if (failures.size >= 40) failures.delete(failures.keys().next().value!);
  failures.set(src, now + 60_000);
}
