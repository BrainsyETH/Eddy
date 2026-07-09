import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { EddyMascot } from "../../components/EddyMascot";
import { colors } from "../../design-tokens/colors";
import { fontFamilies } from "../../design-tokens/fonts";
import { ENTRANCE, BOUNCY } from "../../lib/spring-presets";
import type { PromoFormat } from "./PromoScaffold";

/** CTA for the Current River reel — sends the viewer to the river page. */
export const PromoCurrentCTA: React.FC<{ format?: PromoFormat }> = ({ format = "portrait" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = format === "portrait";

  const mascot = spring({ frame: frame - 2, fps, config: BOUNCY });
  const url = spring({ frame: frame - 10, fps, config: BOUNCY });
  const sub = spring({ frame: frame - 22, fps, config: ENTRANCE });
  const urlScale = interpolate(url, [0, 1], [0.72, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: fontFamilies.body }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 900px at 50% 44%, ${colors.primary[700]} 0%, ${colors.primary[900]} 72%)`,
        }}
      />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div style={{ opacity: mascot }}>
          <EddyMascot variant="green" size={isPortrait ? 290 : 240} />
        </div>
        <div
          style={{
            opacity: url,
            transform: `scale(${urlScale})`,
            marginTop: 18,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 78 : 66,
            fontWeight: 600,
            color: colors.accent[500],
            textAlign: "center",
            textShadow: "0 0 44px rgba(240,112,82,0.45)",
          }}
        >
          eddy.guide/rivers/current
        </div>
        <div
          style={{
            opacity: sub,
            marginTop: 18,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 40 : 34,
            color: "#fff",
            letterSpacing: 1,
          }}
        >
          Conditions · Eddy&apos;s verdict · Float plans
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
