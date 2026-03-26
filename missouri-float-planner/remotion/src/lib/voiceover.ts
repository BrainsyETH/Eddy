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
