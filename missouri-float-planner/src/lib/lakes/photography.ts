import credits from '../../../public/lakes/credits.json';

// Presentation only: this module is safe in client components and never loads
// the lake registry or a database reader. Rights live on /photo-credits.
// `focus` is the CSS object-position that keeps the subject inside the wide,
// shallow header crop; a centred crop of several dam photos shows only water.
export function damPhoto(damId?: string) {
  const photo = damId ? (credits as Record<string, { asset: string; title: string; focus?: string }>)[damId] : undefined;
  return photo ? { src: `/lakes/${photo.asset}`, alt: photo.title, focus: photo.focus } : undefined;
}

export function lakePhoto(slug: string) {
  return damPhoto(slug === 'table-rock' ? 'lake-table-rock' : slug === 'truman' ? 'lake-truman' : undefined);
}

export function lakeDamPhoto(slug: string) {
  return damPhoto(slug === 'table-rock' ? 'swl-table-rock-dam' : slug === 'truman' ? 'nwk-truman-dam' : undefined);
}

export function launchPhoto(lakeSlug: string, launchSlug: string) {
  return damPhoto(`launch-${lakeSlug}-${launchSlug}`);
}

export const LAKE_RECREATION: Record<string, { href: string; label: string }> = {
  'table-rock': { href: 'https://www.swl.usace.army.mil/Missions/Recreation/Lakes/Table-Rock-Lake/Recreation-Activities/', label: 'USACE Table Rock Lake' },
  truman: { href: 'https://www.nwk.usace.army.mil/Locations/District-Lakes/Harry-S-Truman-Lake/', label: 'USACE Truman Lake' },
};
