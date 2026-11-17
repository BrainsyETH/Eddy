// eddy-ios/src/lib/damSourceLinks.ts
// Which publisher pages a dam card may offer, read off the snapshot.
//
// The server builds these links from its registry (see DamSourceLink in
// shared/dam-types.ts for why the URL rides the wire). This is the client's
// half of that arrangement: decide what is safe and sensible to draw from a
// field a shipped binary will be handed by deploys that do not exist yet.
//
// Pure and React-free, so it is tested from the web suite like the rest of
// this directory's logic.

import type { DamSnapshot, DamSourceLink } from '@eddy/types';

/**
 * A link is drawn only if it is an https page.
 *
 * openExternalLink will also hand `tel:` and `mailto:` to the system, which is
 * right for a contact row and wrong here: a control labelled as a data source
 * must open a web page or nothing.
 */
function opensWebPage(link: DamSourceLink): boolean {
  try {
    return new URL(link.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The publisher's page for one half of the card, or null.
 *
 * Null for a payload from before the field existed, for a kind this dam has no
 * page for, and for a link that is not an https page. An unknown `kind` from a
 * later deploy is simply never asked for.
 */
export function damSourceLink(
  dam: Pick<DamSnapshot, 'sourceLinks'>,
  kind: DamSourceLink['kind'],
): DamSourceLink | null {
  const link = dam.sourceLinks?.find((entry) => entry.kind === kind);
  return link && opensWebPage(link) ? link : null;
}

/**
 * The links that belong beside the data: the readings' source, then the
 * schedule's. Never the `reference` link — that is the operator's page for a
 * dam whose readings came from somebody else, and beside the readings it would
 * claim a source it is not. The screen offers it among its actions instead.
 */
export function damSourceLinks(dam: Pick<DamSnapshot, 'sourceLinks'>): DamSourceLink[] {
  return (['readings', 'schedule'] as const)
    .map((kind) => damSourceLink(dam, kind))
    .filter((link): link is DamSourceLink => link !== null);
}

type ScreenDam = Pick<
  DamSnapshot,
  'metrics' | 'schedule' | 'generating' | 'generationForecast' | 'hasTurbines' | 'sourceLinks'
>;

/**
 * Whether the dam screen has any data to draw at all.
 *
 * Everything upstream is read-through and allowed to fail independently, so a
 * dam can arrive with a schedule and no readings, or readings and no schedule.
 * Both are ordinary; this is false only for nothing whatsoever.
 */
export function damHasAnything(dam: ScreenDam): boolean {
  return (
    Object.keys(dam.metrics).length > 0 ||
    dam.schedule.length > 0 ||
    dam.generating !== null ||
    Boolean(dam.generationForecast)
  );
}

/**
 * Whether the screen draws the Generation card — the card that holds the
 * source links.
 *
 * BOTH conditions, because the screen applies both: the card is for a
 * release reading, powerhouse or schedule, and the screen replaces every data card with its
 * "nothing published" notice when the dam arrived with nothing.
 */
export function generationCardRenders(dam: ScreenDam): boolean {
  return damHasAnything(dam) && (Boolean(dam.metrics.release) || dam.hasTurbines || dam.schedule.length > 0);
}

/**
 * The links the screen must draw itself, because no Generation card is there
 * to hold them.
 *
 * Decided by whether the card RENDERS, not by what kind of dam this is. The
 * first version asked only "does it have turbines", so a hydropower dam whose
 * every read had failed drew neither the card nor these — losing the links on
 * exactly the screen with nothing else to offer.
 */
export function standaloneSourceLinks(dam: ScreenDam): DamSourceLink[] {
  return generationCardRenders(dam) ? [] : damSourceLinks(dam);
}
