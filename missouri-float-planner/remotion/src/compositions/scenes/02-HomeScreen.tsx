import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { BrowserFrame } from "../../components/BrowserFrame";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Callout } from "../../components/Callout";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface HomeSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[1];

/**
 * Scene 02: Home page walkthrough.
 * Shows hero, Eddy Says report, and featured rivers with animated callouts.
 */
export const HomeScene: React.FC<HomeSceneProps> = ({
  format = "landscape",
}) => {
  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <BrowserFrame url="eddy.guide" screenshotFile="home.png">
            <Callout text="Daily River Report" x={50} y={35} delay={30} arrow="down" />
            <Callout text="Live Conditions" x={25} y={65} delay={90} arrow="down" />
            <Callout text="Featured Rivers" x={75} y={65} delay={150} arrow="down" />
          </BrowserFrame>
        ) : (
          <PhoneFrame screenshotFile="home-vertical.png">
            <Callout text="Daily Report" x={50} y={30} delay={30} arrow="down" />
            <Callout text="Live Conditions" x={50} y={60} delay={90} arrow="down" />
          </PhoneFrame>
        )}

        <Subtitle text={scene.script} delay={15} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
