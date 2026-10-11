// eddy-ios/src/float/hazardReports.ts
// The app's one hazard-report queue (src/lib/hazardReportQueue.ts) wired to
// the phone's storage and the reports API, plus when to try sending.
//
// Sending is tried when a report is added, when Eddy comes to the foreground,
// on a timer while anything is waiting, and from the locked-screen location
// task, so a report written with no signal goes out once the phone in the dry
// bag finds some. All of those funnel into one flush, which sends one at a
// time and only what is due.

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, fetchRiverDetail, submitHazardReport } from '@/api/client';
import { readRiver } from '@/lib/riverCache';
import { warn } from '@/lib/monitoring';
import {
  createReportQueue,
  isFinalRefusal,
  reportDescription,
  type HazardReport,
  type SendOutcome,
} from '@/lib/hazardReportQueue';

/** The river's id, from the phone when it can be; the API needs the UUID. */
async function riverIdFor(slug: string, signal: AbortSignal): Promise<string> {
  const cached = await readRiver(slug);
  const id = cached?.payload.river?.id;
  if (id) return id;
  return (await fetchRiverDetail(slug, signal)).id;
}

async function send(report: HazardReport, signal: AbortSignal): Promise<SendOutcome> {
  try {
    const riverId = await riverIdFor(report.riverSlug, signal);
    await submitHazardReport({
      riverId,
      latitude: report.latitude,
      longitude: report.longitude,
      description: reportDescription(report),
      capturedAt: report.capturedAt,
      clientReportId: report.id,
    }, signal);
    return { kind: 'sent' };
  } catch (error) {
    if (error instanceof ApiError && isFinalRefusal(error.status)) return { kind: 'refused', message: error.message };
    return { kind: 'retry' };
  }
}

const queue = createReportQueue(AsyncStorage, send, (message, detail) => warn('float', message, detail));

let timer: ReturnType<typeof setTimeout> | null = null;

/** Try to send what is due, then wake again when the next one is. */
export function flushHazardReports(budgetMs?: number): Promise<void> {
  return queue.flush(budgetMs).then(() => {
    if (timer) clearTimeout(timer);
    timer = null;
    const due = queue.nextDueAt();
    if (due != null && AppState.currentState === 'active') {
      timer = setTimeout(() => void flushHazardReports(), Math.max(1_000, due - Date.now()));
    }
  });
}

export function addHazardReport(report: Parameters<typeof queue.add>[0]): Promise<void> {
  return queue.add(report).then(() => void flushHazardReports());
}

// Foreground: anything waiting may be sendable now.
AppState.addEventListener('change', (state) => {
  if (state === 'active') void flushHazardReports();
});
void queue.ensureLoaded().then(() => {
  if (queue.nextDueAt() != null) void flushHazardReports();
});

export function useHazardReports(): readonly HazardReport[] {
  return useSyncExternalStore(queue.subscribe, queue.list, queue.list);
}
