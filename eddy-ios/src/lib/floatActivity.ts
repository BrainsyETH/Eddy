// Pure presentation and serialized delivery for Float Mode's native card.
// It shares the float screen's distance/pace model; it never tracks location.
import { formatBeyond, remainingCopy, STALE_POSITION_MS, viewSession, type FloatSession, type FloatStatus } from './floatSession';

export type ActivityAvailability = 'unavailable' | 'idle' | 'active' | 'dismissed' | 'disabled' | 'error';
export interface FloatActivitySnapshot {
  sessionId: string;
  state: {
    riverName: string;
    takeOutName: string;
    status: FloatStatus;
    milesText: string;
    progress: number | null;
    estimateText: string;
    estimateNote: string;
    estimateAsOf: number | null;
    lastFixAt: number | null;
    staleAt: number | null;
    paused: boolean;
    arrived: boolean;
    atRiverEnd: boolean;
    pastEnd: boolean;
    beyondText: string;
  };
}

// Bounded Unicode names keep the complete ActivityKit content below 4 KB.
const name = (value: string) => Array.from(value).slice(0, 80).join('');
export function floatActivitySnapshot(session: FloatSession, now: number): FloatActivitySnapshot {
  const view = viewSession(session, now);
  const copy = remainingCopy(view.estimate, view.takeOutBeyondMeters != null);
  return {
    sessionId: session.id,
    state: {
      riverName: name(view.riverName),
      takeOutName: name(view.takeOutName),
      status: view.status,
      milesText: view.startedPastTakeOut || view.milesLeft == null ? '—' : view.milesLeft.toFixed(1),
      progress: view.fraction == null ? null : Math.round(view.fraction * 100) / 100,
      estimateText: view.startedPastTakeOut ? 'Choose another take-out' : copy.headline,
      estimateNote: copy.note,
      estimateAsOf: view.positionAt,
      lastFixAt: view.positionAt,
      staleAt: view.positionAt == null ? null : view.positionAt + STALE_POSITION_MS,
      paused: view.estimate.paused,
      // The widget must still check status/system staleness before showing arrival.
      arrived: view.arrived && !view.startedPastTakeOut,
      atRiverEnd: view.atRiverEnd && !view.startedPastTakeOut,
      pastEnd: view.pastEnd || view.startedPastTakeOut,
      beyondText: view.takeOutBeyondMeters == null ? '' : `Take-out ${formatBeyond(view.takeOutBeyondMeters)} off the mapped river`,
    },
  };
}

const HEARTBEAT_MS = 60_000;
function displayKey(snapshot: FloatActivitySnapshot | null): string {
  if (!snapshot) return 'ended';
  const { lastFixAt: _lastFixAt, staleAt: _staleAt, estimateAsOf: _estimateAsOf, progress: _progress, ...visible } = snapshot.state;
  // Percent moves with the distance/ETA or heartbeat, rather than every fix.
  return JSON.stringify([snapshot.sessionId, visible]);
}

export interface FloatActivityBridge {
  sync(snapshot: FloatActivitySnapshot | null, allowStart: boolean): Promise<ActivityAvailability>;
}

/**
 * One call in flight, with the latest pending state coalesced. End supersedes
 * pending updates and is sent after an in-flight update, so an old update
 * cannot revive the card. Only a new float or explicit Show action may start.
 */
export function createFloatActivityController(
  bridge: FloatActivityBridge,
  changed: (availability: ActivityAvailability) => void,
  clock: () => number = Date.now,
) {
  type Pending = { snapshot: FloatActivitySnapshot | null; allowStart: boolean; force: boolean };
  let pending: Pending | null = null;
  let running: Promise<void> | null = null;
  let last: FloatActivitySnapshot | null | undefined;
  let lastDelivery = 0;
  let lastAttempt = 0;
  let attemptedSession: string | null | undefined;
  let availability: ActivityAvailability = 'idle';

  const publish = (next: ActivityAvailability) => {
    if (next === availability) return;
    availability = next;
    changed(next);
  };
  const drain = async () => {
    while (pending) {
      const current = pending;
      pending = null;
      const sameSession = current.snapshot?.sessionId === last?.sessionId;
      // Do not cosmetically refresh the date on a held, earlier-pace estimate.
      if (current.snapshot && last && sameSession && current.snapshot.state.paused && last.state.paused &&
          current.snapshot.state.milesText === last.state.milesText && current.snapshot.state.estimateText === last.state.estimateText) {
        current.snapshot.state.estimateAsOf = last.state.estimateAsOf;
      }
      const now = clock();
      if (!current.allowStart && !current.force) {
        if (availability === 'error' && attemptedSession === (current.snapshot?.sessionId ?? null) && now - lastAttempt < HEARTBEAT_MS) continue;
        if (availability !== 'error' && last !== undefined && sameSession && displayKey(current.snapshot) === displayKey(last) && now - lastDelivery < HEARTBEAT_MS) continue;
      }
      lastAttempt = now;
      attemptedSession = current.snapshot?.sessionId ?? null;
      try {
        const result = await bridge.sync(current.snapshot, current.allowStart);
        publish(result);
        // Failures remain retryable; never pretend an undelivered state landed.
        if (result !== 'error') {
          last = current.snapshot;
          lastDelivery = now;
        }
      } catch {
        publish('error');
      }
    }
  };
  const kick = (): Promise<void> => {
    // Keep a single promise through the final microtask too: a caller arriving
    // as drain finishes must not leave an update stranded until the next fix.
    running ??= Promise.resolve().then(drain).then(() => {
      running = null;
      if (pending) return kick();
    });
    return running;
  };
  return {
    observeAvailability: publish,
    sync(snapshot: FloatActivitySnapshot | null, options: { start?: boolean; force?: boolean } = {}): Promise<void> {
      const samePending = pending?.snapshot?.sessionId === snapshot?.sessionId;
      pending = {
        snapshot: snapshot ? { ...snapshot, state: { ...snapshot.state } } : null,
        allowStart: options.start === true || (samePending && pending?.allowStart === true),
        force: options.force === true || (samePending && pending?.force === true),
      };
      // Schedule as a microtask so synchronous callers coalesce too.
      return kick();
    },
    async settled(): Promise<void> {
      while (running) await running;
    },
  };
}
