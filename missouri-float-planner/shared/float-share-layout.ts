// Presentation only: one 9:16 composition for the server and offline SVG.
// Callers retain ownership of measurements, mood gates and verified conditions.
import { colors } from './social-brand';
import { CONDITION_SYSTEM, type ConditionCode } from './condition-system';

export const FLOAT_SHARE_WIDTH = 1080;
export const FLOAT_SHARE_HEIGHT = 1920;
export type ShareFace = 'display' | 'heading' | 'body' | 'mono';
export type ShareElement =
  | { kind: 'path'; d: string; fill: string; stroke?: string; strokeWidth?: number }
  | { kind: 'box'; x: number; y: number; width: number; height: number; fill: string; radius: number; border?: string }
  | { kind: 'text'; x: number; y: number; width: number; size: number; face: ShareFace; color: string; text: string; center?: boolean };

/** Typography only: keep the existing sub-hour labels; shorten hour labels. */
export function compactShareDuration(duration: string): string {
  return duration.includes(' hr') ? duration.replace(' hr', 'h').replace(' min', 'm') : duration;
}

export function shareTextLines(text: string, limit = 28, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= limit) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  const shown = lines.slice(0, maxLines).map(line => line.length > limit ? line.slice(0, limit - 1) + '…' : line);
  if (lines.length > maxLines) shown[maxLines - 1] = shown[maxLines - 1].slice(0, limit - 1) + '…';
  return shown;
}

/** UTC preserves the saved calendar day in every export timezone. */
function shareDate(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date))
    .toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function floatShareLayout(input: {
  river: string; from: string; to: string; date: string;
  distance: string | null; distanceLabel: string; duration: string;
  arrival: string; tracking: string | null;
  moodLabel?: string | null; cautious?: boolean;
  condition?: { code: Exclude<ConditionCode, 'unknown'>; cfs: number | null } | null;
}) {
  const ink = colors.primary[900], muted = colors.neutral[600];
  const paper = colors.secondary[50], water = colors.primary[800], onWater = colors.primary[100];
  const elements: ShareElement[] = [];
  const box = (x: number, y: number, width: number, height: number, fill: string, radius = 0, border?: string) =>
    elements.push({ kind: 'box', x, y, width, height, fill, radius, border });
  const text = (value: string, x: number, y: number, width: number, size: number, face: ShareFace = 'body', color: string = ink, center = false) =>
    elements.push({ kind: 'text', text: value, x, y, width, size, face, color, center });
  const path = (d: string, fill: string, stroke?: string, strokeWidth?: number) =>
    elements.push({ kind: 'path', d, fill, stroke, strokeWidth });
  const river = shareTextLines(input.river, 12, 3);
  const titleSize = river.length === 3 ? 94 : 116;
  const titleHeight = river.length * (titleSize + 4);
  const route = shareTextLines(`${input.from} → ${input.to}`, 38, 3);
  const routeSize = route.length > 1 ? 38 : 44;
  const routeTop = 280 + titleHeight + 30;
  const dateTop = routeTop + route.length * (routeSize + 10) + 24;
  const arrivalTop = dateTop + 54;
  const heroTop = Math.max(800, arrivalTop + 82);
  const statsTop = heroTop + 402;

  box(0, 0, 1080, 1920, paper);
  text('Eddy', 80, 104, 360, 76, 'display', colors.accent[700]);
  text('FLOAT RECAP', 752, 144, 248, 28, 'body', muted);
  river.forEach((line, i) => text(line, 80, 280 + i * (titleSize + 4), 920, titleSize, 'heading'));
  route.forEach((line, i) => text(line, 80, routeTop + i * (routeSize + 10), 920, routeSize, 'body', colors.primary[700]));
  text(shareDate(input.date), 80, dateTop, 920, 32, 'body', muted);
  text(input.arrival, 80, arrivalTop, 920, 28, 'body', muted);

  // A decorative water shape, never route geometry or a progress illustration.
  path(`M0 ${heroTop + 110} C280 ${heroTop + 10} 440 ${heroTop + 210} 700 ${heroTop + 80} S940 ${heroTop - 40} 1080 ${heroTop + 20} L1080 1920 L0 1920 Z`, water);
  path(`M-40 ${heroTop + 300} C220 ${heroTop + 205} 400 ${heroTop + 375} 650 ${heroTop + 278} S960 ${heroTop + 135} 1120 ${heroTop + 230}`, 'none', colors.primary[600], 3);
  text(input.moodLabel ?? 'Your float', 80, heroTop + 158, 510, 64, 'display', input.cautious ? onWater : colors.accent[400]);
  // The standard PNG carries more transparent padding than the mood stickers.
  const art = input.moodLabel
    ? { x: 602, y: heroTop - 90, width: 364, height: 364 }
    : { x: 556, y: heroTop - 136, width: 456, height: 456 };

  const statSize = Math.max(input.distance?.length ?? 1, input.duration.length) > 10 ? 56 : 88;
  const stat = (value: string, label: string, x: number) => {
    text(value, x, statsTop, 430, statSize, 'heading', paper);
    text(label, x, statsTop + (statSize === 56 ? 84 : 116), 430, 30, 'body', onWater);
  };
  stat(input.distance ?? '—', input.distanceLabel, 80);
  stat(input.duration, 'Total time', 590);
  if (input.tracking) text(input.tracking, 80, statsTop + 192, 920, 30, 'body', onWater);

  if (input.condition) {
    const condition = CONDITION_SYSTEM[input.condition.code];
    const conditionTop = statsTop + (input.tracking ? 264 : 228);
    text('At start', 80, conditionTop + 10, 170, 30, 'body', onWater);
    // A white backing keeps the canonical translucent condition tint legible.
    box(262, conditionTop, 190, 62, paper, 15);
    box(262, conditionTop, 190, 62, condition.bg, 15);
    text(condition.label, 272, conditionTop + 10, 170, 32, 'heading', condition.ink, true);
    if (input.condition.cfs != null) text(`${input.condition.cfs.toLocaleString('en-US')} cfs`, 490, conditionTop + 9, 510, 36, 'mono', paper);
  }
  text('eddy.guide', 80, 1758, 920, 34, 'display', onWater);
  return { elements, art };
}
