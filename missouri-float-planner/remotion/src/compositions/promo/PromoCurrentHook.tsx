import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { Watermark } from "../../components/Watermark";
import { colors } from "../../design-tokens/colors";
import { fontFamilies } from "../../design-tokens/fonts";
import { ENTRANCE } from "../../lib/spring-presets";
import type { PromoFormat } from "./PromoScaffold";

/** Hook for the Current River reel — names the river up front. */
export const PromoCurrentHook: React.FC<{ format?: PromoFormat }> = ({ format = "portrait" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = format === "portrait";

  const eyebrow = spring({ frame: frame - 6, fps, config: ENTRANCE });
  const title = spring({ frame: frame - 12, fps, config: ENTRANCE });
  const sub = spring({ frame: frame - 24, fps, config: ENTRANCE });
  const titleY = interpolate(title, [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: fontFamilies.body }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 900px at 50% 40%, ${colors.primary[700]} 0%, ${colors.primary[900]} 72%)`,
        }}
      />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <EddyMascot variant="canoe" size={isPortrait ? 340 : 288} />
        <div
          style={{
            opacity: eyebrow,
            marginTop: 24,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 36 : 32,
            fontWeight: 500,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: colors.accent[400],
          }}
        >
          Today on the
        </div>
        <div
          style={{
            opacity: title,
            transform: `translateY(${titleY}px)`,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 120 : 100,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            lineHeight: 1.0,
            textShadow: `0 0 40px rgba(114,181,196,0.5)`,
          }}
        >
          Current River
        </div>
        <div
          style={{
            opacity: sub,
            marginTop: 24,
            fontFamily: fontFamilies.body,
            fontSize: isPortrait ? 40 : 36,
            color: "rgba(255,255,255,0.72)",
            textAlign: "center",
          }}
        >
          Is it floating? Ask Eddy.
        </div>
      </AbsoluteFill>
      <Watermark format={format} />
    </AbsoluteFill>
  );
};
