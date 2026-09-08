import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

interface StyleLayer {
  id: string;
  type: string;
  'source-layer'?: string;
  layout?: Record<string, unknown>;
}

interface StyleDoc {
  layers: StyleLayer[];
}

function style(name: 'eddy-natural' | 'eddy-immersive'): StyleDoc {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'map-styles', `${name}.json`), 'utf8'),
  ) as StyleDoc;
}

function indexOf(layers: StyleLayer[], id: string): number {
  const index = layers.findIndex((layer) => layer.id === id);
  assert.notEqual(index, -1, `${id} must exist`);
  return index;
}

test('both curated styles honor the shared overlay and line anchor contract', () => {
  for (const name of ['eddy-natural', 'eddy-immersive'] as const) {
    const layers = style(name).layers;
    const overlays = indexOf(layers, 'eddy-anchor-overlays');
    const lines = indexOf(layers, 'eddy-anchor-lines');
    const water = indexOf(layers, 'water');
    const firstRoad = layers.findIndex((layer) => layer['source-layer'] === 'transportation');
    const firstLabel = layers.findIndex(
      (layer) => layer.type === 'symbol' && Boolean(layer.layout?.['text-field']),
    );

    assert.ok(overlays > water, `${name}: overlays must paint above the water fill`);
    assert.ok(firstRoad > overlays, `${name}: roads must paint above overlays`);
    assert.ok(lines > firstRoad, `${name}: Eddy data lines must paint above roads`);
    assert.ok(firstLabel > lines, `${name}: labels must paint above Eddy data lines`);
  }
});

test('Immersive carries usable road geometry and matching road names', () => {
  const layers = style('eddy-immersive').layers;
  for (const id of [
    'road_motorway',
    'road_trunk_primary',
    'road_secondary_tertiary',
    'road_minor',
    'road_service_track',
    'bridge_trunk_primary',
    'highway-name-major',
    'highway-name-minor',
  ]) {
    indexOf(layers, id);
  }

  assert.equal(
    layers.some((layer) => layer.id.includes('rail')),
    false,
    'Immersive should not gain unrelated rail clutter with its roads',
  );
});
