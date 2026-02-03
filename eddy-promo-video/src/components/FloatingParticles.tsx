import React from "react";
import { useCurrentFrame } from "remotion";
import { COLORS } from "../lib/constants";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

// Generate deterministic particles
const generateParticles = (count: number): Particle[] => {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    // Use deterministic "random" based on index
    const seed = (i * 7919 + 104729) % 1000 / 1000;
    const seed2 = (i * 6547 + 9973) % 1000 / 1000;
    const seed3 = (i * 8713 + 7877) % 1000 / 1000;
    
    particles.push({
      id: i,
      x: seed * 100, // 0-100%
      y: seed2 * 100,
      size: 2 + seed3 * 4, // 2-6px
      speed: 0.3 + seed * 0.5, // Speed multiplier
      opacity: 0.2 + seed2 * 0.4, // 0.2-0.6
    });
  }
  return particles;
};

const particles = generateParticles(30);

interface FloatingParticlesProps {
  color?: string;
  count?: number;
}

/**
 * Ambient floating particles for atmosphere
 */
export const FloatingParticles: React.FC<FloatingParticlesProps> = ({
  color = COLORS.shallowBlue,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {particles.map((particle) => {
        // Calculate position based on frame
        const yOffset = (frame * particle.speed * 0.5) % 120 - 10;
        const xWobble = Math.sin(frame * 0.02 + particle.id) * 20;
        
        const y = ((particle.y - yOffset) % 120) - 10;
        const x = particle.x + xWobble * 0.1;

        return (
          <div
            key={particle.id}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: particle.size,
              height: particle.size,
              borderRadius: "50%",
              backgroundColor: color,
              opacity: particle.opacity,
              filter: "blur(1px)",
            }}
          />
        );
      })}
    </div>
  );
};
