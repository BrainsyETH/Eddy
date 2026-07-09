import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { currentScenes, getSceneFrames } from "../lib/voiceover";
import { Montage } from "../lib/montage";
import { PromoCurrentHook } from "./promo/PromoCurrentHook";
import { PromoEddySays } from "./promo/PromoEddySays";
import { PromoScaffold, type PromoFormat } from "./promo/PromoScaffold";
import { HighlightRing } from "./promo/PromoMedia";
import { PromoCurrentCTA } from "./promo/PromoCurrentCTA";
import { colors } from "../design-tokens/colors";

export interface PromoCurrentProps {
  format?: PromoFormat;
  voiceover?: boolean;
}

const PLAN_PHRASES = [
  "The classic float: Akers Ferry to Pulltite Spring",
  "9.6 river miles · about 4–6 hours on the water",
];

/**
 * Current River focus reel (~30s): hook → Eddy Says verdict → plan the float
 * (Akers → Pulltite) → CTA. Renders portrait (1080x1920) or landscape.
 */
export const PromoCurrent: React.FC<PromoCurrentProps> = ({ format = "portrait", voiceover = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const musicPeak = voiceover ? 0.055 : 0.14;
  const musicVolume = interpolate(
    frame,
    [0, 20, durationInFrames - 45, durationInFrames],
    [0, musicPeak, musicPeak, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const vo = (i: number) =>
    voiceover ? <Audio src={staticFile(`audio/voiceover/${currentScenes[i].audioFile}`)} volume={1} /> : null;

  // Beats in order; the montage overlaps and blends them into one continuous cut.
  const beats = [
    <PromoCurrentHook format={format} />,
    <PromoEddySays format={format} />,
    <PromoScaffold
      format={format}
      eyebrow="Plan the Float"
      title="Akers → Pulltite"
      phrases={PLAN_PHRASES}
      image="promo/plan-current.png"
      url="eddy.guide/plan"
      from={{ scale: 1.14, x: 150, y: 40 }}
      to={{ scale: 1.26, x: 168, y: 20 }}
      mascot="flag"
      accent={colors.primary[300]}
      glow="rgba(114,181,196,0.45)"
      cta="9.6 mi · ~4–6 hrs · Class I–II"
      overlay={<HighlightRing x={20} y={34} size={150} delay={40} />}
    />,
    <PromoCurrentCTA format={format} />,
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "#0F2D35" }}>
      <Audio src={staticFile("audio/promo-music-bed.wav")} volume={musicVolume} />

      <Montage
        scenes={currentScenes.map((scene, i) => ({
          durationInFrames: getSceneFrames(scene),
          content: (
            <>
              {vo(i)}
              {beats[i]}
            </>
          ),
        }))}
      />
    </AbsoluteFill>
  );
};
