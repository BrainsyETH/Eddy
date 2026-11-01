import assert from 'node:assert/strict';
import test from 'node:test';
import { line } from './access-enrichment-2026-11';
import { alongRiverKm, approachPoints, channelIndex, deadEnds, dedupeAlongRiver, gapAround, nearestMouth, offMvumNote, rankRoadEnd, reviewedVerdict, routeEnds, tigerClass, tigerRoadKind, vehicleClass } from './public-land-access-2026-11';

test('vehicleClass reports the most capable vehicle an MVUM route is open to', () => {
  assert.equal(vehicleClass({ passengervehicle: 'open', atv: 'open' }), 'passenger');
  assert.equal(vehicleClass({ passengervehicle: null, highclearancevehicle: 'open' }), 'high_clearance');
  assert.equal(vehicleClass({ atv: 'open' }), 'atv');
  assert.equal(vehicleClass({ motorcycle: 'open' }), 'motorcycle');
  assert.equal(vehicleClass({ passengervehicle: 'closed' }), 'none');
});

test('routeEnds returns both ends of every path and skips degenerate ones', () => {
  assert.deepEqual(routeEnds([[[0, 0], [1, 1], [2, 2]], [[5, 5]], [[3, 3], [4, 4]]]), [[0, 0], [2, 2], [3, 3], [4, 4]]);
});

test('alongRiverKm measures along the line, across MultiLineString parts, without double counting', () => {
  // ~1.11 km per 0.01° of latitude.
  const straight = line([[-91, 37], [-91, 37.02]]);
  const mid = alongRiverKm(straight, [-91.0005, 37.01]);
  assert.ok(Math.abs(mid.km - 1.11) < 0.02, `km ${mid.km}`);
  assert.ok(Math.abs(mid.offsetM - 44) < 3, `offset ${mid.offsetM}`);
  const multi = { type: 'MultiLineString' as const, coordinates: [[[-91, 37], [-91, 37.01]], [[-91, 37.01], [-91, 37.02]]] };
  assert.ok(Math.abs(alongRiverKm(multi, [-91, 37.015]).km - 1.67) < 0.02);
});

test('gapAround finds the accesses either side and the gap between them', () => {
  assert.deepEqual(gapAround(12, [2, 10, 25], 40), { upKm: 10, downKm: 25, nearestKm: 2, gapKm: 15 });
  assert.equal(gapAround(30, [2, 10, 25], 40).gapKm, 15, 'below the last access the gap runs to the river end');
  assert.equal(gapAround(1, [2, 10], 40).gapKm, 2, 'above the first access the gap runs from the river start');
});

test('dedupeAlongRiver keeps one candidate per stretch, preferring the most capable route', () => {
  const kept = dedupeAlongRiver([
    { km: 5.0, vehicle: 'atv', offsetM: 10 },
    { km: 5.1, vehicle: 'passenger', offsetM: 120 },
    { km: 9.0, vehicle: 'high_clearance', offsetM: 50 },
  ]);
  assert.deepEqual(kept.map((k) => [k.km, k.vehicle]), [[5.1, 'passenger'], [9.0, 'high_clearance']]);
});

test('TIGER classes: county roads drivable, S1500 is a 4WD trail, walkways and private service roads are not', () => {
  assert.deepEqual(tigerClass('S1400'), { drivable: true, fourWd: false });
  assert.deepEqual(tigerClass('S1500'), { drivable: true, fourWd: true });
  assert.deepEqual(tigerClass('S1710'), { drivable: false, fourWd: false });
  assert.deepEqual(tigerClass('S1740'), { drivable: false, fourWd: false }, 'S1740 is a private road for service vehicles');
});

test('deadEnds keeps road ends nothing continues from, and drops junctions', () => {
  // A road (a→b), a stub continuing from b to c: only a and c are ends; b is a junction.
  const a = [-91.37, 36.815], b = [-91.364, 36.8169], c = [-91.36392, 36.81738];
  const ends = deadEnds([[a, [-91.367, 36.816], b], [b, c]]);
  assert.deepEqual(ends.map((e) => e.join()), [a.join(), c.join()]);
});

test('ranking: a county road end on public bank beats a high-clearance Forest Service track (Long Hollow vs Boom Hole)', () => {
  const longHollow = rankRoadEnd({ kind: 'public', toWaterM: 48, fourWd: false, maintLevel: null, publicEnd: true, publicBank: true });
  const boomHole = rankRoadEnd({ kind: 'mvum', toWaterM: 21, fourWd: false, maintLevel: 2, publicEnd: true, publicBank: true });
  assert.equal(longHollow.tier, 'A');
  assert.equal(boomHole.tier, 'B');
  assert.ok(longHollow.score > boomHole.score);
  const rowEnd = rankRoadEnd({ kind: 'public', toWaterM: 30, fourWd: false, maintLevel: null, publicEnd: false, publicBank: false });
  assert.equal(rowEnd.tier, 'B');
  assert.match(rowEnd.notes.join(), /check legality/);
});

test('nearestMouth names a candidate by the tributary it sits at', () => {
  assert.equal(nearestMouth([-91.36392, 36.81738], [{ name: 'Long Hollow Creek', at: [-91.36298, 36.81708] }, { name: 'Far Creek', at: [-91.3, 36.8] }]), 'Long Hollow Creek mouth');
  assert.equal(nearestMouth([-91.36392, 36.81738], [{ name: 'Far Creek', at: [-91.3, 36.8] }]), null);
});

test('deadEnds: another source continues a road only through its interior', () => {
  const end = [-91.3, 36.8];
  const county = [[[-91.31, 36.8], end]];
  // A Forest Service road continuing from the county road's end: not a dead end.
  assert.equal(deadEnds(county, 8, [[[-91.305, 36.8], end, [-91.29, 36.81]]]).length, 1, 'only the far end remains');
  // A duplicate of the same road that also stops there: still a dead end.
  assert.equal(deadEnds(county, 8, [[[-91.31, 36.8], end]]).length, 2);
});

test('deadEnds ignores a road\'s own nearby vertices (Long Hollow: 7 vertices in the last 49 m)', () => {
  const b = [-91.36398, 36.81694];
  const stub = [b, [-91.36396, 36.81701], [-91.36395, 36.81709], [-91.36394, 36.81716], [-91.36393, 36.81724], [-91.36392, 36.81731], [-91.36392, 36.81738]];
  const road416 = [[-91.37, 36.81511], [-91.367, 36.816], b];
  const ends = deadEnds([road416, stub]).map((e) => e.join());
  assert.ok(ends.includes([-91.36392, 36.81738].join()), 'the stub end at the river is a dead end');
  assert.ok(!ends.includes(b.join()), 'the 416/stub junction is not');
});

test('channelIndex measures planar metres to the nearest channel segment, Infinity when far', () => {
  const dist = channelIndex([[[-91.0, 37.0], [-90.99, 37.0]]]);
  assert.ok(Math.abs(dist([-90.995, 37.0005]) - 55.5) < 1);
  assert.equal(dist([-90.0, 37.0]), Infinity);
});

test('approachPoints finds a road that loops down to the river and back, not one running alongside it', () => {
  // River along 37.0. A loop road: comes south to 50 m from the river, then back north.
  const dist = channelIndex([[[-91.02, 37.0], [-90.98, 37.0]]]);
  const north = (m: number, x: number) => [x, 37.0 + m / 111_000];
  const loop = [north(600, -91.004), north(300, -91.002), north(50, -91.0), north(300, -90.998), north(600, -90.996)];
  const hit = approachPoints(loop, dist);
  assert.equal(hit.length, 1);
  assert.ok(Math.abs(hit[0][0] + 91.0) < 1e-9);
  // A road running alongside the river at 80 m: level distance, no approach point.
  const parallel = [north(80, -91.01), north(80, -91.005), north(80, -91.0), north(80, -90.995), north(80, -90.99)];
  assert.equal(approachPoints(parallel, dist).length, 0);
});

// The five Eleven Point tier-A spots v2 proposed on 2026-11-01. The owner
// reviewed each: none is an access. Census attributes as fetched; all five are on
// National Forest land with no MVUM route within 300 m.
const ELEVEN_POINT_FALSE_POSITIVES = [
  { at: 'Hurricane Creek mouth 36.776422,-91.275183', attrs: { NAME: 'Forest Rd 4031', MTFCC: 'S1400', RTTYP: 'O' } },
  { at: 'loop 36.651746,-91.186327', attrs: { NAME: null, MTFCC: 'S1740', RTTYP: null } },
  { at: 'loop 36.750056,-91.249741', attrs: { NAME: 'Forest Rd 3230A', MTFCC: 'S1400', RTTYP: 'O' } },
  { at: 'end 36.785240,-91.311326', attrs: { NAME: null, MTFCC: 'S1400', RTTYP: null } },
  { at: 'Rush Creek mouth 36.565231,-91.176195', attrs: { NAME: null, MTFCC: 'S1740', RTTYP: null } },
];

test('road kind from Census route type and name', () => {
  assert.equal(tigerRoadKind({ NAME: 'Co Rd 416', RTTYP: 'C' }), 'public');
  assert.equal(tigerRoadKind({ NAME: 'State Hwy 19', RTTYP: 'S' }), 'public');
  assert.equal(tigerRoadKind({ NAME: 'Forest Rd 4031', RTTYP: 'O' }), 'forest');
  assert.equal(tigerRoadKind({ NAME: 'Riverview Ln', RTTYP: 'M' }), 'local');
  assert.equal(tigerRoadKind({ NAME: null, RTTYP: null }), 'unnamed');
});

test('none of the five reviewed Eleven Point false positives can be tier A', () => {
  for (const fp of ELEVEN_POINT_FALSE_POSITIVES) {
    if (!tigerClass(fp.attrs.MTFCC).drivable) continue; // S1740: not read at all
    const kind = tigerRoadKind(fp.attrs);
    assert.equal(rankRoadEnd({ kind, toWaterM: 50, fourWd: false, maintLevel: null, publicEnd: true, publicBank: true }).tier, 'B', fp.at);
    assert.match(offMvumNote({ kind, endOnNationalForest: true, onMvum: false }) ?? '', /not on the Motor Vehicle Use Map/, fp.at);
  }
});

test('Long Hollow (Co Rd 416, county) is tier A with no MVUM warning; a road that is also an MVUM route gets none either', () => {
  const kind = tigerRoadKind({ NAME: 'Co Rd 416', RTTYP: 'C' });
  assert.equal(offMvumNote({ kind, endOnNationalForest: true, onMvum: false }), null);
  assert.equal(rankRoadEnd({ kind, toWaterM: 47, fourWd: false, maintLevel: null, publicEnd: true, publicBank: true }).tier, 'A');
  assert.equal(offMvumNote({ kind: 'forest', endOnNationalForest: true, onMvum: true }), null);
  assert.equal(offMvumNote({ kind: 'unnamed', endOnNationalForest: false, onMvum: false }), null, 'a private resort road beside forest bank');
});

test('only county/state roads and passenger-grade MVUM roads reach tier A', () => {
  const at = { toWaterM: 50, fourWd: false, maintLevel: null, publicEnd: true, publicBank: true };
  assert.equal(rankRoadEnd({ ...at, kind: 'unnamed' }).tier, 'B');
  assert.equal(rankRoadEnd({ ...at, kind: 'local' }).tier, 'B');
  assert.equal(rankRoadEnd({ ...at, kind: 'mvum', maintLevel: 3 }).tier, 'A', 'High Log Eddy: FS 255, maintenance level 3');
  assert.equal(rankRoadEnd({ ...at, kind: 'mvum', fourWd: true, maintLevel: 3 }).tier, 'B', 'an ATV-only route');
});

test('reviewedVerdict finds a hand-checked spot on the same river within 300 m', () => {
  const reviewed = [{ river: 'big-piney', lat: 37.194717, lon: -92.039614, verdict: 'access' }];
  assert.equal(reviewedVerdict('big-piney', [-92.0396, 37.1950], reviewed), 'access');
  assert.equal(reviewedVerdict('big-piney', [-92.0396, 37.2000], reviewed), null, '~600 m away');
  assert.equal(reviewedVerdict('eleven-point', [-92.039614, 37.194717], reviewed), null, 'another river');
});
