/**
 * Left edge for a label centred on a percentage marker and kept inside a track.
 *
 * Pure because the scale component has to measure its two widths at runtime,
 * while the edge behaviour is geometry we can pin without a native renderer.
 */
export function anchoredLabelLeft(
  trackWidth: number,
  labelWidth: number,
  markerPercent: number,
): number {
  if (
    !Number.isFinite(trackWidth) ||
    !Number.isFinite(labelWidth) ||
    !Number.isFinite(markerPercent) ||
    trackWidth <= 0 ||
    labelWidth <= 0
  ) {
    return 0;
  }

  const boundedLabelWidth = Math.min(labelWidth, trackWidth);
  const markerFraction = Math.min(Math.max(markerPercent / 100, 0), 1);
  const centred = markerFraction * trackWidth - boundedLabelWidth / 2;
  return Math.min(Math.max(centred, 0), trackWidth - boundedLabelWidth);
}
