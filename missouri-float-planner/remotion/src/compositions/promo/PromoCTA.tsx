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

/** Beat 5 — the call to action. Wordmark + the three-feature recap + URL. */
export const PromoCTA: React.FC<{ format?: PromoFormat }> = ({ format = "portrait" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = format === "portrait";

  const wordmark = spring({ frame: frame - 4, fps, config: BOUNCY });
  const recap = spring({ frame: frame - 16, fps, config: ENTRANCE });
  const cta = spring({ frame: frame - 28, fps, config: ENTRANCE });
  const wordScale = interpolate(wordmark, [0, 1], [0.7, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: fontFamilies.body }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 900px at 50% 44%, ${colors.primary[700]} 0%, ${colors.primary[900]} 72%)`,
        }}
      />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <EddyMascot variant="green" size={isPortrait ? 300 : 250} />
        <div
          style={{
            opacity: wordmark,
            transform: `scale(${wordScale})`,
            marginTop: 20,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 128 : 108,
            fontWeight: 600,
            color: colors.accent[500],
            textShadow: "0 0 44px rgba(240,112,82,0.45)",
          }}
        >
          eddy.guide
        </div>
        <div
          style={{
            opacity: recap,
            marginTop: 8,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 40 : 36,
            color: "#fff",
            letterSpacing: 1,
          }}
        >
          Live map · River levels · Float plans
        </div>
        <div
          style={{
            opacity: cta,
            marginTop: 30,
            fontFamily: fontFamilies.body,
            fontSize: isPortrait ? 34 : 30,
            color: "rgba(255,255,255,0.66)",
          }}
        >
          Check the rivers. Plan the float.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
