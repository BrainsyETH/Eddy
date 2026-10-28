// eddy-ios/src/float/hazardReports.ts
// The app's one hazard-report queue (src/lib/hazardReportQueue.ts) wired to
// the phone's storage and the reports API, plus when to try sending.
//
// Sending is tried when a report is added, when Eddy comes to the foreground,
// on a timer while anything is waiting, and on each recorded GPS fix during a
// float (flushDueHazardReports). The timer runs in the foreground and, during
// a float, in the background too; but iOS can hold a JavaScript timer back
// with the phone locked, so the fix path is what carries a report written
// with no signal out of the dry bag once the phone finds some: the recorder's
// background session (ADR 0014) wakes JavaScript with every fix. With no
// float, a backgrounded Eddy is suspended and the next foreground tries
// again. All of those funnel into one flush, which sends one at a time and
// only what is due. Locked-phone delivery is still a device gate.

import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, fetchRiverDetail, submitHazardReport } from '@/api/client';
import { getFloatSession } from '@/lib/floatSessionStore';
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
    if (due != null && (AppState.currentState === 'active' || getFloatSession() != null)) {
      timer = setTimeout(() => void flushHazardReports(), Math.max(1_000, due - Date.now()));
    }
  });
}

/** How long a send started from a GPS fix may run: well inside a background wake. */
const FIX_FLUSH_BUDGET_MS = 20_000;
let lastFixFlushAt = 0;

/**
 * Called on every recorded fix (src/float/recorder.ts). With the phone
 * locked, iOS can hold back a JavaScript timer even while the recorder keeps
 * Eddy alive, so the retry timer alone did not prove a report would go out
 * in the dry bag; a fix delivery is execution time iOS has already granted.
 * Sends only what is due, at most every 30 seconds, and bounded so a slow
 * network cannot hold that wake open.
 */
export function flushDueHazardReports(now = Date.now()): void {
  const due = queue.nextDueAt();
  if (due == null || due > now || now - lastFixFlushAt < 30_000) return;
  lastFixFlushAt = now;
  void flushHazardReports(FIX_FLUSH_BUDGET_MS);
}

/** Start the attempts again for a report Eddy gave up on. */
export function retryHazardReport(id: string): Promise<boolean> {
  return queue.retry(id).then(async (retried) => {
    // The queue retries once itself; rejoin the scheduler so another network
    // failure still gets the normal automatic attempts.
    if (retried) await flushHazardReports();
    return retried;
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

/** Withdraw a report that has not been sent (a mistake, or a wrong place). */
export function removeHazardReport(id: string): Promise<boolean> {
  return queue.remove(id);
}

/** Account deletion: every report, sent or not. Positions must not outlive the account. */
export async function clearHazardReports(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  await queue.clear();
}
