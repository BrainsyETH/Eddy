/** Restore the same entity after reordering; never reuse another account's selection. */
export function railSelectionIndex(
  ids: readonly string[],
  selection: { scope: string; id: string } | null,
  scope: string,
): number {
  return selection?.scope === scope ? Math.max(0, ids.indexOf(selection.id)) : 0;
}

/** Works during a drag as well as during momentum, including iOS overscroll. */
export function railIndexAtOffset(offset: number, interval: number, count: number): number {
  if (count <= 0 || interval <= 0 || !Number.isFinite(offset)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offset / interval)));
}
