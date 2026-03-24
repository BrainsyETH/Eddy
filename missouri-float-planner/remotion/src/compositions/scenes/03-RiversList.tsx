import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { BrowserFrame } from "../../components/BrowserFrame";
import { PhoneFrame } from "../../components/PhoneFrame";
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
 */
export const RiversListScene: React.FC<RiversListSceneProps> = ({
  format = "landscape",
}) => {
  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <BrowserFrame url="eddy.guide/rivers" screenshotFile="rivers-list.png">
            <Callout text="8 Float Rivers" x={50} y={20} delay={20} arrow="down" />
            <FeatureHighlight x={5} y={30} width={42} height={30} delay={60} />
            <Callout text="Live Condition Badges" x={75} y={45} delay={100} arrow="left" />
          </BrowserFrame>
        ) : (
          <PhoneFrame screenshotFile="rivers-list-vertical.png">
            <Callout text="8 Rivers" x={50} y={15} delay={20} arrow="down" />
            <Callout text="Live Conditions" x={50} y={50} delay={80} arrow="down" />
          </PhoneFrame>
        )}

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
