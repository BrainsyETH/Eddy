import type { DemandBand } from '@eddy/conditions/camping-demand';
import { accent, support, type Palette } from './palette';

// Camping availability, not a river-safety verdict. Light mode uses richer
// gold/orange shades so even yellow stays visible against the pale track.
// The percentage and outcome carry the meaning without relying on color.
const METER_COLORS = {
  light: { green: support[700], yellow: '#A67C00', orange: '#C25A13', red: accent[700] },
  dark: { green: support[500], yellow: '#FACC15', orange: '#FB923C', red: '#F87171' },
} as const;

const BAND_COLOR: Record<DemandBand, keyof typeof METER_COLORS.light> = {
  quiet: 'green',
  moderate: 'yellow',
  busy: 'orange',
  crowded: 'red',
  packed: 'red',
};

/** Increasing booked share means fewer available sites, from green to red. */
export function campingMeterColor(band: DemandBand, scheme: Palette['scheme']): string {
  return METER_COLORS[scheme][BAND_COLOR[band]];
}
