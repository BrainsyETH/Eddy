import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { BrowserFrame } from "../../components/BrowserFrame";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Callout } from "../../components/Callout";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface SharePlanSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[7];

/**
 * Scene 08: Share your float plan with a link.
 */
export const SharePlanScene: React.FC<SharePlanSceneProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Share button animation
  const shareButtonPop = spring({
    frame: frame - 90,
    fps,
    config: { damping: 8, mass: 0.5, stiffness: 150 },
  });

  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <BrowserFrame url="eddy.guide/plan/abc123" screenshotFile="share-plan.png">
            <Callout text="Trip Summary" x={35} y={30} delay={20} arrow="down" />
            <Callout text="Map Preview" x={70} y={45} delay={60} arrow="left" />

            {/* Animated share button */}
            <div
              className="absolute flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-500 text-white font-semibold border-2 border-accent-600"
              style={{
                right: "15%",
                top: "20%",
                transform: `scale(${shareButtonPop})`,
                opacity: shareButtonPop,
                boxShadow: "3px 3px 0 #E5573F",
                fontFamily: "'Geist Sans', system-ui",
              }}
            >
              Share Plan
            </div>
          </BrowserFrame>
        ) : (
          <PhoneFrame screenshotFile="share-plan-vertical.png">
            <Callout text="One Link" x={50} y={25} delay={20} arrow="down" />
            <Callout text="All Details" x={50} y={60} delay={70} arrow="down" />
          </PhoneFrame>
        )}

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
