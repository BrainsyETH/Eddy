import type { DemandBand } from '@eddy/conditions/camping-demand';
import { accent, neutral, secondary } from './palette';

/** Shared by the regional scale and its status pills. Light pill fills keep
 * the same dark ink readable across every band in either app theme. */
export const CAMPING_BAND_STYLES: Record<DemandBand, { scale: string; fill: string; ink: string }> = {
  quiet: { scale: secondary[200], fill: secondary[100], ink: neutral[950] },
  moderate: { scale: secondary[500], fill: secondary[200], ink: neutral[950] },
  busy: { scale: accent[400], fill: accent[100], ink: neutral[950] },
  crowded: { scale: accent[600], fill: accent[300], ink: neutral[950] },
  packed: { scale: accent[700], fill: accent[400], ink: neutral[950] },
};
