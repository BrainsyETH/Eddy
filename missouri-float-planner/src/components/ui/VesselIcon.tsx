import type { FloatBoat } from '@shared/float-search';

/** Web counterpart of eddy-ios/src/components/VesselIcon.tsx. Keep the
 * silhouettes in sync; currentColor makes selected and dark states legible. */
export default function VesselIcon({ vessel, size = 32 }: { vessel: FloatBoat; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {vessel === 'canoe' && <>
          <path d="M4 25Q10 15 24 15Q38 15 44 25Q38 35 24 35Q10 35 4 25Z" />
          <path d="M16 18V32M32 18V32M13 6L27 18" />
          <path d="M7 5Q8 1 12 4L17 8L13 12L8 8Z" fill="currentColor" strokeWidth={1.4} />
        </>}
        {vessel === 'kayak' && <>
          <path d="M3 25Q15 16 24 16Q33 16 45 25Q33 34 24 34Q15 34 3 25Z" />
          <ellipse cx={24} cy={25} rx={7} ry={4.5} />
          <path d="M13 6L35 42" />
          <path d="M10 4Q13 2 16 7L18 11L14 14L11 10Q8 6 10 4ZM31 35L35 32L38 37Q40 42 37 44Q34 46 32 40Z" fill="currentColor" strokeWidth={1.4} />
        </>}
        {vessel === 'raft' && <>
          <rect x={4} y={10} width={40} height={28} rx={12} />
          <rect x={10} y={16} width={28} height={16} rx={6} />
          <path d="M19 16V32M29 16V32M6 20H10M38 28H42" />
        </>}
        {vessel === 'tube' && <>
          <circle cx={24} cy={24} r={17} />
          <circle cx={24} cy={24} r={8} />
          <path d="M10 15L17 20M31 28L38 33M28 8L27 15M20 33L19 40" />
        </>}
      </g>
    </svg>
  );
}
