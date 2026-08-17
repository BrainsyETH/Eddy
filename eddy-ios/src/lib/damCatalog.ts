// eddy-ios/src/lib/damCatalog.ts
// Where the Corps' dams ARE, shipped with the app.
//
// ── Why this is in the binary and not in a cache ──────────────────────────
//
// The Lakes & dams layer drew nothing whenever /api/dams was slow, and it is
// slow exactly when nobody has asked recently: the route reads through to CWMS
// and SWPA live for two dozen projects, so a cold CDN entry costs between five
// and fifty seconds against a fifteen-second client deadline. The layer then
// went empty and STAYED empty, because the map's request latch is set before
// the fetch and never reset.
//
// A cache of the last good response would have fixed the second visit and not
// the first. A fresh install, on a cold endpoint, at a put-in with one bar, has
// no last good response — and that is the reader this app is for.
//
// So identity and location ship as source. They are the half of a dam that
// cannot change between releases: the Corps does not move Bull Shoals. What
// genuinely changes — whether the units are turning, what is coming out, how
// high the lake is — still comes from the network and still degrades to
// nothing, which is the honest treatment for a fact nobody has measured.
//
// ── The duplication, and what guards it ───────────────────────────────────
//
// The registry these rows come from is `USACE_DAMS` in the web app's
// src/lib/flow-providers/usace-registry.ts, which also carries CWMS series
// specs, SWPA codes and nameplate figures — none of which a map pin needs, and
// none of which belongs in a phone binary. The app cannot import it anyway:
// Vercel installs only missouri-float-planner/, so the dependency may not point
// that way, and the same constraint is why campsiteAvailabilityLine and the
// public-land styles are duplicated too.
//
// dam-catalog-parity.test.ts in the web suite is the guard. It fails if a dam is
// added, removed, renamed, or moved on either side — which is the only way this
// file can go wrong, since nothing here is derived.
//
// ── A pure .ts module, on purpose ────────────────────────────────────────
//
// The web suite type-checks and runs this file, and resolves `@/*` to its OWN
// src/, so nothing here may import through the app alias or from a .tsx. Same
// constraint as availability.ts and placeSymbol.ts — see their headers.

/** A dam's immutable half: who it is and where. */
export interface DamCatalogEntry {
  /** Eddy's slug — `DamSnapshot.id`, and the dam screen's route segment. */
  id: string;
  name: string;
  /** The lake behind it. Null for the handful with no impoundment name. */
  lakeName: string | null;
  state: 'MO' | 'AR' | 'OK' | 'TX' | 'KY' | 'TN';
  lat: number;
  lon: number;
}

/**
 * Every dam Eddy tracks, by id.
 *
 * Ordered by id so a diff against the registry reads as a diff rather than as a
 * reshuffle. Coordinates are verbatim from the registry, to the digit: the
 * parity test compares them exactly, because a pin quietly moved half a mile is
 * the failure mode a rounded copy would introduce.
 */
export const DAM_CATALOG: DamCatalogEntry[] = [
  { id: 'ameren-bagnell-dam', name: 'Bagnell Dam', lakeName: 'Lake of the Ozarks', state: 'MO', lat: 38.2019, lon: -92.6228 },
  { id: 'lrn-center-hill-dam', name: 'Center Hill Dam', lakeName: 'Center Hill Lake', state: 'TN', lat: 36.0963889, lon: -85.8205556 },
  { id: 'lrn-dale-hollow-dam', name: 'Dale Hollow Dam', lakeName: 'Dale Hollow Lake', state: 'TN', lat: 36.538333, lon: -85.451111 },
  { id: 'lrn-wolf-creek-dam', name: 'Wolf Creek Dam', lakeName: 'Lake Cumberland', state: 'KY', lat: 36.868333, lon: -85.146944 },
  { id: 'mvs-mark-twain', name: 'Mark Twain Lake', lakeName: 'Mark Twain Lake', state: 'MO', lat: 39.5342, lon: -91.6521 },
  { id: 'mvs-wappapello', name: 'Wappapello Lake', lakeName: 'Wappapello Lake', state: 'MO', lat: 36.9331, lon: -90.2837 },
  { id: 'nwk-stockton-dam', name: 'Stockton Dam', lakeName: 'Stockton Lake', state: 'MO', lat: 37.6672, lon: -93.7583 },
  { id: 'nwk-truman-dam', name: 'Harry S. Truman Dam', lakeName: 'Truman Lake', state: 'MO', lat: 38.2653, lon: -93.4054 },
  { id: 'swl-beaver-dam', name: 'Beaver Dam', lakeName: 'Beaver Lake', state: 'AR', lat: 36.421283333333, lon: -93.847616666667 },
  { id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', lakeName: 'Bull Shoals Lake', state: 'AR', lat: 36.3657191, lon: -92.574845 },
  { id: 'swl-clearwater-dam', name: 'Clearwater Dam', lakeName: 'Clearwater Lake', state: 'MO', lat: 37.1349222, lon: -90.7708833 },
  { id: 'swl-dardanelle-dam', name: 'Dardanelle Lock & Dam', lakeName: 'Lake Dardanelle', state: 'AR', lat: 35.24731, lon: -93.17323 },
  { id: 'swl-greers-ferry-dam', name: 'Greers Ferry Dam', lakeName: 'Greers Ferry Lake', state: 'AR', lat: 35.52103, lon: -91.99362 },
  { id: 'swl-norfork-dam', name: 'Norfork Dam', lakeName: 'Norfork Lake', state: 'AR', lat: 36.24863, lon: -92.23786 },
  { id: 'swl-ozark-dam', name: 'Ozark Lock & Dam', lakeName: 'Ozark Lake', state: 'AR', lat: 35.47333, lon: -93.81 },
  { id: 'swl-table-rock-dam', name: 'Table Rock Dam', lakeName: 'Table Rock Lake', state: 'MO', lat: 36.59539, lon: -93.31106 },
  { id: 'swt-broken-bow-dam', name: 'Broken Bow Dam', lakeName: 'Broken Bow Lake', state: 'OK', lat: 34.14306, lon: -94.69444 },
  { id: 'swt-denison-dam', name: 'Denison Dam', lakeName: 'Lake Texoma', state: 'TX', lat: 33.81806, lon: -96.57222 },
  { id: 'swt-eufaula-dam', name: 'Eufaula Dam', lakeName: 'Eufaula Lake', state: 'OK', lat: 35.30694, lon: -95.3625 },
  { id: 'swt-fort-gibson-dam', name: 'Fort Gibson Dam', lakeName: 'Fort Gibson Lake', state: 'OK', lat: 35.87111, lon: -95.22861 },
  { id: 'swt-keystone-dam', name: 'Keystone Dam', lakeName: 'Keystone Lake', state: 'OK', lat: 36.15167, lon: -96.25167 },
  { id: 'swt-robert-s-kerr-dam', name: 'Robert S. Kerr Lock & Dam', lakeName: 'Robert S. Kerr Reservoir', state: 'OK', lat: 35.34791, lon: -94.77846 },
  { id: 'swt-tenkiller-dam', name: 'Tenkiller Ferry Dam', lakeName: 'Tenkiller Ferry Lake', state: 'OK', lat: 35.59667, lon: -95.04917 },
  { id: 'swt-webbers-falls-dam', name: 'Webbers Falls Lock & Dam', lakeName: 'Webbers Falls Reservoir', state: 'OK', lat: 35.55445, lon: -95.16773 },
];

/** The subtitle a pin wears — `Bull Shoals Lake · AR`. */
export function damSubtitle(entry: {
  lakeName?: string | null;
  state?: string | null;
}): string | null {
  return [entry.lakeName, entry.state].filter(Boolean).join(' · ') || null;
}

/**
 * What the live response knows about one dam, in the shape the pins need.
 *
 * Structural rather than `DamSnapshot`, so this module stays free of the app's
 * type imports and testable from the web suite. Every field is optional because
 * every one of them is a measurement that may not have been taken.
 */
export interface DamLiveState {
  id: string;
  /** Null where the dam publishes no turbine flow — see the map screen. */
  generating?: boolean | null;
  /** Pre-composed release text, e.g. `1,200 cfs`. */
  value?: string | null;
  updatedAt?: string | null;
  riverSlug?: string | null;
  /** The live name, when it disagrees with the catalog — the live one wins. */
  name?: string | null;
  lakeName?: string | null;
  state?: string | null;
}

/** What a dam pin is, before the map turns it into a MapPin. */
export interface DamPinFacts {
  id: string;
  name: string;
  subtitle: string | null;
  coordinates: { lng: number; lat: number };
  /** Absent until a live reading says one way or the other. */
  codeLabel?: string;
  value: string | null;
  updatedAt: string | null;
  damId: string;
  riverSlug: string | null;
}

/**
 * Every dam, drawn from the catalog and enriched by whatever the network
 * returned.
 *
 * ── The catalog is the SPINE, and the response is the overlay ─────────────
 *
 * Not the other way round. Mapping over the response and falling back to the
 * catalog would still draw nothing when the response is empty, which is the
 * whole failure this exists to end. Walking the catalog means the layer has the
 * same twenty-four pins on a fresh install with no network as it does on a warm
 * cache — and the only difference the reader sees is that the chip and the
 * release figure are missing, which is exactly what "we have not heard from the
 * Corps" should look like.
 *
 * A dam in the response but NOT in the catalog is still drawn: the registry can
 * gain a project while a build is in the field, and the response's own name and
 * coordinates are enough to place it. That is the one case where a pin's
 * location comes off the wire.
 */
export function damPins(
  live: DamLiveState[] | null | undefined,
  liveCoordinates?: Map<string, { lng: number; lat: number }>,
): DamPinFacts[] {
  const byId = new Map((live ?? []).map((dam) => [dam.id, dam]));
  const seen = new Set<string>();

  const pins: DamPinFacts[] = DAM_CATALOG.map((entry) => {
    const state = byId.get(entry.id) ?? null;
    seen.add(entry.id);
    return pin(entry, state, liveCoordinates?.get(entry.id));
  });

  for (const dam of live ?? []) {
    if (seen.has(dam.id)) continue;
    const at = liveCoordinates?.get(dam.id);
    // No catalog row and no coordinate means nowhere to draw it. Skipped rather
    // than dropped at (0, 0), which is in the Gulf of Guinea.
    if (!at) continue;
    pins.push(
      pin(
        {
          id: dam.id,
          name: dam.name ?? dam.id,
          lakeName: dam.lakeName ?? null,
          // NOT a guess. The response's own `state` is read below and a dam
          // this build has never heard of has no shipped one to fall back to —
          // so an omitted state prints nothing rather than a plausible 'MO'.
          state: null,
          lat: at.lat,
          lon: at.lng,
        },
        dam,
        at,
      ),
    );
  }

  return pins;
}

function pin(
  /** A shipped row, or the stand-in built for a dam this build does not carry. */
  entry: Omit<DamCatalogEntry, 'state'> & { state: DamCatalogEntry['state'] | null },
  state: DamLiveState | null,
  at?: { lng: number; lat: number },
): DamPinFacts {
  return {
    id: `dam:${entry.id}`,
    // The live name wins where there is one: a project renamed upstream should
    // not wait for an app release to be called by its new name.
    name: state?.name ?? entry.name,
    subtitle: damSubtitle({
      lakeName: state?.lakeName ?? entry.lakeName,
      state: state?.state ?? entry.state,
    }),
    coordinates: at ?? { lng: entry.lon, lat: entry.lat },
    // OMITTED, never "Units idle", when nothing has been measured. `generating`
    // is already null for a dam that publishes no turbine flow, and a pin drawn
    // from the catalog alone has heard nothing at all — the two are the same
    // silence and must read the same way.
    ...(state?.generating != null
      ? { codeLabel: state.generating ? 'Generating' : 'Units idle' }
      : {}),
    value: state?.value ?? null,
    updatedAt: state?.updatedAt ?? null,
    damId: entry.id,
    riverSlug: state?.riverSlug ?? null,
  };
}
