import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { useRiverForecast } from '@/hooks/useRiverForecast';
import { useForecastByCoords } from '@/hooks/useWeather';
import { computeTrend } from '@/lib/gauge-trend';
import { buildRiverOutlookState } from '@/lib/river-outlook';
import type { ConditionThresholds } from '@/lib/conditions';

interface UseRiverOutlookOptions {
  siteId: string | null;
  lat: number | null;
  lon: number | null;
  trendUnit: 'ft' | 'cfs';
  stageThresholds: ConditionThresholds | null;
}

export function useRiverOutlook({
  siteId,
  lat,
  lon,
  trendUnit,
  stageThresholds,
}: UseRiverOutlookOptions) {
  const weatherQuery = useForecastByCoords(lat, lon, !!siteId);
  const riverQuery = useRiverForecast(siteId);
  const historyQuery = useGaugeHistory(siteId, 14);
  const trend = computeTrend(historyQuery.data?.readings, trendUnit, 6);

  return buildRiverOutlookState({
    weatherDays: weatherQuery.data?.days ?? [],
    weatherPending: weatherQuery.isPending,
    weatherError: weatherQuery.isError,
    riverStages: riverQuery.data?.stages ?? [],
    riverPending: riverQuery.isPending,
    trend,
    stageThresholds,
  });
}
