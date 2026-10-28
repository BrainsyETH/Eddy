/** Stable selection independent of native draw order and duplicate label/icon hits. */
export function nextPinId(ids: readonly string[], selected: string | null | undefined): string | null {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return null;
  return unique[(unique.indexOf(selected ?? '') + 1) % unique.length];
}

export function pointNeedsReveal(
  point: readonly number[], size: { width: number; height: number },
  padding: { paddingTop: number; paddingBottom: number; paddingLeft: number; paddingRight: number },
): boolean {
  const [x, y] = point;
  const gap = 22; // Keep the entire touch target above the sheet and below chrome.
  return !Number.isFinite(x) || !Number.isFinite(y) ||
    x < padding.paddingLeft + gap || x > size.width - padding.paddingRight - gap ||
    y < padding.paddingTop + gap || y > size.height - padding.paddingBottom - gap;
}

export function gestureStarted(previous: boolean, active: boolean): boolean {
  return active && !previous;
}
