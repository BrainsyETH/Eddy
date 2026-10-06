/** Selection and evidence of reach coverage are separate. An explicit curated
 * assignment can represent a reach across a boundary; proximity alone cannot. */
export function sectionGaugeSupportsReport(input: {
  curatedStationId: string | null;
  selectedStationId: string;
  startMile: number | null;
  endMile: number | null;
  gaugeMile: number | null;
}): boolean {
  if (input.curatedStationId) return input.curatedStationId === input.selectedStationId;
  const { startMile, endMile, gaugeMile } = input;
  return startMile != null && endMile != null && gaugeMile != null
    && [startMile, endMile, gaugeMile].every(Number.isFinite)
    && startMile < endMile && gaugeMile >= startMile && gaugeMile < endMile;
}
