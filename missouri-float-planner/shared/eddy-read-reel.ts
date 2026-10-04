/** Full-report reels follow the natural narration, never a forced time cap. */
export const READ_FPS = 30;
export const READ_CTA_FRAMES = 90;
export const READ_VOICE_LEAD = 18;
export const READ_VOICE_GAP = 9;
export type ReadVoiceover = {
  clips: Array<{ src: string; durationFrames: number }>;
  closing: { src: string; durationFrames: number };
};

export function readingTiming(text: string, voiceover?: ReadVoiceover) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const bodyFrames = voiceover
    ? voiceover.clips.reduce((sum, clip) => sum + clip.durationFrames, 0) + Math.max(0, voiceover.clips.length - 1) * READ_VOICE_GAP
    : Math.ceil(Math.max(9, words / 145 * 60) * READ_FPS);
  const endingFrames = Math.max(READ_CTA_FRAMES, (voiceover?.closing.durationFrames ?? 0) + 24);
  const endingStart = READ_VOICE_LEAD + bodyFrames + 12;
  return { endingStart, endingFrames, duration: endingStart + endingFrames };
}

export function readingDuration(text: string, voiceover?: ReadVoiceover) {
  return readingTiming(text, voiceover).duration;
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

/** Start with prose in view; the inline ending follows without an empty beat. */
export function readingScrollY(frame: number, duration: number, endingTop: number, endingFrames = READ_CTA_FRAMES) {
  const start = 24;
  const end = start - endingTop;
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, duration - endingFrames - 1)));
  return start + (end - start) * progress;
}

export type ReadWeather = { date: string; highF: number | null; lowF: number | null; condition: string; precipChance: number | null };

/** Use only the forecast for this report's Missouri date, not the window max. */
export function readingWeather(weather: { forecast?: ReadWeather[] } | null | undefined, generatedAt: string): ReadWeather | null {
  const stamp = new Date(generatedAt);
  if (!Number.isFinite(stamp.getTime())) return null;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(stamp);
  const day = weather?.forecast?.find(day => day.date === date);
  if (!day) return null;
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  const highF = number(day.highF), lowF = number(day.lowF), rain = number(day.precipChance);
  if (highF === null && lowF === null) return null;
  return { date, highF, lowF, condition: typeof day.condition === 'string' ? day.condition : '', precipChance: rain !== null && rain >= 0 && rain <= 100 ? rain : null };
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
