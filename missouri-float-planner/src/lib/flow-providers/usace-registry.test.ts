import assert from 'node:assert/strict';
import test from 'node:test';
import {
  USACE_DAMS,
  USACE_RELEASE_SITE_IDS,
  getUsaceDam,
  getUsaceSeries,
} from './usace-registry';
import { SWPA_PROJECTS } from '@/lib/usace/swpa';

// Structural invariants only — no network. Every timeseries id here was
// confirmed live once; what this file guards is the wiring around them, which
// is where a typo would otherwise surface as a silently missing dam.

test('every dam has an id matching its registry key', () => {
  for (const [key, dam] of Object.entries(USACE_DAMS)) {
    assert.equal(dam.id, key, `${key} disagrees with its own id`);
  }
});

test('a dam publishes to CWMS, to SWPA, or both — never neither', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    const hasCwms = Boolean(dam.cdaLocation && dam.office);
    const hasSwpa = Boolean(dam.swpaCode);
    assert.ok(hasCwms || hasSwpa, `${dam.id} has no data source at all`);
  }
});

test('CWMS series are only configured for dams with an office', () => {
  // A series without an office cannot be fetched — fetchLatestValue needs both.
  for (const dam of Object.values(USACE_DAMS)) {
    if (Object.keys(dam.series).length > 0) {
      assert.ok(dam.office, `${dam.id} declares series but no CWMS office`);
      assert.ok(dam.cdaLocation, `${dam.id} declares series but no cdaLocation`);
    }
  }
});

test('every SWPA code resolves to a project with a MW→CFS key', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    if (!dam.swpaCode) continue;
    const project = SWPA_PROJECTS[dam.swpaCode];
    assert.ok(project, `${dam.id} references unknown SWPA code ${dam.swpaCode}`);
    assert.ok(project.capacityMw > 0, `${dam.swpaCode} has no plant capacity`);
    assert.ok(project.fullPowerCfs > 0, `${dam.swpaCode} has no full-power discharge`);
  }
});

test('a dam with turbines declares when it counts as generating', () => {
  // Table Rock idles around 20 cfs with the units off, so a bare `> 0` test
  // would read "generating" all day. Any dam with a powerhouse needs a floor.
  for (const dam of Object.values(USACE_DAMS)) {
    if (!dam.series.generationFlow) continue;
    assert.ok(
      typeof dam.generationOnCfs === 'number' && dam.generationOnCfs > 0,
      `${dam.id} reports turbine flow but declares no generationOnCfs floor`
    );
  }
});

test('tailwater links point at a dam that actually reports a release', () => {
  // A tailwater section claims "this reach runs at whatever the dam releases".
  // Without a release series there is no number behind that claim.
  for (const dam of Object.values(USACE_DAMS)) {
    if (!dam.tailwater) continue;
    assert.ok(dam.tailwater.riverSlug, `${dam.id} tailwater has no riverSlug`);
    assert.ok(dam.tailwater.gaugeSiteId, `${dam.id} tailwater has no gaugeSiteId`);
    assert.ok(dam.series.release, `${dam.id} claims a tailwater but reports no release`);
  }
});

test('at most one dam claims any given river as its tailwater', () => {
  // fetchRiverDam takes the first match, so a duplicate would make which dam a
  // river shows depend on object key order.
  const seen = new Set<string>();
  for (const dam of Object.values(USACE_DAMS)) {
    const slug = dam.tailwater?.riverSlug;
    if (!slug) continue;
    assert.ok(!seen.has(slug), `${slug} is claimed by more than one dam`);
    seen.add(slug);
  }
});

test('release-capable site ids are exactly the dams with a release series', () => {
  const expected = Object.values(USACE_DAMS)
    .filter((d) => d.series.release)
    .map((d) => d.id);
  assert.deepEqual([...USACE_RELEASE_SITE_IDS].sort(), expected.sort());
  // Stockton and Truman are SWPA-only: CWMS carries nothing for the Kansas
  // City district, so they must not enter the gauge ingestion path.
  assert.ok(!USACE_RELEASE_SITE_IDS.includes('nwk-stockton-dam'));
  assert.ok(!USACE_RELEASE_SITE_IDS.includes('nwk-truman-dam'));
});

test('lookups are total and fail soft', () => {
  assert.equal(getUsaceDam(null), null);
  assert.equal(getUsaceDam('nope'), null);
  assert.equal(getUsaceSeries('nope', 'release'), null);
  assert.ok(getUsaceSeries('swl-clearwater-dam', 'release'));
  // Clearwater is flood-control only — no powerhouse, so no generation series.
  assert.equal(getUsaceSeries('swl-clearwater-dam', 'generationFlow'), null);
});
