import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNWIRED_SWPA_PROJECTS,
  USACE_DAMS,
  USACE_RELEASE_SITE_IDS,
  getUsaceDam,
  getUsaceSeries,
  hasPowerhouse,
  type UsaceDam,
} from './usace-registry';
import { SWPA_PROJECTS, swpaCodeCandidates } from '@/lib/usace/swpa';

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
  //
  // The condition is deliberately NOT `series.generationFlow` alone: a dam that
  // relies on the catalog resolver declares no series at all, yet still resolves
  // turbine flow at request time and so still needs a floor. Every Tulsa project
  // is in that shape, and checking only declared series would have let all eight
  // ship with `generating` permanently null.
  //
  // Whether turbine flow is resolvable is a property of the DISTRICT, measured
  // 2026-08-02: SWL publishes `Flow-Plant`, SWT publishes `Flow-Power`, and MVS
  // publishes neither for either of its projects — which is why Mark Twain has a
  // powerhouse, a SWPA column and a CWMS location but legitimately no floor.
  const OFFICES_PUBLISHING_TURBINE_FLOW = new Set(['SWL', 'SWT']);

  for (const dam of Object.values(USACE_DAMS)) {
    // `hasPowerhouse`, not `swpaCode`, for the same reason the wire field
    // changed: whether the district serves turbine flow is a fact about the
    // PLANT and the district, and owes nothing to SWPA's schedule. Gating on
    // the code would let a Corps hydro project SWPA does not schedule ship
    // with no floor at all — and a missing floor means `generationNow` falls
    // back to 0, so the plant reads "generating" on its own idle leakage.
    const resolvesTurbineFlow = Boolean(
      hasPowerhouse(dam) &&
        dam.cdaLocation &&
        dam.office &&
        OFFICES_PUBLISHING_TURBINE_FLOW.has(dam.office)
    );
    if (!dam.series.generationFlow && !resolvesTurbineFlow) continue;
    assert.ok(
      typeof dam.generationOnCfs === 'number' && dam.generationOnCfs > 0,
      `${dam.id} can report turbine flow but declares no generationOnCfs floor`
    );
  }

  // Mark Twain pins the exception, so a future district audit has to confront it
  // rather than quietly "fixing" it with an invented number.
  const markTwain = getUsaceDam('mvs-mark-twain')!;
  assert.ok(markTwain.swpaCode, 'Mark Twain has a powerhouse');
  assert.equal(markTwain.generationOnCfs, undefined, 'MVS publishes no turbine flow to floor');
});

test('generation floors clear the leakage each plant actually idles at', () => {
  // Measured on 2026-08-01/02: most Tulsa plants read exactly 0 cfs with the
  // units off, but Denison idles at 19, Keystone at 200 and Eufaula at 230. The
  // uniform 100 the White River dams use would have read "generating" all night
  // at the last two, so floors scale with plant size (~2% of full-power
  // discharge) instead of being copied.
  const observedIdleCfs: Record<string, number> = {
    'swt-denison-dam': 19,
    'swt-keystone-dam': 200,
    'swt-eufaula-dam': 230,
  };
  for (const [id, idle] of Object.entries(observedIdleCfs)) {
    const dam = getUsaceDam(id)!;
    assert.ok(
      dam.generationOnCfs! > idle,
      `${id} floor ${dam.generationOnCfs} does not clear its observed ${idle} cfs idle flow`
    );
  }

  // And a floor must stay well under full power, or real generation reads idle.
  for (const dam of Object.values(USACE_DAMS)) {
    if (dam.generationOnCfs === undefined || !dam.swpaCode) continue;
    const fullPower = SWPA_PROJECTS[dam.swpaCode].fullPowerCfs;
    assert.ok(
      dam.generationOnCfs < fullPower * 0.05,
      `${dam.id} floor is more than 5% of full power — real generation would read idle`
    );
  }
});

test('no two dams claim the same SWPA schedule column', () => {
  // Schedules are keyed on the column code, so two dams sharing one would
  // render the same schedule and which dam "owns" it would be arbitrary. Ozark
  // makes this a live hazard: SWPA prints both OZK and OZD for it.
  const claimed = new Map<string, string>();
  for (const dam of Object.values(USACE_DAMS)) {
    if (!dam.swpaCode) continue;
    for (const code of swpaCodeCandidates(dam.swpaCode)) {
      const prior = claimed.get(code);
      assert.ok(!prior, `${dam.id} and ${prior} both claim SWPA code ${code}`);
      claimed.set(code, dam.id);
    }
  }
});

test('every SWPA project is either wired to a dam or listed as unwired', () => {
  // The gap this locks out: SWPA's schedule carries 18 projects and the parser
  // read all of them, but only 8 were wired to a dam — so ten hourly generation
  // schedules were parsed and discarded, with nothing anywhere recording that as
  // a decision. An unwired project now has to be argued for in writing.
  const wired = new Set<string>();
  for (const dam of Object.values(USACE_DAMS)) {
    if (!dam.swpaCode) continue;
    for (const code of swpaCodeCandidates(dam.swpaCode)) wired.add(code);
  }
  const excused = new Set(UNWIRED_SWPA_PROJECTS.map((p) => p.code));

  for (const code of Object.keys(SWPA_PROJECTS)) {
    assert.ok(
      wired.has(code) || excused.has(code),
      `SWPA project ${code} is parsed but neither wired to a dam nor listed in UNWIRED_SWPA_PROJECTS`
    );
  }
  for (const entry of UNWIRED_SWPA_PROJECTS) {
    assert.ok(SWPA_PROJECTS[entry.code], `UNWIRED_SWPA_PROJECTS names unknown code ${entry.code}`);
    assert.ok(entry.reason.length > 0, `${entry.code} is excused without a reason`);
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
  // Exactly seven of these are cold deep-release trout fisheries: the five
  // White River system dams, plus Oklahoma's two — Broken Bow (Lower Mountain
  // Fork) and Tenkiller Ferry (Lower Illinois). The list is exact on purpose.
  // Adding a dam should force a decision about its fishery, not inherit one.
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
    'swt-broken-bow-dam',
    'swt-tenkiller-dam',
  ]);

  const norfork = getUsaceDam('swl-norfork-dam')!;
  assert.equal(norfork.tailwaterFishery, 'trout');
  assert.equal(norfork.series.tailwaterTempF, undefined, 'Norfork publishes no water temp');

  // The Tulsa district publishes no water temperature at any project, so both
  // Oklahoma trout tailwaters would be unlabelled if this were inferred — the
  // same trap Norfork sets, twice over.
  for (const id of ['swt-broken-bow-dam', 'swt-tenkiller-dam']) {
    const dam = getUsaceDam(id)!;
    assert.equal(dam.office, 'SWT');
    assert.equal(dam.series.tailwaterTempF, undefined);
  }
});

test('every project declares what its tailwater fishery is', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    assert.ok(dam.tailwaterFishery, `${dam.id} has no fishery classification`);
  }
});

// ── A powerhouse and a published schedule are different facts ──────────────

test('having a powerhouse does not depend on SWPA scheduling it', () => {
  // `hasTurbines` was `Boolean(swpaCode)` in two places — the wire and the
  // history cron — which held only while every hydro project Eddy carried was
  // also in SWPA's file. The first Corps hydro project SWPA does not schedule
  // (DeGray, Narrows, Blakely Mountain are the near candidates, and CWMS
  // publishes turbine flow for all three) would have reported "this project
  // has no powerhouse" while the district was serving its Flow-Plant series.
  const scheduled = getUsaceDam('swl-bull-shoals-dam')!;
  assert.ok(scheduled.swpaCode, 'Bull Shoals is scheduled');
  assert.equal(hasPowerhouse(scheduled), true);

  // The shape a future DeGray takes: a described plant, no schedule column.
  const unscheduledHydro = {
    ...scheduled,
    id: 'swl-example-unscheduled',
    swpaCode: undefined,
    nameplate: { units: 2, megawatts: 68 },
  } as UsaceDam;
  assert.equal(
    hasPowerhouse(unscheduledHydro),
    true,
    'a plant SWPA does not schedule is still a plant',
  );

  // And the ten Tulsa and lock-and-dam projects carry a code with no nameplate,
  // so the rule cannot be `Boolean(nameplate)` either.
  const tulsa = getUsaceDam('swt-tenkiller-dam')!;
  assert.equal(tulsa.nameplate, undefined);
  assert.equal(hasPowerhouse(tulsa), true);
});

test('a station-service turbine is not a powerhouse', () => {
  // WAPPAPELLO IS THE CASE THAT DECIDES THE RULE. It has a turbine — 175 kW,
  // enough to run the dam's own lights — and it must stay false: it never
  // peaks, has no schedule, and a hero reading "generating" for it would
  // answer a question nobody asked about water nobody is standing in. So the
  // test is "does Eddy describe a PLANT here", which is what `nameplate`
  // records, and not "is there a turbine anywhere in the structure".
  const wappapello = getUsaceDam('mvs-wappapello')!;
  assert.equal(wappapello.swpaCode, undefined);
  assert.equal(wappapello.nameplate, undefined);
  assert.equal(hasPowerhouse(wappapello), false);

  // And a flood-control project with no turbine at all, for the other end.
  const clearwater = getUsaceDam('swl-clearwater-dam')!;
  assert.equal(hasPowerhouse(clearwater), false);
});

test('the powerhouse question is answerable with no live fetch', () => {
  // The bug this locks out is the one /dams/[damId] shipped: it used
  // `schedule.length === 0` to mean "no powerhouse", so a stale SWPA file made
  // Table Rock's four units vanish from the page while the index card beside
  // it read "Generating". Every dam has to answer from static fields alone.
  for (const dam of Object.values(USACE_DAMS)) {
    assert.equal(
      typeof hasPowerhouse(dam),
      'boolean',
      `${dam.id} cannot answer whether it has a powerhouse`,
    );
  }

  // Today the two rules still agree on every shipped dam, which is why the
  // conflation was invisible. Pinned so the day they diverge is a deliberate
  // change with a dam to point at rather than a silent behaviour shift.
  const diverging = Object.values(USACE_DAMS).filter(
    (d) => hasPowerhouse(d) !== Boolean(d.swpaCode),
  );
  assert.deepEqual(
    diverging.map((d) => d.id),
    [],
    'a dam now diverges from the old rule — intended, but update this list',
  );
});
