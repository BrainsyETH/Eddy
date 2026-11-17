import React, { useId } from 'react';
import { Img, staticFile } from 'remotion';
import { colors } from '../../../../shared/social-brand';
import { eddyVariantFile } from '../../components/EddyMascot';

/** Decorative schedule illustration. Fixed lake level; motion never claims live release. */
export function DamStoryScene({ frame, active }: { frame: number; active: boolean }) {
  const turbine = active;
  const release = active;
  const spillway = false;
  const surfaceY = 98;
  const id = useId();
  // The lake is clipped by the same face that outlines the dam: no second,
  // subtly different slope calculation at the water's edge.
  return <svg data-dam-scene viewBox="0 0 720 280" width="100%" height="100%" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-lake`}><path d="M8 53 H358 L335 233 H8Z" /></clipPath>
      <clipPath id={`${id}-river`}><path d="M478 215 Q540 207 605 216 T712 218 V252 H478Z" /></clipPath>
      <clipPath id={`${id}-pipe`}><path d="M343 172 H378 Q404 172 423 202 H514 V220 H414 Q394 190 378 190 H343Z" /></clipPath>
      <clipPath id={`${id}-spill`}><path d="M398 92 Q441 92 457 149 T512 211 L502 223 Q465 210 443 153 T398 108Z" /></clipPath>
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
        <g className="dam-water-level-shift" style={{ transform: `translateY(${surfaceY - 98}px)` }}>
          <path d="M-30 116 Q-10 110 10 116 T50 116 T90 116 T130 116 T170 116 T210 116 T250 116 T290 116 T330 116 T370 116 V300 H-30Z" fill={colors.primary[300]} />
          <path d="M-30 170 Q35 151 92 174 T213 174 T330 170 H380 V300 H-30Z" fill={colors.primary[400]} stroke="none" />
          <path d="M-30 211 Q24 191 83 215 T204 214 T330 211 H380 V300 H-30Z" fill={colors.primary[500]} stroke="none" />
          <g transform={`translate(${Math.sin(frame / 30 * Math.PI / 3) * 5} 0)`} fill="none" stroke={colors.primary[100]}>
            <path d="M65 142 H92 M103 142 H109 M185 192 H211 M220 192 H227 M262 143 H291" />
          </g>
        </g>
      </g>
      <g transform={`translate(0 ${Math.sin(frame * Math.PI / 90) * 1.2}) rotate(${Math.sin(frame * Math.PI / 90) * 0.8} 170 116)`}>
        <foreignObject x="110" y="45" width="120" height="80">
          <Img data-dam-canoe alt="" src={staticFile(eddyVariantFile('canoe'))} style={{ width: 120, height: 80, display: 'block' }} />
        </foreignObject>
      </g>
      <path d="M478 215 Q540 207 605 216 T712 218 V252 H478Z" fill={colors.primary[300]} />
      <path d="M493 241 Q539 229 590 242 T710 242" fill="none" stroke={colors.primary[500]} strokeWidth="10" />
      {release && <g data-water-path="release" clipPath={`url(#${id}-river)`}>
        <g transform={`translate(${frame % 90 / 90 * 112} 0)`} stroke={colors.primary[50]} fill="none">
          <path d="M426 226 H454 M482 232 H506 M538 226 H566 M594 232 H618 M650 226 H678 M706 232 H730" />
        </g>
      </g>}
      <path d="M367 63 H403 C417 131 452 204 504 243 L345 243Z" fill={colors.primary[900]} stroke="none" />
      <path d="M358 53 H397 C409 121 444 194 496 233 H335Z" fill={colors.secondary[200]} />
      <path d="M386 54 H397 C409 121 444 194 496 233 H469 C431 187 401 118 386 54Z" fill={colors.neutral[300]} stroke="none" />
      <path d="M351 47 Q374 39 403 47 V62 H351Z" fill={colors.secondary[100]} />
      <path d="M354 92 H371 M353 100 H360 M356 147 H373 M422 174 L434 191" stroke={colors.neutral[400]} />
      <path d="M343 181 H378 Q399 181 418 211 H514" fill="none" strokeWidth="25" />
      <path d="M343 181 H378 Q399 181 418 211 H514" fill="none" stroke={turbine ? colors.primary[200] : colors.neutral[300]} strokeWidth="17" />
      {turbine && <g data-water-path="turbine" clipPath={`url(#${id}-pipe)`}>
        <g transform={`translate(${frame % 60 / 60 * 40} 0)`} stroke={colors.primary[50]} strokeWidth="5">
          <path d="M310 160 V225 M350 160 V225 M390 160 V225 M430 160 V225 M470 160 V225 M510 160 V225" />
        </g>
      </g>}
      {spillway && <g data-water-path="spillway">
        <path d="M398 100 Q434 100 450 151 T507 217" fill="none" strokeWidth="23" />
        <path d="M398 100 Q434 100 450 151 T507 217" fill="none" stroke={colors.primary[300]} strokeWidth="15" />
        <g clipPath={`url(#${id}-spill)`}>
          <g className="dam-motion dam-motion-spill" stroke={colors.primary[50]} strokeWidth="5">
            <path d="M390 70 H530 M390 100 H530 M390 130 H530 M390 160 H530 M390 190 H530 M390 220 H530" />
          </g>
        </g>
      </g>}
      <circle cx="400" cy="199" r="29" fill={colors.secondary[50]} />
      <circle cx="400" cy="199" r="22" fill={colors.accent[400]} />
      <g transform={`rotate(${turbine ? frame * 2 : 0} 400 199)`}>
        <path d="M400 182 V216 M383 199 H417 M388 187 L412 211 M412 187 L388 211" strokeWidth="3" />
        <circle cx="400" cy="199" r="7" fill={colors.secondary[100]} />
      </g>
      <path d="M538 250 L545 239 Q558 237 565 251Z M586 255 L593 244 L607 255Z" fill={colors.neutral[300]} />
    </g>
  </svg>;
}
