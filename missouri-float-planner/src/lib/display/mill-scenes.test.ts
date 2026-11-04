import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import {
  MILL_INTERLUDE_FRAMES,
  MILL_PASS_FRAMES,
  MILL_RIVERS,
  MILL_SCENES,
  MILL_STAGE,
  MILL_BREAK_FRAME,
  MILL_SWAP_FRAME,
  TOUR_MIN_HEIGHT,
  VERTICAL_ART_HEIGHT,
  millBreakBetween,
  VERTICAL_DOCK_HEIGHT,
  VERTICAL_MAX_HEIGHT,
  millCamera,
  millDuration,
  millMoment,
  millRoute,
  millStartFrame,
  mixHex,
  nextMillFrame,
  parseMillFormat,
  selectMillScenes,
  verticalHeight,
  verticalLayout,
} from './mill-scenes';
import { MILL_MAP_HEIGHT, MILL_MAP_RIVERS, MILL_MAP_WIDTH, projectMap } from './mill-map';

test('mill collection has ten unique real sites and locally shipped artwork', () => {
  assert.equal(MILL_SCENES.length, 10);
  assert.equal(new Set(MILL_SCENES.map((s) => s.id)).size, 10);
  for (const s of MILL_SCENES) {
    assert.ok(existsSync(`public/display/mills/${s.id}.webp`), s.id);
    const [x, y, w, h] = s.board;
    assert.ok(x >= 0 && y >= 0 && x + w < 100 && y + h < 100);
    assert.match(s.tone, /^#[0-9a-f]{6}$/);
  }
  // The repeated foreground tree is gone; joins are drawn, not covered.
  assert.equal(existsSync('public/display/mills/transition.webp'), false);
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

test('one painting at a time; the swap happens only under the full veil', () => {
  for (const count of [1, 2, 3, 10]) {
    let previous = millMoment(0, count)!;
    for (let frame = 0; frame <= millDuration(count); frame++) {
      const m = millMoment(frame, count)!;
      assert.ok(m.index >= 0 && m.index < count);
      assert.ok(m.veil >= 0 && m.veil <= 1);
      if (m.index !== previous.index) assert.equal(m.veil, 1, `swap at ${frame} must be hidden`);
      if (!m.interlude) assert.equal(m.veil, 0);
      previous = m;
    }
    for (let i = 0; i < count; i++) {
      // Seeking to a pass start (Mills picker) lands on the painting itself.
      assert.deepEqual(millMoment(i * MILL_PASS_FRAMES, count), { index: i, sceneFrame: 0, veil: 0, interlude: null });
    }
    assert.deepEqual(millMoment(0, count), millMoment(millDuration(count), count));
    const join = millMoment(MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES + MILL_SWAP_FRAME, count)!;
    assert.deepEqual([join.index, join.interlude?.from, join.interlude?.to], [1 % count, 0, 1 % count]);
  }
  assert.equal(millMoment(0, 0), null);
});

test('each mill holds the screen for 30 seconds, journey included', () => {
  assert.equal(MILL_PASS_FRAMES / 30, 30);
  assert.equal(millDuration(MILL_SCENES.length) / 30, 300);
  // The painting still gets most of the pass.
  assert.ok(MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES >= 2 * MILL_INTERLUDE_FRAMES);
});

test('Next mill advances from the mill on screen, including mid-interlude', () => {
  assert.equal(nextMillFrame(0, 10), MILL_PASS_FRAMES);
  assert.equal(nextMillFrame(MILL_PASS_FRAMES - 10, 10), 2 * MILL_PASS_FRAMES);
  assert.equal(nextMillFrame(MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES + 10, 10), MILL_PASS_FRAMES);
  assert.equal(nextMillFrame(9 * MILL_PASS_FRAMES + 5, 10), 0);
  assert.equal(nextMillFrame(500, 1), 0);
});

test('landscape keeps the live board in frame; vertical fills the window and pans to the board', () => {
  for (const mill of MILL_SCENES) {
    const [left, top, width, height] = mill.board;
    for (const frame of [0, MILL_PASS_FRAMES / 2, MILL_PASS_FRAMES]) {
      const { scale } = millCamera(mill, frame, 'landscape');
      const ox = (left + width / 2) * 19.2;
      const oy = (top + height / 2) * 10.8;
      const x1 = ox + (left * 19.2 - ox) * scale;
      const x2 = ox + ((left + width) * 19.2 - ox) * scale;
      const y2 = oy + ((top + height) * 10.8 - oy) * scale;
      assert.ok(x1 >= 0 && x2 <= 1920 && y2 <= 1080, `${mill.id} board stays visible`);
    }
    const start = millCamera(mill, 0, 'vertical');
    const end = millCamera(mill, MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES, 'vertical');
    assert.ok(start.x <= 0);
    assert.equal(1080 * start.scale, VERTICAL_ART_HEIGHT);
    // Each pass opens with its mill in the window.
    const focusX = (mill.focus / 100) * 1920 * start.scale + start.x;
    assert.ok(focusX > 200 && focusX < MILL_STAGE.vertical.width - 120, `${mill.id} opens on its mill`);
    // The pan ends exactly at the painting's right edge, with its board in view.
    assert.ok(Math.abs(1920 * end.scale + end.x - MILL_STAGE.vertical.width) < 0.01);
    assert.ok((left + width) * 19.2 * end.scale + end.x <= MILL_STAGE.vertical.width);
  }
});

test('format parameter and route geometry', () => {
  assert.equal(parseMillFormat('vertical'), 'vertical');
  assert.equal(parseMillFormat('Portrait'), 'vertical');
  assert.equal(parseMillFormat('landscape'), 'landscape');
  assert.equal(parseMillFormat('sideways'), null);
  assert.equal(parseMillFormat(null), null);
  const [greer, turner, hodgson, rockbridge] = ['greer', 'turner', 'hodgson', 'rockbridge'].map((id) => MILL_SCENES.find((s) => s.id === id)!);
  assert.deepEqual(millRoute(greer, turner), { miles: 4, direction: 'east' });
  assert.equal(millRoute(hodgson, rockbridge).direction, 'northwest');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  for (const mill of MILL_SCENES) {
    const [x, y] = projectMap(...mill.at);
    assert.ok(x > 0 && x < MILL_MAP_WIDTH && y > 0 && y < MILL_MAP_HEIGHT, mill.id);
  }
  assert.deepEqual(Object.keys(MILL_MAP_RIVERS).sort(), [...MILL_RIVERS].sort());
});

test('display contract: one break as each painting ends, none for seeks; ?start= resumes the tour', () => {
  const count = MILL_SCENES.length;
  const total = millDuration(count);
  // Breaks land where the veil starts to fall, before the next mill swaps in.
  assert.equal(millMoment(MILL_BREAK_FRAME - 1, count)!.veil, 0);
  assert.ok(millMoment(MILL_BREAK_FRAME + 1, count)!.interlude);
  // Playback at uneven frame steps (a slow wall drops frames) finds each break exactly once, including across the loop.
  const found: number[] = [];
  for (let f = 0, step = 1; f < total * 2; f += step, step = (step % 7) + 1) {
    const pass = millBreakBetween(f, (f + step) % total, count);
    if (pass != null) found.push(pass);
  }
  assert.deepEqual(found, [...MILL_SCENES.keys(), ...MILL_SCENES.keys()]);
  // A seek (Next mill, the picker) is not playback.
  assert.equal(millBreakBetween(MILL_BREAK_FRAME - 10, MILL_PASS_FRAMES * 3, count), null);
  assert.equal(millBreakBetween(5, 5, count), null);
  assert.equal(millBreakBetween(0, 10, 0), null);

  assert.equal(millStartFrame('alley', MILL_SCENES), MILL_PASS_FRAMES);
  assert.equal(millStartFrame(' Dawt ', MILL_SCENES), MILL_SCENES.findIndex((m) => m.id === 'dawt') * MILL_PASS_FRAMES);
  assert.equal(millStartFrame('nowhere', MILL_SCENES), 0);
  assert.equal(millStartFrame(null, MILL_SCENES), 0);
  assert.equal(millStartFrame('alley', selectMillScenes(['huzzah'])), 0, 'a filtered-out mill opens on the first');
  // Frame 0 of the start pass is the mill's own painting.
  assert.equal(millMoment(millStartFrame('greer', MILL_SCENES), count)!.index, MILL_SCENES.findIndex((m) => m.id === 'greer'));
});

test('tall portrait screens stretch the vertical stage: tour band first, then a taller painting', () => {
  assert.equal(verticalHeight(1080, 1920), 1920);
  assert.equal(verticalHeight(1440, 2560), 1920); // still 9:16
  assert.equal(verticalHeight(1920, 1080), 1920); // forced vertical on a landscape screen letterboxes
  assert.equal(verticalHeight(1080, 2560), 2560); // an ultrawide on end
  assert.equal(verticalHeight(1080, 2563) % 8, 0);
  assert.equal(verticalHeight(500, 5000), VERTICAL_MAX_HEIGHT);
  assert.equal(verticalHeight(0, 0), 1920);
  assert.deepEqual(verticalLayout(1920), { height: 1920, art: VERTICAL_ART_HEIGHT, dockTop: VERTICAL_ART_HEIGHT, tourTop: 1920, tour: 0 });
  // Too little extra for a readable band: it all goes to the painting.
  assert.equal(verticalLayout(1920 + TOUR_MIN_HEIGHT - 8).tour, 0);
  assert.equal(verticalLayout(1920 + TOUR_MIN_HEIGHT - 8).art, VERTICAL_ART_HEIGHT + TOUR_MIN_HEIGHT - 8);
  for (const height of [1920, 2160, 2224, 2336, 2560, 2880, VERTICAL_MAX_HEIGHT]) {
    const l = verticalLayout(height);
    assert.equal(l.height, height);
    assert.equal(l.art + VERTICAL_DOCK_HEIGHT + l.tour, height);
    assert.ok(l.art >= VERTICAL_ART_HEIGHT);
    assert.ok(l.tour === 0 || l.tour >= TOUR_MIN_HEIGHT);
    for (const mill of MILL_SCENES) {
      // A taller painting window still opens on the mill and ends at the board.
      const start = millCamera(mill, 0, 'vertical', l.art);
      const end = millCamera(mill, MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES, 'vertical', l.art);
      const focusX = (mill.focus / 100) * 1920 * start.scale + start.x;
      assert.ok(focusX > 200 && focusX < MILL_STAGE.vertical.width - 120, `${mill.id} at ${height}`);
      assert.ok(Math.abs(1920 * end.scale + end.x - MILL_STAGE.vertical.width) < 0.01);
    }
  }
  assert.equal(verticalLayout(2560).tour, 640);
});
