// Barrel for the map "chrome" — the detail rail + its cards, the 30-day
// timeline, the center detail modal, and the gauge hover overlay. The
// implementation now lives in ./chrome/*; this file keeps the original
// import path ('./Chrome') stable for MOSurfaceWaterApp and MOMap.

export { RightRail, SHEET_PEEK_FRACTION, ContextSiteCard } from './chrome/rail';
export { TimeScrubber } from './chrome/TimeScrubber';
export { DetailModal, type ModalSelection } from './chrome/DetailModal';
export { GaugeHoverOverlay } from './chrome/GaugeHoverOverlay';
export { flatlineDays, readingAge, DataAgeChip, UnchangedChip } from './chrome/shared';
export type { EddyReport } from './chrome/eddy-report';
