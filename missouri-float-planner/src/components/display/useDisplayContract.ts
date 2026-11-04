'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  postDisplayEvent,
  type DisplayFormat,
  type DisplayId,
  type DisplayReadings,
  type DisplayScenery,
} from '@/lib/embed/display-events';

/**
 * The display contract's sending side (docs/embeds.md#display-contract):
 * `ready` once the first readings request has settled, `status` whenever
 * readings or scenery change, and `postBreak` for the display to call at its
 * natural cut points. Every message is a no-op when the page is not framed.
 * `readings` null means the first request is still pending.
 */
export function useDisplayContract(
  display: DisplayId,
  format: DisplayFormat,
  readings: DisplayReadings | null,
  scenery: DisplayScenery
) {
  const ready = useRef(false);
  const breaks = useRef(0);

  useEffect(() => {
    if (readings == null) return;
    if (!ready.current) {
      ready.current = true;
      postDisplayEvent({ type: 'eddy-display:ready', v: 1, display, format });
    }
    postDisplayEvent({ type: 'eddy-display:status', v: 1, display, readings, scenery });
  }, [display, format, readings, scenery]);

  return useCallback(
    (total: number, next?: string) => {
      breaks.current += 1;
      postDisplayEvent({
        type: 'eddy-display:break',
        v: 1,
        display,
        completed: breaks.current,
        total: Math.max(1, total),
        ...(next ? { next } : {}),
      });
    },
    [display]
  );
}
