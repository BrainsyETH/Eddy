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
  // Water-only region, excluding banks, buildings and the information board.
  water?: string;
};

export const MILL_SCENES: MillScene[] = [
  { id: 'dillard', name: 'Dillard Mill', location: 'Dillard · Huzzah Creek', riverSlug: 'huzzah', riverName: 'Huzzah Creek', context: 'River report', board: [79.8, 60.3, 15.5, 15.6, 0], water: 'polygon(1% 70%, 72% 70%, 72% 81%, 26% 86%, 1% 79%)' },
  { id: 'alley', name: 'Alley Mill', location: 'Alley Spring · ONSR', riverSlug: 'jacks-fork', riverName: 'Jacks Fork', context: 'Related river', board: [77.8, 64.5, 17.2, 17.3, 8], water: 'polygon(20% 53%, 73% 53%, 73% 71%, 37% 77%, 20% 72%)' },
  { id: 'klepzig', name: 'Klepzig Mill', location: 'Rocky Creek · ONSR', riverSlug: 'current', riverName: 'Current River', context: 'Related river', board: [81.8, 64, 13.7, 17.6, 0], water: 'polygon(2% 61%, 25% 62%, 27% 66%, 18% 69%, 1% 67%)' },
  { id: 'montauk', name: 'Montauk Mill', location: 'Montauk State Park · Salem', riverSlug: 'current', riverName: 'Current River', context: 'Related river', board: [72.8, 59.2, 20.5, 18, 0] },
  { id: 'falling', name: 'Falling Spring Mill', location: 'Mark Twain NF · near Winona', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Nearby river', board: [77, 63, 17, 16.5, 0], water: 'polygon(12% 58%, 69% 58%, 69% 72%, 23% 73%, 12% 68%)' },
  { id: 'greer', name: 'Greer Mill', location: 'Greer Spring uplands · Alton', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Related river', board: [73.3, 59, 20.5, 17.5, 0] },
  { id: 'turner', name: 'Turner Mill Site', location: 'Turner Spring · near Alton', riverSlug: 'eleven-point', riverName: 'Eleven Point', context: 'Related river', board: [73, 53.2, 21, 21, 0], water: 'polygon(30% 88%, 58% 88%, 58% 93%, 30% 93%)' },
  { id: 'hodgson', name: 'Hodgson Mill', location: 'Sycamore · Ozark County', riverSlug: 'bryant-creek', riverName: 'Bryant Creek', context: 'Related river', board: [72.4, 62, 21, 17.8, 0], water: 'polygon(37% 82%, 60% 81%, 65% 87%, 42% 87%)' },
  { id: 'dawt', name: 'Dawt Mill', location: 'Dawt · near Tecumseh', riverSlug: 'north-fork-white', riverName: 'North Fork River', context: 'River report', board: [78.6, 60.8, 15.1, 14.2, 0], water: 'polygon(5% 73%, 72% 73%, 70% 81%, 32% 82%)' },
  { id: 'rockbridge', name: 'Rockbridge Mill', location: 'Spring Creek · Rockbridge', riverSlug: 'bryant-creek', riverName: 'Bryant Creek', context: 'Related river', board: [81.2, 62.4, 13.7, 13.1, -2], water: 'polygon(18% 65%, 74% 65%, 74% 76%, 32% 77%)' },
];

export const MILL_RIVERS = [...new Set(MILL_SCENES.map((s) => s.riverSlug))];
export const MILL_WIDTH = 1920;
export const MILL_PASS_FRAMES = 2400; // 80 seconds, 24 scene pixels / second.

export function selectMillScenes(requested: string[]): MillScene[] {
  return requested.length ? MILL_SCENES.filter((s) => requested.includes(s.riverSlug)) : MILL_SCENES;
}

export function millDuration(count: number): number {
  return Math.max(1, count) * MILL_PASS_FRAMES;
}

/** Only the current and incoming panels are mounted. Copies permit a single
 * selected mill to loop without recycling a still-visible image. */
export function visibleMillPanels(frame: number, count: number) {
  if (!count) return [];
  const time = ((frame % millDuration(count)) + millDuration(count)) % millDuration(count);
  const pass = Math.floor(time / MILL_PASS_FRAMES);
  const offset = (time % MILL_PASS_FRAMES) / MILL_PASS_FRAMES * MILL_WIDTH;
  return [0, 1].map((i) => ({ key: pass + i, index: (pass + i) % count, x: i * MILL_WIDTH - offset }));
}

export function millAsset(id: string): string {
  return `/display/mills/${id}.webp`;
}
