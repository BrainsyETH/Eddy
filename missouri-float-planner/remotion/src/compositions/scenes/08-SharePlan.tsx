import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";
import { DevicePair } from "../../components/DevicePair";
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
 * Desktop + Phone in landscape; phone-only in portrait.
 * Share button bounces on the phone frame.
 */
export const SharePlanScene: React.FC<SharePlanSceneProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Share button animation — appears on the phone after it fades in
  const shareButtonPop = spring({
    frame: frame - 150,
    fps,
    config: { damping: 8, mass: 0.5, stiffness: 150 },
  });

  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        <DevicePair
          format={format}
          desktopScreenshot="share-plan.png"
          mobileScreenshot="share-plan-vertical.png"
          desktopUrl="eddy.guide/plan/abc123"
          phoneDelay={120}
          desktopChildren={
            <>
              <Callout text="Trip Summary" x={35} y={30} delay={20} arrow="down" />
              <Callout text="Map Preview" x={70} y={45} delay={60} arrow="left" />
            </>
          }
          mobileChildren={
            <>
              {/* Animated share button on phone */}
              <div
                className="absolute flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-500 text-white font-semibold border-2 border-accent-600"
                style={{
                  left: "50%",
                  top: "15%",
                  transform: `translate(-50%, 0) scale(${shareButtonPop})`,
                  opacity: shareButtonPop,
                  boxShadow: "3px 3px 0 #E5573F",
                  fontFamily: "'Geist Sans', system-ui",
                  fontSize: "0.85rem",
                }}
              >
                Share Plan
              </div>
            </>
          }
        />

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
