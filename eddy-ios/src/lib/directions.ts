// Single-location handoffs use DirectionsMenu. The shuttle remains an explicit
// take-out → put-in drive, separate from opening either endpoint on its own.
export { driveToUrl, driveBetweenUrl, type DrivePoint } from './directionsChoices';

/** The USGS page is available only when the plan supplies a station number. */
export function usgsGaugeUrl(siteId: string | null | undefined): string | null {
  if (!siteId) return null;
  return `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(siteId)}/`;
}
