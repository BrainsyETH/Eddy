/** Measurement readiness gates a new selection, never later updates to an open one. */
export function sheetTransition(
  openedSelection: string | null,
  selection: string,
  initialReady: boolean,
  alreadyVisible: boolean,
): 'wait' | 'enter' | 'replace' | 'follow' {
  if (openedSelection === selection) return 'follow';
  if (!initialReady) return 'wait';
  return alreadyVisible ? 'replace' : 'enter';
}
