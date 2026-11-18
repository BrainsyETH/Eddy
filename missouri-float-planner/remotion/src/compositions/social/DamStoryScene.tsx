import React, { useId } from 'react';
import { colors } from '../../../../shared/social-brand';
import { EddyCanoe } from './EddyCanoe';
import { damMotion, lakeSurface, lakeSurfacePath } from './dam-story-motion';

const water = colors.primary;
const sand = colors.secondary;
const ink = water[900];
const riverBank = 'M473 215 C515 203 552 218 582 216 C629 212 653 222 679 218 C695 215 713 217 711 228 C707 248 672 251 641 251 C593 252 574 242 537 246 C512 249 480 248 473 239 Q465 229 473 215Z';

function Pine({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={water[800]} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 1 V-11" />
    <path d="M-14 -10 L-8 -20 H-11 L-5 -30 H-7 L0 -44 L7 -30 H5 L11 -20 H8 L14 -10 Q0 -5 -14 -10Z" fill={water[500]} />
    <path d="M0 -38 L5 -26 H2 L8 -13 Q3 -11 0 -11Z" fill={water[400]} stroke="none" />
  </g>;
}

/** Decorative schedule illustration. Water height and motion are illustrative. */
export function DamStoryScene({ frame, active }: { frame: number; active: boolean }) {
  const motion = damMotion(frame);
  const surface = lakeSurfacePath(motion.frame, 20, 358);
  const westShore = lakeSurface(20, motion.frame);
  const lakeBasin = `${surface} L335 233 C259 238 188 246 115 233 C64 225 39 208 21 186 C10 173 5 158 5 144 C5 129 8 ${westShore - 1} 20 ${westShore}Z`;
  const pipe = 'M350 181 H378 C398 181 408 204 425 211 C435 215 449 216 482 216';
  const flow = `${pipe} C507 216 510 228 540 229 C584 230 608 222 639 229 S681 233 702 227`;
  const id = useId();
  return <svg data-dam-scene viewBox="0 0 720 280" width="100%" height="100%" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-lake`}><path d={lakeBasin} /></clipPath>
      <clipPath id={`${id}-river`}><path d={riverBank} /></clipPath>
      <linearGradient id={`${id}-lake-fill`} x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor={water[200]} /><stop offset="0.7" stopColor={water[400]} />
      </linearGradient>
      <linearGradient id={`${id}-release`}>
        <stop stopColor={water[100]} /><stop offset="1" stopColor={water[100]} stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* The wooded ridges and exposed rock keep both sides in the same landscape. */}
    <path d="M9 127 C30 108 52 110 70 96 C97 74 116 86 134 96 C156 107 197 75 219 77 C251 77 286 103 332 103 L358 131Z" fill={sand[200]} />
    <path d="M41 127 C72 116 87 105 108 111 C143 123 162 102 187 105 C214 108 236 124 274 117 L329 138Z" fill={sand[300]} />
    <path d="M472 226 C500 209 514 185 541 177 C561 169 586 177 604 164 C628 146 656 147 682 166 Q706 185 711 229Z" fill={sand[200]} />
    <path d="M488 226 C521 221 523 196 551 193 C566 192 590 202 613 187 C639 171 664 177 687 192 Q708 208 709 230Z" fill={sand[300]} />
    <g fill="none" stroke={sand[300]} strokeWidth="2.1" strokeLinecap="round">
      <path d="M42 60 C62 57 73 42 93 49 Q103 54 119 52" />
      <path d="M512 65 C526 64 533 54 546 55 Q557 57 562 63 Q573 60 586 65" />
    </g>

    {/* A curved rock shelf supports the lake, dam and downstream banks. */}
    <path d="M18 171 C59 221 128 207 183 221 C240 235 292 217 343 226 C392 227 442 244 485 232 C528 220 581 234 627 227 C659 221 691 214 706 225 C720 238 703 254 679 258 C601 272 534 259 467 262 C404 266 385 257 337 261 C249 273 175 263 108 254 C60 248 31 232 20 210 Q9 190 18 171Z" fill={sand[200]} stroke={sand[600]} strokeWidth="2" />
    <path d="M31 211 C72 251 156 250 240 256 C267 257 290 254 306 254 M459 255 C521 248 553 255 598 256 M642 254 Q671 255 692 246" fill="none" stroke={sand[400]} strokeWidth="2" strokeLinecap="round" />

    <Pine x={34} y={126} scale={0.69} />
    <Pine x={75} y={122} scale={0.55} />
    <Pine x={56} y={128} scale={0.98} />
    <Pine x={684} y={223} scale={0.71} />
    <Pine x={624} y={222} scale={0.62} />
    <Pine x={657} y={225} scale={1.08} />

    <g clipPath={`url(#${id}-lake)`}>
      <path d={lakeBasin} fill={`url(#${id}-lake-fill)`} />
      <g transform={`translate(0 ${Math.sin(motion.phase * Math.PI * 2) * 2})`}>
        <path d="M-30 159 C38 190 92 163 151 168 C205 173 224 192 275 178 C297 172 331 160 380 169 V300 H-30Z" fill={water[400]} opacity="0.5" />
        <path d="M-30 204 C26 198 71 213 111 220 C172 232 224 202 272 207 C306 211 326 217 380 200 V300 H-30Z" fill={water[500]} opacity="0.66" />
      </g>
      <path d={surface} fill="none" stroke={water[600]} strokeWidth="2.2" />
      <g fill="none" stroke={water[50]} strokeLinecap="round">
        <path d={lakeSurfacePath(motion.frame, 18, 62, 6)} strokeWidth="2.6" opacity="0.81" />
        <path d={lakeSurfacePath(motion.frame, 251, 311, 8)} strokeWidth="2.1" opacity="0.73" />
        <path d="M-90 142 Q59 134 160 144 T430 142" strokeWidth="1.9" strokeDasharray="17 10 4 51" strokeDashoffset={motion.lakeOffset} opacity="0.57" />
        <path d="M-150 191 Q30 182 166 193 T430 191" strokeWidth="2.1" strokeDasharray="22 60" strokeDashoffset={motion.lakeOffset - 36} opacity="0.38" />
      </g>
    </g>
    <EddyCanoe frame={motion.frame} />

    <path d={riverBank} fill={water[300]} stroke={water[600]} strokeWidth="2.1" />
    <g clipPath={`url(#${id}-river)`} fill="none" strokeLinecap="round">
      <path d="M484 230 C548 212 570 239 631 227 S688 239 728 214" stroke={water[200]} strokeWidth="8" />
      <path d="M478 244 Q535 230 583 240 T710 233" stroke={water[500]} strokeWidth="6" opacity="0.52" />
      <path d="M450 240 Q510 229 587 240 T770 239" stroke={water[50]} strokeWidth="2" opacity={active ? 0.58 : 0.32} strokeDasharray="10 26" strokeDashoffset={active ? motion.flowOffset : motion.flowOffset / 2} />
    </g>

    <path d="M359 57 H404 C416 125 452 201 499 237 C466 244 385 244 335 235Z" fill={sand[400]} opacity="0.7" />
    <g stroke={ink} strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round">
      <path d="M357 53 H397 C410 124 444 198 489 230 Q449 237 335 232Z" fill={sand[200]} />
      <path d="M384 54 H397 C410 124 444 198 489 230 Q480 232 465 233 C427 194 395 119 384 54Z" fill={sand[300]} stroke="none" />
      <path d="M349 47 Q374 39 405 47 V61 Q383 65 349 61Z" fill={sand[100]} />
      <path d="M350 54 Q376 50 403 54 M353 94 H367 M351 102 H357 M347 146 H364 M425 174 L432 185" fill="none" stroke={sand[500]} strokeWidth="2.1" />
    </g>
    {active && <path data-water-path="release" d="M478 210 C508 210 514 219 536 219 C553 219 569 214 597 225 C567 227 549 240 530 237 C508 234 503 223 478 222Z" clipPath={`url(#${id}-river)`} fill={`url(#${id}-release)`} />}
    <path d={pipe} fill="none" stroke={water[700]} strokeWidth="18" strokeLinecap="round" />
    <path d={pipe} fill="none" stroke={active ? water[200] : sand[300]} strokeWidth="12" strokeLinecap="round" />
    {active && <path data-water-path="turbine" d={flow} fill="none" stroke={water[50]} strokeWidth="2.5" strokeLinecap="round" opacity="0.78" strokeDasharray="10 26" strokeDashoffset={motion.flowOffset} />}
    <g stroke={ink} strokeWidth="2.25" strokeLinecap="round">
      <circle cx="404" cy="200" r="20" fill={sand[50]} />
      <circle cx="404" cy="200" r="15.5" fill={active ? colors.accent[400] : sand[300]} />
      <g transform={`rotate(${active ? motion.turbineAngle : 0} 404 200)`}>
        <path d="M404 188 V212 M392 200 H416 M395.5 191.5 L412.5 208.5 M412.5 191.5 L395.5 208.5" />
        <circle cx="404" cy="200" r="4.1" fill={sand[100]} />
      </g>
    </g>
    <path d="M532 247 Q537 236 548 239 Q554 241 558 249 Q542 252 532 247Z M575 251 Q579 243 585 246 Q592 248 594 253Z" fill={sand[300]} stroke={sand[700]} strokeWidth="2" strokeLinejoin="round" />
  </svg>;
}
