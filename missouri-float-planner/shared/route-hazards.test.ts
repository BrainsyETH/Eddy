import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import PlanDownstreamDams from '../src/components/plan/PlanDownstreamDams';
import { damBelowTakeOutLabel, hazardAbovePutInLabel, splitRouteHazards } from './route-hazards';

const row = (id: string, mile: number | string | null, type = 'low_water_dam') => ({
  id, name: id, river_mile_downstream: mile, type, portage_required: true,
});

test('Wayside gets a separate dam notice without acquiring an in-route portage', () => {
  const dam = row('Shadow Lake Dam', '11.61');
  const onRoute = row('crossing', 6.52, 'other');
  for (const start of [0.43, 6.55]) {
    const result = splitRouteHazards([onRoute, dam], start, 11.33);
    assert.deepEqual(result.hazards, start < 6.52 ? [onRoute] : []);
    assert.deepEqual(result.damsBelowTakeOut, [{
      id: dam.id, name: dam.name, type: 'low_water_dam', riverMile: 11.61, distanceBelowTakeOutMiles: 0.28,
    }]);
    assert.equal('portageRequired' in result.damsBelowTakeOut[0], false);
    assert.equal(damBelowTakeOutLabel(result.damsBelowTakeOut[0]), '0.3 mi below your take-out');
  }
  const upper = splitRouteHazards([onRoute, dam], 0.43, 6.55);
  assert.deepEqual(upper.hazards, [onRoute]);
  assert.deepEqual(upper.damsBelowTakeOut, []);
});

test('the buffer includes only downstream dams through 0.5 miles, including the boundary', () => {
  const result = splitRouteHazards([
    row('before launch', 1), row('at launch', 2), row('at landing', 10),
    row('near', 10.05), row('boundary', 10.5), row('far', 10.5001),
    row('strainer', 10.2, 'strainer'), row('bridge', 10.3, 'bridge_piling'),
    row('missing', null), row('invalid', 'not a mile'),
  ], 2, 10);
  assert.deepEqual(result.hazards.map(h => h.id), ['at launch', 'at landing']);
  assert.deepEqual(result.damsBelowTakeOut.map(h => h.id), ['near', 'boundary']);
  assert.equal(damBelowTakeOutLabel(result.damsBelowTakeOut[0]), 'Less than 0.1 mi below your take-out');
  assert.deepEqual(splitRouteHazards([], 2, 10), { hazards: [], damsBelowTakeOut: [], hazardsAbovePutIn: [] });
  assert.throws(() => splitRouteHazards([], 10, 2));
  assert.throws(() => splitRouteHazards([], 2, Number.NaN));
});

test('a tailwater dam just above the put-in is context, never an in-route hazard', () => {
  // Beaver: the dam at mile 0.00, Dam Site Boat Ramp at 0.33, Bertrand at 3.30.
  const dam = { ...row('Beaver Dam', '0.00', 'other'), severity: 'danger' };
  const bridge = { ...row('Highway 62 bridge', 4.7, 'bridge_piling'), severity: 'info' };
  const result = splitRouteHazards([dam, bridge], 0.33, 3.3);
  assert.deepEqual(result.hazards, []);
  assert.deepEqual(result.damsBelowTakeOut, []);
  assert.deepEqual(result.hazardsAbovePutIn, [{
    id: 'Beaver Dam', name: 'Beaver Dam', type: 'other', riverMile: 0, distanceAbovePutInMiles: 0.33,
  }]);
  assert.equal('portageRequired' in result.hazardsAbovePutIn[0], false);
  assert.equal(hazardAbovePutInLabel(result.hazardsAbovePutIn[0]), '0.3 mi above your put-in');
  // At the put-in — exactly, or within the endpoint tolerance on either side —
  // a hazard appears once, in the route list, never in both lists or neither.
  for (const start of [0, 0.005, 0.01]) {
    const at = splitRouteHazards([dam], start, 3.3);
    assert.deepEqual(at.hazards.map(h => h.id), ['Beaver Dam'], `put-in ${start}`);
    assert.deepEqual(at.hazardsAbovePutIn, [], `put-in ${start}`);
  }
  const justOutside = splitRouteHazards([dam], 0.011, 3.3);
  assert.deepEqual(justOutside.hazards, []);
  assert.deepEqual(justOutside.hazardsAbovePutIn.map(h => h.id), ['Beaver Dam']);
});

test('only danger hazards within 0.5 miles above the put-in are listed, nearest first', () => {
  const d = (id: string, mile: number, severity: string | null, type = 'other') => ({ ...row(id, mile, type), severity });
  const result = splitRouteHazards([
    d('far dam', 1.49, 'danger'), d('boundary', 1.5, 'danger'), d('near dam', 1.95, 'danger', 'low_water_dam'),
    d('warning only', 1.9, 'warning'), d('unknown severity', 1.9, null),
  ], 2, 10);
  assert.deepEqual(result.hazardsAbovePutIn.map(h => h.id), ['near dam', 'boundary']);
  assert.equal(hazardAbovePutInLabel(result.hazardsAbovePutIn[0]), 'Less than 0.1 mi above your put-in');
  assert.deepEqual(result.hazards, []);
});

test('web notices are conditional and explicitly place the dam below the landing', () => {
  assert.equal(renderToStaticMarkup(createElement(PlanDownstreamDams, {})), '');
  const { damsBelowTakeOut } = splitRouteHazards([row('Shadow Lake Dam', 11.61)], 0.43, 11.33);
  const html = renderToStaticMarkup(createElement(PlanDownstreamDams, { dams: damsBelowTakeOut }));
  assert.match(html, /Below your take-out/);
  assert.match(html, /Shadow Lake Dam/);
  assert.match(html, /0.3 mi below your take-out/);
  assert.doesNotMatch(html, /Portage|Hazards on Route/);
  const { hazardsAbovePutIn } = splitRouteHazards([{ ...row('Beaver Dam', 0, 'other'), severity: 'danger' }], 0.33, 3.3);
  const aboveHtml = renderToStaticMarkup(createElement(PlanDownstreamDams, { above: hazardsAbovePutIn }));
  assert.match(aboveHtml, /Above your put-in/);
  assert.match(aboveHtml, /Beaver Dam/);
  assert.match(aboveHtml, /0.3 mi above your put-in/);
  assert.doesNotMatch(aboveHtml, /Below your take-out|Portage/);
});

test('web planner expands its query and agent adapters share the full-catalog partition', () => {
  for (const path of ['src/app/api/plan/route.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /\.lte\('river_mile_downstream', maxMile \+ DOWNSTREAM_DAM_BUFFER_MILES\)/, path);
    assert.match(source, /\.gte\('river_mile_downstream', minMile - UPSTREAM_DANGER_BUFFER_MILES\)/, path);
    assert.match(source, /hazardsAbovePutIn: routeHazards\.hazardsAbovePutIn/, path);
    assert.match(source, /splitRouteHazards\(/, path);
    assert.match(source, /damsBelowTakeOut: routeHazards\.damsBelowTakeOut/, path);
    assert.match(source, /routeHazards\.hazards\.map/, path);
  }
  for (const path of ['src/lib/chat/tool-handlers.ts', 'src/app/api/mcp/route.ts']) {
    assert.match(readFileSync(path, 'utf8'), /createAgentExecutor\(/, path);
  }
  const planning = readFileSync('src/lib/agent-tools/planning.ts', 'utf8');
  assert.match(planning, /splitRouteHazards\(/);
  assert.match(planning, /damsBelowTakeOut: routeHazards\.damsBelowTakeOut/);
  assert.match(planning, /hazardsAbovePutIn: routeHazards\.hazardsAbovePutIn/);
});
