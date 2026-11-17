import React, { useId } from 'react';
import { colors } from '../../../../shared/social-brand';
import { EddyCanoe } from './EddyCanoe';
import { damMotion, lakeSurfacePath } from './dam-story-motion';

/** Decorative schedule illustration. Fixed lake level; motion never claims live release. */
export function DamStoryScene({ frame, active }: { frame: number; active: boolean }) {
  const motion = damMotion(frame);
  const surface = lakeSurfacePath(motion.frame);
  const pipe = 'M343 181 H378 Q399 181 418 211 H508';
  const flow = `${pipe} Q520 211 528 218 T553 223 Q609 220 659 227 T749 224`;
  const id = useId();
  // The lake is clipped by the same face that outlines the dam: no second,
  // subtly different slope calculation at the water's edge.
  return <svg data-dam-scene viewBox="0 0 720 280" width="100%" height="100%" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-flow`}><rect x="330" y="160" width="382" height="90" /></clipPath>
      <clipPath id={`${id}-pipe-end`}><rect x="320" y="160" width="188" height="70" /></clipPath>
      <clipPath id={`${id}-lake`}><path d="M8 53 H358 L335 233 H8Z" /></clipPath>
      <clipPath id={`${id}-river`}><path d="M478 215 Q540 207 605 216 T712 218 V252 H478Z" /></clipPath>
    </defs>
    <g stroke={colors.primary[900]} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
      <path d="M15 133 Q52 84 103 108 Q150 65 211 107 L281 160" fill={colors.secondary[200]} stroke="none" />
      <path d="M539 153 Q577 119 610 145 Q666 101 709 157 V235 H530Z" fill={colors.secondary[200]} stroke="none" />
      <g fill={colors.secondary[50]}>
        <path transform="translate(-45 -6)" d="M128 51 C114 51 114 34 129 33 C131 14 160 17 162 34 C179 29 188 51 171 51Z" />
        <path d="M555 68 C543 68 543 53 555 52 C560 36 583 39 585 53 C601 51 607 68 591 68Z" />
      </g>
      <g fill={colors.primary[300]}>
        <path d="M47 140 V84 M28 117 L47 74 L67 117Z M33 101 L47 65 L61 101Z" />
        <path d="M83 137 V104 M68 125 L83 91 L99 125Z" />
        <path d="M655 211 V151 M635 186 L655 137 L677 186Z M640 165 L655 126 L671 165Z" />
        <path d="M692 216 V178 M678 199 L692 165 L707 199Z" />
      </g>
      <path d="M10 218 Q140 242 335 233 H711 V261 Q565 272 387 262 Q173 278 10 249Z" fill={colors.secondary[200]} />
      <g clipPath={`url(#${id}-lake)`}>
        <path data-lake-surface d={`${surface} V300 H-32Z`} fill={colors.primary[300]} />
        <g transform={`translate(0 ${Math.sin(motion.phase * Math.PI * 2) * 1.1})`} stroke="none">
          <path d="M-30 170 Q35 151 92 174 T213 174 T330 170 H380 V300 H-30Z" fill={colors.primary[400]} />
          <path d="M-30 211 Q24 191 83 215 T204 214 T330 211 H380 V300 H-30Z" fill={colors.primary[500]} />
        </g>
        <g fill="none" stroke={colors.primary[100]} strokeWidth="2.4" strokeDasharray="22 60" strokeDashoffset={motion.lakeOffset} opacity="0.65">
          <path d="M-90 144 Q60 140 160 145 T430 143" />
          <path d="M-150 194 Q30 188 166 194 T430 193" strokeDashoffset={motion.lakeOffset - 36} />
        </g>
      </g>
      {/* Both ends of the hull follow the same wave sampled above. */}
      <EddyCanoe frame={motion.frame} />
      <path d="M478 215 Q540 207 605 216 T712 218 V252 H478Z" fill={colors.primary[300]} />
      <path d="M493 241 Q539 229 590 242 T710 242" fill="none" stroke={colors.primary[500]} strokeWidth="10" />
      <g clipPath={`url(#${id}-river)`} fill="none" stroke={colors.primary[50]} strokeWidth="2.3" opacity={active ? 0.55 : 0.3}>
        <path d="M450 240 Q510 229 587 240 T770 239" strokeDasharray="10 26" strokeDashoffset={active ? motion.flowOffset : motion.flowOffset / 2} />
      </g>
      <path d="M367 63 H403 C417 131 452 204 504 243 L345 243Z" fill={colors.primary[900]} stroke="none" />
      <path d="M358 53 H397 C409 121 444 194 496 233 H335Z" fill={colors.secondary[200]} />
      <path d="M386 54 H397 C409 121 444 194 496 233 H469 C431 187 401 118 386 54Z" fill={colors.neutral[300]} stroke="none" />
      <path d="M351 47 Q374 39 403 47 V62 H351Z" fill={colors.secondary[100]} />
      <path d="M354 92 H371 M353 100 H360 M356 147 H373 M422 174 L434 191" stroke={colors.neutral[400]} />
      {/* The outlet widens into the river rather than ending in a floating cap. */}
      {active && <path data-water-path="release" d="M506 203 Q521 203 532 214 Q542 220 560 218 L560 232 Q535 233 521 223 Q516 219 506 219Z" fill={colors.primary[200]} stroke="none" />}
      <g clipPath={`url(#${id}-pipe-end)`}>
        <path d={pipe} fill="none" strokeWidth="25" />
        <path d={pipe} fill="none" stroke={active ? colors.primary[200] : colors.neutral[300]} strokeWidth="17" />
      </g>
      {active && <path data-water-path="turbine" d={flow} clipPath={`url(#${id}-flow)`} fill="none" stroke={colors.primary[50]} strokeWidth="3" opacity="0.7" strokeDasharray="10 26" strokeDashoffset={motion.flowOffset} />}
      <circle cx="400" cy="199" r="29" fill={colors.secondary[50]} />
      <circle cx="400" cy="199" r="22" fill={colors.accent[400]} />
      <g transform={`rotate(${active ? motion.turbineAngle : 0} 400 199)`}>
        <path d="M400 182 V216 M383 199 H417 M388 187 L412 211 M412 187 L388 211" strokeWidth="3" />
        <circle cx="400" cy="199" r="7" fill={colors.secondary[100]} />
      </g>
      <path d="M538 250 L545 239 Q558 237 565 251Z M586 255 L593 244 L607 255Z" fill={colors.neutral[300]} />
    </g>
  </svg>;
}
