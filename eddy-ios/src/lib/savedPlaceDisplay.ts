import { CONDITION_SYSTEM } from '@eddy/conditions';
import { centralDayKey, nextDayKey, scheduleDayLabel, windowLabel } from '@eddy/conditions/dam-schedule-copy';
import { CAMPING_MAX_AGE_MS } from '@eddy/conditions/camping-freshness';
import { availabilityHero, availabilityVoiceOver, nightBars } from '../components/map-sheet/availability';
import { readingBand } from './offline-cache';
import { savedScheduleState, type SavedPlace } from './savedPlaces';
import type { DamCatalogEntry } from './damCatalog';

export function observedAge(iso: string | null | undefined, now: number): number | null {
  const stamp = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(stamp) && stamp <= now + 60_000 ? Math.max(0, (now - stamp) / 3_600_000) : null;
}
export function shortAge(hours: number | null): string {
  if (hours === null) return 'Time unknown';
  if (hours < 1 / 60) return 'Just now';
  if (hours < 1) return `${Math.floor(hours * 60)} min ago`;
  if (hours < 24) return `${Math.floor(hours)} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
export function savedGaugeDisplay(place: SavedPlace, now: number) {
  const gauge = place.gauge?.reading;
  const hours = observedAge(gauge?.lastUpdated, now);
  const band = readingBand(hours);
  const reading = !gauge || band === 'expired' ? null : gauge.cfs != null
    ? `${Math.round(gauge.cfs).toLocaleString()} cfs` : gauge.heightFt != null ? `${gauge.heightFt.toFixed(2)} ft` : null;
  const code = gauge && reading && band === 'fresh' && gauge.level !== 'unknown' && gauge.level in CONDITION_SYSTEM ? gauge.level : null;
  return { band, reading, age: shortAge(hours), code,
    condition: code ? CONDITION_SYSTEM[code].label : null,
    state: band === 'expired' ? 'Out of date' : band === 'stale' ? 'Stale' : null };
}
/** Preserve the campsite panel while withholding counts from expired inventory. */
export function savedCampingDisplay(place: SavedPlace, now: number) {
  const saved = place.camping;
  if (!saved) return null;
  const today = centralDayKey(now);
  const ageMs = now - Date.parse(saved.availability.fetchedAt);
  const fresh = Number.isFinite(ageMs) && ageMs >= 0 && ageMs < CAMPING_MAX_AGE_MS;
  // availabilityHero falls back to the weekend aggregate when its strip is
  // empty. Once that window starts passing, its old count is no longer an
  // answer about tonight; a future measured night can still supply the hero.
  const hasUpcomingNight = nightBars(saved.availability, today).some(bar => bar.mark !== 'none');
  const upcomingWindow = saved.availability.window.startDate >= today;
  const availability = fresh && (hasUpcomingNight || upcomingWindow) ? saved.availability : null;
  const hero = availabilityHero(availability, today, saved.name);
  const summary = hero ? [hero.count === null ? hero.headline : `${hero.count} ${hero.headline}`,
    hero.detail, hero.caption, hero.walkUp].filter(Boolean).join(' · ') : 'Availability out of date';
  return {
    availability, name: saved.name, today, summary,
    compactSummary: hero ? [hero.count === null ? hero.headline : `${hero.count} ${hero.headline}`,
      hero.caption, hero.walkUp].filter(Boolean).join(' · ') : summary,
    age: shortAge(Number.isFinite(ageMs) && ageMs >= 0 ? ageMs / 3_600_000 : null),
    accessibilityLabel: availabilityVoiceOver(availability, today, saved.name) ?? summary,
  };
}
export function scheduleGroups(place: SavedPlace, now: number) {
  const today = centralDayKey(now);
  const days = [...(place.dam?.snapshot.schedule ?? [])].sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
  return { upcoming: days.filter(d => d.scheduleDate >= today), earlier: days.filter(d => d.scheduleDate < today).reverse() };
}
export function savedScheduleDayLabel(day: string, now: number) {
  const today = centralDayKey(now);
  if (day === today) return 'Today';
  if (day === nextDayKey(today)) return 'Tomorrow';
  return scheduleDayLabel(day) + (day.slice(0, 4) !== today.slice(0, 4) ? ` ${day.slice(0, 4)}` : '');
}
export function savedPlaceSummary(place: SavedPlace, now: number, includeCamping = true) {
  const camping = savedCampingDisplay(place, now);
  if (includeCamping && place.kind === 'campground' && camping) return camping.summary;
  if (place.gauge) {
    const gauge = savedGaugeDisplay(place, now);
    return [gauge.reading ?? gauge.state, gauge.reading ? gauge.state : null, gauge.age].filter(Boolean).join(' · ');
  }
  const day = place.dam?.snapshot.schedule.find(d => d.scheduleDate === centralDayKey(now));
  if (day && savedScheduleState(day, new Date(now)) === 'Downloaded schedule' && day.hours.length === 24) {
    const runs: { from: number; to: number }[] = [];
    for (const hour of [...day.hours].sort((a, b) => a.hourEnding - b.hourEnding)) {
      if (hour.megawatts <= 0) continue;
      const last = runs.at(-1);
      if (last?.to === hour.hourEnding - 1) last.to = hour.hourEnding;
      else runs.push({ from: hour.hourEnding, to: hour.hourEnding });
    }
    return runs.length ? `Scheduled ${runs.map(r => windowLabel(r.from, r.to)).join(', ')} CT` : 'No generation scheduled today';
  }
  if (place.dam?.snapshot.schedule.length) return day ? 'Schedule out of date' : scheduleGroups(place, now).upcoming.length ? 'No schedule for today' : 'Schedule out of date';
  if (includeCamping && camping) return camping.summary;
  if (!place.detailsDownloadedAt) return 'Details not downloaded';
  const parking = place.facts.find(f => f.label === 'Parking')?.value;
  return (place.tags[0] ?? parking ?? place.amenities.join(' · ')) || null;
}
export function sortedPlaceDams(catalog: readonly DamCatalogEntry[], relatedIds: readonly string[], search = '') {
  const needle = search.trim().toLowerCase();
  return catalog.filter(d => `${d.name} ${d.lakeName ?? ''} ${d.state}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(relatedIds.includes(b.id)) - Number(relatedIds.includes(a.id)) || a.name.localeCompare(b.name));
}
