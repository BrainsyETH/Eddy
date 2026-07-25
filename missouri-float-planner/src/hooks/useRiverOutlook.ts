import { useMemo } from 'react';
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

  const weatherDays = weatherQuery.data?.days;
  const riverStages = riverQuery.data?.stages;
  const readings = historyQuery.data?.readings;

  // A fresh object each render would defeat every downstream useMemo that
  // depends on the outlook.
  return useMemo(() => {
    const trend = computeTrend(readings, trendUnit, 6);
    return buildRiverOutlookState({
      weatherDays: weatherDays ?? [],
      weatherPending: weatherQuery.isPending,
      weatherError: weatherQuery.isError,
      riverStages: riverStages ?? [],
      riverPending: riverQuery.isPending,
      trend,
      stageThresholds,
    });
  }, [
    weatherDays,
    weatherQuery.isPending,
    weatherQuery.isError,
    riverStages,
    riverQuery.isPending,
    readings,
    trendUnit,
    stageThresholds,
  ]);
}
