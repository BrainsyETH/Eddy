import React, { useId } from 'react';
import { colors } from '../../../../shared/social-brand';
import { canoePose, paddlePose } from './dam-story-motion';

// The existing canoe mascot's navy fur, green muzzle and coral shades, redrawn
// as articulated shapes. These two fur colours belong to Eddy's artwork, not UI.
const fur = '#2D3975';
const furLight = '#46528E';
const ink = colors.primary[900];

export function EddyCanoe({ frame }: { frame: number }) {
  const id = useId();
  const boat = canoePose(frame);
  const paddle = paddlePose(frame);
  const headTilt = Math.sin(frame / 360 * Math.PI * 2 - 0.3) * 1.4;
  const paddleShape = <g transform={`translate(0 ${paddle.lift}) rotate(${paddle.angle} 27 -32)`}>
    <path d="M24 -40 H30 M27 -39 V4" fill="none" stroke={ink} strokeWidth="5" />
    <path d="M27 -38 V4" fill="none" stroke={colors.secondary[400]} strokeWidth="2.4" />
    <path d="M24 0 Q20 6 21 14 Q27 20 33 14 Q34 6 30 0Z" fill={colors.secondary[400]} strokeWidth="2" />
    <path d="M27 4 V14" stroke={colors.secondary[200]} strokeWidth="1.3" />
  </g>;
  return <g data-dam-canoe transform={`translate(${boat.x} ${boat.y}) rotate(${boat.roll})`} stroke={ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
    <defs>
      <clipPath id={`${id}-air`}><rect x="-90" y="-120" width="180" height="120" /></clipPath>
      <clipPath id={`${id}-water`}><rect x="-90" y="0" width="180" height="40" /></clipPath>
    </defs>
    {/* Back gunwale and the seated body come before the front of the hull. */}
    <path d="M-56 -15 Q-36 -4 4 -5 Q39 -6 57 -18 L51 -2 Q-3 20 -50 -1Z" fill={colors.primary[700]} />
    <path d="M-43 -12 Q-5 -1 44 -12" fill="none" stroke={colors.secondary[300]} strokeWidth="3" />
    <path d="M-30 -5 Q-32 -22 -22 -36 Q-16 -44 0 -41 Q17 -38 20 -9 L26 1 H-34Z" fill={fur} />
    <path d="M-15 -35 Q-5 -26 6 -34 L7 -23 L13 -14 L7 -15 L11 -5 Q-4 1 -17 -5 L-12 -14 L-18 -12 L-14 -24Z" fill={colors.support[500]} stroke="none" />
    <g transform={`rotate(${headTilt} -8 -42)`}>
      <circle cx="-31" cy="-60" r="7" fill={fur} />
      <circle cx="15" cy="-61" r="6.5" fill={fur} />
      <path d="M-31 -60 L-28 -57 M14 -61 L12 -58" fill="none" stroke={furLight} strokeWidth="2" />
      <path data-canoe-head d="M-32 -55 Q-34 -68 -19 -70 L-11 -76 L-11 -71 L-2 -74 L-4 -70 Q18 -69 19 -53 Q20 -39 -6 -36 Q-29 -36 -32 -55Z" fill={fur} />
      <path d="M-28 -49 Q-18 -54 -7 -49 Q4 -55 16 -50 Q19 -37 -6 -36 Q-25 -36 -28 -49Z" fill={colors.support[500]} stroke="none" />
      <path d="M-27 -66 Q-20 -69 -16 -70" stroke={colors.support[500]} strokeWidth="2" fill="none" />
      {/* Oversized sunglasses and whiskers carry the identity at Story size. */}
      <path d="M-33 -59 L-29 -60 M-9 -60 Q-4 -63 0 -60 M18 -61 L21 -61" fill="none" stroke={colors.accent[500]} strokeWidth="3.6" />
      <path d="M-29 -62 Q-20 -66 -10 -62 L-12 -54 Q-18 -48 -25 -53Z M0 -62 Q9 -66 18 -62 L16 -54 Q9 -48 3 -53Z" fill={colors.accent[500]} strokeWidth="2.2" />
      <path d="M-22 -62 L-25 -56 M11 -63 L7 -55" stroke={colors.secondary[200]} strokeWidth="2.4" opacity="0.8" />
      <path d="M-10 -50 Q-6 -54 -1 -50 Q-2 -46 -6 -46Z" fill={ink} strokeWidth="1.3" />
      <path d="M-6 -46 V-43 Q-10 -40 -15 -43 M-6 -43 Q0 -40 4 -43" fill="none" strokeWidth="1.3" />
      <path d="M-19 -47 L-33 -49 M-19 -43 L-32 -40 M8 -47 L23 -50 M8 -43 L22 -40" fill="none" strokeWidth="1.2" />
    </g>
    <path d={`M-23 -29 Q-12 -22 4 -30 L${paddle.upperHand.x} ${paddle.upperHand.y}`} fill="none" strokeWidth="8" />
    <path d={`M-23 -29 Q-12 -22 4 -30 L${paddle.upperHand.x} ${paddle.upperHand.y}`} fill="none" stroke={fur} strokeWidth="4" />
    {/* Front hull hides the lower body, so Eddy sits inside the boat. */}
    <path data-canoe-hull d="M-56 -15 Q-35 -4 2 -4 Q40 -4 57 -18 Q55 -1 39 6 Q0 14 -34 6 Q-50 1 -56 -15Z" fill={colors.primary[400]} />
    <path d="M-46 -5 Q-34 6 -1 7 Q26 8 41 1 Q3 7 -28 1Z" fill={colors.primary[600]} stroke="none" />
    <path d="M-52 -12 Q-11 4 48 -10" fill="none" stroke={colors.secondary[200]} strokeWidth="2.5" />
    <path d="M-32 -1 Q-22 2 -12 2" fill="none" stroke={colors.primary[100]} strokeWidth="2" />
    <g data-canoe-paddle>
      <g clipPath={`url(#${id}-water)`} opacity="0.34">{paddleShape}</g>
      <g clipPath={`url(#${id}-air)`}>{paddleShape}</g>
    </g>
    <path d={`M8 -31 Q12 -20 18 -20 L${paddle.lowerHand.x} ${paddle.lowerHand.y}`} fill="none" strokeWidth="9" />
    <path d={`M8 -31 Q12 -20 18 -20 L${paddle.lowerHand.x} ${paddle.lowerHand.y}`} fill="none" stroke={fur} strokeWidth="5" />
    <circle cx={paddle.upperHand.x} cy={paddle.upperHand.y} r="3.2" fill={fur} strokeWidth="1.7" />
    <circle cx={paddle.lowerHand.x} cy={paddle.lowerHand.y} r="3.6" fill={fur} strokeWidth="1.7" />
    <g data-paddle-ripple transform={`translate(${paddle.contact} 1)`} opacity={paddle.ripple * 0.7} stroke={colors.primary[50]} strokeWidth="1.6" fill="none">
      <path d={`M${-4 - paddle.pull * 4} 0 Q-3 3 4 1 M${-7 - paddle.pull * 6} 4 Q-3 8 ${8 + paddle.pull * 4} 4`} />
    </g>
  </g>;
}
