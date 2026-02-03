// ─── Video Configuration ───────────────────────────────────────────────
export const VIDEO_CONFIG = {
  fps: 30,
  width: 1920,
  height: 1080,
  totalFrames: 30 * 45, // 45 seconds total
} as const;

// ─── Color Palette ─────────────────────────────────────────────────────
// Inspired by Ozark rivers: deep blues, warm earth tones, sunlit greens
export const COLORS = {
  // Primary
  riverBlue: "#1B4965",
  deepWater: "#0B2545",
  skyBlue: "#62B6CB",
  shallowBlue: "#BEE9E8",

  // Accent
  sunsetOrange: "#E07A5F",
  warmGold: "#F2CC8F",
  driftwood: "#C9B99A",

  // Nature
  forestGreen: "#3D5A45",
  mossGreen: "#81B29A",
  sandBar: "#F4F1DE",

  // UI
  white: "#FFFFFF",
  offWhite: "#FAF9F6",
  darkText: "#1A1A2E",
  lightText: "#E8E8E8",
  
  // Eddy brand colors (from the site)
  eddyTeal: "#0F2D35",
  eddyOrange: "#F07052",
  eddyPrimary: "#2D7889",
} as const;

// ─── Typography ────────────────────────────────────────────────────────
export const FONTS = {
  display: "'Playfair Display', Georgia, serif",
  heading: "'DM Sans', 'Helvetica Neue', sans-serif",
  body: "'DM Sans', 'Helvetica Neue', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

// ─── Scene Timing (in frames at 30fps) ────────────────────────────────
export const SCENES = {
  // Scene 1: Opening Hook - River beauty, problem statement
  opening: { start: 0, duration: 30 * 6 }, // 0-6s

  // Scene 2: Introduce Eddy - Logo + mascot reveal
  introEddy: { start: 30 * 6, duration: 30 * 5 }, // 6-11s

  // Scene 3: Feature 1 - Plan Your Float (river selector UI)
  planFloat: { start: 30 * 11, duration: 30 * 6 }, // 11-17s

  // Scene 4: Feature 2 - Live River Gauges
  riverGauges: { start: 30 * 17, duration: 30 * 6 }, // 17-23s

  // Scene 5: Feature 3 - Access Points & Float Times
  accessPoints: { start: 30 * 23, duration: 30 * 6 }, // 23-29s

  // Scene 6: Feature 4 - Blog & Guides
  blogGuides: { start: 30 * 29, duration: 30 * 5 }, // 29-34s

  // Scene 7: Social Proof / Stats
  stats: { start: 30 * 34, duration: 30 * 4 }, // 34-38s

  // Scene 8: CTA - Visit eddy.guide
  cta: { start: 30 * 38, duration: 30 * 7 }, // 38-45s
} as const;

// ─── Narration Script ──────────────────────────────────────────────────
// Each entry has the text and its approximate frame timing for captions.
// You'll generate audio from this script using TTS (see scripts/generate-audio.ts)
export const NARRATION_SCRIPT: Array<{
  scene: keyof typeof SCENES;
  text: string;
  startFrame: number;
  endFrame: number;
}> = [
  {
    scene: "opening",
    text: "Missouri's Ozark rivers are some of the most beautiful waterways in America.",
    startFrame: 15,
    endFrame: 120,
  },
  {
    scene: "opening",
    text: "But planning a float trip? That's been the hard part. Until now.",
    startFrame: 120,
    endFrame: 180,
  },
  {
    scene: "introEddy",
    text: "Meet Eddy — your Ozark float trip companion.",
    startFrame: 180,
    endFrame: 270,
  },
  {
    scene: "introEddy",
    text: "A free tool that makes planning your next river adventure effortless.",
    startFrame: 270,
    endFrame: 330,
  },
  {
    scene: "planFloat",
    text: "Pick your river. Choose your put-in and take-out.",
    startFrame: 330,
    endFrame: 420,
  },
  {
    scene: "planFloat",
    text: "Eddy calculates distance and estimated float time instantly.",
    startFrame: 420,
    endFrame: 510,
  },
  {
    scene: "riverGauges",
    text: "Check real-time water levels powered by USGS gauges.",
    startFrame: 510,
    endFrame: 600,
  },
  {
    scene: "riverGauges",
    text: "Know if conditions are too low, optimal, or too high before you go.",
    startFrame: 600,
    endFrame: 690,
  },
  {
    scene: "accessPoints",
    text: "Over thirty curated access points across Missouri's best float rivers.",
    startFrame: 690,
    endFrame: 780,
  },
  {
    scene: "accessPoints",
    text: "Every launch mapped. Every detail covered.",
    startFrame: 780,
    endFrame: 870,
  },
  {
    scene: "blogGuides",
    text: "Plus in-depth river guides and blog posts to help you choose your perfect float.",
    startFrame: 870,
    endFrame: 990,
  },
  {
    scene: "stats",
    text: "Trusted by Missouri floaters for live data and local knowledge.",
    startFrame: 1020,
    endFrame: 1110,
  },
  {
    scene: "cta",
    text: "Plan your next float trip today.",
    startFrame: 1140,
    endFrame: 1230,
  },
  {
    scene: "cta",
    text: "eddy dot guide. Your river. Your adventure.",
    startFrame: 1230,
    endFrame: 1350,
  },
];

// ─── Full narration script as a single string (for TTS generation) ────
export const FULL_NARRATION = NARRATION_SCRIPT.map((s) => s.text).join(" ");

// ─── Eddy mascot images from Vercel blob storage ──────────────────────
export const EDDY_IMAGES = {
  main: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png",
  flood: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png",
  canoe: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png",
  green: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png",
  red: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png",
  yellow: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png",
  flag: "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png",
} as const;
