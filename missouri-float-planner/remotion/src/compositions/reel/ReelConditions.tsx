import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Callout } from "../../components/Callout";
import { reelScenes } from "../../lib/voiceover";
import { ENTRANCE } from "../../lib/spring-presets";

const scene = reelScenes[1];

/**
 * Reel Scene 2: Live Conditions — rivers list with pulsing condition badges.
 */
export const ReelConditions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneEntrance = spring({
    frame,
    fps,
    config: ENTRANCE,
  });

  const phoneY = interpolate(phoneEntrance, [0, 1], [40, 0]);

  // Pulsing glow on badges area
  const pulse = Math.sin(frame / 10) * 0.2 + 0.8;

  return (
    <AbsoluteFill className="bg-neutral-100 flex items-center justify-center">
      <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

      <div
        style={{
          opacity: phoneEntrance,
          transform: `translateY(${phoneY}px)`,
        }}
      >
        <PhoneFrame screenshotFile="rivers-list-vertical.png">
          {/* Highlight condition badges with pulsing glow */}
          <div
            className="absolute rounded-lg pointer-events-none"
            style={{
              left: "55%",
              top: "15%",
              width: "40%",
              height: "70%",
              border: "2px solid #F07052",
              boxShadow: `0 0 15px rgba(240, 112, 82, ${pulse * 0.4})`,
              opacity: pulse,
            }}
          />
          <Callout text="Live Conditions" x={30} y={12} delay={30} arrow="down" />
        </PhoneFrame>
      </div>
    </AbsoluteFill>
  );
};
