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
 *   Use ElevenLabs or OpenAI TTS API with a warm, friendly male voice.
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

export const scenes: SceneVO[] = [
  {
    id: "intro",
    compositionId: "scene-intro",
    title: "Intro",
    script:
      "Meet Eddy — your guide to the best float trips in Missouri.",
    voDuration: 4,
    animationPadding: 2,
    audioFile: "01-intro.mp3",
  },
  {
    id: "home",
    compositionId: "scene-home",
    title: "Home",
    script:
      "Eddy gives you a daily river report with real-time conditions across Missouri's top floating rivers. See what's running good at a glance.",
    voDuration: 10,
    animationPadding: 3,
    audioFile: "02-home.mp3",
  },
  {
    id: "rivers",
    compositionId: "scene-rivers",
    title: "Rivers",
    script:
      "Browse eight of Missouri's best float rivers. Each one shows live conditions so you know exactly what to expect before you go.",
    voDuration: 9,
    animationPadding: 2,
    audioFile: "03-rivers.mp3",
  },
  {
    id: "river-detail",
    compositionId: "scene-river-detail",
    title: "River Detail",
    script:
      "Dive into any river to see an interactive map with every access point, gauge station, and hazard marked.",
    voDuration: 8,
    animationPadding: 3,
    audioFile: "04-river-detail.mp3",
  },
  {
    id: "float-planner",
    compositionId: "scene-float-planner",
    title: "Float Planner",
    script:
      "Pick your put-in and take-out, and Eddy calculates your float time, distance, and shuttle drive — all in seconds.",
    voDuration: 9,
    animationPadding: 3,
    audioFile: "05-float-planner.mp3",
  },
  {
    id: "gauges",
    compositionId: "scene-gauges",
    title: "Gauges",
    script:
      "Track real-time water levels from USGS gauge stations. Sparkline charts show you the seven-day trend at a glance.",
    voDuration: 9,
    animationPadding: 2,
    audioFile: "06-gauges.mp3",
  },
  {
    id: "access-point",
    compositionId: "scene-access-point",
    title: "Access Point",
    script:
      "Every access point has detailed info — parking, facilities, road conditions, and nearby outfitters.",
    voDuration: 7,
    animationPadding: 2,
    audioFile: "07-access-point.mp3",
  },
  {
    id: "share-plan",
    compositionId: "scene-share-plan",
    title: "Share Plan",
    script:
      "Share your float plan with friends. One link, all the details — put-in, take-out, estimated time, and a map.",
    voDuration: 8,
    animationPadding: 2,
    audioFile: "08-share-plan.mp3",
  },
  {
    id: "ask-eddy",
    compositionId: "scene-ask-eddy",
    title: "Ask Eddy",
    script:
      "Got questions? Ask Eddy. He knows the rivers, the conditions, and can help you plan the perfect trip.",
    voDuration: 8,
    animationPadding: 2,
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

/** Get total duration of a scene in seconds */
export function getSceneDuration(scene: SceneVO): number {
  return scene.voDuration + scene.animationPadding;
}

/** Get total duration of a scene in frames */
export function getSceneFrames(scene: SceneVO): number {
  return getSceneDuration(scene) * FPS;
}

/** Get total video duration in frames */
export function getTotalFrames(): number {
  return scenes.reduce((sum, s) => sum + getSceneFrames(s), 0);
}

/** Get total video duration in seconds */
export function getTotalDuration(): number {
  return scenes.reduce((sum, s) => sum + getSceneDuration(s), 0);
}
