import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { BrandCTA } from "../../components/BrandCTA";
import { Watermark } from "../../components/Watermark";
import { PromoMedia, type Focus } from "./PromoMedia";
import { AutoCaptions } from "./AutoCaptions";
import { colors } from "../../design-tokens/colors";
import { fontFamilies } from "../../design-tokens/fonts";
import { ENTRANCE } from "../../lib/spring-presets";

export type PromoFormat = "portrait" | "landscape";

// Shared geometry shape for both orientations. colLeft/colWidth are the
// landscape-only left text column, so they're optional (portrait stacks instead
// of splitting) — this keeps `g = isPortrait ? P : L` a single, well-typed shape.
type Geom = {
  bandW: number;
  bandH: number;
  bandTop: number;
  bandLeft: number;
  mastheadTop: number;
  captionTop: number;
  footerTop: number;
  mascot: number;
  eyebrow: number;
  title: number;
  titlePad: number;
  colLeft?: number;
  colWidth?: number;
};

// Portrait (1080x1920): masthead high, chromed media band mid, captions + CTA low.
const P: Geom = {
  bandW: 1004,
  bandH: 565,
  bandTop: 582,
  bandLeft: (1080 - 1004) / 2,
  mastheadTop: 156,
  captionTop: 1300,
  footerTop: 1452,
  mascot: 132,
  eyebrow: 34,
  title: 68,
  titlePad: 90,
};

// Landscape (1920x1080): split — text column left, chromed media band right.
const L: Geom = {
  bandW: 1150,
  bandH: 647, // 16:9
  bandTop: 176,
  bandLeft: 690,
  colLeft: 96,
  colWidth: 560,
  mastheadTop: 250,
  captionTop: 560,
  footerTop: 760,
  mascot: 150,
  eyebrow: 30,
  title: 66,
  titlePad: 0,
};

type EddyVariant = React.ComponentProps<typeof EddyMascot>["variant"];

interface PromoScaffoldProps {
  eyebrow: string;
  title: string;
  /** Caption phrases, auto-spread across the beat's voiceover. */
  phrases: string[];
  image: string;
  video?: string | null;
  url: string;
  from: Focus;
  to: Focus;
  overlay?: React.ReactNode;
  mascot?: EddyVariant;
  accent?: string;
  glow?: string;
  cta?: string;
  format?: PromoFormat;
}

/**
 * Shared feature-beat frame. Portrait stacks masthead / media / caption / CTA;
 * landscape splits into a left text column beside a right media band. Both reuse
 * the same chromed Ken-Burns media, Eddy masthead, timed captions and CTA.
 */
export const PromoScaffold: React.FC<PromoScaffoldProps> = ({
  eyebrow,
  title,
  phrases,
  image,
  video,
  url,
  from,
  to,
  overlay,
  mascot = "canoe",
  accent = colors.primary[300],
  glow = "rgba(114,181,196,0.45)",
  cta,
  format = "portrait",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const eyebrowIn = spring({ frame, fps, config: ENTRANCE });
  const titleIn = spring({ frame: frame - 8, fps, config: ENTRANCE });
  const g = format === "portrait" ? P : L;
  const isPortrait = format === "portrait";

  const masthead = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isPortrait ? "center" : "flex-start",
        textAlign: isPortrait ? "center" : "left",
      }}
    >
      <EddyMascot variant={mascot} size={g.mascot} />
      <div
        style={{
          opacity: eyebrowIn,
          marginTop: 10,
          fontFamily: fontFamilies.display,
          fontSize: g.eyebrow,
          fontWeight: 500,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: colors.accent[400],
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          opacity: titleIn,
          marginTop: 8,
          fontFamily: fontFamilies.display,
          fontSize: g.title,
          fontWeight: 600,
          color: "#fff",
          lineHeight: 1.02,
          padding: isPortrait ? `0 ${g.titlePad}px` : 0,
          textShadow: `0 0 34px ${glow}`,
        }}
      >
        {title}
      </div>
    </div>
  );

  const mediaBand = (
    <PromoMedia
      image={image}
      video={video}
      from={from}
      to={to}
      width={g.bandW}
      height={g.bandH}
      url={url}
    >
      {overlay}
    </PromoMedia>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: fontFamilies.body }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 900px at ${isPortrait ? "50% 46%" : "62% 50%"}, ${colors.primary[700]} 0%, ${colors.primary[900]} 70%)`,
        }}
      />

      {isPortrait ? (
        <>
          <div style={{ position: "absolute", top: g.mastheadTop, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            {masthead}
          </div>
          <div style={{ position: "absolute", top: g.bandTop, left: g.bandLeft }}>{mediaBand}</div>
          <div style={{ position: "absolute", top: g.captionTop, left: 50, right: 50, display: "flex", justifyContent: "center" }}>
            <AutoCaptions phrases={phrases} />
          </div>
          <div style={{ position: "absolute", top: g.footerTop, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <BrandCTA color={accent} text={cta} />
          </div>
        </>
      ) : (
        <>
          <div style={{ position: "absolute", top: g.bandTop, left: g.bandLeft }}>{mediaBand}</div>
          <div style={{ position: "absolute", top: g.mastheadTop, left: g.colLeft, width: g.colWidth }}>{masthead}</div>
          <div style={{ position: "absolute", top: g.captionTop, left: g.colLeft, width: g.colWidth }}>
            <AutoCaptions phrases={phrases} />
          </div>
          <div style={{ position: "absolute", top: g.footerTop, left: g.colLeft, width: g.colWidth, display: "flex", justifyContent: "flex-start" }}>
            <BrandCTA color={accent} text={cta} isPortrait={false} />
          </div>
        </>
      )}

      <Watermark format={format} />
    </AbsoluteFill>
  );
};
