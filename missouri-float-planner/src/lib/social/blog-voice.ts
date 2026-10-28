import { replaceEmDashes } from '@/lib/eddy/parse-response';

/**
 * Editorial openings for evergreen guides, written from EDDY_KNOWLEDGE.md and
 * the published river guides. Voice: generate-update.ts + river-guide-style.md
 * (warm local outfitter, concrete imagery, light playfulness, direct warnings).
 * No invented trips, current-condition claims, forced otter puns or superlatives.
 * Facts and practical advice below the opening still come from the live guide.
 *
 * These are the first line of the deterministic TEMPLATE caption, the one
 * that posts when there is no model. The model-written post does not see
 * them: it writes its own opener from the guide's material.
 */
export const GUIDE_OPENINGS: Readonly<Record<string, string>> = {
  current: 'Leave a little room in your Current River plans for a gravel-bar lunch. And possibly a second lunch.',
  meramec: 'A Meramec day can come with a cave tour. Give the river a little competition for your afternoon.',
  'eleven-point': 'The Eleven Point is a good reason to pack the camping gear and make a little more room in the calendar.',
  'jacks-fork': 'A Jacks Fork trip deserves a little time on land, too. That red mill at Alley Spring is worth the detour.',
  niangua: 'Bennett Spring gives a Niangua trip a pretty good opening act. Leave time to look around before the paddle.',
  huzzah: 'Huzzah Creek makes a strong case for putting a river day on the calendar. Steelville is a good place to start.',
  courtois: 'Courtois Creek brings the gravel bars and bluffs. You handle the lunch situation.',
  'big-piney': 'Big Piney plans have a habit of turning into fishing plans. Pack accordingly.',
  'big-river': 'Big River has a solid answer to “what else can we do while we’re there?” Start with Washington State Park.',
  black: 'Black River weekend? First, pick which side of Clearwater Lake gets your day.',
  gasconade: 'The Gasconade takes the scenic route. Your shuttle driver may appreciate the shortcut.',
  bourbeuse: 'The Bourbeuse has never been in much of a hurry to get anywhere. Plan your river day accordingly.',
  buffalo: 'The Buffalo brings the bluffs. You bring lunch and a little room in the schedule.',
  'st-francis': 'The St. Francis has more than one mood. Decide which stretch you’re meeting before you pack the boat.',
  'bryant-creek': 'Bryant Creek is a good place to trade a big mileage goal for a fishing rod.',
  'north-fork-white': 'A North Fork weekend can fit a paddle, a spring walk, and an evening at camp. No need to rush the middle bit.',
  james: 'The James makes a good case for spending less of the day driving and more of it holding a paddle.',
  elk: 'The Elk has room in the plan for a social river day or an early start with a fishing rod. The access details come first.',
  'spring-river-mo': 'Spring River trip? Check the state before you pack. This one is near La Russell and Carthage, Missouri.',
  'spring-river': 'Mammoth Spring is worth a stop before your Arkansas Spring River trip. The paddle can have its own chapter.',
  'kings-river': 'The Kings River makes a convincing argument for a long lunch and a short to-do list.',
  'war-eagle-creek': 'War Eagle Creek is a plan worth keeping flexible. Withrow Springs gives you a good reason to enjoy the land, too.',
  'crooked-creek': 'On Crooked Creek, the fishing rod deserves a say in how far you float.',
  mulberry: 'The Mulberry is a keep-your-paddle-handy kind of river. Pick the run with as much care as the company.',
  'caddo-river': 'Put Glenwood on the map and leave a little room for river time. The Caddo can take it from there.',
};

/**
 * The template caption's closing line. A soft nod, not a pitch: Facebook
 * renders the clickable article card under the message, so the line only
 * has to make the card feel like the natural next thing.
 */
export const GUIDE_CAPTION_CTA = 'There’s more in the guide below.';

/** A line the model added that the link post must not carry: a bare URL, a
 *  hashtag block, or a leftover "HOOK:"/"CAPTION:" label. */
function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return true;
  if (/^(#\w+\s*)+$/.test(t)) return true;
  if (/^(HOOK|CAPTION|HASHTAGS):/i.test(t)) return true;
  return false;
}

/**
 * Tidy a model-written guide post: drop any pasted URL (the `link` param
 * already renders the card), hashtag blocks and format labels, and turn
 * em-dashes into commas with the helper the river updates use. Nobody types
 * an em-dash into a Facebook post; it is the quickest tell that a model did.
 * The wording itself is the model's; what it may say is enforced by the lint.
 */
export function finalizeGuideBody(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !isNoiseLine(line))
    .map((line) => replaceEmDashes(line.replace(/\s*https?:\/\/\S+/gi, '')).trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
