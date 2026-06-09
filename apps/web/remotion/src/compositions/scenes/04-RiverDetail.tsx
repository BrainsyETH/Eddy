import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { DevicePair } from "../../components/DevicePair";
import { Callout } from "../../components/Callout";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface RiverDetailSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[3];

/**
 * Scene 04: River detail with interactive map, access points, gauges.
 * Desktop + Phone in landscape; phone-only in portrait.
 */
export const RiverDetailScene: React.FC<RiverDetailSceneProps> = ({
  format = "landscape",
}) => {
  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        <DevicePair
          format={format}
          desktopScreenshot="river-detail.png"
          mobileScreenshot="river-detail-vertical.png"
          desktopUrl="eddy.guide/rivers/current"
          phoneDelay={140}
          desktopChildren={
            <>
              <Callout text="Interactive Map" x={40} y={30} delay={20} arrow="down" />
              <Callout text="Access Points" x={65} y={50} delay={60} arrow="left" />
              <Callout text="Gauge Station" x={25} y={55} delay={100} arrow="right" />
            </>
          }
          mobileChildren={
            <Callout text="Touch to Explore" x={50} y={30} delay={170} arrow="down" />
          }
        />

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
