/**
 * Voiceover script and timing for each scene.
 *
 * Each scene has:
 * - script: The voiceover narration text
 * - voDuration: Duration of spoken audio in seconds
 * - totalDuration: voDuration + animation padding
 *
 * Audio files should be placed in public/audio/voiceover/ as:
 *   01-intro.mp3, 02-home.mp3, etc.
 *
 * TTS Generation:
 *   Use OpenAI TTS API with "nova" (warm, natural female voice).
 *   Export each as MP3 at 44.1kHz.
 */

export interface SceneVO {
  id: string;
  compositionId: string;
  title: string;
  script: string;
  /** Voiceover audio duration in seconds */
  voDuration: number;
  /** Extra padding for animations in seconds */
  animationPadding: number;
  /** Audio file name in public/audio/voiceover/ */
  audioFile: string;
}

export const FPS = 30;

/**
 * Overlap length of each montage transition, in frames (~0.47s at 30fps). Beats
 * that play back-to-back through a <Montage> overlap by this much and blend, so
 * a composition's real length is shorter than the naive sum of its beats — use
 * the *MontageFrames helpers below to register the right durationInFrames.
 */
export const MONTAGE_TRANSITION_FRAMES = 14;

// ============================================
// Website/YouTube Tutorial Scenes (~110s)
// ============================================

export const scenes: SceneVO[] = [
  {
    id: "intro",
    compositionId: "scene-intro",
    title: "Intro",
    script:
      "Meet Eddy — your personal guide to floating Midwest rivers.",
    voDuration: 5,
    animationPadding: 2,
    audioFile: "01-intro.mp3",
  },
  {
    id: "home",
    compositionId: "scene-home",
    title: "Home",
    script:
      "Eddy gives you a daily river report with real-time conditions across the Midwest's top floating rivers. See what's running at a glance — whether you're on desktop or on your phone.",
    voDuration: 10,
    animationPadding: 4,
    audioFile: "02-home.mp3",
  },
  {
    id: "rivers",
    compositionId: "scene-rivers",
    title: "Rivers",
    script:
      "Browse eight of the Midwest's best float rivers. Each one shows live conditions — so you always know what to expect before you head out.",
    voDuration: 9,
    animationPadding: 3,
    audioFile: "03-rivers.mp3",
  },
  {
    id: "river-detail",
    compositionId: "scene-river-detail",
    title: "River Detail",
    script:
      "Tap into any river to explore an interactive map — every access point, gauge station, and hazard is marked. The map works beautifully on mobile too.",
    voDuration: 9,
    animationPadding: 4,
    audioFile: "04-river-detail.mp3",
  },
  {
    id: "float-planner",
    compositionId: "scene-float-planner",
    title: "Float Planner",
    script:
      "Pick your put-in and take-out, and Eddy calculates float time, distance, and shuttle drive — all in seconds.",
    voDuration: 9,
    animationPadding: 4,
    audioFile: "05-float-planner.mp3",
  },
  {
    id: "gauges",
    compositionId: "scene-gauges",
    title: "Gauges",
    script:
      "Track real-time water levels from USGS gauge stations. Sparkline charts show the seven-day trend at a glance.",
    voDuration: 9,
    animationPadding: 3,
    audioFile: "06-gauges.mp3",
  },
  {
    id: "access-point",
    compositionId: "scene-access-point",
    title: "Access Point",
    script:
      "Every access point has detailed info — parking, facilities, road conditions, and nearby outfitters.",
    voDuration: 7,
    animationPadding: 3,
    audioFile: "07-access-point.mp3",
  },
  {
    id: "share-plan",
    compositionId: "scene-share-plan",
    title: "Share Plan",
    script:
      "Share your float plan with one link. All the details — put-in, take-out, time estimate, and a map preview — ready to send to friends.",
    voDuration: 8,
    animationPadding: 3,
    audioFile: "08-share-plan.mp3",
  },
  {
    id: "ask-eddy",
    compositionId: "scene-ask-eddy",
    title: "Ask Eddy",
    script:
      "Got questions? Ask Eddy. He knows the rivers, the conditions, and can help you plan the perfect trip.",
    voDuration: 8,
    animationPadding: 3,
    audioFile: "09-ask-eddy.mp3",
  },
  {
    id: "outro",
    compositionId: "scene-outro",
    title: "Outro",
    script: "Start planning your next float at eddy dot guide.",
    voDuration: 4,
    animationPadding: 3,
    audioFile: "10-outro.mp3",
  },
];

// ============================================
// Reel/TikTok Scenes (~35s)
// ============================================

export const reelScenes: SceneVO[] = [
  {
    id: "reel-hook",
    compositionId: "reel-hook",
    title: "Hook",
    script: "Planning a float trip? You need this.",
    voDuration: 3,
    animationPadding: 1,
    audioFile: "reel-01-hook.mp3",
  },
  {
    id: "reel-conditions",
    compositionId: "reel-conditions",
    title: "Live Conditions",
    script:
      "Real-time river conditions — eight Midwest rivers, updated live.",
    voDuration: 5,
    animationPadding: 2,
    audioFile: "reel-02-conditions.mp3",
  },
  {
    id: "reel-map-plan",
    compositionId: "reel-map-plan",
    title: "Map + Plan",
    script:
      "Pick your put-in and take-out. Distance, float time, shuttle — done.",
    voDuration: 6,
    animationPadding: 2,
    audioFile: "reel-03-map-plan.mp3",
  },
  {
    id: "reel-gauges",
    compositionId: "reel-gauges",
    title: "Gauges",
    script:
      "USGS water levels and seven-day trends — all in one place.",
    voDuration: 5,
    animationPadding: 2,
    audioFile: "reel-04-gauges.mp3",
  },
  {
    id: "reel-share-cta",
    compositionId: "reel-share-cta",
    title: "Share + CTA",
    script:
      "Share your plan with one link. Start at eddy dot guide.",
    voDuration: 6,
    animationPadding: 3,
    audioFile: "reel-05-cta.mp3",
  },
];

// ============================================
// Promo Reel Scenes (~39s) — 3-feature product promo:
// live river map · river levels · plan a float
// ============================================

export const promoScenes: SceneVO[] = [
  {
    id: "promo-hook",
    compositionId: "promo-hook",
    title: "Hook",
    script:
      "Floating an Ozark river this weekend? Here's how to know it's running — before you load the cooler.",
    voDuration: 6.12,
    animationPadding: 0.78,
    audioFile: "promo-01-hook.mp3",
  },
  {
    id: "promo-map",
    compositionId: "promo-map",
    title: "Live River Map",
    script:
      "This is the live river map. Every river is painted by its USGS gauges, so you can see what's flowing at a glance. Tap one for today's floater's verdict — then drag the timeline to replay the whole month.",
    voDuration: 13.66,
    animationPadding: 0.84,
    audioFile: "promo-02-map.mp3",
  },
  {
    id: "promo-levels",
    compositionId: "promo-levels",
    title: "River Levels",
    script:
      "Too low and you're dragging bottom; too high and it's dangerous. Eddy reads the gauges for you — feet, flow, and the seven-day trend — and just tells you: good to float, or wait.",
    voDuration: 13.66,
    animationPadding: 0.84,
    audioFile: "promo-03-levels.mp3",
  },
  {
    id: "promo-plan",
    compositionId: "promo-plan",
    title: "Plan a Float",
    script:
      "Found a good one? Pick your put-in and take-out. Eddy does the math — float time, river miles, and the shuttle drive — in seconds.",
    voDuration: 7.42,
    animationPadding: 0.88,
    audioFile: "promo-04-plan.mp3",
  },
  {
    id: "promo-cta",
    compositionId: "promo-cta",
    title: "CTA",
    script: "Check the rivers. Plan the float. Start at eddy dot guide.",
    voDuration: 4.8,
    animationPadding: 0.9,
    audioFile: "promo-05-cta.mp3",
  },
];

// ============================================
// Current River focus reel (~30s) — Eddy Says verdict + plan the float
// ============================================

export const currentScenes: SceneVO[] = [
  {
    id: "current-hook",
    compositionId: "current-hook",
    title: "Hook",
    script:
      "Thinking about floating the Current River this weekend? Let's see what Eddy says.",
    voDuration: 4.75,
    animationPadding: 0.85,
    audioFile: "current-01-hook.mp3",
  },
  {
    id: "current-eddy-says",
    compositionId: "current-eddy-says",
    title: "Eddy Says",
    script:
      "Right now, the Current is sitting at three feet — the low end of the ideal range — running clear and steady. Eddy says conditions are excellent today.",
    voDuration: 9.36,
    animationPadding: 1.04,
    audioFile: "current-02-eddysays.mp3",
  },
  {
    id: "current-plan",
    compositionId: "current-plan",
    title: "Plan the Float",
    script:
      "Ready to go? The classic float from Akers Ferry down to Pulltite Spring is nine and a half miles — about four to six hours on the water.",
    voDuration: 8.21,
    animationPadding: 0.89,
    audioFile: "current-03-plan.mp3",
  },
  {
    id: "current-cta",
    compositionId: "current-cta",
    title: "CTA",
    script: "Check conditions and plan your Current River float at eddy dot guide.",
    voDuration: 4.75,
    animationPadding: 0.85,
    audioFile: "current-04-cta.mp3",
  },
];

/** Get total duration of a scene in seconds */
export function getSceneDuration(scene: SceneVO): number {
  return scene.voDuration + scene.animationPadding;
}

/** Get total duration of a scene in frames */
export function getSceneFrames(scene: SceneVO): number {
  return getSceneDuration(scene) * FPS;
}

/** Get total video duration in frames (website tutorial) */
export function getTotalFrames(): number {
  return scenes.reduce((sum, s) => sum + getSceneFrames(s), 0);
}

/** Get total video duration in seconds (website tutorial) */
export function getTotalDuration(): number {
  return scenes.reduce((sum, s) => sum + getSceneDuration(s), 0);
}

/** Get total reel duration in frames */
export function getReelTotalFrames(): number {
  return reelScenes.reduce((sum, s) => sum + getSceneFrames(s), 0);
}

/** Get total reel duration in seconds */
export function getReelTotalDuration(): number {
  return reelScenes.reduce((sum, s) => sum + getSceneDuration(s), 0);
}

/** Get total promo duration in frames */
export function getPromoTotalFrames(): number {
  return promoScenes.reduce((sum, s) => sum + getSceneFrames(s), 0);
}

/** Promo length once beats overlap through the montage transitions. */
export function getPromoMontageFrames(): number {
  return montageLength(promoScenes);
}

/** Current-River reel length once beats overlap through the montage. */
export function getCurrentMontageFrames(): number {
  return montageLength(currentScenes);
}

/** Reel length once beats overlap through the montage transitions. */
export function getReelMontageFrames(): number {
  return montageLength(reelScenes);
}

/** Frames a montage of these beats occupies: total minus the (n-1) overlaps. */
function montageLength(list: SceneVO[]): number {
  const total = list.reduce((sum, s) => sum + getSceneFrames(s), 0);
  const overlaps = Math.max(0, list.length - 1) * MONTAGE_TRANSITION_FRAMES;
  return Math.max(1, total - overlaps);
}

/** Get total promo duration in seconds */
export function getPromoTotalDuration(): number {
  return promoScenes.reduce((sum, s) => sum + getSceneDuration(s), 0);
}

/** Get total Current River reel duration in frames */
export function getCurrentTotalFrames(): number {
  return currentScenes.reduce((sum, s) => sum + getSceneFrames(s), 0);
}
