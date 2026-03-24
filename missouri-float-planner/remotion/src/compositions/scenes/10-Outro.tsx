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
import { EddyMascot } from "../../components/EddyMascot";
import { Subtitle } from "../../components/Subtitle";
import { scenes } from "../../lib/voiceover";

interface OutroSceneProps {
  format?: "landscape" | "portrait";
}

const scene = scenes[9];

/**
 * Scene 10: CTA + closing.
 * Eddy (flag variant), "Start Planning at eddy.guide", social handles.
 */
export const OutroScene: React.FC<OutroSceneProps> = ({
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ctaEntrance = spring({
    frame: frame - 30,
    fps,
    config: { damping: 12, mass: 0.8 },
  });

  const ctaY = interpolate(ctaEntrance, [0, 1], [30, 0]);

  // Fade in for social handles
  const socialFade = spring({
    frame: frame - 60,
    fps,
    config: { damping: 20, mass: 1 },
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #163F4A 0%, #0F2D35 100%)",
      }}
    >
      <Audio src={staticFile(`audio/voiceover/${scene.audioFile}`)} volume={1} />

      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0 L60 30 L30 60 L0 30Z' fill='none' stroke='%23fff' stroke-width='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 60px",
        }}
      />

      <AbsoluteFill className="flex flex-col items-center justify-center gap-8">
        <EddyMascot
          variant="flag"
          size={format === "portrait" ? 200 : 240}
          delay={5}
          float
        />

        {/* CTA */}
        <div
          style={{
            opacity: ctaEntrance,
            transform: `translateY(${ctaY}px)`,
          }}
        >
          <div
            className="px-10 py-4 rounded-xl bg-accent-500 text-white text-3xl font-bold tracking-tight border-2 border-accent-600"
            style={{
              fontFamily: "'Fredoka', system-ui, sans-serif",
              boxShadow: "4px 4px 0 #E5573F",
            }}
          >
            Start Planning at eddy.guide
          </div>
        </div>

        {/* Social handles */}
        <div
          className="flex gap-6 text-neutral-400 text-lg"
          style={{
            opacity: socialFade,
            fontFamily: "'Geist Sans', system-ui, sans-serif",
          }}
        >
          <span>@eddyfloatguide</span>
        </div>
      </AbsoluteFill>

      <Subtitle text={scene.script} delay={10} format={format} />
    </AbsoluteFill>
  );
};
