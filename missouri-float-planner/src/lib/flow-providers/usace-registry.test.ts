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

test('a dam with a powerhouse is identifiable without any live fetch', () => {
  // The bug this locks out: /dams/[damId] used `schedule.length === 0` to mean
  // "no powerhouse". Table Rock has four units, but whenever SWPA's file for
  // that weekday had not refreshed the fail-closed date check dropped it, and
  // the page announced the plant did not exist — while the index card beside it
  // read "Generating". Whether a dam HAS turbines cannot depend on a fetch.
  const tableRock = getUsaceDam('swl-table-rock-dam');
  assert.ok(tableRock);
  assert.ok(tableRock.swpaCode, 'Table Rock must be recognisable as a hydro project');
  assert.ok(tableRock.nameplate, 'Table Rock must describe its plant');
  assert.equal(tableRock.nameplate.units, 4);

  const clearwater = getUsaceDam('swl-clearwater-dam');
  assert.ok(clearwater);
  assert.equal(clearwater.swpaCode, undefined, 'Clearwater is flood-control only');
  assert.equal(clearwater.nameplate, undefined);
});

test('nameplate capacity is never SWPA scheduling capacity', () => {
  // SWPA's project table lists short-term overload capability, which runs
  // higher than nameplate. Mixing them would overstate every plant — and the
  // MW->CFS conversion needs BOTH halves from SWPA's table to stay consistent,
  // so the two numbers must not be reconciled into one.
  const mismatches: Array<[string, number, number]> = [
    ['swl-table-rock-dam', 200, 230],
    ['swl-beaver-dam', 112, 128],
    ['nwk-truman-dam', 160, 184],
  ];
  for (const [id, nameplate, swpa] of mismatches) {
    const dam = getUsaceDam(id)!;
    assert.equal(dam.nameplate?.megawatts, nameplate, `${id} nameplate`);
    assert.equal(SWPA_PROJECTS[dam.swpaCode!].capacityMw, swpa, `${id} SWPA capacity`);
    assert.notEqual(dam.nameplate?.megawatts, SWPA_PROJECTS[dam.swpaCode!].capacityMw);
  }
});

test('trout tailwaters are declared, not inferred from temperature', () => {
  // Exactly five of these are cold deep-release trout fisheries. Norfork is
  // one of them AND publishes no water temperature, which is why this cannot
  // be derived from a reading.
  const trout = Object.values(USACE_DAMS)
    .filter((d) => d.tailwaterFishery === 'trout')
    .map((d) => d.id)
    .sort();
  assert.deepEqual(trout, [
    'swl-beaver-dam',
    'swl-bull-shoals-dam',
    'swl-greers-ferry-dam',
    'swl-norfork-dam',
    'swl-table-rock-dam',
  ]);

  const norfork = getUsaceDam('swl-norfork-dam')!;
  assert.equal(norfork.tailwaterFishery, 'trout');
  assert.equal(norfork.series.tailwaterTempF, undefined, 'Norfork publishes no water temp');
});

test('every project declares what its tailwater fishery is', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    assert.ok(dam.tailwaterFishery, `${dam.id} has no fishery classification`);
  }
});
