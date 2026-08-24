import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNWIRED_SWPA_PROJECTS,
  USACE_DAMS,
  USACE_RELEASE_SITE_IDS,
  declaresHourlyHistory,
  getUsaceDam,
  getUsaceSeries,
  hasPowerhouse,
  recordsHistory,
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

test('a dam publishes to CWMS, to SWPA, or a licensed operator — never nowhere', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    // A CWMS presence is either a resolvable location or explicit series —
    // the Nashville dams are the second shape: office + verified tsIds, no
    // cdaLocation, because no single location prefix spans their split
    // station namespaces (see the LRN block in the registry). Bagnell is the
    // third source: a FERC licensee's own reporting API (amerenMetrics).
    const hasCwms = Boolean(
      dam.office &&
        (dam.cdaLocation || dam.cdaLocations?.length || Object.keys(dam.series).length > 0)
    );
    const hasSwpa = Boolean(dam.swpaCode);
    const hasOperatorFeed = Boolean(dam.amerenMetrics);
    assert.ok(hasCwms || hasSwpa || hasOperatorFeed, `${dam.id} has no data source at all`);
  }
});

test('CWMS series are only configured for dams with an office', () => {
  // A series without an office cannot be fetched — fetchLatestValue needs the
  // office and the tsId, and nothing else. cdaLocation is deliberately NOT
  // required here: it exists for the catalog resolver, and the LRN dams omit
  // it on purpose to keep resolution structurally off (their observed series
  // live under split station prefixes no one location can name).
  for (const dam of Object.values(USACE_DAMS)) {
    if (Object.keys(dam.series).length > 0) {
      assert.ok(dam.office, `${dam.id} declares series but no CWMS office`);
    }
  }
});

test('a resolvable location is never configured without an office', () => {
  // Locations feed resolveSeries, which needs both halves; a location
  // without an office is dead config that reads as coverage.
  for (const dam of Object.values(USACE_DAMS)) {
    if (dam.cdaLocation || dam.cdaLocations?.length) {
      assert.ok(dam.office, `${dam.id} has CWMS locations but no office to resolve them against`);
    }
  }
});

test('a dam carries one location shape, never both', () => {
  // cdaLocations exists for the split-namespace districts (LRN); cdaLocation
  // stays the common case. Both set would leave which one the resolver reads
  // as a fact about implementation order rather than about the dam.
  for (const dam of Object.values(USACE_DAMS)) {
    assert.ok(
      !(dam.cdaLocation && dam.cdaLocations),
      `${dam.id} sets both cdaLocation and cdaLocations — pick the one that describes it`
    );
    if (dam.cdaLocations) {
      assert.ok(dam.cdaLocations.length > 0, `${dam.id} has an empty cdaLocations list`);
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
    // LRN, measured 2026-08-03..15: idle hours read exactly 0 at all three
    // Cumberland dams, but Center Hill and Dale Hollow occasionally report
    // 25-50 cfs with the units off. Wolf Creek's clean zero needs no entry.
    'lrn-center-hill-dam': 50,
    'lrn-dale-hollow-dam': 50,
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

  // The LRN dams have no SWPA full-power figure to hold that ceiling against,
  // so it is held against the observation instead: the smallest real
  // single-unit hour measured across 2026-08-03..15 was 1,580 cfs (Dale
  // Hollow). A floor above a tenth of that would be flirting with reading a
  // one-unit hour as idle.
  const SMALLEST_OBSERVED_UNIT_CFS = 1_580;
  for (const dam of Object.values(USACE_DAMS)) {
    if (dam.office !== 'LRN' || dam.generationOnCfs === undefined) continue;
    assert.ok(
      dam.generationOnCfs <= SMALLEST_OBSERVED_UNIT_CFS * 0.1,
      `${dam.id} floor ${dam.generationOnCfs} sits too close to a single-unit hour`
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
  // Exactly ten of these are cold deep-release trout fisheries: the five
  // White River system dams; Oklahoma's two — Broken Bow (Lower Mountain
  // Fork) and Tenkiller Ferry (Lower Illinois); and the three Cumberland
  // dams — Wolf Creek (Cumberland), Center Hill (Caney Fork) and Dale Hollow
  // (Obey), where the deep-draw fact was measured directly: both live
  // Temp-Water-Tail sensors read ~50 F in August 2026. The list is exact on
  // purpose. Adding a dam should force a decision about its fishery, not
  // inherit one.
  const trout = Object.values(USACE_DAMS)
    .filter((d) => d.tailwaterFishery === 'trout')
    .map((d) => d.id)
    .sort();
  assert.deepEqual(trout, [
    'lrn-center-hill-dam',
    'lrn-dale-hollow-dam',
    'lrn-wolf-creek-dam',
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

  // The two rules no longer agree everywhere, and the disagreement is the whole
  // point of separating them. These four have a nameplate and no swpaCode, so
  // `hasPowerhouse` says yes where the old `Boolean(swpaCode)` said no:
  //
  //   lrn-wolf-creek-dam, lrn-center-hill-dam, lrn-dale-hollow-dam
  //     Nashville District. SWPA is the SOUTHWESTERN power administration and
  //     does not schedule LRN projects, so they were never going to have a code.
  //   ameren-bagnell-dam
  //     privately owned; SWPA markets no power from it at all.
  //
  // All four run real units (6, 3, 3 and 8), so answering "no powerhouse" for
  // them is exactly the bug this test was written to catch, pointed the other
  // way. Still pinned, so the NEXT divergence is deliberate too.
  //
  // Sorted on both sides: the previous form compared against `[]`, which made
  // the order irrelevant, but a bare list would silently depend on key order in
  // USACE_DAMS and break the day someone inserts a dam above another.
  const diverging = Object.values(USACE_DAMS).filter(
    (d) => hasPowerhouse(d) !== Boolean(d.swpaCode),
  );
  assert.deepEqual(
    diverging.map((d) => d.id).sort(),
    [
      'ameren-bagnell-dam',
      'lrn-center-hill-dam',
      'lrn-dale-hollow-dam',
      'lrn-wolf-creek-dam',
    ].sort(),
    'a dam now diverges from the old rule — intended, but update this list',
  );
});

// ── The history recorder's reach ─────────────────────────────────────────
//
// Added after the defect it describes. On 2026-08-22 the merge that brought
// `cdaLocations` to main also left sync-dam-history filtering on the singular
// `cdaLocation`, so Wolf Creek, Center Hill and Dale Hollow stopped being
// read. Nothing failed: every other test in this file passed, dam-catalog
// parity passed, the routes passed, and the three dam pages went on rendering
// live metrics because seriesFor() reads both location shapes. The only
// symptom was a table nobody was watching, and by the time it was measured on
// 2026-08-24 the strips had been frozen for 53 hours.
//
// So this is the cheap half of the guard: it runs in `make check-web` and
// fails at merge. The other half is the dam_freshness trust check, which
// catches what a static test cannot — a series that is resolved at runtime, or
// an upstream that stops answering.

test('every powerhouse that declares an hourly history series is one the recorder reads', () => {
  for (const dam of Object.values(USACE_DAMS)) {
    // `hasPowerhouse` is part of the invariant, not just of the predicate.
    // The pattern strip draws what the UNITS did, so a project with no units
    // is correctly absent however good its release series is — see the
    // Clearwater pin below, which this loop would otherwise drag in.
    if (!hasPowerhouse(dam) || !declaresHourlyHistory(dam)) continue;
    assert.ok(
      recordsHistory(dam),
      `${dam.id} declares an hourly release/generation series that sync-dam-history will never fetch. ` +
        `History cannot be backfilled once it leaves CWMS's rolling window, so this is lost data, not a lost feature.`,
    );
  }
});

test('a dam with no units stays out, however good its release series', () => {
  // Clearwater is the case, and it is worth pinning because it looks like a
  // gap and is not one. It publishes the same hourly `Flow-Res Out` every
  // Little Rock reservoir does, and that release matters more than most —
  // it IS the Black River tailwater Eddy carries. But it has no powerhouse, so
  // a pattern strip for it would be a permanently empty top half over a bar
  // chart of gate releases, which is not what that component means.
  //
  // Recording it anyway would be a feature decision about what the strip is
  // for, not a repair. Left alone deliberately; if the tailwater reach ever
  // wants release history, that is the argument to have, and this pin is where
  // to have it.
  const clearwater = getUsaceDam('swl-clearwater-dam');
  assert.ok(clearwater, 'swl-clearwater-dam missing from the registry');
  assert.equal(declaresHourlyHistory(clearwater!), true, 'Clearwater does publish hourly release');
  assert.equal(hasPowerhouse(clearwater!), false, 'Clearwater has no turbines');
  assert.equal(recordsHistory(clearwater!), false, 'so the recorder correctly skips it');
});

test('the recorder reaches the Nashville dams, which carry cdaLocations and no cdaLocation', () => {
  // Pinned by name rather than left to the loop above, because these three ARE
  // the regression. A future refactor that reintroduces a singular-only test
  // would pass the general assertion for as long as no other district uses the
  // plural form — which is how this got through the first time.
  for (const id of ['lrn-wolf-creek-dam', 'lrn-center-hill-dam', 'lrn-dale-hollow-dam']) {
    const dam = getUsaceDam(id);
    assert.ok(dam, `${id} missing from the registry`);
    assert.equal(dam!.cdaLocation, undefined, `${id} should carry cdaLocations, not cdaLocation`);
    assert.ok(dam!.cdaLocations?.length, `${id} has no cdaLocations`);
    assert.equal(recordsHistory(dam!), true, `${id} is invisible to the history recorder`);
  }
});

test('a daily mean alone does not make a dam a history dam', () => {
  // St. Louis is the case. Both MVS projects publish release as a ~1Day
  // average and the recorder skips daily means outright, so neither declares
  // hourly history — Wappapello because it has no plant to report on at all,
  // Mark Twain because its 2x58 MW plant publishes no turbine series. Asserting
  // this keeps someone from "fixing" the loop above by widening
  // declaresHourlyHistory() until a flat 24-bar day counts as a pattern.
  for (const id of ['mvs-wappapello', 'mvs-mark-twain']) {
    const dam = getUsaceDam(id);
    assert.ok(dam, `${id} missing from the registry`);
    assert.equal(dam!.series.release?.dailyMean, true, `${id} release should be a daily mean`);
    assert.equal(declaresHourlyHistory(dam!), false, `${id} declares no hourly history`);
  }
});

test('schedule-only dams stay out of the recorder', () => {
  // Stockton and Truman have nameplates and SWPA columns but publish nothing to
  // CWMS — Kansas City serves no timeseries. They must not be fetched: a dam
  // with no office and no location has no series to ask for, and including it
  // would spend a request an hour on a guaranteed miss.
  for (const id of ['nwk-stockton-dam', 'nwk-truman-dam']) {
    const dam = getUsaceDam(id);
    assert.ok(dam, `${id} missing from the registry`);
    assert.equal(recordsHistory(dam!), false, `${id} has nothing for the recorder to read`);
  }
});
