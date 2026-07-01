// src/lib/usgs/drainage.ts
//
// Drainage-area discharge transfer (audit F11). When a segment sits well above or
// below its anchoring gauge, the gauge's discharge over/understates the segment's
// flow. A standard first-order correction scales by the drainage-area ratio:
//     Q_seg ≈ Q_gauge * (A_seg / A_gauge)^b     with b ≈ 0.8–1.0
//
// CAVEAT (Ozark springs): area scaling underestimates below the big springs — Big
// Spring alone adds ~470 cfs of baseflow regardless of watershed area. Where a major
// spring lies between the gauge and the segment, prefer interpolating between two
// bracketing gauges over area scaling. Callers should pass a spring-adjusted A_seg or
// skip scaling in those reaches.

/** Exponent for area→flow transfer. ~0.9 is typical for humid mid-continent basins. */
export const DRAINAGE_TRANSFER_EXPONENT = 0.9;

/**
 * Scales a gauge discharge to a segment by drainage-area ratio. Returns the input
 * discharge unchanged when either area is missing/invalid (safe no-op), and clamps the
 * ratio so a bad area value can't produce an absurd flow.
 */
export function scaleDischargeByDrainageArea(
  dischargeCfsAtGauge: number,
  gaugeDrainageAreaSqmi: number | null | undefined,
  segmentDrainageAreaSqmi: number | null | undefined,
  exponent: number = DRAINAGE_TRANSFER_EXPONENT
): number {
  if (
    !(dischargeCfsAtGauge >= 0) ||
    gaugeDrainageAreaSqmi == null ||
    segmentDrainageAreaSqmi == null ||
    !(gaugeDrainageAreaSqmi > 0) ||
    !(segmentDrainageAreaSqmi > 0)
  ) {
    return dischargeCfsAtGauge;
  }
  const ratio = Math.pow(segmentDrainageAreaSqmi / gaugeDrainageAreaSqmi, exponent);
  // Clamp to a sane band (0.25×–4×) so a data error can't 10× the flow.
  const clamped = Math.min(4, Math.max(0.25, ratio));
  return dischargeCfsAtGauge * clamped;
}
