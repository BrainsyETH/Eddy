// When an admin save may change an access point's slug.
//
// A slug is a public address: /rivers/<state>/<river>/access/<slug> is linked
// and indexed, and guide data addresses put-ins and take-outs by slug
// (src/lib/access-slugs.ts). The save route used to rebuild the slug from the
// name on every save that included a name, changed or not. Production has
// approved points whose slug is deliberately not the name-derived one, so an
// unrelated edit could silently move a live page.

export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface SlugDecision {
  /** The slug to write, or undefined to leave it alone. */
  slug?: string;
  /** True when the name changed on a live point and its address was kept. */
  keptLiveAddress: boolean;
}

/**
 * - Name unchanged: never touch the slug.
 * - Renaming an approved (public) point: keep its address.
 * - Renaming an unapproved point: nothing links to it yet, so follow the name.
 */
export function slugForSave(
  current: { name: string; slug: string | null; approved: boolean },
  newName: string,
): SlugDecision {
  const renamed = newName.trim() !== current.name.trim();
  if (!renamed) return { keptLiveAddress: false };
  if (current.approved && current.slug) return { keptLiveAddress: true };
  const slug = slugFromName(newName);
  return slug && slug !== current.slug ? { slug, keptLiveAddress: false } : { keptLiveAddress: false };
}
