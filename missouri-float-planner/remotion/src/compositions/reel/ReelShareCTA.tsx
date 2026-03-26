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
import { BOUNCY, ENTRANCE } from "../../lib/spring-presets";

const scene = reelScenes[4];

/**
 * Reel Scene 5: Share + CTA — share plan then eddy.guide CTA scales in.
 */
export const ReelShareCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneEntrance = spring({
    frame,
    fps,
    config: ENTRANCE,
  });

  // Share button bounce
  const shareButton = spring({
    frame: frame - 30,
    fps,
    config: { damping: 8, mass: 0.5, stiffness: 150 },
  });

  // CTA text scales in
  const ctaSpring = spring({
    frame: frame - 120,
    fps,
    config: BOUNCY,
  });
  const ctaScale = interpolate(ctaSpring, [0, 1], [0.5, 1]);

  // Phone fades out as CTA takes over
  const phoneOpacity = interpolate(
    frame,
    [110, 130],
    [1, 0.3],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #163F4A 0%, #0F2D35 100%)",
      }}
    >
      <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

      {/* Phone with share plan */}
      <AbsoluteFill className="flex items-center justify-center">
        <div style={{ opacity: phoneEntrance * phoneOpacity }}>
          <PhoneFrame screenshotFile="share-plan-vertical.png">
            {/* Animated share button */}
            <div
              className="absolute flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-500 text-white font-semibold border-2 border-accent-600"
              style={{
                left: "50%",
                top: "15%",
                transform: `translate(-50%, 0) scale(${shareButton})`,
                opacity: shareButton,
                boxShadow: "3px 3px 0 #E5573F",
                fontFamily: "'Geist Sans', system-ui",
              }}
            >
              Share Plan
            </div>
          </PhoneFrame>
        </div>
      </AbsoluteFill>

      {/* CTA overlay */}
      <AbsoluteFill className="flex items-center justify-center">
        <div
          className="px-8 py-4 rounded-xl bg-accent-500 border-2 border-accent-600"
          style={{
            transform: `scale(${ctaScale})`,
            opacity: ctaSpring,
            boxShadow: "4px 4px 0 #E5573F",
          }}
        >
          <span
            className="text-white font-bold"
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              fontSize: "2rem",
            }}
          >
            eddy.guide
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
