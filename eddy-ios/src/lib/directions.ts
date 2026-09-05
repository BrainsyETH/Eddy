// eddy-ios/src/lib/directions.ts
// Turning a float plan into the two or three drives it actually takes, and
// handing the last mile off to whatever map app is better at gravel than we are.
//
// A float has more driving in it than paddling for most people: get to the
// put-in, leave a car at the take-out, and run the shuttle between them. The
// website answers that with Google Maps links; on a phone the answer has to be
// a handoff to whatever the phone already trusts for navigation.
//
// ── Apple Maps for the DRIVE ────────────────────────────────────────────────
// Apple Maps is guaranteed present on every iPhone, so a link into it can never
// fail. That is why driveToUrl and driveBetweenUrl are unconditional and why
// turn-by-turn is never offered as a choice — a primary action that sometimes
// isn't there is worse than one that always is. The https form is used rather
// than the maps:// scheme because it degrades to a real page if this ever runs
// anywhere but iOS.
//
// ── onX and Gaia for the LAST MILE ──────────────────────────────────────────
// This file used to stop there, on the reasoning that offering alternatives
// would mean shipping LSApplicationQueriesSchemes and a canOpenURL probe just to
// decide whether to draw a second button. That reasoning was right about the
// cost and wrong about the benefit, and the website had already settled the
// question — src/lib/navigation/deepLinks.ts has offered onX and Gaia on the
// access-point page since it shipped.
//
// The benefit it missed: these are not redundant road maps. The last half mile
// to an Ozark put-in is frequently an unnamed track that consumer road maps do
// not draw and will not route down. onX and Gaia do, and the people who own
// them own them for exactly this. Apple Maps answers "get me to the area"; they
// answer "which of these two ruts is the one".
//
// The cost is real and is paid honestly: the three schemes are declared in
// app.json under ios.infoPlist.LSApplicationQueriesSchemes (iOS answers `false`
// to canOpenURL for anything undeclared, so an omission here reads as "not
// installed" and the button silently never appears), and navLinksForPoint
// filters to what the phone actually has. NOT INSTALLED MEANS NOT SHOWN — a
// button that bounces to the App Store is a dead end dressed as an action.
//
// ── One definition, two apps ────────────────────────────────────────────────
// The URLs themselves live in @eddy/geo so the app and the website cannot drift
// on what an onX link looks like. The website keeps its own copy because Vercel
// installs only missouri-float-planner/; a test in the web suite asserts the two
// agree. See deep-links-parity.test.ts.
//
// Coordinates rather than names, always. "Akers Ferry" is ambiguous to a
// geocoder and an Ozark access point is frequently not in one at all; the
// latitude and longitude we hold are the only unambiguous thing about it.

import { Linking } from 'react-native';
import { navCoordinatesFor, navLinksFor, type NavLinkSpec } from '@eddy/geo';

export type { NavLinkSpec, NavApp } from '@eddy/geo';

/** Where a drive starts or ends. Anything with a coordinate will do. */
export interface DrivePoint {
  name: string;
  coordinates: { lng: number; lat: number };
}

function coord(point: DrivePoint): string {
  return `${point.coordinates.lat},${point.coordinates.lng}`;
}

/** Anything a curator may have recorded a parking coordinate for. */
export interface ParkablePoint {
  name: string;
  coordinates: { lng: number; lat: number };
  drivingLat?: number | null;
  drivingLng?: number | null;
}

/**
 * Where a drive to an access point should end, and whether that is the
 * parking or the water.
 *
 * A gravel bar's coordinate sits on the waterline; its parking can be a quarter
 * mile up a track. `drivingLat/Lng` is that parking when an admin has entered
 * it, and it is what navigation must prefer — routing someone to the waterline
 * hands them a destination with no road to it and a track they may not be able
 * to reverse out of.
 *
 * Most access points (372 of 406 at the last count) have NO parking coordinate,
 * so the fallback is the common case, not the edge. That is why this returns
 * `usedParking` beside the point rather than silently choosing: the surface
 * that draws the Directions button has to be able to say which of the two it
 * is about to open. One helper, so the sentence it justifies is written once
 * (NO_PARKING_COORDINATE_NOTE) and the choice is made the same way on the
 * access screen, the plan result and the map sheet.
 *
 * The coordinate choice itself is @eddy/geo's navCoordinatesFor, shared with
 * the website, so the two cannot disagree about where "there" is.
 */
export interface DriveTarget {
  point: DrivePoint;
  /** True when the drive ends at a recorded parking coordinate. */
  usedParking: boolean;
}

export function driveTargetFor(accessPoint: ParkablePoint): DriveTarget {
  const nav = navCoordinatesFor(accessPoint);
  return {
    point: { name: nav.label ?? accessPoint.name, coordinates: { lat: nav.lat, lng: nav.lng } },
    usedParking: accessPoint.drivingLat != null && accessPoint.drivingLng != null,
  };
}

/**
 * Said beside a Directions button that will end at the water.
 *
 * Plain about the consequence rather than the data model: "no parking
 * coordinate recorded" is our problem, "stop where the road ends" is theirs.
 */
export const NO_PARKING_COORDINATE_NOTE =
  'No parking location recorded — directions point to the mapped river access. Stop where the road ends.';

/** The label a Directions button wears for each of the two destinations. */
export function directionsLabel(target: DriveTarget): string {
  return target.usedParking ? 'Directions' : 'Directions to the water';
}

/** "37.3762, -91.5563" — for the Garmin or onX user who types coordinates by hand. */
export function coordinateLine(point: DrivePoint): string {
  return `${point.coordinates.lat.toFixed(4)}, ${point.coordinates.lng.toFixed(4)}`;
}

/** Directions from wherever the phone is now to a single point. */
export function driveToUrl(point: DrivePoint): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(coord(point))}&dirflg=d`;
}

/**
 * Directions between two of the plan's own points — the shuttle.
 *
 * Take-out → put-in is the direction the shuttle drives (you leave a car at the
 * bottom and drive back up to the water), and it is the same direction the plan's
 * own `driveBack` estimate is measured in, so the two agree.
 */
export function driveBetweenUrl(from: DrivePoint, to: DrivePoint): string {
  return `https://maps.apple.com/?saddr=${encodeURIComponent(coord(from))}&daddr=${encodeURIComponent(coord(to))}&dirflg=d`;
}

/**
 * The USGS page for a gauge, when we know its site number.
 *
 * The monitoring-location path is USGS's current canonical URL; the older
 * `?site_no=` query form redirects to it. Returns null rather than a guessed URL
 * when the plan came back without a site id — a dead link on a safety-adjacent
 * number is worse than no link.
 */
export function usgsGaugeUrl(siteId: string | null | undefined): string | null {
  if (!siteId) return null;
  return `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(siteId)}/`;
}

/**
 * Apple is excluded from the alternatives row.
 *
 * Not because it is unwanted — because it is already the primary Directions
 * button above the row, and it is a different question there. Apple's entry in
 * @eddy/geo drops a PIN (`?q=&ll=`); driveToUrl starts NAVIGATION (`?daddr=`).
 * Listing "Apple" beside a button that already says Directions would offer the
 * same app twice for two things a user reads as one.
 */
const ALTERNATIVE_APPS = ['onx', 'gaia', 'google'] as const;

/**
 * The map apps installed on this phone that can show this access point.
 *
 * Async because canOpenURL is, and probed per app rather than once at startup:
 * someone can install onX between two screens, and the answer costs a few
 * milliseconds. A probe that throws is treated as "not installed" — the only
 * ways it fails are an undeclared scheme or a malformed URL, and both mean the
 * button would not have worked.
 *
 * Returns [] when none are installed, which callers must render as NOTHING
 * rather than as an empty row with a heading over it.
 */
export async function installedNavLinks(point: {
  name: string;
  coordinates: { lng: number; lat: number };
  drivingLat?: number | null;
  drivingLng?: number | null;
}): Promise<NavLinkSpec[]> {
  const links = navLinksFor(navCoordinatesFor(point)).filter((link) =>
    (ALTERNATIVE_APPS as readonly string[]).includes(link.app)
  );

  const probes = await Promise.all(
    links.map(async (link) => {
      try {
        return await Linking.canOpenURL(`${link.scheme}://`);
      } catch {
        return false;
      }
    })
  );

  return links.filter((_, i) => probes[i]);
}

/**
 * Open one of those links, falling back to the open web.
 *
 * The fallback should be unreachable — the link was only drawn because
 * canOpenURL said yes — but an app can be uninstalled while this screen is on
 * screen, and landing on webmap.onxmaps.com beats landing nowhere.
 */
export async function openNavLink(link: NavLinkSpec): Promise<void> {
  try {
    await Linking.openURL(link.deepLink);
  } catch {
    await Linking.openURL(link.webFallback).catch(() => {});
  }
}
