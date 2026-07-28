// src/components/ui/EddyIcon.tsx
// Eddy's own icons, where a lucide glyph used to sit.
//
// The browser half of eddy-ios/src/components/EddySymbol.tsx + EddyScene.tsx,
// and deliberately the same shape: a name → asset map the caller picks from,
// with the art derived from design/eddy-emoji by a script rather than
// hand-exported. The two apps must not drift on what a gauge looks like.
//
// ── Two sizes of thing, one component ───────────────────────────────────────
// SYMBOLS are mascot-free marks that work inline beside a label, ~16-20px.
// SCENES are full-body stickers — an otter, a prop, a bit of river — and they
// need a hero slot, ~80px and up. At 18px a scene is a smudge. The `scene` flag
// on each entry is what lets a misuse be caught in review rather than in
// production, and it is why the default size differs per entry.
//
// ── Where these must NOT go ─────────────────────────────────────────────────
// Anywhere the current glyph is tinted to carry state. These are fixed-colour,
// three-tone art. The map markers colour a pin by condition (gauges) and by
// put-in / take-out / neutral (access points); painting those with a blue
// droplet and a coral pin deletes the signal. Same for anything inheriting
// `currentColor` from a status class.
//
// Names are ROLES, not drawings — `gauge`, not `waterDroplet`. A caller asking
// for a gauge mark should not have to know the catalog decided that is a
// droplet, and the day it becomes something else this file is the only edit.

import Image from 'next/image';

const ICONS = {
  // Symbols — inline, beside a label.
  gauge: { file: 'eddy-water-droplet', size: 18, alt: 'Gauge' },
  accessPoint: { file: 'eddy-poi', size: 18, alt: 'Access point' },
  weather: { file: 'eddy-weather', size: 18, alt: 'Weather' },
  ai: { file: 'eddy-ai-assistant', size: 18, alt: 'Eddy' },

  // The access-point section marks. These three were already on that page, as
  // hardcoded Vercel blob URLs in DETAIL_ICONS — art with no copy in this
  // repository, which the app therefore could not bundle and which nothing
  // regenerated. They are sources under design/eddy-emoji now, and the iOS
  // catalog names the same three roles (see EddySymbol.tsx).
  //
  // `facilities` is a role, not a drawing, which is why it is not called
  // `restroom`: the section it marks covers toilets, water and picnic tables,
  // and the day the art stops being a pair of restroom-sign otters this map is
  // the only edit. Same rule as `gauge` being a droplet.
  road: { file: 'eddy-road', size: 20, alt: 'Road access' },
  parking: { file: 'eddy-parking', size: 20, alt: 'Parking' },
  facilities: { file: 'eddy-restroom', size: 20, alt: 'Facilities' },

  // Scenes — hero slots only.
  //
  // Three of the catalog's ten, because a name here has to have a file under
  // public/icons and that file is emitted by WEB_ICONS in
  // eddy-ios/scripts/build-eddy-icons.py. Adding a name means adding it there
  // and re-running the script; a name without a file is a 404, not a fallback.
  //
  // `campfire` is a scene the site draws small on purpose — it feeds
  // DETAIL_ICONS in FloatPlanCard, whose sockets are 14-20px. It reads there
  // because a campfire is a prop, not a whole otter.
  campfire: { file: 'eddy-campfire-chill', size: 110, alt: '', scene: true },
  wave: { file: 'eddy-wave', size: 110, alt: '', scene: true },
  thumbsUp: { file: 'eddy-thumbs-up', size: 110, alt: '', scene: true },
} as const;

export type EddyIconName = keyof typeof ICONS;

/** Public path for one icon, for the places that need a URL and not an element. */
export function eddyIconUrl(name: EddyIconName): string {
  return `/icons/${ICONS[name].file}.png`;
}

export function EddyIcon({
  name,
  size,
  className,
  decorative = true,
}: {
  name: EddyIconName;
  size?: number;
  className?: string;
  /**
   * Default. The adjacent text names the thing in every current placement, and
   * announcing both reads as a stutter. Pass false only where the icon is the
   * ONLY thing saying what a control is.
   */
  decorative?: boolean;
}) {
  const icon = ICONS[name];
  const px = size ?? icon.size;

  return (
    <Image
      src={eddyIconUrl(name)}
      alt={decorative ? '' : icon.alt}
      width={px}
      height={px}
      // The sources are square-ish but not square; contain keeps a droplet from
      // being stretched into a circle in a square box.
      className={className}
      style={{ objectFit: 'contain' }}
      aria-hidden={decorative || undefined}
    />
  );
}
