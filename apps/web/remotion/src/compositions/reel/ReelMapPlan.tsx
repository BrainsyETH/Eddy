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
import { SNAPPY } from "../../lib/spring-presets";

const scene = reelScenes[2];

/**
 * Reel Scene 3: Map + Plan — river detail transitions to float planner.
 * Quick crossfade between map view and planner with animated counter.
 */
export const ReelMapPlan: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // First half: river detail map; second half: float planner
  const transitionPoint = 90; // frame 90 = 3 seconds in
  const showPlanner = frame >= transitionPoint;

  // Crossfade between screenshots
  const crossfade = spring({
    frame: frame - transitionPoint,
    fps,
    config: SNAPPY,
  });

  // Animated counter for float planner
  const counterProgress = spring({
    frame: frame - transitionPoint - 15,
    fps,
    config: { damping: 20, mass: 1 },
  });
  const distance = Math.round(interpolate(counterProgress, [0, 1], [0, 8.5]) * 10) / 10;
  const hours = Math.round(interpolate(counterProgress, [0, 1], [0, 4]) * 10) / 10;

  return (
    <AbsoluteFill className="bg-neutral-100 flex items-center justify-center">
      <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

      {/* Map view (fades out) */}
      <AbsoluteFill
        className="flex items-center justify-center"
        style={{ opacity: showPlanner ? 1 - crossfade : 1 }}
      >
        <PhoneFrame screenshotFile="river-detail-vertical.png">
          <Callout text="Tap to Plan" x={50} y={25} delay={15} arrow="down" />
        </PhoneFrame>
      </AbsoluteFill>

      {/* Planner view (fades in) */}
      {showPlanner && (
        <AbsoluteFill
          className="flex items-center justify-center"
          style={{ opacity: crossfade }}
        >
          <PhoneFrame screenshotFile="float-planner-vertical.png">
            <Callout text="Put-In" x={30} y={25} delay={transitionPoint + 10} arrow="down" />
            <Callout text="Take-Out" x={70} y={25} delay={transitionPoint + 30} arrow="down" />

            {/* Animated stats */}
            <div
              className="absolute bottom-[20%] left-1/2 -translate-x-1/2 flex gap-4"
              style={{ opacity: counterProgress }}
            >
              <div className="bg-primary-800 text-white px-4 py-2 rounded-lg border-2 border-primary-600"
                style={{ boxShadow: "3px 3px 0 #1D525F", fontFamily: "'Geist Sans', system-ui" }}>
                <span className="text-lg font-bold font-mono">{distance} mi</span>
              </div>
              <div className="bg-primary-800 text-white px-4 py-2 rounded-lg border-2 border-primary-600"
                style={{ boxShadow: "3px 3px 0 #1D525F", fontFamily: "'Geist Sans', system-ui" }}>
                <span className="text-lg font-bold font-mono">~{hours} hrs</span>
              </div>
            </div>
          </PhoneFrame>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
