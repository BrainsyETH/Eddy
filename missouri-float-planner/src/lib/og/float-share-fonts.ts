import { loadOgFonts, type OGFont } from './fonts';
import { GEIST_REGULAR_BASE64, GEIST_BOLD_BASE64 } from './geist-share-font-data';

let cached: OGFont[] | undefined;
/** The recap's font roles, without changing other OG covers. */
export function loadFloatShareFonts(): OGFont[] {
  return cached ??= [
    ...loadOgFonts(),
    { name: 'Geist', data: Uint8Array.from(atob(GEIST_REGULAR_BASE64), c => c.charCodeAt(0)).buffer, weight: 400, style: 'normal' },
    { name: 'Geist', data: Uint8Array.from(atob(GEIST_BOLD_BASE64), c => c.charCodeAt(0)).buffer, weight: 700, style: 'normal' },
  ];
}
