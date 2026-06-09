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
import { EddyMascot } from "../../components/EddyMascot";
import { Subtitle } from "../../components/Subtitle";
import { TransitionWipe } from "../../components/TransitionWipe";
import { scenes } from "../../lib/voiceover";

interface AskEddySceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[8];

/**
 * Scene 09: Ask Eddy AI chat — typing animation and Eddy mascot.
 */
export const AskEddyScene: React.FC<AskEddySceneProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Typing indicator dots animation
  const dot1 = Math.sin(frame / 5) > 0 ? 1 : 0.3;
  const dot2 = Math.sin((frame + 5) / 5) > 0 ? 1 : 0.3;
  const dot3 = Math.sin((frame + 10) / 5) > 0 ? 1 : 0.3;

  // Speech bubble entrance
  const bubbleEntrance = spring({
    frame: frame - 60,
    fps,
    config: { damping: 12, mass: 0.6 },
  });

  return (
    <TransitionWipe>
      <AbsoluteFill className="bg-neutral-50 flex items-center justify-center">
        <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

        {format === "landscape" ? (
          <>
            <div style={{ width: "65%" }}>
              <BrowserFrame url="eddy.guide/chat" screenshotFile="ask-eddy.png">
                {/* Typing indicator overlay */}
                <div
                  className="absolute flex gap-1 items-center px-4 py-2 bg-neutral-100 rounded-xl"
                  style={{ bottom: "12%", left: "8%" }}
                >
                  {[dot1, dot2, dot3].map((opacity, i) => (
                    <div
                      key={i}
                      className="w-2.5 h-2.5 rounded-full bg-primary-500"
                      style={{ opacity }}
                    />
                  ))}
                </div>
              </BrowserFrame>
            </div>

            {/* Eddy mascot with speech bubble */}
            <div className="absolute right-[5%] bottom-[15%] flex flex-col items-center">
              <div
                className="mb-4 px-5 py-3 rounded-xl bg-primary-800 text-white text-lg font-medium border-2 border-primary-600"
                style={{
                  opacity: bubbleEntrance,
                  transform: `scale(${bubbleEntrance})`,
                  boxShadow: "3px 3px 0 #1D525F",
                  fontFamily: "'Geist Sans', system-ui",
                  maxWidth: 280,
                }}
              >
                I can help with that!
              </div>
              <EddyMascot variant="standard" size={160} delay={30} />
            </div>
          </>
        ) : (
          <>
            <PhoneFrame screenshotFile="ask-eddy-vertical.png" />
            <div className="absolute bottom-[22%] right-[10%]">
              <EddyMascot variant="standard" size={100} delay={20} />
            </div>
          </>
        )}

        <Subtitle text={scene.script} delay={10} format={format} />
      </AbsoluteFill>
    </TransitionWipe>
  );
};
