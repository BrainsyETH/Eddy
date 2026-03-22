// src/lib/eddy/rain-lag.ts
// Static per-river rain-to-river response times and recovery rates.
// Used by buildPrompt() to give the AI model context about how quickly
// each river responds to rainfall and recovers from high water.

export interface RainLagInfo {
  /** Typical hours from local rain to gauge response */
  hours: number;
  /** Short description for the prompt */
  note: string;
  /** Typical drop rate when falling from high water (ft/day) — estimate, refine with observations */
  dropRateFtPerDay: string;
}

export const RAIN_LAG: Record<string, RainLagInfo> = {
  'current': {
    hours: 8,
    note: 'Large spring inputs buffer light rain. Heavy rain shows in 6-12 hours.',
    dropRateFtPerDay: '0.2-0.4 ft/day (slow, large spring base flow)',
  },
  'jacks-fork': {
    hours: 4,
    note: 'Small watershed with limited spring input responds fast, 3-6 hours. Flash rises are common.',
    dropRateFtPerDay: '1-3 ft/day (drops as fast as it rises)',
  },
  'meramec': {
    hours: 6,
    note: 'Large watershed, responds in 4-8 hours depending on intensity. Can spike 5-10 ft after heavy storms.',
    dropRateFtPerDay: '0.5-2 ft/day (floatable above Hwy 8 ~36h after rain stops)',
  },
  'eleven-point': {
    hours: 8,
    note: 'Greer Spring stabilizes lower sections. Upper sections respond to rain in 6-10 hours.',
    dropRateFtPerDay: '0.3-0.6 ft/day (Greer Spring stabilizes)',
  },
  'niangua': {
    hours: 10,
    note: 'Bennett Spring provides stable base flow. Rain response is moderate, 8-12 hours.',
    dropRateFtPerDay: '0.3-0.5 ft/day (Bennett Spring stabilizes)',
  },
  'big-piney': {
    hours: 6,
    note: 'Lower volume spring inputs. Responds to rain in 5-8 hours.',
    dropRateFtPerDay: '0.3-0.6 ft/day (lower volume, steady spring base)',
  },
  'huzzah': {
    hours: 3,
    note: 'Small watershed creek. Responds quickly, 2-4 hours. Drops fast in dry spells.',
    dropRateFtPerDay: '1-2 ft/day (small watershed drains fast)',
  },
  'courtois': {
    hours: 3,
    note: 'Small watershed creek, similar to Huzzah. Fast response, 2-4 hours.',
    dropRateFtPerDay: '1-2 ft/day (similar to Huzzah)',
  },
};
