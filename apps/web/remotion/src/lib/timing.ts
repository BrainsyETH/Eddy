import { scenes, reelScenes, getSceneFrames, FPS } from "./voiceover";

export { FPS };

/**
 * Pre-computed frame durations for each website tutorial scene.
 */
export const SCENE_FRAMES = {
  intro: getSceneFrames(scenes[0]),        // 210 (7s)
  home: getSceneFrames(scenes[1]),         // 420 (14s)
  rivers: getSceneFrames(scenes[2]),       // 360 (12s)
  riverDetail: getSceneFrames(scenes[3]),  // 390 (13s)
  floatPlanner: getSceneFrames(scenes[4]), // 390 (13s)
  gauges: getSceneFrames(scenes[5]),       // 360 (12s)
  accessPoint: getSceneFrames(scenes[6]),  // 300 (10s)
  sharePlan: getSceneFrames(scenes[7]),    // 330 (11s)
  askEddy: getSceneFrames(scenes[8]),      // 330 (11s)
  outro: getSceneFrames(scenes[9]),        // 210 (7s)
} as const;

/** Total frames for the full website tutorial */
export const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce(
  (sum, f) => sum + f,
  0
);

/**
 * Pre-computed frame durations for each reel scene.
 */
export const REEL_FRAMES = {
  hook: getSceneFrames(reelScenes[0]),       // 120 (4s)
  conditions: getSceneFrames(reelScenes[1]), // 210 (7s)
  mapPlan: getSceneFrames(reelScenes[2]),    // 240 (8s)
  gauges: getSceneFrames(reelScenes[3]),     // 210 (7s)
  shareCta: getSceneFrames(reelScenes[4]),   // 270 (9s)
} as const;

/** Total frames for the reel */
export const REEL_TOTAL_FRAMES = Object.values(REEL_FRAMES).reduce(
  (sum, f) => sum + f,
  0
);

/** Transition overlap in frames */
export const TRANSITION_FRAMES = 15;
