import { centralDayKey, nextDayKey } from '@shared/dam-schedule-copy';
import { damStorySnapshot, forecastStorySnapshot, releaseStorySnapshot, type DamPostOption } from '@shared/social-dam-schedule';
import { fetchOsageReadings } from '@/lib/ameren/osage';
import { readForecast, readSchedule } from '@/lib/data/dams';
import { hasPowerhouse, USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import { SWPA_PROJECTS } from '@/lib/usace/swpa';

export const damPostOptions: DamPostOption[] = Object.values(USACE_DAMS)
  .filter(hasPowerhouse)
  .map((dam): DamPostOption => ({
    id: dam.id, name: dam.name,
    kind: dam.swpaCode ? 'schedule' : dam.series.generationForecast ? 'forecast' : dam.amerenMetrics === 'osage' ? 'release' : 'unavailable',
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

export async function loadDamPost(damId: string, date?: string) {
  const option = damPostOptions.find(dam => dam.id === damId);
  if (!option) throw new Error('Choose a dam with a powerhouse.');
  const { id, name } = option;
  const dam = { id, name };
  const entry = USACE_DAMS[id];
  const now = Date.now();
  const today = centralDayKey(now);
  if (option.kind === 'release') {
    if (date !== undefined) throw new Error('Choose the latest measured release for this dam.');
    return releaseStorySnapshot(dam, await fetchOsageReadings(), now);
  }
  const day = date ?? today;
  if (day !== today && day !== nextDayKey(today)) throw new Error('Choose today or tomorrow in Central time.');
  if (option.kind === 'forecast') return forecastStorySnapshot(dam, await readForecast(entry), day, now);
  if (!entry.swpaCode) throw new Error('Eddy has no generation data for this powerhouse yet.');
  const schedule = await readSchedule(entry, 2);
  return damStorySnapshot(schedule.find(s => s.scheduleDate === day), day, now, SWPA_PROJECTS[entry.swpaCode]?.capacityMw, dam);
}
