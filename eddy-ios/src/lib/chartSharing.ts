import { captureChart } from '@eddy/conditions/chart-snapshot';
import { chartShareQuery, parseChartShare, shareStation } from '@eddy/conditions/chart-share';

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
  const destination =
    station.provider === 'usace' ? `/dam/${station.siteId}` : `/gauge/${station.siteId}`;
  if (match[1] === 'gauge') return destination;
  const state = parseChartShare(station.provider, station.siteId, url.searchParams);
  return state
    ? `${destination}?chart=${encodeURIComponent(chartShareQuery(state))}`
    : `${destination}?shareUnavailable=1`;
}

export { chartView as nativeChartView } from '@eddy/conditions/chart-view';
