import credits from '@eddy/conditions/place-photo-credits.json';
import type { RiverHeaderPhoto } from './riverHeader';

/** The web's editorial photos, bundled as metadata so the header needs no API call. */
export function damHeaderPhoto(damId: string): RiverHeaderPhoto | null {
  if (!Object.hasOwn(credits, damId) || /^(lake|launch)-/.test(damId)) return null;
  const photo = credits[damId as keyof typeof credits];
  const focus = 'focus' in photo && /^\d{1,3}% \d{1,3}%$/.test(photo.focus)
    ? photo.focus as `${number}% ${number}%` : undefined;
  return {
    url: `https://eddy.guide/lakes/${photo.asset}`,
    focus,
    credit: { text: photo.credit, url: `https://eddy.guide/photo-credits#${damId}` },
  };
}
