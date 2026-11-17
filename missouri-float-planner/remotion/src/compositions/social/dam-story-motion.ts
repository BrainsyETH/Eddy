// A single 12-second clock drives the scene. Every moving pattern completes
// whole cycles, including at the loop seam; nothing resets while still visible.
export const DAM_LOOP_FRAMES = 360;
const tau = Math.PI * 2;
export const loopFrame = (frame: number) => ((frame % DAM_LOOP_FRAMES) + DAM_LOOP_FRAMES) % DAM_LOOP_FRAMES;
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * t * (t * (t * 6 - 15) + 10); };

export function lakeSurface(x: number, frame: number) {
  const t = loopFrame(frame) / DAM_LOOP_FRAMES;
  return 116 + 1.4 * Math.sin(tau * (x / 180 - t * 2)) + 0.45 * Math.sin(tau * (x / 90 + t));
}

/** Smooth cubic samples of the same surface the hull rests on. */
export function lakeSurfacePath(frame: number) {
  const slope = (x: number) => (lakeSurface(x + 0.01, frame) - lakeSurface(x - 0.01, frame)) / 0.02;
  let path = `M-32 ${lakeSurface(-32, frame)}`;
  for (let x = -32; x < 388; x += 20) {
    const y = lakeSurface(x, frame), end = lakeSurface(x + 20, frame);
    path += ` C${x + 20 / 3} ${y + slope(x) * 20 / 3} ${x + 40 / 3} ${end - slope(x + 20) * 20 / 3} ${x + 20} ${end}`;
  }
  return path;
}

export function canoePose(frame: number) {
  const t = loopFrame(frame) / DAM_LOOP_FRAMES;
  const x = 174 + 3 * Math.sin(tau * t);
  // Average the water under the bow and stern, rather than bobbing separately.
  const stern = lakeSurface(x - 42, frame), bow = lakeSurface(x + 42, frame);
  return { x, y: (stern + bow) / 2, roll: Math.atan2(bow - stern, 84) * 180 / Math.PI };
}

export function paddlePose(frame: number) {
  const phase = (loopFrame(frame) % 180) / 180;
  const pull = smooth((phase - 0.12) / 0.34);
  const recovery = smooth((phase - 0.50) / 0.40);
  const angle = -25 + 48 * pull - 48 * recovery;
  // Lift first, return above the water, then ease the blade back in.
  const lift = -20 * smooth((phase - 0.46) / 0.12) * (1 - smooth((phase - 0.88) / 0.12));
  const radians = angle * Math.PI / 180;
  const point = (y: number) => ({ x: 27 - (y + 32) * Math.sin(radians), y: -32 + lift + (y + 32) * Math.cos(radians) });
  const contact = 27 - (32 - lift) * Math.tan(radians);
  const ripple = smooth((phase - 0.08) / 0.10) * (1 - smooth((phase - 0.46) / 0.13)) * smooth(point(16).y / 6);
  return { angle, lift, upperHand: point(-36), lowerHand: point(-17), contact, ripple, pull };
}

export function damMotion(frame: number) {
  const f = loopFrame(frame);
  return { frame: f, phase: f / DAM_LOOP_FRAMES, flowOffset: -f * 0.4, lakeOffset: -f * 82 / DAM_LOOP_FRAMES,
    turbineAngle: f, canoe: canoePose(f), paddle: paddlePose(f) };
}
