import { centralDayKey, nextDayKey } from '@shared/dam-schedule-copy';
import { DAM_STORY_ID, damStorySnapshot } from '@shared/social-dam-schedule';
import { fetchDamSummary } from '@/lib/data/dams';

export async function loadDamStorySchedule(date: string) {
  const now = Date.now();
  if (date !== centralDayKey(now) && date !== nextDayKey(centralDayKey(now))) throw new Error('Choose a schedule for today or tomorrow in Central time.');
  const dam = await fetchDamSummary(DAM_STORY_ID, { scheduleDays: 2 });
  return damStorySnapshot(dam?.schedule.find(day => day.scheduleDate === date), date, now, dam?.generationReference?.schedulingCapacityMw);
}
