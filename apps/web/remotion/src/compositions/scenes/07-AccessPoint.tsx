import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import { BrowserFrame } from "../../components/BrowserFrame";
import { PhoneFrame } from "../../components/PhoneFrame";
import { Callout } from "../../components/Callout";
import { FeatureHighlight } from "../../components/FeatureHighlight";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface AccessPointSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[6];

/**
 * Scene 07: Access point detail — facilities, amenities, services.
 */
export const AccessPointScene: React.FC<AccessPointSceneProps> = ({
  format = "landscape",
}) => {
  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <BrowserFrame
            url="eddy.guide/rivers/current/access/akers-ferry"
            screenshotFile="access-point.png"
          >
            <Callout text="Parking Info" x={25} y={35} delay={20} arrow="down" />
            <Callout text="Facilities" x={55} y={35} delay={60} arrow="down" />
            <FeatureHighlight x={5} y={50} width={90} height={25} delay={100} />
            <Callout text="Nearby Outfitters" x={75} y={80} delay={140} arrow="up" />
          </BrowserFrame>
        ) : (
          <PhoneFrame screenshotFile="access-point-vertical.png">
            <Callout text="Facilities" x={50} y={30} delay={20} arrow="down" />
            <Callout text="Outfitters" x={50} y={65} delay={80} arrow="down" />
          </PhoneFrame>
        )}

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
