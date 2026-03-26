import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { DevicePair } from "../../components/DevicePair";
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
 * Desktop + Phone in landscape; phone-only in portrait.
 */
export const HomeScene: React.FC<HomeSceneProps> = ({
  format = "landscape",
}) => {
  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        <DevicePair
          format={format}
          desktopScreenshot="home.png"
          mobileScreenshot="home-vertical.png"
          desktopUrl="eddy.guide"
          phoneDelay={150}
          desktopChildren={
            <>
              <Callout text="Daily River Report" x={50} y={35} delay={30} arrow="down" />
              <Callout text="Live Conditions" x={25} y={65} delay={90} arrow="down" />
            </>
          }
          mobileChildren={
            <Callout text="On the Go" x={50} y={30} delay={180} arrow="down" />
          }
        />

        <Subtitle text={scene.script} delay={15} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
