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

const scene = reelScenes[3];

/**
 * Reel Scene 4: Gauges — USGS water levels with sparkline draw animation.
 */
export const ReelGauges: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneEntrance = spring({
    frame,
    fps,
    config: ENTRANCE,
  });

  const phoneY = interpolate(phoneEntrance, [0, 1], [30, 0]);

  // Sparkline draw progress
  const sparklineProgress = interpolate(
    frame,
    [40, 120],
    [0, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill className="bg-neutral-100 flex items-center justify-center">
      <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

      <div
        style={{
          opacity: phoneEntrance,
          transform: `translateY(${phoneY}px)`,
        }}
      >
        <PhoneFrame screenshotFile="gauges-vertical.png">
          <Callout text="USGS Data" x={50} y={10} delay={20} arrow="down" />

          {/* Animated sparkline overlay */}
          <svg
            className="absolute pointer-events-none"
            style={{ left: "5%", top: "30%", width: "90%", height: "25%" }}
            viewBox="0 0 200 50"
            preserveAspectRatio="none"
          >
            <polyline
              points="0,40 20,35 40,25 60,30 80,20 100,15 120,25 140,18 160,22 180,12 200,10"
              fill="none"
              stroke="#F07052"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="300"
              strokeDashoffset={300 - (sparklineProgress / 100) * 300}
            />
          </svg>

          <Callout text="7-Day Trend" x={50} y={60} delay={80} arrow="up" />
        </PhoneFrame>
      </div>
    </AbsoluteFill>
  );
};
