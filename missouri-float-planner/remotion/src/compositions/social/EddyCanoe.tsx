import React, { useId } from 'react';
import { colors } from '../../../../shared/social-brand';
import { canoePose, paddlePose } from './dam-story-motion';

// The existing canoe mascot's navy fur, green muzzle and coral shades, redrawn
// as articulated shapes. These two fur colours belong to Eddy's artwork, not UI.
const fur = '#2D3975';
const furLight = '#46528E';
const ink = colors.primary[900];

function PaddlingArm({ arm, near = false }: { arm: ReturnType<typeof paddlePose>['nearArm']; near?: boolean }) {
  const { shoulder, elbow, paw } = arm;
  const before = { x: (shoulder.x + 3 * elbow.x) / 4, y: (shoulder.y + 3 * elbow.y) / 4 };
  const after = { x: (paw.x + 3 * elbow.x) / 4, y: (paw.y + 3 * elbow.y) / 4 };
  const limb = `M${shoulder.x} ${shoulder.y} L${before.x} ${before.y} Q${elbow.x} ${elbow.y} ${after.x} ${after.y} L${paw.x} ${paw.y}`;
  return <g fill="none">
    <path d={limb} strokeWidth={near ? 10 : 8.5} />
    <path d={limb} stroke={near ? furLight : fur} strokeWidth={near ? 6.8 : 5.3} />
  </g>;
}

export function EddyCanoe({ frame }: { frame: number }) {
  const id = useId();
  const boat = canoePose(frame);
  const paddle = paddlePose(frame);
  const headTilt = Math.sin(frame / 360 * Math.PI * 2 - 0.3) * 1.4;
  const paddleShape = <g transform={`translate(0 ${paddle.lift}) rotate(${paddle.angle} ${paddle.pivot.x} ${paddle.pivot.y})`}>
    <path d="M25 -33 H31 M28 -32 V0" fill="none" stroke={ink} strokeWidth="4.5" />
    <path d="M28 -31 V0" fill="none" stroke={colors.secondary[400]} strokeWidth="2.4" />
    <path d="M25 -3 Q21 2 22 9 Q28 13 34 9 Q35 2 31 -3Z" fill={colors.secondary[400]} strokeWidth="2" />
    <path d="M28 1 V8" stroke={colors.secondary[200]} strokeWidth="1.3" />
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
      <circle cx="-30" cy="-66" r="7.5" fill={fur} />
      <circle cx="16" cy="-66" r="7" fill={fur} />
      <circle cx="-30" cy="-66" r="3.4" fill={furLight} stroke="none" />
      <circle cx="16" cy="-66" r="3.1" fill={furLight} stroke="none" />
      <path data-canoe-head d="M-34 -55 C-34 -67 -25 -73 -16 -73 Q-12 -79 -7 -77 Q-5 -77 -8 -73 Q-2 -75 4 -74 Q7 -73 4 -71 C16 -70 22 -63 22 -52 C22 -41 11 -34 -6 -34 C-22 -34 -34 -42 -34 -55Z" fill={fur} />
      <path d="M-30 -53 C-29 -60 -17 -62 -9 -55 Q-6 -53 -3 -55 C7 -62 19 -59 19 -51 C18 -41 8 -36 -6 -36 C-20 -36 -30 -43 -30 -53Z" fill={colors.support[500]} stroke="none" />
      <path d="M-26 -47 Q-17 -53 -7 -47 Q3 -53 14 -47 C12 -40 5 -37 -6 -37 Q-22 -38 -26 -47Z" fill={colors.support[300]} stroke="none" />
      <path d="M-33 -55 L-27 -57 M-9 -57 Q-6 -59 -2 -57 M16 -57 L21 -56" fill="none" stroke={colors.accent[500]} strokeWidth="2.5" />
      <rect x="-28" y="-62" width="19" height="12" rx="6" fill={colors.accent[400]} strokeWidth="1.7" />
      <rect x="-2" y="-62" width="19" height="12" rx="6" fill={colors.accent[400]} strokeWidth="1.7" />
      <path d="M-21 -59 L-23 -55 M5 -59 L3 -55" stroke={colors.secondary[100]} strokeWidth="1.7" />
      <path d="M-10 -49 Q-6 -51 -2 -49 Q-2 -46 -6 -46 Q-10 -46 -10 -49Z" fill={ink} stroke="none" />
      <path d="M-14 -45 Q-6 -41 3 -46 Q1 -38 -6 -38 Q-12 -38 -14 -45Z" fill={ink} strokeWidth="0.9" />
      <path d="M-9 -40 Q-6 -43 -2 -40 Q-5 -38 -9 -40Z" fill={colors.accent[300]} stroke="none" />
      <path d="M-21 -47 L-31 -49 M-20 -44 L-30 -44 M10 -47 L20 -49 M9 -44 L19 -44" fill="none" strokeWidth="1.05" />
    </g>
    <PaddlingArm arm={paddle.farArm} />
    <PaddlingArm arm={paddle.nearArm} near />
    {/* Front hull hides the lower body, so Eddy sits inside the boat. */}
    <path data-canoe-hull d="M-56 -15 Q-35 -4 2 -4 Q40 -4 57 -18 Q55 -1 39 6 Q0 14 -34 6 Q-50 1 -56 -15Z" fill={colors.primary[400]} />
    <path d="M-46 -5 Q-34 6 -1 7 Q26 8 41 1 Q3 7 -28 1Z" fill={colors.primary[600]} stroke="none" />
    <path d="M-52 -12 Q-11 4 48 -10" fill="none" stroke={colors.secondary[200]} strokeWidth="2.5" />
    <path d="M-32 -1 Q-22 2 -12 2" fill="none" stroke={colors.primary[100]} strokeWidth="2" />
    <g data-canoe-paddle>
      <g clipPath={`url(#${id}-water)`} opacity="0.34">{paddleShape}</g>
      <g clipPath={`url(#${id}-air)`}>{paddleShape}</g>
    </g>
    <ellipse cx={paddle.upperHand.x} cy={paddle.upperHand.y} rx="3.7" ry="2.8" fill={fur} strokeWidth="1.6" />
    <ellipse cx={paddle.lowerHand.x} cy={paddle.lowerHand.y} rx="4.1" ry="3.2" fill={furLight} strokeWidth="1.6" />
    <g data-paddle-ripple transform={`translate(${paddle.contact} 1)`} opacity={paddle.ripple * 0.7} stroke={colors.primary[50]} strokeWidth="1.6" fill="none">
      <path d={`M${-4 - paddle.pull * 4} 0 Q-3 3 4 1 M${-7 - paddle.pull * 6} 4 Q-3 8 ${8 + paddle.pull * 4} 4`} />
    </g>
  </g>;
}
