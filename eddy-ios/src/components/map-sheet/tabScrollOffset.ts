/** Keep the shared header at the same collapse position when changing tabs.
 * Deeper page positions survive only while that header is fully collapsed.
 */
export function tabScrollOffset(current: number, incoming: number, headerHeight: number): number {
  const height = Math.max(0, headerHeight);
  if (height === 0) return Math.max(0, incoming);
  const collapse = Math.min(height, Math.max(0, current));
  return collapse < height ? collapse : Math.max(height, incoming);
}
