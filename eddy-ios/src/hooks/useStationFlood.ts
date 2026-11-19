import type { GaugeDetail } from '@eddy/types';
import { useGaugeDetail } from './useGaugeDetail';
import { useGaugeHistory } from './useGaugeHistory';
import { useObservationClock } from './useObservationClock';
import { floodReadingForStation, readingFlood, type FloodReading } from '@/lib/readingFlood';

/** Pass the screen's own detail (including its loading null) when it already owns the request. */
export function useStationFlood(siteId: string | null, supplied?: GaugeDetail | null, fallback?: FloodReading | null) {
  const { detail } = useGaugeDetail(supplied === undefined ? siteId : null);
  const station = supplied === undefined ? detail : supplied;
  const now = useObservationClock();
  const source = siteId ? floodReadingForStation(station?.siteId === siteId ? station : null, fallback ?? null, now) : null;
  // The forecast is independent of the observation window. Compact cards request the smallest
  // window; detail screens share the chart's week through the API's request pool.
  const days = supplied === undefined ? 1 : 7;
  const history = useGaugeHistory(source?.floodStages ? siteId : null, days);
  return readingFlood(source, history.matchesRequest ? history.history?.forecast : null, now);
}
