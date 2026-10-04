/**
 * Route to coordinates, never names: "Akers Ferry" is ambiguous to a geocoder.
 * Prefer a complete curated parking pair; never mix it with waterline coordinates.
 * The shuttle runs take-out → put-in, matching the plan's driveBack direction.
 * Outdoor URLs come from @eddy/geo and stay in parity with the website's
 * navigation/deepLinks.ts through its deep-links-parity.test.ts coverage.
 */
import { navCoordinatesFor, navLinksFor, type NavApp } from '@eddy/geo';

/** A destination, optionally with a curated road/parking approach. */
export interface DrivePoint {
  name: string;
  coordinates: { lng: number; lat: number };
  drivingLat?: number | null;
  drivingLng?: number | null;
}

export interface DirectionsChoice {
  app: NavApp | 'waze';
  label: string;
  group: 'Driving directions' | 'Outdoor maps';
  /** Omitted for Apple Maps: its HTTPS link also works without the app. */
  scheme?: string;
  deepLink: string;
  webFallback: string;
}

function coordinate(point: DrivePoint): string {
  const { lat, lng } = navCoordinatesFor(point);
  return `${lat},${lng}`;
}

export function driveToUrl(point: DrivePoint): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(coordinate(point))}&dirflg=d`;
}

/** The shuttle runs from the car left at the take-out back to the put-in. */
export function driveBetweenUrl(from: DrivePoint, to: DrivePoint): string {
  return `https://maps.apple.com/?saddr=${encodeURIComponent(coordinate(from))}&daddr=${encodeURIComponent(coordinate(to))}&dirflg=d`;
}

/** Road apps request a drive; outdoor apps show the same destination as a pin. */
export function directionsChoices(point: DrivePoint): DirectionsChoice[] {
  const destination = encodeURIComponent(coordinate(point));
  const appleUrl = driveToUrl(point);
  const outdoor = navLinksFor(navCoordinatesFor(point))
    .filter((link) => link.app === 'onx' || link.app === 'gaia')
    .map((link): DirectionsChoice => ({
      app: link.app,
      label: link.app === 'onx' ? 'onX Offroad' : 'Gaia GPS',
      group: 'Outdoor maps',
      scheme: link.scheme,
      deepLink: link.deepLink,
      webFallback: link.webFallback,
    }));

  return [
    { app: 'apple', label: 'Apple Maps', group: 'Driving directions', deepLink: appleUrl, webFallback: appleUrl },
    {
      app: 'google', label: 'Google Maps', group: 'Driving directions', scheme: 'comgooglemaps',
      // https://developers.google.com/maps/documentation/urls/ios-urlscheme
      deepLink: `comgooglemaps://?daddr=${destination}&directionsmode=driving`,
      webFallback: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
    },
    {
      app: 'waze', label: 'Waze', group: 'Driving directions', scheme: 'waze',
      // https://developers.google.com/waze/deeplinks
      deepLink: `waze://?ll=${destination}&navigate=yes`,
      webFallback: `https://waze.com/ul?ll=${destination}&navigate=yes`,
    },
    ...outdoor,
  ];
}

/** Probe on each explicit opening; a failed probe hides only that app. */
export async function installedDirectionsChoices(
  point: DrivePoint,
  canOpenURL: (url: string) => Promise<boolean>,
): Promise<DirectionsChoice[]> {
  const choices = directionsChoices(point);
  const installed = await Promise.all(choices.map(async (choice) => {
    if (!choice.scheme) return true;
    try { return await canOpenURL(`${choice.scheme}://`); } catch { return false; }
  }));
  return choices.filter((_, index) => installed[index]);
}

/** Report both failures to the chooser, instead of silently dropping the tap. */
export async function openDirectionsChoice(
  choice: DirectionsChoice,
  openURL: (url: string) => Promise<unknown>,
): Promise<void> {
  try {
    await openURL(choice.deepLink);
  } catch (error) {
    if (choice.webFallback === choice.deepLink) throw error;
    await openURL(choice.webFallback);
  }
}
