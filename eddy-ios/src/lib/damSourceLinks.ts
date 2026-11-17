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

/** Every drawable link in card order: the operator's readings, then the schedule. */
export function damSourceLinks(dam: Pick<DamSnapshot, 'sourceLinks'>): DamSourceLink[] {
  return (['readings', 'schedule'] as const)
    .map((kind) => damSourceLink(dam, kind))
    .filter((link): link is DamSourceLink => link !== null);
}
