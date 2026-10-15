import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { MILL_SCENES, MILL_RIVERS, MILL_PASS_FRAMES, millDuration, selectMillScenes, visibleMillPanels } from './mill-scenes';

test('mill collection has ten unique real sites and locally shipped artwork', () => {
  assert.equal(MILL_SCENES.length, 10);
  assert.equal(new Set(MILL_SCENES.map((s) => s.id)).size, 10);
  for (const s of MILL_SCENES) {
    assert.ok(existsSync(`public/display/mills/${s.id}.webp`), s.id);
    const [x, y, w, h] = s.board;
    assert.ok(x >= 0 && y >= 0 && x + w < 100 && y + h < 100);
  }
  assert.ok(existsSync('public/display/mills/transition.webp'));
});

test('river filters select associated mills without substituting another waterway', () => {
  assert.deepEqual(selectMillScenes(['huzzah']).map((s) => s.id), ['dillard']);
  assert.deepEqual(selectMillScenes(['jacks-fork']).map((s) => s.id), ['alley']);
  assert.deepEqual(selectMillScenes(['current']).map((s) => s.id), ['klepzig', 'montauk']);
  assert.deepEqual(selectMillScenes(['unknown']), []);
  assert.equal(selectMillScenes([]).length, 10);
  assert.equal(MILL_RIVERS.length, 6);
  assert.equal(MILL_SCENES.find((s) => s.id === 'falling')?.context, 'Nearby river');
  assert.equal(MILL_SCENES.find((s) => s.id === 'greer')?.water, undefined);
});

test('every scene remains covered, closes its loop, and mounts only two panels', () => {
  for (const count of [1, 2, 3, 10]) {
    for (let frame = 0; frame <= millDuration(count); frame += 37) {
      const panels = visibleMillPanels(frame, count);
      assert.equal(panels.length, 2);
      assert.ok(panels[0].x <= 0 && panels[0].x > -1920);
      assert.equal(panels[1].x - panels[0].x, 1920);
      assert.ok(panels[1].x + 1920 >= 1920);
      for (const p of panels) assert.ok(p.index >= 0 && p.index < count);
    }
    assert.deepEqual(visibleMillPanels(0, count), visibleMillPanels(millDuration(count), count));
    assert.equal(visibleMillPanels(MILL_PASS_FRAMES, count)[0].index, 1 % count);
  }
  assert.deepEqual(visibleMillPanels(0, 0), []);
});
