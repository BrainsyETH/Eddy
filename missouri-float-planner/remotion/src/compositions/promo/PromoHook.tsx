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

/** Beat 1 — the hook. A quick branded title card to stop the scroll. */
export const PromoHook: React.FC<{ format?: PromoFormat }> = ({ format = "portrait" }) => {
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
        <EddyMascot variant="canoe" size={isPortrait ? 360 : 300} />
        <div
          style={{
            opacity: eyebrow,
            marginTop: 24,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 38 : 34,
            fontWeight: 500,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: colors.accent[400],
          }}
        >
          Ozark Float Season
        </div>
        <div
          style={{
            opacity: title,
            transform: `translateY(${titleY}px)`,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 104 : 88,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            lineHeight: 1.0,
            padding: "0 70px",
            textShadow: `0 0 40px rgba(114,181,196,0.5)`,
          }}
        >
          {isPortrait ? (
            <>
              Is your river
              <br />
              running?
            </>
          ) : (
            <>Is your river running?</>
          )}
        </div>
        <div
          style={{
            opacity: sub,
            marginTop: 26,
            fontFamily: fontFamilies.body,
            fontSize: isPortrait ? 40 : 36,
            color: "rgba(255,255,255,0.72)",
            textAlign: "center",
            padding: "0 90px",
          }}
        >
          Find out before you load the cooler.
        </div>
      </AbsoluteFill>
      <Watermark format="portrait" />
    </AbsoluteFill>
  );
};
