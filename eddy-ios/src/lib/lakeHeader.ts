import credits from '@eddy/conditions/place-photo-credits.json';
import type { RiverHeaderPhoto } from './riverHeader';

/**
 * A lake's own scenery, from the same credited set the web lake page uses.
 * Keyed `lake-<slug>` there, which is why damHeaderPhoto refuses those keys:
 * a lake photo is not a picture of the dam.
 */
export function lakeHeaderPhoto(slug: string): RiverHeaderPhoto | null {
  const key = `lake-${slug}`;
  if (!Object.hasOwn(credits, key)) return null;
  const photo = credits[key as keyof typeof credits];
  const focus = 'focus' in photo && /^\d{1,3}% \d{1,3}%$/.test(photo.focus)
    ? photo.focus as `${number}% ${number}%` : undefined;
  return {
    url: `https://eddy.guide/lakes/${photo.asset}`,
    focus,
    credit: { text: photo.credit, url: `https://eddy.guide/photo-credits#${key}` },
  };
}
