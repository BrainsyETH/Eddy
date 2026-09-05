// src/lib/pois/spring-extract.ts
// Pulling actual springs out of mile-by-mile prose.
//
// ── THE SOURCE IS NOT A LIST OF SPRINGS ────────────────────────────────────
//
// `floatmissouri_mile_markers.json` flags 105 markers with `feature_type:
// "spring"` or `has_spring: true`, and reading them in order is the fastest way
// to learn that the flag means "the word spring occurs here". The 105 include:
//
//   • Seasons.      "Hwy D Bridge access in spring or high water only."
//                   "Middle Fork can be run only in spring or high-water."
//   • Creeks.       "Spring Creek enters on left."  (a tributary, not a spring)
//   • Place names.  "Weldon Spring Conservation Area ends on left."  (×7)
//                   "Lake Springfield backs up water beyond this point."
//                   "Hwy. 49 Bridge at town of Mill Spring."
//   • Businesses.   "Keener Springs Resort. Fee access, camping."
//   • Access points "Schlicht Springs Access on Resort Road off Hwy. 133."
//     named for a   "MDC House Springs Access. No camping."
//     spring.       "Mineral Springs Ford. Access in dry weather."
//
// Roughly half. Shipping the flag as-is would put a pin labelled "Spring Creek"
// on a creek mouth and seven pins reading "Weldon Spring" down a stretch of the
// Missouri, on a map whose whole claim is that it knows where things are. So
// this module reads the prose instead of trusting the flag, and it is
// deliberately biased towards refusing: a spring it misses is a spring a person
// adds later, and a spring it invents is a person paddling to nothing.
//
// ── WHAT IT ACCEPTS ────────────────────────────────────────────────────────
//
// A NAMED spring: a proper noun immediately before "Spring"/"Springs" that is
// not swallowed by a longer place name. "Boze Mill Spring on left." yes.
// "Fiddle Springs Hollow on left." no — the spring is the hollow's name, and
// the feature at that mile is a hollow.
//
// UNNAMED springs ("Spring on right.", "Spring at base of bluff on right.") are
// real and are recognised, but come back as their own bucket rather than as
// accepted rows. They are the case where a false positive is likeliest — the
// seasonal reading of the word lives in exactly these short phrases — and a map
// pin labelled "Spring" earns little even when it is right. `spring-ingest`
// leaves them for a human.
//
// ── AND WHAT IT REFUSES ON POSITION ────────────────────────────────────────
//
// A marker's mile is the mile of the RIVER, and much of this prose describes
// springs that are not on it: "Harrison Spring 0.3 mile up branch on left",
// "Twin Springs 0.75 mile up creek", "Montague Spring, 2.5 miles up creek". A
// mile is the only position this source carries, so a spring 2.5 miles up a
// tributary would be drawn 2.5 miles from where it is — worse than not drawing
// it, because the pin looks as confident as every other pin. Anything the text
// places further than OFF_RIVER_LIMIT_MI from the channel is refused, and the
// distance is reported so the refusal can be read rather than guessed at.

/** How far off the channel a spring may be and still be placed by river mile. */
export const OFF_RIVER_LIMIT_MI = 0.25;

export interface SpringMarker {
  river_id: string;
  mile: number;
  description: string;
  feature_type: string | null;
  has_spring: boolean;
  side: string | null;
}

export interface SpringCandidate {
  /** Display name, e.g. "Boze Mill Spring". */
  name: string;
  /** The marker's river mile, on that river's own mile axis. */
  mile: number;
  /** "left" / "right" as the guide states it, when it does. */
  side: string | null;
  /** How far the text puts the spring off the channel, when it says. */
  offRiverMiles: number | null;
  /** The text says this one is private, closed, or not open to the public. */
  isPrivate: boolean;
  /** The sentence the name came from, kept for review and for `description`. */
  sourceText: string;
}

export interface SpringExtraction {
  named: SpringCandidate[];
  /** Real but nameless — held back for a human, see the header. */
  unnamed: SpringCandidate[];
  rejected: { text: string; reason: string }[];
}

/** Entities survive in this file's prose; a pin must not read "Officer&#8217;s". */
function decode(s: string): string {
  return s
    .replace(/&#8217;|&#146;|&rsquo;/g, '’')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words that turn "<name> Spring" into something that is not a spring.
 *
 * A trailing one renames the feature — "Spring Creek" is a creek, "Springs
 * Access" is a put-in the access layer already draws, "Spring Conservation
 * Area" is a landholding. Each is a whole-word match immediately after
 * Spring/Springs.
 */
const FEATURE_STEALERS = new Set([
  'creek', 'branch', 'hollow', 'bluff', 'valley', 'ford', 'road', 'drive',
  'access', 'resort', 'ranch', 'lodge', 'campground', 'conservation', 'ca',
  'recreation', 'school', 'church', 'cemetery', 'city', 'township', 'lake',
  'river', 'tower', 'trail', 'landing', 'ramp', 'store', 'bridge',
]);

/**
 * Capitalised words that are still not part of a name.
 *
 * The name walk already stops at any lower-case word, which disposes of "a
 * small spring" and "Multiple spring on north side" for free — the `Springs?`
 * match is case-sensitive, so a generic lower-case "spring" is never a
 * candidate in the first place. What survives that filter is a determiner
 * capitalised because it opens a sentence, and only those belong here.
 *
 * Size adjectives are deliberately ABSENT. "Big Spring" on the Current is the
 * largest spring in the state and one of the best-known places on any river in
 * this dataset; a stop list that reaches for the obvious "big, large, small"
 * silently drops it.
 */
const NOT_A_NAME = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'its', 'his', 'her',
  'their', 'multiple', 'other', 'another', 'both', 'several', 'some', 'each',
  'no', 'not', 'or', 'but', 'if', 'when', 'then', 'there', 'here', 'it',
  'is', 'was', 'has', 'have', 'also', 'and', 'to', 'in', 'on', 'at', 'by',
  'from', 'up', 'down', 'with', 'of', 'which', 'known', 'begin', 'begins',
]);

/**
 * Verbs that say the spring is somewhere else and merely REACHES here.
 *
 * "Dry Creek includes water from James Spring" puts James Spring up Dry Creek,
 * not on the Huzzah at mile 23. "McIntosh Spring is one of the springs feeding
 * this branch" is up Pine Branch, not on the Meramec at 43.9. Neither states a
 * distance, so `offRiverMiles` cannot catch them, and both would otherwise be
 * drawn confidently on the channel.
 */
const FEEDS_FROM_ELSEWHERE =
  /\b(?:water from|includes water|feeding|feeds|fed by|source of|issues from|supplies|supply)\b/i;

const PRIVATE_RE =
  /\b(private|privately|not open to (?:the )?public|no admittance|no trespass|closed to the public|permission)\b/i;

/** "0.3 mile up branch", "500 feet up branch", "2.5 miles up creek". */
function offRiverMiles(sentence: string): number | null {
  const m = sentence.match(
    /(\d+(?:\.\d+)?)\s*(miles?|feet|ft|yards?)\s+(?:up|from|off|west of|east of|north of|south of|away|walk|down)/i,
  );
  if (!m) {
    const walk = sentence.match(/(\d+(?:\.\d+)?)\s*(miles?|feet|ft)\s+walk/i);
    if (!walk) return null;
    return unit(parseFloat(walk[1]), walk[2]);
  }
  return unit(parseFloat(m[1]), m[2]);
}

function unit(value: number, u: string): number {
  const l = u.toLowerCase();
  if (l.startsWith('mile')) return value;
  if (l.startsWith('yard')) return value / 1760;
  return value / 5280; // feet
}

/** Split on sentence boundaries without breaking "Hwy. 19" or "0.75 mile". */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function titleCase(words: string[]): string {
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Drop parenthetical asides before the name walk.
 *
 * This prose names a spring and its alias in one breath — "Shanghai Spring
 * (Blue Spring)", "Creasy Spring (Bubbling Spring)", "Rainbow (Double) Spring",
 * "Blue Spring (also called Big Blue Spring)" — and every one of them produced
 * a SECOND match whose name walk ran back through the first, yielding
 * "Shanghai Spring Blue Spring". Removing the aside leaves one spring wearing
 * the name the guide leads with, which is the name on the signs.
 */
function stripAsides(sentence: string): string {
  return sentence.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * True when a description is a fragment rather than a marker's own text.
 *
 * The Eleven Point's mile-1.2 entry begins "miles away. The average flow is
 * more than 300 cubic feet per second…" — the tail of a paragraph about Greer
 * Spring that the source's own scrape cut in half and filed under the wrong
 * mile. Greer Spring is at mile 16.6 and 0.75 mile up a hill from the river;
 * trusting the fragment would pin the Eleven Point's most famous spring fifteen
 * miles downstream of itself. A description that opens mid-sentence cannot be
 * trusted to describe the mile it is filed under.
 */
function isFragment(text: string): boolean {
  return /^[a-z]/.test(text);
}

/**
 * Extract every spring a marker's prose actually asserts.
 *
 * One marker can yield more than one — "Mineral Springs Access on right …
 * Mineral Spring 0.5 mile up branch." names an access point and a spring — and
 * can yield none while still being flagged in the source.
 */
export function extractSprings(marker: SpringMarker): SpringExtraction {
  const out: SpringExtraction = { named: [], unnamed: [], rejected: [] };
  const text = decode(marker.description || '');
  if (!text) {
    out.rejected.push({ text: '', reason: 'empty description' });
    return out;
  }

  if (isFragment(text)) {
    out.rejected.push({ text, reason: 'description is a mid-sentence fragment; its mile is unreliable' });
    return out;
  }

  const seen = new Set<string>();
  let sawAnySpringWord = false;

  // Privacy is read from the WHOLE marker, not the sentence that names the
  // spring. The guide states access in a following sentence far more often than
  // in the naming one — Rainbow Spring on the North Fork is introduced as
  // "Upper branch of Rainbow (Double) Spring on right." and only then "No
  // admittance. Private use only." Reading per sentence marked it public, which
  // is the one direction this flag must never be wrong in.
  const markerIsPrivate = PRIVATE_RE.test(text);

  for (const raw of sentences(text)) {
    const sentence = stripAsides(raw);
    // Seasonal use is decided per sentence, and only kills that sentence:
    // "can be run only in spring or high-water" sits beside real springs
    // elsewhere in the same marker on some rivers.
    if (/\b(?:in|during|the)\s+spring\b(?!\s*(?:creek|branch|hollow))/i.test(sentence) &&
        !/\bSprings?\b/.test(sentence.replace(/\b(?:in|during|the)\s+spring\b/gi, ''))) {
      sawAnySpringWord = true;
      out.rejected.push({ text: sentence, reason: 'seasonal use of "spring"' });
      continue;
    }

    const re = /\bSprings?\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sentence)) !== null) {
      sawAnySpringWord = true;
      const before = sentence.slice(0, match.index);
      const after = sentence.slice(match.index + match[0].length);

      const nextWord = (after.match(/^[\s,.]*([A-Za-z]+)/) || [])[1];
      if (nextWord && FEATURE_STEALERS.has(nextWord.toLowerCase())) {
        out.rejected.push({
          text: sentence,
          reason: `"Spring ${nextWord}" names a ${nextWord.toLowerCase()}, not a spring`,
        });
        continue;
      }

      // "town of Mill Spring" — a settlement that happens to end in Spring.
      if (/\b(?:town|city|village|community) of\s+[A-Z][\w']*\s*$/i.test(before)) {
        out.rejected.push({ text: sentence, reason: 'settlement name' });
        continue;
      }

      // Walk back over capitalised words to find the proper noun, if any.
      //
      // `and` is the one lower-case word allowed through, and only when the
      // word beyond it is itself capitalised: "Ebb and Flow Spring" on the
      // Jacks Fork is one spring with a conjunction in its name, and stopping
      // at `and` christened it "Flow Spring".
      const beforeWords = before.trim().split(/\s+/).filter(Boolean);
      const nameWords: string[] = [];
      for (let i = beforeWords.length - 1; i >= 0 && nameWords.length < 4; i -= 1) {
        const word = beforeWords[i].replace(/[^\w'’-]/g, '');
        if (!word) break;
        const lower = word.toLowerCase();
        if (lower === 'and') {
          const prev = (beforeWords[i - 1] || '').replace(/[^\w'’-]/g, '');
          if (nameWords.length > 0 && /^[A-Z]/.test(prev)) {
            nameWords.unshift(word);
            continue;
          }
          break;
        }
        if (NOT_A_NAME.has(lower)) break;
        if (!/^[A-Z]/.test(word)) break;
        nameWords.unshift(word);
      }

      const offRiver = offRiverMiles(sentence);
      const isPrivate = markerIsPrivate;

      if (nameWords.length === 0) {
        // Unnamed, but only when the sentence is genuinely ABOUT a spring:
        // "Spring" opening a clause and followed by a locator.
        const standalone =
          /(?:^|[.;,]\s*)Springs?\b\s*(?:at|on|in|up|is|of|down|behind|just|from|0)/i.test(
            sentence.slice(Math.max(0, match.index - 2)),
          );
        const cand: SpringCandidate = {
          name: 'Spring',
          mile: marker.mile,
          side: marker.side,
          offRiverMiles: offRiver,
          isPrivate,
          sourceText: sentence,
        };
        if (standalone) out.unnamed.push(cand);
        else out.rejected.push({ text: sentence, reason: 'no name and no locator' });
        continue;
      }

      const name = titleCase([...nameWords, match[0]]);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      // "…access on Rochester Road off Hwy. 7 at Ozark Springs" names the
      // locality the put-in sits in, not a spring on the bank. The tell is a
      // locative preposition in front of the name on a sentence whose subject
      // is an access, a bridge or a portage.
      const beforeName = beforeWords
        .slice(0, beforeWords.length - nameWords.length)
        .join(' ')
        .replace(/[^\w\s]/g, ' ');
      if (
        /\b(?:at|near|in|above|below)\s*$/i.test(beforeName) &&
        /\b(?:access|bridge|portage|ford|put-?in|take-?out|launch|ramp)\b/i.test(sentence)
      ) {
        out.rejected.push({ text: sentence, reason: `"${name}" is the locality an access sits in` });
        continue;
      }

      if (FEEDS_FROM_ELSEWHERE.test(sentence)) {
        out.rejected.push({
          text: sentence,
          reason: `${name} feeds this reach from off-channel; its own position is unstated`,
        });
        continue;
      }

      if (offRiver !== null && offRiver > OFF_RIVER_LIMIT_MI) {
        out.rejected.push({
          text: sentence,
          reason: `${name} is ${offRiver} mi off the river; mile alone cannot place it`,
        });
        continue;
      }

      out.named.push({
        name,
        mile: marker.mile,
        side: marker.side,
        offRiverMiles: offRiver,
        isPrivate,
        sourceText: sentence,
      });
    }
  }

  if (!sawAnySpringWord) {
    out.rejected.push({ text, reason: 'flagged as a spring but the word never occurs' });
  }
  return out;
}
