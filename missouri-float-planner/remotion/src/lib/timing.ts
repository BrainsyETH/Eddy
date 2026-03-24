import { scenes, getSceneFrames, FPS } from "./voiceover";

export { FPS };

/**
 * Pre-computed frame durations for each scene.
 */
export const SCENE_FRAMES = {
  intro: getSceneFrames(scenes[0]),      // 180 (6s)
  home: getSceneFrames(scenes[1]),       // 390 (13s)
  rivers: getSceneFrames(scenes[2]),     // 330 (11s)
  riverDetail: getSceneFrames(scenes[3]), // 330 (11s)
  floatPlanner: getSceneFrames(scenes[4]), // 360 (12s)
  gauges: getSceneFrames(scenes[5]),     // 330 (11s)
  accessPoint: getSceneFrames(scenes[6]), // 270 (9s)
  sharePlan: getSceneFrames(scenes[7]),  // 300 (10s)
  askEddy: getSceneFrames(scenes[8]),    // 300 (10s)
  outro: getSceneFrames(scenes[9]),      // 210 (7s)
} as const;

/** Total frames for the full tutorial */
export const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce(
  (sum, f) => sum + f,
  0
);

/** Transition overlap in frames */
export const TRANSITION_FRAMES = 15;
