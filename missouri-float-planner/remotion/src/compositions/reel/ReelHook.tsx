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
import { reelScenes } from "../../lib/voiceover";
import { BOUNCY } from "../../lib/spring-presets";

const scene = reelScenes[0];

/**
 * Reel Scene 1: Hook — "Planning a float trip? You need this."
 * Bold text scales up, phone with home screenshot fades in behind.
 */
export const ReelHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bold text scales up
  const textSpring = spring({
    frame,
    fps,
    config: BOUNCY,
  });
  const textScale = interpolate(textSpring, [0, 1], [0.3, 1]);

  // Phone fades in behind the text
  const phoneSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 20, mass: 0.8, stiffness: 80 },
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #163F4A 0%, #0F2D35 100%)",
      }}
    >
      <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

      {/* Phone behind text */}
      <AbsoluteFill className="flex items-center justify-center">
        <div
          style={{
            opacity: phoneSpring * 0.4,
            transform: `scale(${interpolate(phoneSpring, [0, 1], [0.9, 1])})`,
          }}
        >
          <PhoneFrame screenshotFile="home-vertical.png" />
        </div>
      </AbsoluteFill>

      {/* Bold hook text */}
      <AbsoluteFill className="flex items-center justify-center">
        <h1
          className="text-white text-center font-bold px-8"
          style={{
            fontFamily: "'Fredoka', system-ui, sans-serif",
            fontSize: "3.5rem",
            lineHeight: 1.2,
            transform: `scale(${textScale})`,
            opacity: textSpring,
            textShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          Plan Your
          <br />
          <span style={{ color: "#F07052" }}>Float.</span>
        </h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
