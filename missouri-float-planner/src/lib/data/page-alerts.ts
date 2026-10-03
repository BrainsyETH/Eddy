import type { RiverAlert } from '@/types/api';

/** Keep optional alert failures outside the successful-data cache. */
export async function loadPageAlerts(load: () => Promise<RiverAlert[]>) {
  try {
    return { alerts: await load(), unavailable: false };
  } catch (error) {
    console.warn('[river-page] Alerts unavailable:', error);
    return { alerts: [] as RiverAlert[], unavailable: true };
  }
}
