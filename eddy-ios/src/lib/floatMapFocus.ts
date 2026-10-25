import type { LngLat } from '@eddy/geo';

export interface FloatMapFocus {
  id: number;
  sessionId: string;
  point: LngLat;
  title: string;
  detail: string;
}

/** Commands are consumed once; the mounted map owns its temporary highlight. */
export function createFloatMapFocusStore() {
  let sequence = 0;
  let pending: FloatMapFocus | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    snapshot: () => pending,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    request(next: Omit<FloatMapFocus, 'id'>) {
      const request = { ...next, id: ++sequence };
      pending = request;
      notify();
      return request;
    },
    consume(id: number): FloatMapFocus | null {
      if (pending?.id !== id) return null;
      const applied = pending;
      pending = null;
      notify();
      return applied;
    },
  };
}
