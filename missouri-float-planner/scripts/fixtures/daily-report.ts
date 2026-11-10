import type { RiverEmbedData } from '../../src/lib/embed/river-data';
import type { DamEmbedData } from '../../src/lib/embed/dam-data';
import { DAILY_REPORT_KIND, riverReportSlide, damReportSlide, type DailyReport } from '../../src/lib/social/daily-report';
import { computeTrend } from '../../shared/gauge-trend';

export const REPORT_FIXTURE_NOW = Date.parse('2026-11-10T15:30:00Z');
const at = new Date(REPORT_FIXTURE_NOW - 10 * 60_000).toISOString();
const ladder = { levelTooLow: 100, levelLow: 200, levelOptimalMin: 300, levelOptimalMax: 800, levelHigh: 1500, levelDangerous: 3000, unit: 'cfs' as const };
export const reportRiver: RiverEmbedData = {
  river: { id: 'r1', slug: 'current', name: 'Current River', path: '/rivers/missouri/current', state: 'MO', lengthMiles: 100, accessPointCount: 30, conditionCode: 'flowing', conditionLabel: 'Flowing', thresholdUnit: 'cfs' },
  primary: { id: 'g1', siteId: '07067000', name: 'Current River at Van Buren', isPrimary: true, provider: 'usgs', rated: true, unit: 'cfs', gaugeHeightFt: 2.4, dischargeCfs: 460,
    readingTimestamp: at, readingSuspect: false, qualifierNote: null, conditionCode: 'flowing', conditionLabel: 'Flowing', ladder, optimalRange: '300–800 cfs', trend: null, coordinates: null },
  secondary: [], take: null, weather: { tempF: 61, condition: 'Mostly sunny', highF: 66, lowF: 42, precipitation: 10 },
  chart: { days: 7, unit: 'cfs', thresholds: ladder, readings: Array.from({ length: 169 }, (_, i) => ({ timestamp: new Date(Date.parse(at) - (168 - i) * 3_600_000).toISOString(), value: Math.round(460 + 440 * Math.exp(-(((i - 82) / 25) ** 2))) })) },
  assembledAt: REPORT_FIXTURE_NOW,
};
const riverTrend = computeTrend(reportRiver.chart!.readings.map(r => ({ timestamp: r.timestamp, dischargeCfs: r.value, gaugeHeightFt: null })), 'cfs', 6);
reportRiver.primary!.trend = riverTrend?.direction ?? null;
reportRiver.primary!.trendWindowHours = riverTrend?.windowHours ?? null;
const metric = (value: number, unit = 'cfs') => ({ value, unit, at, staleness: 'fresh' as const });
export const reportDam: DamEmbedData = {
  powerhouse: true, tailwaterFishery: 'trout', assembledAt: REPORT_FIXTURE_NOW,
  dam: { id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', lakeName: 'Bull Shoals Lake', state: 'AR', lat: 36, lon: -92,
    hasTurbines: true, generationFloorCfs: 100, generating: true,
    generationReference: { units: 8, fullGenerationCfs: 26400, schedulingCapacityMw: 391, source: 'SWPA' },
    metrics: { generationFlow: metric(13200), tailwaterElevation: { ...metric(455.12, 'ft'), trend: { hours: 3, delta: 1.2 } }, poolElevation: metric(659.4, 'ft'), tailwaterTempF: metric(56, 'F') },
    schedule: ['2026-11-10', '2026-11-11'].map(scheduleDate => ({ scheduleDate, retrievedAt: at, idle: [], hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i >= 12 && i < 20 ? 200 : 0, cfs: null, isRamp: false })) })),
    sources: ['USACE CWMS', 'SWPA'],
  },
};
export const reportFixture: DailyReport = { kind: DAILY_REPORT_KIND, version: 1, capturedAt: new Date(REPORT_FIXTURE_NOW).toISOString(), slides: [riverReportSlide(reportRiver, REPORT_FIXTURE_NOW)!, damReportSlide(reportDam, REPORT_FIXTURE_NOW)!] };
