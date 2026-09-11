// The compact iOS hydrograph has a deliberately smaller visual budget than the
// expanded web chart. Pin those phone-specific choices here so the semantic
// parity contract does not imply identical paint on unlike surfaces.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const app = readFileSync(
  join(process.cwd(), '../eddy-ios/src/components/GaugeChart.tsx'),
  'utf8',
);

test('the compact chart uses one shaded comparison and no observed-area wash', () => {
  // Pin the condition fill itself, not every possible SVG Rect: future clip
  // paths, hit targets or backgrounds are unrelated to chart density.
  assert.doesNotMatch(
    app,
    /fill=\{conditionColor\(/,
    'condition zones are painting the plot again',
  );
  assert.doesNotMatch(app, /series\.areas/, 'the observed line regained a competing area wash');
  assert.match(app, /series\.typicalArea/, 'the typical 25–75% context disappeared');
  assert.match(app, /key={`grid-\$\{tick\.value\}`}/, 'the neutral value grid disappeared');
});

test('one useful condition boundary remains visible without repainting the ladder', () => {
  assert.match(app, /nextZoneBoundary\(zones, newest\?\.v\)/);
  assert.match(app, /visibleConditionBoundary\.toLabel/);
  assert.match(app, /conditionBoundary\.value/);
  assert.match(app, /begins at \$\{formatReading\(visibleConditionBoundary\.value/);
});

test('a median-only USGS ladder degrades to a labelled median line', () => {
  assert.match(app, /row\.p50Cfs !== null/);
  assert.match(app, /series\.typicalPath/);
  assert.match(app, /Typical median/);
});
