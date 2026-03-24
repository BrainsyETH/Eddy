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
import { BrowserFrame } from "../../components/BrowserFrame";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Callout } from "../../components/Callout";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface FloatPlannerSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[4];

/**
 * Scene 05: Float planner — put-in/take-out selector with animated stats.
 */
export const FloatPlannerScene: React.FC<FloatPlannerSceneProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animated counter for distance
  const counterProgress = spring({
    frame: frame - 120,
    fps,
    config: { damping: 20, mass: 1 },
  });
  const distance = Math.round(interpolate(counterProgress, [0, 1], [0, 8.5]) * 10) / 10;
  const hours = Math.round(interpolate(counterProgress, [0, 1], [0, 4]) * 10) / 10;

  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <BrowserFrame url="eddy.guide/rivers/current" screenshotFile="float-planner.png">
            <Callout text="Pick Put-In" x={30} y={35} delay={20} arrow="down" />
            <Callout text="Pick Take-Out" x={70} y={35} delay={60} arrow="down" />

            {/* Animated stats overlay */}
            <div
              className="absolute bottom-[15%] left-1/2 -translate-x-1/2 flex gap-8"
              style={{ opacity: counterProgress }}
            >
              <div className="bg-primary-800 text-white px-6 py-3 rounded-lg border-2 border-primary-600"
                style={{ boxShadow: "3px 3px 0 #1D525F", fontFamily: "'Geist Sans', system-ui" }}>
                <span className="text-2xl font-bold font-mono">{distance} mi</span>
              </div>
              <div className="bg-primary-800 text-white px-6 py-3 rounded-lg border-2 border-primary-600"
                style={{ boxShadow: "3px 3px 0 #1D525F", fontFamily: "'Geist Sans', system-ui" }}>
                <span className="text-2xl font-bold font-mono">~{hours} hrs</span>
              </div>
            </div>
          </BrowserFrame>
        ) : (
          <PhoneFrame screenshotFile="float-planner-vertical.png">
            <Callout text="Put-In" x={30} y={30} delay={20} arrow="down" />
            <Callout text="Take-Out" x={70} y={30} delay={60} arrow="down" />
          </PhoneFrame>
        )}

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
