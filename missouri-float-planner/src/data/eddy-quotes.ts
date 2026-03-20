// src/data/eddy-quotes.ts
// Eddy's condition-based status quotes and river-specific local knowledge.
// Used by the EddyQuote component on each river page.

import type { ConditionCode } from '@/types/api';

// --- River-specific local color (notes only — thresholds come from the DB) ---

export const RIVER_NOTES: Record<string, string> = {
  current: 'Spring-fed with a consistent base flow. Upper sections (Montauk to Akers) are shallower than the lower stretches.',
  'eleven-point': 'Remote and scenic. Peak season is mid-June through September. Prone to fast rises after rain.',
  'jacks-fork': 'Rain-dependent with a smaller watershed. Rises and falls fast — flash floods are a serious concern.',
  meramec: 'Largest of the Ozark rivers. Upper sections above Meramec State Park are the most scenic.',
  niangua: 'Fed by Bennett Spring. Generally consistent flows — a reliable choice.',
  'big-piney': 'Remote and scenic with a smaller watershed. Can fluctuate quickly after rain.',
  huzzah: 'Short float sections, popular for day trips. Pairs well with Courtois for a weekend.',
  courtois: 'More secluded than Huzzah. Excellent for a quieter, scenic float.',
};

// --- Condition-based quote templates ---
// {gauge} = gauge height, {range} = optimal range, {river} = river name, {note} = local note

type QuoteTemplates = Record<ConditionCode, string[]>;

const QUOTE_TEMPLATES: QuoteTemplates = {
  optimal: [
    "Sitting at {gauge} ft — right in the sweet spot. It's a great day to float.",
    "{gauge} ft at the gauge. Conditions are dialed. Grab your paddle.",
    "Reading {gauge} ft — optimal range is {range} and we're right in it. Get out there.",
  ],
  okay: [
    "{gauge} ft — a little outside the sweet spot but still a solid day on the water.",
    "Gauge reads {gauge} ft. Not textbook, but you'll have a good time out there.",
    "{gauge} ft today. Floatable and fun — just keep your eyes on the water.",
  ],
  low: [
    "{gauge} ft — it's on the shallow side. You'll scrape a riffle or two. Pack light.",
    "Running a bit thin at {gauge} ft. Lighter loads and shorter trips are the move.",
    "{gauge} ft today. Doable, but you'll be doing some rock-dodging.",
  ],
  too_low: [
    "Down to {gauge} ft. You'll be walking more than floating. I'd wait for rain.",
    "{gauge} ft — that's too shallow for a good time. Save it for another day.",
    "Not today. {gauge} ft means you'll be dragging. Check back after some rain.",
  ],
  high: [
    "{gauge} ft — running hot. Strong current, use caution out there.",
    "Water's up to {gauge} ft. Use caution and check with outfitters before heading out.",
    "{gauge} ft and moving fast. {note} Use caution out there.",
  ],
  dangerous: [
    "{gauge} ft — stay off the water. River is closed.",
    "Flood stage at {gauge} ft. This is a hard no. Stay safe and check back later.",
    "{gauge} ft. Do not float. Contact local outfitters for updates.",
  ],
  unknown: [
    "Can't get a read on conditions right now. Check back soon or call a local outfitter.",
    "Gauge data is unavailable at the moment. I'll have an update as soon as it's back.",
    "No current reading available. When in doubt, check with the locals before heading out.",
  ],
};

// --- Weather quips appended to the main quote ---

const WEATHER_QUIPS: Record<string, string> = {
  Clear: 'Clear skies and {temp}°F — sunscreen weather.',
  Clouds: 'Overcast at {temp}°F — comfortable on the water.',
  Rain: 'Rain in the area at {temp}°F. Watch for rising water.',
  Drizzle: 'Light drizzle, {temp}°F. Not a dealbreaker if you don\'t mind getting wet.',
  Thunderstorm: 'Thunderstorms and {temp}°F — stay off the water until it passes.',
  Snow: '{temp}°F with snow. Yeah, not today.',
  Mist: 'Misty at {temp}°F. Visibility may be low early on.',
  Fog: 'Foggy and {temp}°F. Give it time to burn off before launching.',
};

function buildWeatherLine(condition: string, temp: number): string {
  const key = Object.keys(WEATHER_QUIPS).find(k =>
    condition.toLowerCase().startsWith(k.toLowerCase())
  );
  const template = key ? WEATHER_QUIPS[key] : `${Math.round(temp)}°F out there.`;
  return template.replace(/\{temp\}/g, String(Math.round(temp)));
}

// --- Quote builder ---

export interface WeatherInput {
  condition: string; // e.g. "Clear", "Rain", "Clouds"
  temp: number;      // degrees F
}

export interface EddyQuoteData {
  text: string;
  conditionCode: ConditionCode;
  eddyImage: string;
}

const EDDY_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
  flood: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png',
  canoe: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png',
};

function conditionToImage(code: ConditionCode): string {
  switch (code) {
    case 'optimal':
    case 'okay':
      return EDDY_IMAGES.canoe;
    case 'low':
      return EDDY_IMAGES.yellow;
    case 'too_low':
      return EDDY_IMAGES.flag;
    case 'high':
      return EDDY_IMAGES.red;
    case 'dangerous':
      return EDDY_IMAGES.flood;
    case 'unknown':
    default:
      return EDDY_IMAGES.flag;
  }
}

/**
 * Pick a deterministic-per-day quote (rotates daily, not random on every render).
 */
function pickTemplate(templates: string[]): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return templates[day % templates.length];
}

export function buildEddyQuote(
  riverSlug: string,
  conditionCode: ConditionCode,
  gaugeHeightFt: number | null,
  weather?: WeatherInput | null,
  optimalRange?: string | null,
): EddyQuoteData {
  const templates = QUOTE_TEMPLATES[conditionCode];
  let text = pickTemplate(templates);

  const gauge = gaugeHeightFt !== null ? gaugeHeightFt.toFixed(1) : '—';
  const range = optimalRange ?? '—';
  const note = RIVER_NOTES[riverSlug] ?? '';

  text = text
    .replace(/\{gauge\}/g, gauge)
    .replace(/\{range\}/g, range)
    .replace(/\{river\}/g, riverSlug)
    .replace(/\{note\}/g, note);

  // Append weather context
  if (weather) {
    text += ' ' + buildWeatherLine(weather.condition, weather.temp);
  }

  return {
    text,
    conditionCode,
    eddyImage: conditionToImage(conditionCode),
  };
}

// --- Rivers listing summary ---

/** Short card-level blurb for condition (no gauge data needed). */
export const CONDITION_CARD_BLURBS: Record<ConditionCode, string> = {
  optimal: 'Great day to float!',
  okay: 'Solid conditions out there.',
  low: 'Running shallow — pack light.',
  too_low: 'Too low to float right now.',
  high: 'High water — use caution.',
  dangerous: 'Flood stage — do not float.',
  unknown: 'Conditions unavailable.',
};

/** Build a one-line Eddy summary across all rivers for the listing page. */
export function buildRiversSummary(conditionCodes: (ConditionCode | null)[]): string {
  const counts: Partial<Record<ConditionCode | 'none', number>> = {};
  for (const code of conditionCodes) {
    const key = code ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const good = (counts.optimal ?? 0) + (counts.okay ?? 0);
  const low = (counts.low ?? 0) + (counts.too_low ?? 0);
  const high = (counts.high ?? 0) + (counts.dangerous ?? 0);

  const parts: string[] = [];
  if (good > 0) parts.push(`${good} river${good > 1 ? 's' : ''} looking great`);
  if (low > 0) parts.push(`${low} running low`);
  if (high > 0) parts.push(`${high} running high`);

  if (parts.length === 0) return 'Checking conditions across all rivers — hang tight.';
  return parts.join(', ') + '. Check the details before you head out!';
}
