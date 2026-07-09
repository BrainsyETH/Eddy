import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { promoScenes, getSceneFrames } from "../lib/voiceover";
import { Montage } from "../lib/montage";
import { PromoHook } from "./promo/PromoHook";
import { PromoLiveMap } from "./promo/PromoLiveMap";
import { PromoLevels } from "./promo/PromoLevels";
import { PromoPlan } from "./promo/PromoPlan";
import { PromoCTA } from "./promo/PromoCTA";

export interface PromoFullProps {
  /** Optional live-motion clip for the map beat, relative to public/
   *  (e.g. "video/promo-map-portrait.mp4"). Falls back to the Ken-Burns still. */
  mapClip?: string | null;
  /** Output aspect — portrait reel (default) or landscape. */
  format?: "portrait" | "landscape";
  /** Play per-beat narration from public/audio/voiceover/. Off = music-only cut. */
  voiceover?: boolean;
}

/**
 * 3-feature product promo (~39s): hook → live river map → river levels → plan a
 * float → CTA. Renders as a 1080x1920 reel or a 1920x1080 landscape cut.
 * Background music under on-screen captions; voiceover can be layered in later
 * (see promoScenes audioFile names).
 */
export const PromoFull: React.FC<PromoFullProps> = ({
  mapClip = null,
  format = "portrait",
  voiceover = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Duck the bed under narration; a touch louder for the music-only cut.
  const musicPeak = voiceover ? 0.055 : 0.14;
  const musicVolume = interpolate(
    frame,
    [0, 20, durationInFrames - 45, durationInFrames],
    [0, musicPeak, musicPeak, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const vo = (i: number) =>
    voiceover ? (
      <Audio src={staticFile(`audio/voiceover/${promoScenes[i].audioFile}`)} volume={1} />
    ) : null;

  // Feature beats, in order. Each keeps its own narration; the montage overlaps
  // adjacent beats and blends them (slide → soft fade into the CTA) so the promo
  // plays as one continuous piece instead of five hard cuts.
  const beats = [
    <PromoHook format={format} />,
    <PromoLiveMap video={mapClip} format={format} />,
    <PromoLevels format={format} />,
    <PromoPlan format={format} />,
    <PromoCTA format={format} />,
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "#0F2D35" }}>
      {/* Gapless 65s bed (crossfade-concatenated from the trimmed loop) — the raw
          background-music.wav has ~1.7s of trailing silence, so looping it left an
          audible gap at each repeat. This bed is longer than the promo, no loop. */}
      <Audio src={staticFile("audio/promo-music-bed.wav")} volume={musicVolume} />

      <Montage
        scenes={promoScenes.map((scene, i) => ({
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
