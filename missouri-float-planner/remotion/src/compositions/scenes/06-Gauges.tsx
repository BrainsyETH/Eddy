import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { BrowserFrame } from "../../components/BrowserFrame";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Callout } from "../../components/Callout";
import { FeatureHighlight } from "../../components/FeatureHighlight";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface GaugesSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[5];

/**
 * Scene 06: Real-time gauges dashboard with sparkline animation.
 */
export const GaugesScene: React.FC<GaugesSceneProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Sparkline draw animation
  const sparklineProgress = interpolate(
    frame,
    [60, 150],
    [0, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <BrowserFrame url="eddy.guide/gauges" screenshotFile="gauges.png">
            <Callout text="USGS Gauge Data" x={50} y={18} delay={20} arrow="down" />
            <FeatureHighlight x={5} y={25} width={55} height={35} delay={60} />
            <Callout text="7-Day Sparkline" x={80} y={45} delay={100} arrow="left" />

            {/* Animated sparkline overlay (simplified SVG) */}
            <svg
              className="absolute"
              style={{ left: "10%", top: "40%", width: "40%", height: "15%" }}
              viewBox="0 0 200 50"
              preserveAspectRatio="none"
            >
              <polyline
                points="0,40 20,35 40,25 60,30 80,20 100,15 120,22 140,18 160,10 180,15 200,12"
                fill="none"
                stroke="#4EB86B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="400"
                strokeDashoffset={400 - (sparklineProgress / 100) * 400}
              />
            </svg>
          </BrowserFrame>
        ) : (
          <PhoneFrame screenshotFile="gauges-vertical.png">
            <Callout text="Real-Time Gauges" x={50} y={15} delay={20} arrow="down" />
            <Callout text="7-Day Trend" x={50} y={55} delay={80} arrow="down" />
          </PhoneFrame>
        )}

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
