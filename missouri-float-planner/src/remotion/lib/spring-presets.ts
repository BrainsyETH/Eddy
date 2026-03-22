// Reusable spring animation configs for Remotion compositions

export const springPresets = {
  // Snappy entrance for titles and badges
  snappy: { damping: 15, mass: 0.8, stiffness: 200 },
  // Smooth slide for panels and cards
  smooth: { damping: 20, mass: 1, stiffness: 120 },
  // Bouncy entrance for mascot and playful elements
  bouncy: { damping: 10, mass: 0.6, stiffness: 180 },
  // Gentle fill for water level gauge
  fill: { damping: 30, mass: 1.2, stiffness: 60 },
  // Quick pop for numbers and counters
  pop: { damping: 12, mass: 0.5, stiffness: 250 },
} as const;
