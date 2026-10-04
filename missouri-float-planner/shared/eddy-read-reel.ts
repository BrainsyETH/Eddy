/** Full-report reels: one continuous scroll, including a short ending, ≤30s. */
export const READ_FPS = 30;
export const READ_CTA_FRAMES = 90;
// Leave 100ms for AAC encoder padding: a 900-frame render can mux to 30.06s.
export const READ_MAX_FRAMES = 30 * READ_FPS - 3;

export function readingDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(READ_MAX_FRAMES, Math.ceil(Math.max(9, words / 180 * 60) * READ_FPS) + READ_CTA_FRAMES);
}

export type ReadingTopic = 'water' | 'weather' | 'launch';

/** Topic illustrations, not inferred forecasts. Never invent a number or trend. */
export function readingTopic(text: string): ReadingTopic | null {
  if (/\b(scout|strainers?|blowdowns?|hazards?|outfitters?|launch|life jackets?)\b/i.test(text)) return 'launch';
  if (/\b(rain|precipitation|weather|forecast|skies|storms?|dry|sunny|temperature)\b/i.test(text)) return 'weather';
  if (/\b(gauge|discharge|cfs|flow|water|riffles?|gravel|spring inputs?)\b/i.test(text)) return 'water';
  return null;
}

/** Break at prose boundaries, never at a character limit. All words survive. */
export function readingBlocks(text: string) {
  return text.trim().split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z“"‘])/u)
    .map(text => text.trim()).filter(Boolean)
    .map(text => ({ text, topic: readingTopic(text) }));
}

/** Constant-speed travel. Every line crosses the viewport before the ending. */
export function readingScrollY(frame: number, duration: number, viewportHeight: number, contentHeight: number) {
  const start = Math.max(0, viewportHeight - 180);
  const end = -contentHeight;
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, duration - READ_CTA_FRAMES - 1)));
  return start + (end - start) * progress;
}

/** quote_text is the full Read shown in the app. Do not prepend eddy_read:
 * that is a separate short interpretation and repeats the report's points.
 * The live overlay clears quote/summary when prose must be withheld; the
 * compact interpretation must never resurrect a stale/unsafe report. */
export function publishableReading(prose: { eddy_read?: string | null; quote_text?: string | null; summary_text?: string | null }): string | null {
  return prose.quote_text?.trim() || prose.summary_text?.trim() || null;
}

/** Fixed visual fixture: long name, full prose, topic changes and the ending. */
export const LONG_READING_FIXTURE = 'The river is holding steady, but wide gravel crossings can still be shallow. Choose your line carefully and leave time for stops along the way. Check the latest gauge reading before you launch.\n\n' +
  'Greer Crossing Recreation Area to Riverton East Access is a substantial outing. Verify your take-out, shuttle arrangements and available daylight before leaving. This is a visual test fixture, not a current river forecast.\n\n' +
  'If conditions change, reassess your plans. The app has the latest conditions and access information for the route you choose.';
