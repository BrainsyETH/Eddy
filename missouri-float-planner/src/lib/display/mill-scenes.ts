/** Curated Missouri mill scenes. A river association is never a millpond reading. */
export type MillScene = {
  id: string;
  name: string;
  location: string;
  riverSlug: string;
  riverName: string;
  context: 'River report' | 'Related river' | 'Nearby river';
  // Percentage rectangle inside the painted blank board; angle in degrees.
  board: [number, number, number, number, number];
  // Horizontal centre of the mill (or wheel) in the painting, percent. The
  // vertical format opens on it before drifting to the board.
  focus: number;
  // Approximate site [lat, lng], for the between-mills route map only.
  at: [number, number];
  // The painting's own foreground colour, darkened: the vertical dock and the
  // between-mills veil are tinted from the scenes they join.
  tone: string;
  // Water-only region, excluding banks, buildings and the information board.
  water?: string;
};

export const MILL_SCENES: MillScene[] = [
  { id: 'dillard', name: 'Dillard Mill', location: 'Dillard · Huzzah Creek', riverSlug: 'huzzah', riverName: 'Huzzah Creek', context: 'River report', board: [79.8, 60.3, 15.5, 15.6, 0], focus: 58, at: [37.718, -91.206], tone: '#25241c', water: 'polygon(1% 70%, 72% 70%, 72% 81%, 26% 86%, 1% 79%)' },
  { id: 'alley', name: 'Alley Mill', location: 'Alley Spring · ONSR', riverSlug: 'jacks-fork', riverName: 'Jacks Fork', context: 'Related river', board: [77.8, 64.5, 17.2, 17.3, 8], focus: 35, at: [37.154, -91.442], tone: '#292418', water: 'polygon(20% 53%, 73% 53%, 73% 71%, 37% 77%, 20% 72%)' },
  { id: 'klepzig', name: 'Klepzig Mill', location: 'Rocky Creek · ONSR', riverSlug: 'current', riverName: 'Current River', context: 'Related river', board: [81.8, 64, 13.7, 17.6, 0], focus: 72, at: [37.04, -91.25], tone: '#292118', water: 'polygon(2% 61%, 25% 62%, 27% 66%, 18% 69%, 1% 67%)' },
  { id: 'montauk', name: 'Montauk Mill', location: 'Montauk State Park · Salem', riverSlug: 'current', riverName: 'Current River', context: 'Related river', board: [72.8, 59.2, 20.5, 18, 0], focus: 42, at: [37.46, -91.683], tone: '#2d2c15' },
  { id: 'falling', name: 'Falling Spring Mill', location: 'Mark Twain NF · near Winona', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Nearby river', board: [77, 63, 17, 16.5, 0], focus: 47, at: [36.88, -91.3], tone: '#2a2817', water: 'polygon(12% 58%, 69% 58%, 69% 72%, 23% 73%, 12% 68%)' },
  { id: 'greer', name: 'Greer Mill', location: 'Greer Spring uplands · Alton', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Related river', board: [73.3, 59, 20.5, 17.5, 0], focus: 44, at: [36.786, -91.343], tone: '#302112' },
  { id: 'turner', name: 'Turner Mill Site', location: 'Turner Spring · near Alton', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Related river', board: [73, 53.2, 21, 21, 0], focus: 37, at: [36.766, -91.267], tone: '#2b2716', water: 'polygon(30% 88%, 58% 88%, 58% 93%, 30% 93%)' },
  { id: 'hodgson', name: 'Hodgson Mill', location: 'Sycamore · Ozark County', riverSlug: 'bryant-creek', riverName: 'Bryant Creek', context: 'Related river', board: [72.4, 62, 21, 17.8, 0], focus: 45, at: [36.708, -92.266], tone: '#2a2817', water: 'polygon(37% 82%, 60% 81%, 65% 87%, 42% 87%)' },
  { id: 'dawt', name: 'Dawt Mill', location: 'Dawt · near Tecumseh', riverSlug: 'north-fork-white', riverName: 'North Fork River', context: 'River report', board: [78.6, 60.8, 15.1, 14.2, 0], focus: 55, at: [36.61, -92.277], tone: '#2b2516', water: 'polygon(5% 73%, 72% 73%, 70% 81%, 32% 82%)' },
  { id: 'rockbridge', name: 'Rockbridge Mill', location: 'Spring Creek · Rockbridge', riverSlug: 'bryant-creek', riverName: 'Bryant Creek', context: 'Related river', board: [81.2, 62.4, 13.7, 13.1, -2], focus: 74, at: [36.789, -92.409], tone: '#292718', water: 'polygon(18% 65%, 74% 65%, 74% 76%, 32% 77%)' },
];

export const MILL_RIVERS = [...new Set(MILL_SCENES.map((s) => s.riverSlug))];

/** Landscape TVs get the full painting; portrait walls (a TV or kiosk mounted
 * on end, a phone held upright) get the painting above a reading dock. */
export type MillFormat = 'landscape' | 'vertical';
export const MILL_STAGE: Record<MillFormat, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
};
/** The painting window at the top of the vertical stage; the dock fills the rest. */
export const VERTICAL_ART_HEIGHT = 1216;
const VERTICAL_MIN_DRIFT = 160;
/** A viewport this tall or taller gets the vertical format unless `?format=` says otherwise. */
export const VERTICAL_MEDIA = '(max-aspect-ratio: 4/5)';

export function parseMillFormat(value: string | null): MillFormat | null {
  const v = value?.trim().toLowerCase();
  if (v === 'vertical' || v === 'portrait') return 'vertical';
  if (v === 'landscape' || v === 'horizontal') return 'landscape';
  return null;
}

export const MILL_PASS_FRAMES = 2400; // 80 seconds per mill at 30 fps.
/** The last seven seconds of every pass travel to the next mill. */
export const MILL_INTERLUDE_FRAMES = 210;
const VEIL_FRAMES = 30;
// The next mill opens through an iris in the veil (drawn by the scene); the
// veil itself only lets go over the final frames, after the iris has covered
// the screen, so a browser without clip-path paths still gets a soft cut.
const RELEASE_FRAMES = 6;
/** Under the full veil, the next mill replaces the current one. */
export const MILL_SWAP_FRAME = 105;
const SCENE_FRAMES = MILL_PASS_FRAMES - MILL_INTERLUDE_FRAMES;

export function selectMillScenes(requested: string[]): MillScene[] {
  return requested.length ? MILL_SCENES.filter((s) => requested.includes(s.riverSlug)) : MILL_SCENES;
}

export function millDuration(count: number): number {
  return Math.max(1, count) * MILL_PASS_FRAMES;
}

const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2;

export type MillMoment = {
  /** The one mill scene mounted right now. */
  index: number;
  /** Frames into that scene's own camera move. */
  sceneFrame: number;
  /** 0 = the painting, 1 = fully under the between-mills veil. */
  veil: number;
  /** Set while travelling between mills: frames into the interlude. */
  interlude: { from: number; to: number; frame: number } | null;
};

/** Each pass shows one whole painting, then dips through a veil carrying the
 * route to the next mill. Artwork is never mirrored, crossfaded or seamed:
 * the swap happens only while the veil is opaque. Frame 0 of every pass is the
 * painting itself, so seeking to `index * MILL_PASS_FRAMES` lands on a mill. */
export function millMoment(frame: number, count: number): MillMoment | null {
  if (!count) return null;
  const total = millDuration(count);
  const time = ((frame % total) + total) % total;
  const pass = Math.floor(time / MILL_PASS_FRAMES);
  const f = time - pass * MILL_PASS_FRAMES;
  if (f < SCENE_FRAMES) return { index: pass, sceneFrame: f, veil: 0, interlude: null };
  const r = f - SCENE_FRAMES;
  const to = (pass + 1) % count;
  const veil =
    r < VEIL_FRAMES ? ease(r / VEIL_FRAMES) : r >= MILL_INTERLUDE_FRAMES - RELEASE_FRAMES ? ease((MILL_INTERLUDE_FRAMES - r) / RELEASE_FRAMES) : 1;
  const interlude = { from: pass, to, frame: r };
  return r < MILL_SWAP_FRAME
    ? { index: pass, sceneFrame: f, veil, interlude }
    : { index: to, sceneFrame: 0, veil, interlude };
}

/** The start of the mill after the one on screen (Next mill). */
export function nextMillFrame(frame: number, count: number): number {
  const moment = millMoment(frame, count);
  return moment ? ((moment.index + 1) % count) * MILL_PASS_FRAMES : 0;
}

/** Camera for a 1920 × 1080 painting. Landscape: a slow push toward the live
 * board, which therefore never leaves the frame. Vertical: the painting fills
 * the window's height, opens centred on the mill and drifts (at least
 * VERTICAL_MIN_DRIFT px) across to its board at the painting's right edge. */
export function millCamera(mill: MillScene, sceneFrame: number, format: MillFormat) {
  if (format === 'landscape') {
    const [left, top, width, height] = mill.board;
    return { x: 0, scale: 1 + 0.06 * Math.min(1, sceneFrame / MILL_PASS_FRAMES), origin: `${left + width / 2}% ${top + height / 2}%` };
  }
  const scale = VERTICAL_ART_HEIGHT / 1080;
  const travel = 1920 * scale - MILL_STAGE.vertical.width;
  const start = Math.min(Math.max(0, (mill.focus / 100) * 1920 * scale - MILL_STAGE.vertical.width / 2), travel - VERTICAL_MIN_DRIFT);
  return { x: 0 - (start + (travel - start) * ease(sceneFrame / SCENE_FRAMES)), scale, origin: '0 0' };
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** Straight-line distance and heading between two mills, for the route card. */
export function millRoute(from: MillScene, to: MillScene) {
  const rad = Math.PI / 180;
  const [lat1, lng1] = from.at.map((v) => v * rad);
  const [lat2, lng2] = to.at.map((v) => v * rad);
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
  const miles = 2 * 3958.8 * Math.asin(Math.sqrt(a));
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  const bearing = (Math.atan2(y, x) / rad + 360) % 360;
  return { miles: Math.round(miles), direction: COMPASS[Math.round(bearing / 45) % 8] };
}

/** Linear blend of two #rrggbb colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function millAsset(id: string): string {
  return `/display/mills/${id}.webp`;
}
