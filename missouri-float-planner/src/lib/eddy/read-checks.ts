// src/lib/eddy/read-checks.ts
// Scores one published Read against the rules its prompt sets, so a change to
// the prompt or to EDDY_KNOWLEDGE.md can be shown to help or not.
//
// EVIDENCE, NOT A GATE. Nothing here decides what is published. The publish
// guard is reportContradictions() in report-facts.ts, and it stays narrow on
// purpose: a false positive there replaces a good Read with a fallback. A false
// positive here costs one point on a report. So these rules may be broader than
// the guard's, and each one says what it cannot see.
//
// Pure: text and inputs in, results out. scripts/report-eddy-reads.ts runs it
// over eddy_generation_log and gauge_updates.
//
// What these rules do NOT catch: a claim about a place or a cause that the
// inputs do not support ("where Big Spring feeds in" at a gauge above Big
// Spring). No pattern knows where a spring is. That needs either a model
// grader or a knowledge file that tags each fact with its gauge.

/** The prompt's limits. Reported, never enforced: see docs/eddy-read-accuracy.md. */
export const SUMMARY_MAX_CHARS = 120;
export const READ_MAX_CHARS = 240;

export type ReadCheckId =
  | 'summary_length'
  | 'read_length'
  | 'read_measurements'
  | 'read_forecast_talk'
  | 'weather_talk'
  | 'flat_forecast'
  | 'numbers_match_inputs'
  | 'numbers_from_knowledge'
  | 'stock_lines'
  | 'brief_talk';

export const READ_CHECK_IDS: readonly ReadCheckId[] = [
  'summary_length',
  'read_length',
  'read_measurements',
  'read_forecast_talk',
  'weather_talk',
  'flat_forecast',
  'numbers_match_inputs',
  'numbers_from_knowledge',
  'stock_lines',
  'brief_talk',
];

/** What each rule holds a Read to, for the report's legend. */
export const READ_CHECK_LABELS: Record<ReadCheckId, string> = {
  summary_length: `summary is ${SUMMARY_MAX_CHARS} characters or fewer`,
  read_length: `short Read is ${READ_MAX_CHARS} characters or fewer`,
  read_measurements: 'short Read quotes no reading, temperature or rain percentage',
  read_forecast_talk: 'short Read leaves the forecast to the Watch for panel',
  weather_talk: 'no block describes the weather; the Weather section owns it',
  flat_forecast: 'no flat forecast ("will", "is coming") about water or weather',
  numbers_match_inputs: 'every measurement appears in the inputs with the same unit',
  numbers_from_knowledge: 'no measurement is copied from the knowledge file',
  stock_lines: 'no stock line: steady for 24 hours, call an outfitter, lighter boats, check back after rain',
  brief_talk: 'nothing from the brief or the notes is repeated to the reader ("speaks for", "threshold")',
};

export interface ReadCheckText {
  /** [SUMMARY] */
  summary: string | null;
  /** [EDDY_READ], the short Read. */
  eddyRead: string | null;
  /** [FULL] */
  full: string | null;
}

export interface ReadCheckInputs {
  /**
   * The user message the model was sent. Null when it was not kept, which is
   * every gauge Read before they were logged: the number rules are then
   * skipped, because a number cannot be checked against inputs nobody has.
   */
  prompt: string | null;
}

export interface ReadCheckResult {
  id: ReadCheckId;
  /** `skip` when the rule had nothing to check or nothing to check it against. */
  status: 'pass' | 'fail' | 'skip';
  /** What tripped the rule, for a person reading the report's examples. */
  detail?: string;
}

// ─── Measurements ───────────────────────────────────────────────────────────

export type MeasurementUnit = 'cfs' | 'ft' | 'degF' | 'percent' | 'in' | 'mph' | 'mi';

export interface Measurement {
  value: number;
  unit: MeasurementUnit;
  /** As written, for the report. */
  text: string;
}

const NUM = String.raw`\d[\d,]*(?:\.\d+)?|\.\d+`;
/** "159–637 cfs", "100 to 400 cfs", "2.0 and 3.5 ft": the first number shares the unit. */
const RANGE_LEAD = String.raw`(?:(${NUM})\s*(?:[–—-]|to|and|or)\s*)?`;

const UNIT_PATTERNS: ReadonlyArray<[MeasurementUnit, string]> = [
  ['cfs', String.raw`\s*cfs\b`],
  ['ft', String.raw`[\s-]*(?:ft\b|feet\b|foot\b)`],
  // "58°F", "58 °", "58 degrees". Not "°C": nothing here is metric.
  ['degF', String.raw`\s*(?:°\s*F?|degrees?\b(?:\s*F\b)?)`],
  ['percent', String.raw`\s*(?:%|percent\b)`],
  // "in" alone is a preposition; only inches spelled out, or the mark.
  ['in', String.raw`\s*(?:inch(?:es)?\b|")`],
  ['mph', String.raw`\s*mph\b`],
  ['mi', String.raw`[\s-]*(?:miles?\b|mi\b)`],
];

const toNumber = (raw: string) => Number(raw.replaceAll(',', ''));

/**
 * Every number written with a unit this module knows. A bare number ("the low
 * 5s", "three clear days") is not a measurement and is left alone: without a
 * unit there is nothing to check it against.
 */
export function measurementsIn(text: string): Measurement[] {
  const out: Measurement[] = [];
  for (const [unit, unitPattern] of UNIT_PATTERNS) {
    const re = new RegExp(`${RANGE_LEAD}(${NUM})${unitPattern}`, 'gi');
    for (const match of text.matchAll(re)) {
      for (const raw of [match[1], match[2]]) {
        if (raw == null) continue;
        const value = toNumber(raw);
        if (Number.isFinite(value)) out.push({ value, unit, text: match[0].trim() });
      }
    }
  }
  // "river mile 5.0", "mile 48": the unit comes first.
  for (const match of text.matchAll(new RegExp(String.raw`\bmile\s+~?(${NUM})`, 'gi'))) {
    out.push({ value: toNumber(match[1]), unit: 'mi', text: match[0] });
  }
  // The prompt writes rain as "0.12 in"; prose never should, so this form is
  // only read out of inputs (see suppliedMeasurements).
  return out;
}

/** Inputs also write inches as "0.12 in" and as "in." inside a labelled line. */
function inputMeasurements(text: string): Measurement[] {
  const out = measurementsIn(text);
  for (const match of text.matchAll(new RegExp(String.raw`(${NUM})\s*in\b\.?(?!\s+(?:the|a|an|this|that)\b)`, 'gi'))) {
    out.push({ value: toNumber(match[1]), unit: 'in', text: match[0] });
  }
  return out;
}

/**
 * The ways a supplied value may honestly be written. Stage to one or two
 * decimals and flow to whole cfs or the nearest ten are the conventions
 * report-facts.ts already accepts for a reading; a temperature or a wind speed
 * may be rounded to a whole number. Anything further from the input than that
 * is a different number.
 */
function writtenForms(value: number, unit: MeasurementUnit): number[] {
  const abs = Math.abs(value);
  const round = (digits: number) => Number(abs.toFixed(digits));
  switch (unit) {
    case 'cfs': return [abs, Math.round(abs), Math.round(abs / 10) * 10];
    case 'ft':
    case 'in': return [abs, round(1), round(2)];
    case 'degF':
    case 'mph':
    case 'percent': return [abs, Math.round(abs)];
    case 'mi': return [abs, round(1), Math.round(abs)];
  }
}

const sameValue = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function matches(m: Measurement, supplied: Measurement[]): boolean {
  return supplied.some((s) => s.unit === m.unit && writtenForms(s.value, s.unit).some((v) => sameValue(v, m.value)));
}

/**
 * Splits a prompt into the facts and the knowledge text.
 *
 * Both generators put the knowledge file's text under one labelled header,
 * `[LOCAL KNOWLEDGE ...]` for a river Read and `[RIVER KNOWLEDGE ...]` for a
 * gauge Read. It runs to the next `[HEADER]` line or to the end. The split
 * matters because a number in that block is a pattern somebody wrote down, on
 * whatever gauge and scale they were quoting. It is not today's reading.
 */
export function splitPrompt(prompt: string): { facts: string; knowledge: string } {
  const lines = prompt.split('\n');
  const facts: string[] = [];
  const knowledge: string[] = [];
  let inKnowledge = false;
  for (const line of lines) {
    if (/^\[(?:LOCAL|RIVER) KNOWLEDGE\b/.test(line)) {
      inKnowledge = true;
      continue;
    }
    // A block header is a bracketed, upper-case label at the start of a line.
    if (inKnowledge && /^\[[A-Z0-9][A-Z0-9 \-—':,.()/&]*[\]—-]/.test(line)) inKnowledge = false;
    (inKnowledge ? knowledge : facts).push(line);
  }
  return { facts: facts.join('\n'), knowledge: knowledge.join('\n') };
}

// ─── Forecast language ──────────────────────────────────────────────────────

const WEEKDAY = '(?:mon|tues|wednes|thurs|fri|satur|sun)day';

/**
 * Talk about the days ahead. The river prompt leaves the forecast to the
 * "Watch for" panel "unless rain is already on its way to this gauge", and the
 * gauge prompt forbids inventing a future level, so this is a rate to watch
 * and not a count of mistakes: a Read may mention rain that is truly inbound.
 */
const FORECAST_TALK = new RegExp(
  String.raw`\b(?:forecast|outlook|tomorrow|tonight|this weekend|next week|(?:days?|week|stretch)\s+ahead|next (?:few|couple of|several|two|three) days|` +
    String.raw`(?:through|by|until|on)\s+${WEEKDAY}|(?:rain|storms?|showers?)\s+(?:is|are)\s+(?:on the way|expected|coming|due|possible|likely))\b`,
  'i',
);

/**
 * A description of the weather itself: the sky, the temperature, the wind.
 *
 * Since 2026-11-18 neither Read prompt carries weather, because the app's
 * Weather section is rebuilt on every view and a Read is stored for the day.
 * This counts the Reads that describe it anyway. "Cold" and "clear" alone are
 * left out: cold water and clear water are the river, not the sky. Rain that
 * has fallen, or could, is river news and is not counted here either.
 */
const WEATHER_TALK = new RegExp(
  String.raw`\b(?:sunny|sunshine|cloudy|overcast|skies|blue sky|(?:clear|dry|mild|warm|hot|cool|cold|crisp|chilly|sunny|pleasant)(?:,? (?:and )?[\w-]+){0,2} (?:sky|skies|weather|air|morning|afternoon|day|days|week|weekend|forecast)|` +
    String.raw`temperatures?|temps|highs? (?:in|near|around|of)|lows? (?:in|near|around|of)|\d+\s*(?:°|degrees)|wind(?:s|y)?|breez(?:e|y)|humid(?:ity)?|frost|freezing (?:air|morning|night|temperatures?))\b`,
  'i',
);

/** A sentence that hedges is not a flat forecast, whatever verb it uses. */
const CONDITIONAL = /\b(?:if|unless|could|may|might|would|should|whether)\b/i;

/**
 * A flat statement about later.
 *
 * The prompt's rule is "Anything about later days must be conditional. Never
 * say conditions will stay, remain or be a certain way." The publish guard
 * deliberately has no forecast-verb list (docs/eddy-read-accuracy.md), because
 * the future tense is also how a guide describes today's water: "you will be
 * dragging boats", "the connections between pools will be thin at this level",
 * "lighter craft will have an easier go". Run against the Reads logged on
 * 2026-11-17, a rule that fired on every "will" was wrong about half the time.
 *
 * So a sentence counts only when it says something will CHANGE or PERSIST:
 *   - a set phrase that is only ever about what is coming ("rain is on its
 *     way", "no rain is coming", "isn't going anywhere");
 *   - or will / won't / going to, followed within a few words by a verb of
 *     change or staying (stay, remain, rise, drop, recover, come up ...), or
 *     in a sentence that names a time ahead (tomorrow, by Friday, this week).
 * A sentence whose future verb belongs to the reader or their boat is about
 * the float as it is, and is left alone either way.
 */
const SET_PHRASE = new RegExp(
  String.raw`\b(?:(?:is|are)\s+coming(?!\s+(?:up|down|off|back up|in clear)\b)|(?:is|are)\s+on\s+(?:the|its|their)\s+way|` +
    String.raw`(?:isn't|aren't|is\s+not|are\s+not|not)\s+going\s+anywhere)\b`,
  'i',
);

const FUTURE_AUX = new RegExp(
  String.raw`\b(?:(?:it|that|this|there|river|creek|water|rain)'ll|will(?:\s+not)?|won't|(?:is|are|isn't|aren't)\s+(?:not\s+)?going\s+to)\b`,
  'gi',
);

/** Verbs that say the water or the weather will move, or will not. */
const CHANGE_VERB = /^(?:\W+\w+){0,3}?\W+(?:stay|remain|keep|hold(?!\s+water)|rise|climb|drop|fall|recede|recover|rebound|improve|change|come|bring|arrive|return|continue|last|ease|settle|clear|warm|cool|rain|storm|dry|crest|peak|bottom|reach)\b/i;

const TIME_AHEAD = new RegExp(
  String.raw`\b(?:tomorrow|tonight|soon|later|this (?:week|weekend|afternoon|evening)|next (?:week|few days|couple of days)|(?:by|through|until|on)\s+${WEEKDAY}|(?:for|in|over) the (?:next|coming) \w+)\b`,
  'i',
);

/** Subjects whose future is the reader's own float, not a forecast. */
const READER_SUBJECT = /\b(?:you|we|they|i|boats?|canoes?|kayaks?|rafts?|tubes?|tubers?|craft|paddlers?|floaters?|beginners?|anglers?|groups?|everyone|anyone|nobody|trips?)\s+(?:\w+ly\s+|still\s+|just\s+|also\s+)?$/i;

/** "St. Joe" and "Mt. Ida" are not sentence ends. */
const ABBREVIATION = /\b(St|Mt|Ft|Hwy|Rd|Dr|Jr|Sr|vs|approx|U\.S)\.\s/g;

function sentences(text: string): string[] {
  return text
    .replace(ABBREVIATION, '$1\u0000 ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replaceAll('\u0000', '.').trim())
    .filter(Boolean);
}

/** The flat forecasts in a block of prose, each as the sentence that holds it. */
export function flatForecasts(text: string): string[] {
  const found: string[] = [];
  for (const sentence of sentences(text)) {
    if (CONDITIONAL.test(sentence)) continue;
    if (SET_PHRASE.test(sentence)) {
      found.push(sentence);
      continue;
    }
    for (const match of sentence.matchAll(FUTURE_AUX)) {
      const before = sentence.slice(0, match.index);
      const after = sentence.slice(match.index + match[0].length);
      if (READER_SUBJECT.test(before)) continue;
      if (CHANGE_VERB.test(after) || TIME_AHEAD.test(sentence)) {
        found.push(sentence);
        break;
      }
    }
  }
  return found;
}

// ─── Stock lines and the brief's own words ──────────────────────────────────

/**
 * Lines that were true on most rivers on most days, so a reader who checked
 * three rivers read them three times. On 2026-11-19, 41 of 46 Reads carried the
 * first, and 12 of 24 river Reads the second. The brief (read-brief.ts) asks
 * for each only when it is the point, so this is a rate to watch and not a
 * count of mistakes: a Read whose notes name a put-in outfitters move in low
 * water may honestly say to ask one.
 */
const STOCK_LINES: ReadonlyArray<[string, RegExp]> = [
  ['steady for 24 hours', /\b(?:held|holding|hold|sat|parked|steady|flat|unchanged|moved|budged|changed)\b[^.!?]*\b(?:24 hours|past day)\b/i],
  ['call an outfitter', /\b(?:call|check(?:ing)? (?:in )?with|ask|reach out to|confirm with)\b[^.!?]*\boutfitters?\b/i],
  ['lighter boats', /\blighter (?:craft|boats?)\b|\b(?:canoes?|kayaks?)\b[^.!?]*\bthan (?:a |wider |heavier |loaded )?rafts?\b/i],
  ['check back after rain', /\b(?:check(?:ing)? (?:back|again|the gauge again)|worth (?:another|a second) (?:look|check))\b[^.!?]*\b(?:rain|storm|showers?)\b/i],
];

/**
 * The brief's and the notes' own vocabulary, said to the reader. "Speaks for"
 * is how EDDY_KNOWLEDGE.md describes a gauge; "can both be true" and "not
 * fully resolved" were sentences from the old prompts that Reads repeated on
 * 2026-11-19; "threshold" and "percentile" are how the app talks to itself.
 */
const BRIEF_TALK = /\b(?:speaks? (?:only )?for|this reading (?:reflects|captures|covers)|reporting (?:gauge|station)|thresholds?|percentiles?|can both be (?:true|correct)|does not by itself|not (?:fully )?resolved|comparison (?:is|to)[^.!?]*(?:not available|unavailable)|statistical rather than|outfitter-calibrated|rain event|optimal[- ]range comparison)\b/i;

// ─── The checks ─────────────────────────────────────────────────────────────

const quote = (s: string) => (s.length > 140 ? `${s.slice(0, 137)}...` : s);

export function checkRead(text: ReadCheckText, inputs: ReadCheckInputs): ReadCheckResult[] {
  const results: ReadCheckResult[] = [];
  const add = (id: ReadCheckId, failure: string | null, checked = true) =>
    results.push(!checked ? { id, status: 'skip' } : failure == null ? { id, status: 'pass' } : { id, status: 'fail', detail: failure });

  const { summary, eddyRead, full } = text;
  const all = [summary, eddyRead, full].filter((t): t is string => Boolean(t));

  add('summary_length', summary && summary.length > SUMMARY_MAX_CHARS ? `${summary.length} characters` : null, summary != null);
  add('read_length', eddyRead && eddyRead.length > READ_MAX_CHARS ? `${eddyRead.length} characters` : null, eddyRead != null);

  // The prompt: "Leave out gauge readings, temperatures and rain percentages."
  const quoted = eddyRead
    ? measurementsIn(eddyRead).filter((m) => m.unit === 'cfs' || m.unit === 'ft' || m.unit === 'degF' || m.unit === 'percent')
    : [];
  add('read_measurements', quoted.length ? quoted.map((m) => m.text).join('; ') : null, eddyRead != null);

  const talk = eddyRead?.match(FORECAST_TALK)?.[0] ?? null;
  add('read_forecast_talk', talk, eddyRead != null);

  const weather = all.map((block) => block.match(WEATHER_TALK)?.[0]).find(Boolean) ?? null;
  add('weather_talk', weather, all.length > 0);

  const flat = all.flatMap(flatForecasts);
  add('flat_forecast', flat.length ? quote(flat[0]) : null, all.length > 0);

  // Numbers. Without the prompt there is nothing to hold them against.
  const written = all.flatMap(measurementsIn);
  if (inputs.prompt == null) {
    add('numbers_match_inputs', null, false);
    add('numbers_from_knowledge', null, false);
  } else {
    const { facts, knowledge } = splitPrompt(inputs.prompt);
    const supplied = inputMeasurements(facts);
    const known = inputMeasurements(knowledge);
    const unmatched: Measurement[] = [];
    const fromKnowledge: Measurement[] = [];
    for (const m of written) {
      if (matches(m, supplied)) continue;
      (matches(m, known) ? fromKnowledge : unmatched).push(m);
    }
    add('numbers_match_inputs', unmatched.length ? unmatched.map((m) => m.text).join('; ') : null);
    add('numbers_from_knowledge', fromKnowledge.length ? fromKnowledge.map((m) => m.text).join('; ') : null);
  }

  const stock = STOCK_LINES.filter(([, pattern]) => all.some((block) => pattern.test(block))).map(([name]) => name);
  add('stock_lines', stock.length ? stock.join('; ') : null, all.length > 0);

  const briefTalk = all.map((block) => block.match(BRIEF_TALK)?.[0]).find(Boolean) ?? null;
  add('brief_talk', briefTalk, all.length > 0);

  return results;
}
