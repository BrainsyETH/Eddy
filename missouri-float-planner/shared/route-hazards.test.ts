import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import PlanDownstreamDams from '../src/components/plan/PlanDownstreamDams';
import { damBelowTakeOutLabel, splitRouteHazards } from './route-hazards';

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
  assert.deepEqual(splitRouteHazards([], 2, 10), { hazards: [], damsBelowTakeOut: [] });
  assert.throws(() => splitRouteHazards([], 10, 2));
  assert.throws(() => splitRouteHazards([], 2, Number.NaN));
});

test('web notices are conditional and explicitly place the dam below the landing', () => {
  assert.equal(renderToStaticMarkup(createElement(PlanDownstreamDams, {})), '');
  const { damsBelowTakeOut } = splitRouteHazards([row('Shadow Lake Dam', 11.61)], 0.43, 11.33);
  const html = renderToStaticMarkup(createElement(PlanDownstreamDams, { dams: damsBelowTakeOut }));
  assert.match(html, /Below your take-out/);
  assert.match(html, /Shadow Lake Dam/);
  assert.match(html, /0.3 mi below your take-out/);
  assert.doesNotMatch(html, /Portage|Hazards on Route/);
});

test('planner, chat and MCP all expand the query and partition its results', () => {
  for (const path of ['src/app/api/plan/route.ts', 'src/lib/chat/tool-handlers.ts', 'src/app/api/mcp/route.ts']) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /\.lte\('river_mile_downstream', maxMile \+ DOWNSTREAM_DAM_BUFFER_MILES\)/, path);
    assert.match(source, /splitRouteHazards\(/, path);
    assert.match(source, /damsBelowTakeOut: routeHazards\.damsBelowTakeOut/, path);
    assert.match(source, /routeHazards\.hazards\.map/, path);
  }
});
