import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DamStoryScene } from '../src/compositions/social/DamStoryScene';
import { DAM_LOOP_FRAMES, canoePose, damMotion, lakeSurface, paddlePose } from '../src/compositions/social/dam-story-motion';

test('active and idle artwork return to exactly the same rendered pose after 12 seconds', () => {
  for (const active of [true, false]) {
    const render = (frame: number) => renderToStaticMarkup(React.createElement(DamStoryScene, { active, frame }));
    assert.equal(render(0), render(DAM_LOOP_FRAMES));
    assert.equal(render(47), render(DAM_LOOP_FRAMES + 47));
    assert.doesNotMatch(render(0), /foreignObject|<image|<img/);
    assert.equal(render(0).includes('data-water-path="turbine"'), active);
  }
});

test('the hull follows the water at both ends without slipping or jumping at the seam', () => {
  for (let frame = 0; frame < DAM_LOOP_FRAMES; frame++) {
    const boat = canoePose(frame), next = canoePose(frame + 1);
    for (const dx of [-42, 42]) {
      const hullY = boat.y + Math.tan(boat.roll * Math.PI / 180) * dx;
      assert.ok(Math.abs(hullY - lakeSurface(boat.x + dx, frame)) < 0.001);
    }
    assert.ok(Math.abs(next.x - boat.x) < 0.06, `drift jump at ${frame}`);
    assert.ok(Math.abs(next.y - boat.y) < 0.08, `bob jump at ${frame}`);
    assert.ok(Math.abs(next.roll - boat.roll) < 0.08, `roll jump at ${frame}`);
  }
});

test('hands follow a continuous paddle stroke, including entry, recovery and loop boundary', () => {
  for (let frame = 0; frame < DAM_LOOP_FRAMES; frame++) {
    const now = paddlePose(frame), next = paddlePose(frame + 1);
    for (const hand of ['upperHand', 'lowerHand'] as const) {
      assert.ok(Math.hypot(next[hand].x - now[hand].x, next[hand].y - now[hand].y) < 2.1, `${hand} jumps at ${frame}`);
    }
    assert.ok(now.ripple >= 0 && now.ripple <= 1);
    if (now.bladeDepth < 0) assert.equal(now.ripple, 0, 'no splash while the paddle is out of the water');
  }
  assert.ok(paddlePose(45).bladeDepth > 0, 'blade enters the water during the pull');
  assert.ok(paddlePose(126).bladeDepth < 0, 'blade clears the water on recovery');
});

test('arms bend at the elbows and keep their length through the stroke', () => {
  const initial = paddlePose(0);
  for (const side of ['farArm', 'nearArm'] as const) {
    const lengths = ({ shoulder, elbow, paw }: typeof initial[typeof side]) => [
      Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y),
      Math.hypot(paw.x - elbow.x, paw.y - elbow.y),
    ];
    const startingLengths = lengths(initial[side]);
    for (let frame = 1; frame < DAM_LOOP_FRAMES; frame++) {
      lengths(paddlePose(frame)[side]).forEach((length, segment) => {
        assert.ok(Math.abs(length - startingLengths[segment]) < 0.001, `${side} stretches at frame ${frame}`);
      });
    }
  }
});

test('flow patterns and turbine complete whole cycles at the seam', () => {
  assert.deepEqual(damMotion(0), damMotion(360));
  const periodicDistance = (a: number, b: number, period: number) => {
    const distance = Math.abs(a - b) % period;
    return Math.min(distance, period - distance);
  };
  for (let frame = 0; frame < DAM_LOOP_FRAMES; frame++) {
    const now = damMotion(frame), next = damMotion(frame + 1);
    assert.ok(periodicDistance(now.flowOffset, next.flowOffset, 36) < 0.41, `flow discontinuity at ${frame}`);
    assert.ok(periodicDistance(now.flowOffset / 2, next.flowOffset / 2, 36) < 0.21, `idle current discontinuity at ${frame}`);
    assert.ok(periodicDistance(now.lakeOffset, next.lakeOffset, 82) < 0.23, `lake highlight discontinuity at ${frame}`);
    assert.equal(periodicDistance(now.turbineAngle, next.turbineAngle, 360), 1);
  }
});
