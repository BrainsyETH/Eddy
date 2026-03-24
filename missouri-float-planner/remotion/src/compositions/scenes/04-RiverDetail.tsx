import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { BrowserFrame } from "../../components/BrowserFrame";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Callout } from "../../components/Callout";
import { FeatureHighlight } from "../../components/FeatureHighlight";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface RiverDetailSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[3];

/**
 * Scene 04: River detail with interactive map, access points, gauges.
 */
export const RiverDetailScene: React.FC<RiverDetailSceneProps> = ({
  format = "landscape",
}) => {
  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <BrowserFrame url="eddy.guide/rivers/current" screenshotFile="river-detail.png">
            <Callout text="Interactive Map" x={40} y={30} delay={20} arrow="down" />
            <Callout text="Access Points" x={65} y={50} delay={60} arrow="left" />
            <Callout text="Gauge Station" x={25} y={55} delay={100} arrow="right" />
            <Callout text="Hazard Markers" x={50} y={70} delay={140} arrow="up" />
          </BrowserFrame>
        ) : (
          <PhoneFrame screenshotFile="river-detail-vertical.png">
            <Callout text="Map" x={50} y={25} delay={20} arrow="down" />
            <Callout text="Access Points" x={50} y={50} delay={70} arrow="down" />
            <Callout text="Gauges" x={50} y={75} delay={120} arrow="up" />
          </PhoneFrame>
        )}

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
