// Presentation only: one 9:16 composition for the server and offline SVG.
// Callers retain ownership of measurements, mood gates and verified conditions.
import { colors } from './social-brand';
import { CONDITION_SYSTEM, type ConditionCode } from './condition-system';

export const FLOAT_SHARE_WIDTH = 1080;
export const FLOAT_SHARE_HEIGHT = 1920;
export type ShareFace = 'display' | 'heading' | 'body' | 'mono';
export type ShareElement =
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
  const ink = colors.neutral[900], muted = colors.neutral[600], teal = colors.primary[700];
  const elements: ShareElement[] = [];
  const box = (x: number, y: number, width: number, height: number, fill: string, radius = 0, border?: string) =>
    elements.push({ kind: 'box', x, y, width, height, fill, radius, border });
  const text = (value: string, x: number, y: number, width: number, size: number, face: ShareFace = 'body', color: string = ink, center = false) =>
    elements.push({ kind: 'text', text: value, x, y, width, size, face, color, center });
  const river = shareTextLines(input.river, 18, 3);
  const from = shareTextLines(input.from, 32, 2), to = shareTextLines(input.to, 32, 2);
  const titleSize = river.length > 2 ? 60 : 72;
  const titleHeight = river.length * (titleSize + 10);
  const routeTop = 180 + titleHeight;
  const toTop = routeTop + 82 + from.length * 48;
  const statsTop = toTop + 82 + to.length * 48;
  const statusTop = statsTop + 202;
  const cardHeight = statusTop + (input.tracking ? 130 : 88);
  const conditionHeight = input.condition ? 226 : 0;
  // Center the complete composition in the story-safe area. Missing conditions
  // leave no empty card; longer place names consume the available space.
  const stackHeight = cardHeight + conditionHeight;
  const cardTop = Math.max(250, Math.round((1920 - stackHeight) / 2));
  const left = 72, width = 936, inset = 124;

  box(0, 0, 1080, 1920, colors.neutral[50]);
  text('Eddy', left, cardTop - 142, 300, 68, 'display', teal);
  text('Float recap', 748, cardTop - 112, 260, 30, 'body', muted);
  box(left, cardTop - 52, 64, 7, colors.accent[500], 3);
  box(left, cardTop, width, cardHeight, '#FFFFFF', 36, colors.neutral[200]);
  text(input.moodLabel ?? 'Your float', inset, cardTop + 52, 600, 32, 'display', input.cautious ? muted : teal);
  river.forEach((line, i) => text(line, inset, cardTop + 102 + i * (titleSize + 10), 612, titleSize, 'heading'));
  text(shareDate(input.date), inset, cardTop + 122 + titleHeight, 600, 32, 'body', muted);
  // The standard PNG has more transparent padding than the mood stickers.
  const art = input.moodLabel
    ? { x: 756, y: cardTop + 40, width: 200, height: 200 }
    : { x: 726, y: cardTop + 10, width: 260, height: 260 };

  const y = cardTop + routeTop;
  box(inset, y, 832, 2, colors.neutral[200]);
  text('Your route', inset, y + 32, 832, 30, 'heading', teal);
  // This is an endpoint list, not a geographic or progress diagram.
  text('Put-in', inset, y + 88, 170, 27, 'body', muted);
  from.forEach((line, i) => text(line, 312, y + 84 + i * 48, 644, 38, 'heading'));
  text('Take-out', inset, cardTop + toTop + 6, 170, 27, 'body', muted);
  to.forEach((line, i) => text(line, 312, cardTop + toTop + i * 48, 644, 38, 'heading'));

  const statsY = cardTop + statsTop;
  box(inset, statsY, 832, 2, colors.neutral[200]);
  box(539, statsY + 42, 2, 108, colors.neutral[200]);
  const statSize = Math.max(input.distance?.length ?? 1, input.duration.length) > 10 ? 42 : 58;
  const stat = (value: string, label: string, x: number) => {
    text(value, x, statsY + 42, 390, statSize, 'mono', ink, true);
    text(label, x, statsY + 118, 390, 28, 'body', muted, true);
  };
  stat(input.distance ?? '—', input.distanceLabel, inset);
  stat(input.duration, 'Total time', 566);
  const statusY = cardTop + statusTop;
  box(inset, statusY - 8, 832, input.tracking ? 96 : 54, colors.primary[50], 14);
  text(input.arrival, inset + 24, statusY + 3, 784, 28, 'body', teal);
  if (input.tracking) text(input.tracking, inset + 24, statusY + 43, 784, 27, 'body', muted);

  if (input.condition) {
    const condition = CONDITION_SYSTEM[input.condition.code];
    const conditionY = cardTop + cardHeight + 24;
    box(left, conditionY, width, 202, '#FFFFFF', 32, colors.neutral[200]);
    text('Conditions at start', inset, conditionY + 32, 832, 30, 'heading');
    box(inset, conditionY + 94, 228, 64, condition.bg, 16, condition.chipBorder);
    text(condition.label, inset + 10, conditionY + 106, 208, 32, 'heading', condition.ink, true);
    if (input.condition.cfs != null) text(`${input.condition.cfs.toLocaleString('en-US')} cfs`, 396, conditionY + 104, 560, 38, 'mono');
  }
  text('eddy.guide', 72, cardTop + stackHeight + 62, 936, 36, 'display', teal, true);
  return { elements, art };
}
