import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { USACE_DAMS, getUsaceDam } from '@/lib/flow-providers/usace-registry';

// Dissolved oxygen and water temperature were added FOR the tailwaters and
// were unreachable from them: every tailwater's primary gauge is a USACE dam
// release with provider 'usace', and /api/gauges only asked USGS about USGS
// stations, so all three screens returned null forever while four sites
// published the parameter a mile downstream.
//
// The mapping is declared in the registry because nothing can infer it — these
// sites report no discharge and no stage, so import-usgs-gauges.ts does not
// enrol them and they are not in gauge_stations to be joined to.

const TAILWATERS_WITH_WATER_QUALITY = [
  ['swl-bull-shoals-dam', '07054501'],
  ['swl-norfork-dam', '07060000'],
  ['swl-table-rock-dam', '07053450'],
] as const;

test('every tailwater Eddy carries names a water-quality site', () => {
  for (const [damId, siteId] of TAILWATERS_WITH_WATER_QUALITY) {
    const dam = getUsaceDam(damId);
    assert.ok(dam, `${damId} missing from the registry`);
    assert.equal(
      dam.tailwater?.waterQualitySiteId,
      siteId,
      `${damId} must map to USGS ${siteId}`,
    );
  }
});

test('a mapped site is always named, so a borrowed reading can be attributed', () => {
  // The reading comes from a DIFFERENT station than the one being viewed. A
  // bare number would read as the viewed gauge's own measurement.
  for (const dam of Object.values(USACE_DAMS)) {
    const tw = dam.tailwater;
    if (!tw?.waterQualitySiteId) continue;
    assert.ok(
      tw.waterQualitySiteName && tw.waterQualitySiteName.length > 0,
      `${dam.id} declares a water-quality site with no name to attribute it to`,
    );
  }
});

test('the water-quality site is never the dam release station itself', () => {
  // A release gauge measures discharge. If these ever collide, something has
  // conflated "the station I am viewing" with "the station that can answer".
  for (const dam of Object.values(USACE_DAMS)) {
    const tw = dam.tailwater;
    if (!tw?.waterQualitySiteId) continue;
    assert.notEqual(tw.waterQualitySiteId, dam.id);
    assert.match(
      tw.waterQualitySiteId,
      /^\d{8,15}$/,
      `${dam.id}: a water-quality site id must be a USGS site number`,
    );
  }
});

// ── Static ratchet on the route ─────────────────────────────────────────────

const GAUGE_ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/gauges/[siteId]/route.ts'),
  'utf-8',
);

test('the gauge route resolves water quality rather than gating on provider', () => {
  // The regression: `provider === 'usgs' ? fetchDissolvedOxygen(siteId) : null`.
  // Correct for a USGS station, and a permanent null for every tailwater.
  assert.doesNotMatch(
    GAUGE_ROUTE,
    /provider === 'usgs' \? fetchDissolvedOxygen\(siteId\)/,
    'dissolved oxygen must not be gated on the viewed station being USGS',
  );
  assert.doesNotMatch(
    GAUGE_ROUTE,
    /provider === 'usgs' \? fetchWaterTemperature\(siteId\)/,
    'water temperature must not be gated on the viewed station being USGS',
  );
  assert.match(
    GAUGE_ROUTE,
    /waterQualitySiteId/,
    'the route must consult the registry mapping',
  );
});

test('a borrowed reading is stamped with the station that produced it', () => {
  assert.match(GAUGE_ROUTE, /measuredAtSiteId/);
  assert.match(GAUGE_ROUTE, /measuredAtName/);
  // …and only when it really is borrowed.
  assert.match(
    GAUGE_ROUTE,
    /const borrowed = waterQuality != null && waterQuality\.siteId !== siteId/,
    'a station serving its own reading must not be stamped as borrowed',
  );
});

test('the reading card names the source station', () => {
  const CARD = readFileSync(
    join(process.cwd(), 'src/components/gauge/CurrentReadingCard.tsx'),
    'utf-8',
  );
  assert.match(CARD, /waterQualitySourceName/);
  assert.match(CARD, /at \$\{waterQualitySourceName\}/);
});

test('a borrowed reading is age-limited; a station\'s own is not', () => {
  // Probed 2026-08-25: USGS 07053450 below Table Rock served dissolved oxygen
  // from twenty minutes earlier and a water temperature from January 2025.
  // water-temperature.ts deliberately serves an old reading for the station
  // you asked about — slow-moving water, labelled with its age. A reading
  // fetched from a NEIGHBOURING station on the route's own initiative is a
  // different bargain: nobody asked for it, and a dead thermistor renders as a
  // number under a live release unless something drops it.
  assert.match(
    GAUGE_ROUTE,
    /BORROWED_MAX_AGE_MS/,
    'borrowed water-quality readings must carry a maximum age',
  );
  assert.match(
    GAUGE_ROUTE,
    /if \(!v \|\| !borrowed\) return v;/,
    "the age limit must apply only to borrowed readings, not to a station's own",
  );
});
