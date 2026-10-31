import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { Map, StyleSpecification } from 'maplibre-gl';
import { isStyleReady, MAP_STYLE_TIMEOUT_MS, whenStyleReady } from './map-readiness';

class StreamingMap extends EventEmitter {
  style: StyleSpecification | undefined;
  // Basemap tiles never finish in these cases. These gates must not be used.
  loaded() { return false; }
  isStyleLoaded() { return false; }
  getStyle() { return this.style; }
  parseStyle() {
    this.style = { version: 8, sources: {}, layers: [] };
    this.emit('style.load');
  }
  asMap() { return this as unknown as Map; }
}

test('Eddy layers are ready after style parsing even if tiles never finish', () => {
  const map = new StreamingMap();
  let ready = 0;
  assert.equal(isStyleReady(map.asMap()), false);
  const cancel = whenStyleReady(map.asMap(), () => ready++);
  map.parseStyle();
  assert.equal(isStyleReady(map.asMap()), true);
  assert.equal(map.loaded(), false);
  assert.equal(map.isStyleLoaded(), false);
  assert.equal(ready, 1);
  map.emit('style.load');
  assert.equal(ready, 1);
  cancel();
});

test('data arriving after style.load mounts immediately during tile streaming', () => {
  const map = new StreamingMap();
  map.parseStyle();
  let ready = 0;
  whenStyleReady(map.asMap(), () => ready++);
  assert.equal(ready, 1);
  assert.equal(map.listenerCount('style.load'), 0);
});

test('a style that never parses times out and still recovers if it arrives late', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const map = new StreamingMap();
  const states: string[] = [];
  whenStyleReady(map.asMap(), () => states.push('ready'), () => states.push('timeout'));
  t.mock.timers.tick(MAP_STYLE_TIMEOUT_MS - 1);
  assert.equal(states.length, 0);
  t.mock.timers.tick(1);
  assert.deepEqual(states, ['timeout']);
  map.parseStyle();
  assert.deepEqual(states, ['timeout', 'ready']);
});

test('successful parsing cancels the timeout while tiles continue loading', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const map = new StreamingMap();
  const states: string[] = [];
  whenStyleReady(map.asMap(), () => states.push('ready'), () => states.push('timeout'));
  map.parseStyle();
  t.mock.timers.tick(MAP_STYLE_TIMEOUT_MS);
  assert.deepEqual(states, ['ready']);
});

test('a failed style request fails readiness at once instead of waiting out the timeout', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const map = new StreamingMap();
  const states: string[] = [];
  whenStyleReady(map.asMap(), () => states.push('ready'), (reason) => states.push(reason));
  map.emit('error', { error: new Error('AJAXError: Not Found (404): /map-styles/eddy-immersive.json') });
  assert.deepEqual(states, ['style-error']);
  // One failure per watch: the timeout must not report a second one.
  t.mock.timers.tick(MAP_STYLE_TIMEOUT_MS);
  assert.deepEqual(states, ['style-error']);
  // A retried style that arrives late still recovers.
  map.parseStyle();
  assert.deepEqual(states, ['style-error', 'ready']);
  assert.equal(map.listenerCount('error'), 0);
});

test('tile errors and post-parse resource errors are never fatal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const map = new StreamingMap();
  // Node's EventEmitter throws on an unhandled 'error'; a real map does not.
  map.on('error', () => {});
  const states: string[] = [];
  whenStyleReady(map.asMap(), () => states.push('ready'), (reason) => states.push(reason));
  // A 404 tile from a source that was added before the style finished.
  map.emit('error', { error: new Error('AJAXError: Not Found (404): /tiles/1/2/3.pbf'), sourceId: 'esri-satellite' });
  assert.deepEqual(states, []);
  map.parseStyle();
  // Sprite/glyph failures only happen after the style parsed; readiness is done.
  map.emit('error', { error: new Error('AJAXError: Not Found (404): /sprite.json') });
  assert.deepEqual(states, ['ready']);
  t.mock.timers.tick(MAP_STYLE_TIMEOUT_MS);
  assert.deepEqual(states, ['ready']);
});

test('retry/unmount cancels stale callbacks and a replacement style is independent', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const oldMap = new StreamingMap();
  const states: string[] = [];
  const cancel = whenStyleReady(oldMap.asMap(), () => states.push('old-ready'), () => states.push('old-timeout'));
  cancel();
  oldMap.parseStyle();
  t.mock.timers.tick(MAP_STYLE_TIMEOUT_MS);
  assert.equal(states.length, 0);
  assert.equal(oldMap.listenerCount('style.load'), 0);

  const newMap = new StreamingMap();
  whenStyleReady(newMap.asMap(), () => states.push('new-ready'));
  newMap.parseStyle();
  newMap.style = undefined; // full setStyle replacement
  assert.equal(isStyleReady(newMap.asMap()), false);
  whenStyleReady(newMap.asMap(), () => states.push('replacement-ready'));
  newMap.parseStyle();
  assert.deepEqual(states, ['new-ready', 'replacement-ready']);
});
