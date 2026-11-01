import { captureChart } from '@eddy/conditions/chart-snapshot';
import {
  chartShareAppPath,
  parseChartShare,
  shareStation,
  stationAppPath,
} from '@eddy/conditions/chart-share';

export const captureNativeChart = captureChart;

/** Runs before tab selection on both warm and cold starts. Unknown versions restore nothing. */
export function sharedGaugeDestination(local: string): string | null {
  const url = new URL(local, 'https://eddy.guide');
  const match = url.pathname.match(/^\/share\/(gauge|chart)\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;
  const station = shareStation(match[2], match[3]);
  // Preserve the invalid path so Expo Router explains that the link was not
  // found, instead of silently sending the user to an unrelated Today screen.
  if (!station) return local;
  if (match[1] === 'gauge') return stationAppPath(station);
  // The Smart App Banner on the share page calls chartShareAppPath too.
  return chartShareAppPath(station, parseChartShare(station.provider, station.siteId, url.searchParams));
}

export { chartView as nativeChartView } from '@eddy/conditions/chart-view';
