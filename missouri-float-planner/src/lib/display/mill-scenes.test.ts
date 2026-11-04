import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
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
  riverLabel,
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
    assert.ok(s.focus > 0 && s.focus < 100);
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
  assert.equal(MILL_SCENES.find((s) => s.id === 'falling')?.context, 'Nearby');
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

test('cameras stay on the mill, never the blank painted board', () => {
  // Every point the mill should be visible across the whole scene, at every height.
  const inWindow = (mill: (typeof MILL_SCENES)[number], art: number, frame: number) => {
    const c = millCamera(mill, frame, 'vertical', art);
    return (mill.focus / 100) * 1920 * c.scale + c.x;
  };
  for (const mill of MILL_SCENES) {
    const land = millCamera(mill, MILL_PASS_FRAMES / 2, 'landscape');
    assert.equal(land.origin, `${mill.focus}% 42%`);
    assert.ok(land.scale > 1 && land.scale <= 1.06);
    for (const art of [VERTICAL_ART_HEIGHT, 1456, 1916]) {
      const start = millCamera(mill, 0, 'vertical', art);
      const end = millCamera(mill, MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES, 'vertical', art);
      assert.equal(1080 * start.scale, art);
      // A gentle drift, inside the painting, with the mill in view throughout.
      assert.ok(Math.abs(start.x - end.x - 240) < 0.01, `${mill.id} drifts 240px`);
      assert.ok(start.x <= 0 && 1920 * end.scale + end.x >= MILL_STAGE.vertical.width - 0.01);
      for (const frame of [0, 300, MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES]) {
        const x = inWindow(mill, art, frame);
        assert.ok(x > 120 && x < MILL_STAGE.vertical.width - 120, `${mill.id} visible at ${art}/${frame}`);
      }
    }
  }
});

test('river labels say On or Nearby, never "related"', () => {
  const by = (id: string) => MILL_SCENES.find((s) => s.id === id)!;
  assert.equal(riverLabel(by('dillard')), 'On Huzzah Creek');
  assert.equal(riverLabel(by('dawt')), 'On North Fork River');
  assert.equal(riverLabel(by('hodgson')), 'On Bryant Creek');
  assert.equal(riverLabel(by('alley')), 'Nearby: Jacks Fork');
  assert.equal(riverLabel(by('rockbridge')), 'Nearby: Bryant Creek');
  for (const mill of MILL_SCENES) {
    assert.ok(['On', 'Nearby'].includes(mill.context));
    if (mill.built) assert.match(mill.built, /\b1[89]\d\d\b/);
  }
  // Disputed construction dates stay off the screen.
  assert.equal(by('greer').built, undefined);
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
      // A taller painting window still opens on the mill.
      const start = millCamera(mill, 0, 'vertical', l.art);
      const focusX = (mill.focus / 100) * 1920 * start.scale + start.x;
      assert.ok(focusX > 120 && focusX < MILL_STAGE.vertical.width - 120, `${mill.id} at ${height}`);
    }
  }
  assert.equal(verticalLayout(2560).tour, 640);
});

test('every mill tells two short, sourced facts', () => {
  const docs = readFileSync('docs/missouri-mills.md', 'utf8');
  for (const mill of MILL_SCENES) {
    assert.equal(mill.facts.length, 2);
    for (const fact of mill.facts) {
      // One fact must fit the landscape card in two lines at TV distance.
      assert.ok(fact.length >= 30 && fact.length <= 90, `${mill.id}: ${fact.length} chars`);
      assert.match(fact, /[.]$/);
    }
    assert.notEqual(mill.facts[0], mill.facts[1]);
    assert.match(mill.source, /^https:\/\//);
    assert.ok(docs.includes(mill.source), `${mill.id} source is listed in the docs`);
  }
});
