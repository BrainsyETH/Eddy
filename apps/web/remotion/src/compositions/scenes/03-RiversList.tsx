import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { DevicePair } from "../../components/DevicePair";
import { Callout } from "../../components/Callout";
import { FeatureHighlight } from "../../components/FeatureHighlight";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface RiversListSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[2];

/**
 * Scene 03: Browse all 8 rivers with live condition badges.
 * Desktop + Phone in landscape; phone-only in portrait.
 */
export const RiversListScene: React.FC<RiversListSceneProps> = ({
  format = "landscape",
}) => {
  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        <DevicePair
          format={format}
          desktopScreenshot="rivers-list.png"
          mobileScreenshot="rivers-list-vertical.png"
          desktopUrl="eddy.guide/rivers"
          phoneDelay={120}
          desktopChildren={
            <>
              <Callout text="8 Float Rivers" x={50} y={20} delay={20} arrow="down" />
              <FeatureHighlight x={5} y={30} width={42} height={30} delay={60} />
              <Callout text="Live Condition Badges" x={75} y={45} delay={100} arrow="left" />
            </>
          }
          mobileChildren={
            <Callout text="Mobile Friendly" x={50} y={20} delay={150} arrow="down" />
          }
        />

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
