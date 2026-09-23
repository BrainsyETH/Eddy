import { CONTENT_BOTTOM_PAD } from './sheetGeometry';

/** Natural content, including the header spacer, excludes artificial scroll slack. */
export function measuredPageHeight(bodyHeight: number | null, budget: number): number {
  return Math.min((bodyHeight ?? 0) + CONTENT_BOTTOM_PAD, Math.max(0, budget));
}

/** Readiness requires native adoption of the measured size, even for an empty page. */
export function pageMeasurementReady(bodyHeight: number | null, viewportHeight: number | null, budget: number): boolean {
  return budget > 0 && bodyHeight !== null && viewportHeight !== null &&
    Math.abs(viewportHeight - measuredPageHeight(bodyHeight, budget)) < 1;
}
