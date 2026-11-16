/** Curated Missouri mill scenes. A river association is never a millpond reading. */
export type MillScene = {
  id: string;
  name: string;
  location: string;
  riverSlug: string;
  riverName: string;
  // 'On': the mill stands on the reported river itself. 'Nearby': it sits on a
  // spring branch, tributary or ridge near it, so the report is the river's,
  // never a measurement of the pictured water.
  context: 'On' | 'Nearby';
  // Year built, as its source states it; omitted where sources disagree.
  built?: string;
  // Percentage rectangle inside the painted blank board; angle in degrees.
  board: [number, number, number, number, number];
  // Horizontal centre of the mill (or wheel) in the painting, percent. The
  // vertical format opens on it before drifting to the board.
  focus: number;
  // Approximate site [lat, lng], for the between-mills route map only.
  at: [number, number];
  // Two short facts shown in place of a dominant reading. Each comes from
  // `source` (also listed in docs/missouri-mills.md); where sources disagree,
  // leave the disputed detail out rather than pick one.
  facts: [string, string];
  source: string;
  // Water-only region, excluding banks, buildings and the information board.
  water?: string;
};

export const MILL_SCENES: MillScene[] = [
  { id: 'dillard', name: 'Dillard Mill', location: 'Dillard Mill State Historic Site', riverSlug: 'huzzah', riverName: 'Huzzah Creek', context: 'On', built: 'Built 1908', board: [79.8, 60.3, 15.5, 15.6, 0], focus: 58, at: [37.718, -91.206], facts: ['Emil Mischke fitted steel roller mills, not millstones, and a turbine to power it.', 'Restored with most of its original machinery, which still runs on tours.'], source: 'https://mostateparks.com/page/dillard-mill-state-historic-site/general-information-dillard-mill', water: 'polygon(1% 70%, 72% 70%, 72% 81%, 26% 86%, 1% 79%)' },
  { id: 'alley', name: 'Alley Mill', location: 'Alley Spring, Ozark National Scenic Riverways', riverSlug: 'jacks-fork', riverName: 'Jacks Fork', context: 'Nearby', built: 'Built 1894', board: [77.8, 64.5, 17.2, 17.3, 8], focus: 35, at: [37.154, -91.442], facts: ['It is said to be one of the most photographed mills in the world.', 'Alley Spring, which powered the mill, stays 57 °F year round.'], source: 'https://www.nps.gov/places/alley-spring-and-mill.htm', water: 'polygon(20% 53%, 73% 53%, 73% 71%, 37% 77%, 20% 72%)' },
  { id: 'klepzig', name: 'Klepzig Mill', location: 'Rocky Creek, Ozark National Scenic Riverways', riverSlug: 'current', riverName: 'Current River', context: 'Nearby', built: 'Built 1928', board: [81.8, 64, 13.7, 17.6, 0], focus: 72, at: [37.04, -91.25], facts: ['Walter Klepzig built this small turbine mill in the rhyolite shut-ins of Rocky Creek.', 'He often ground corn free for neighbors who could not spare the toll.'], source: 'https://www.nps.gov/places/klepzig-mill.htm', water: 'polygon(2% 61%, 25% 62%, 27% 66%, 18% 69%, 1% 67%)' },
  { id: 'montauk', name: 'Montauk Mill', location: 'Montauk State Park, near Salem', riverSlug: 'current', riverName: 'Current River', context: 'Nearby', built: 'Built 1896', board: [72.8, 59.2, 20.5, 18, 0], focus: 42, at: [37.46, -91.683], facts: ['The last of four mills built to use the waters of Montauk Spring.', 'Much of its original grinding machinery is still intact.'], source: 'https://mostateparks.com/park/montauk-state-park/montauk-mill' },
  { id: 'falling', name: 'Falling Spring Mill', location: 'Mark Twain National Forest, near Winona', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Nearby', built: 'Built 1927', board: [77, 63, 17, 16.5, 0], focus: 47, at: [36.88, -91.3], facts: ['Its overshot wheel ground corn, sawed shingles and firewood, and made electricity.', 'The spring provides about 500,000 gallons of water a day.'], source: 'https://www.explorewestplains.com/falling-spring-mill/', water: 'polygon(12% 58%, 69% 58%, 69% 72%, 23% 73%, 12% 68%)' },
  { id: 'greer', name: 'Greer Mill', location: 'Above Greer Spring, near Alton', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Nearby', board: [73.3, 59, 20.5, 17.5, 0], focus: 44, at: [36.786, -91.343], facts: ['It stands on the ridge; a cable carried power up from a turbine at the spring.', 'Samuel Greer trained oxen to haul loads up the slope without a driver.'], source: 'https://www.explorewestplains.com/greer-mill/' },
  { id: 'turner', name: 'Turner Mill Site', location: 'Turner Spring, near Alton', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Nearby', board: [73, 53.2, 21, 21, 0], focus: 37, at: [36.766, -91.267], facts: ['All that remains of the mill is its 25-foot overshot metal wheel.', 'Turner Mill Spring flows from a small cave at the base of a tall bluff.'], source: 'https://www.exploretheozarksonline.com/activities/parksnature/wildscenicrivers/elevenpoint/turnermillnorth.html', water: 'polygon(30% 88%, 58% 88%, 58% 93%, 30% 93%)' },
  { id: 'hodgson', name: 'Hodgson Mill', location: 'Sycamore, Ozark County', riverSlug: 'bryant-creek', riverName: 'Bryant Creek', context: 'On', built: 'Built c. 1897', board: [72.4, 62, 21, 17.8, 0], focus: 45, at: [36.708, -92.266], facts: ['It once held a general store, the post office, a sawmill and a cotton gin.', 'Hodgson Spring produces about 28 million gallons of water a day.'], source: 'https://www.explorewestplains.com/hodgson-mill/', water: 'polygon(37% 82%, 60% 81%, 65% 87%, 42% 87%)' },
  { id: 'dawt', name: 'Dawt Mill', location: 'Dawt, near Tecumseh', riverSlug: 'north-fork-white', riverName: 'North Fork River', context: 'On', built: 'A mill here since 1866', board: [78.6, 60.8, 15.1, 14.2, 0], focus: 55, at: [36.61, -92.277], facts: ['It has come through many changes of owner and many floods.', 'Today it is the heart of Dawt Mill Resort on the North Fork.'], source: 'https://www.explorewestplains.com/dawt-mill/', water: 'polygon(5% 73%, 72% 73%, 70% 81%, 32% 82%)' },
  { id: 'rockbridge', name: 'Rockbridge Mill', location: 'Spring Creek, Rockbridge', riverSlug: 'bryant-creek', riverName: 'Bryant Creek', context: 'Nearby', built: 'Rebuilt 1868', board: [81.2, 62.4, 13.7, 13.1, -2], focus: 74, at: [36.789, -92.409], facts: ['B.V. Morris rebuilt it here after the first mill burned in the Civil War.', 'Rockbridge was once the Ozark County seat; its post office is the county\'s oldest.'], source: 'https://www.explorewestplains.com/rockbridge-mill/', water: 'polygon(18% 65%, 74% 65%, 74% 76%, 32% 77%)' },
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
export const VERTICAL_DOCK_HEIGHT = 704;
/** Portrait screens taller than 9:16 (an ultrawide on end, a phone) stretch the
 * composition instead of letterboxing it, up to 1:3. */
export const VERTICAL_MAX_HEIGHT = 3240;
/** The tour band appears once there is this much extra height, and never
 * grows past TOUR_MAX; any further height goes to the painting. */
export const TOUR_MIN_HEIGHT = 300;
const TOUR_MAX_HEIGHT = 900;
/** The vertical camera drifts this far across the mill over a scene. */
const VERTICAL_DRIFT = 240;
/** A viewport this tall or taller gets the vertical format unless `?format=` says otherwise. */
export const VERTICAL_MEDIA = '(max-aspect-ratio: 4/5)';

/** Composition height for a vertical viewport, in 8px steps so small resizes
 * (a phone's address bar) do not re-lay the scene every frame. */
export function verticalHeight(viewportWidth: number, viewportHeight: number): number {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return MILL_STAGE.vertical.height;
  const fit = Math.floor((MILL_STAGE.vertical.width * viewportHeight) / viewportWidth / 8) * 8;
  return Math.min(VERTICAL_MAX_HEIGHT, Math.max(MILL_STAGE.vertical.height, fit));
}

/** Painting window, then the reading dock, then (given room) the tour band. */
export function verticalLayout(height: number) {
  const extra = Math.max(0, height - MILL_STAGE.vertical.height);
  const tour = extra >= TOUR_MIN_HEIGHT ? Math.min(extra, TOUR_MAX_HEIGHT) : 0;
  const art = VERTICAL_ART_HEIGHT + extra - tour;
  return { height: art + VERTICAL_DOCK_HEIGHT + tour, art, dockTop: art, tourTop: art + VERTICAL_DOCK_HEIGHT, tour };
}

export function parseMillFormat(value: string | null): MillFormat | null {
  const v = value?.trim().toLowerCase();
  if (v === 'vertical' || v === 'portrait') return 'vertical';
  if (v === 'landscape' || v === 'horizontal') return 'landscape';
  return null;
}

export const MILL_PASS_FRAMES = 900; // 30 seconds per mill at 30 fps.
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

/** A framing host may cut away as each painting ends, on the frame the veil
 * starts to fall (docs/embeds.md#display-contract). */
export const MILL_BREAK_FRAME = SCENE_FRAMES;
/** Frame updates further apart than this are seeks (Next mill, the picker), not playback. */
const MAX_PLAYBACK_STEP = 45;

/** The pass whose painting ended between two consecutive frame updates, or null. */
export function millBreakBetween(prev: number, next: number, count: number): number | null {
  if (!count) return null;
  const total = millDuration(count);
  const delta = (((next - prev) % total) + total) % total;
  if (delta === 0 || delta > MAX_PLAYBACK_STEP) return null;
  for (let pass = 0; pass < count; pass++) {
    const ahead = (((pass * MILL_PASS_FRAMES + MILL_BREAK_FRAME - prev) % total) + total) % total;
    if (ahead > 0 && ahead <= delta) return pass;
  }
  return null;
}

/** `?start=<mill id>` opens on that mill (so a host that cuts away can resume
 * the tour where it left off); an unknown or filtered-out id opens on the first. */
export function millStartFrame(start: string | null, mills: MillScene[]): number {
  const id = start?.trim().toLowerCase();
  const index = id ? mills.findIndex((m) => m.id === id) : -1;
  return Math.max(0, index) * MILL_PASS_FRAMES;
}

/** How far the current scene is toward its journey (0 → 1), for the tour band. */
export function sceneProgress(sceneFrame: number): number {
  return Math.min(1, sceneFrame / SCENE_FRAMES);
}

/** The start of the mill after the one on screen (Next mill). */
export function nextMillFrame(frame: number, count: number): number {
  const moment = millMoment(frame, count);
  return moment ? ((moment.index + 1) % count) * MILL_PASS_FRAMES : 0;
}

/** Camera for a 1920 × 1080 painting, always about the mill (`focus`), never
 * the painted board, which carries no text. Landscape: a slow push in toward
 * the mill. Vertical: the painting fills the window's height and drifts
 * VERTICAL_DRIFT px across the mill, which stays in view throughout. */
export function millCamera(mill: MillScene, sceneFrame: number, format: MillFormat, artHeight = VERTICAL_ART_HEIGHT) {
  if (format === 'landscape') {
    return { x: 0, scale: 1 + 0.06 * Math.min(1, sceneFrame / MILL_PASS_FRAMES), origin: `${mill.focus}% 42%` };
  }
  const scale = artHeight / 1080;
  const travel = 1920 * scale - MILL_STAGE.vertical.width;
  const centred = (mill.focus / 100) * 1920 * scale - MILL_STAGE.vertical.width / 2;
  const start = Math.min(Math.max(0, centred - VERTICAL_DRIFT / 2), travel - VERTICAL_DRIFT);
  return { x: 0 - (start + VERTICAL_DRIFT * ease(sceneFrame / SCENE_FRAMES)), scale, origin: '0 0' };
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

/** "On Huzzah Creek" or "Nearby: Jacks Fork": never implies the report
 * measures the mill's own spring or pond. */
export function riverLabel(mill: MillScene): string {
  return mill.context === 'On' ? `On ${mill.riverName}` : `Nearby: ${mill.riverName}`;
}

export function millAsset(id: string): string {
  return `/display/mills/${id}.webp`;
}
