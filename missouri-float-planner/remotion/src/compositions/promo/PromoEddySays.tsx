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

// Live Current River verdict (see /api/eddy-update/current). The card mirrors the
// site's "Eddy Says" feature — condition badge + plain-English read of the gauge.
const QUOTE =
  "Sitting at 3.0 ft, right at the bottom of the ideal range — clear, steady, and in fine shape. Conditions are excellent today.";
const CONDITION = "Flowing · Ideal";
const GAUGE_LINE = "Van Buren gauge · 3.0 ft · optimal 3.0–3.9 ft";
const FLOW = colors.support[400]; // healthy green

/** Beat — the "Eddy Says" verdict for the Current River, the reel's centerpiece.
 *  Words reveal in sequence so it reads as Eddy speaking. */
export const PromoEddySays: React.FC<{ format?: PromoFormat }> = ({ format = "portrait" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = format === "portrait";

  const badgeIn = spring({ frame: frame - 10, fps, config: ENTRANCE });
  const words = QUOTE.split(" ");
  const gaugeIn = spring({ frame: frame - 200, fps, config: ENTRANCE });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.primary[900], fontFamily: fontFamilies.body }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 950px at 50% 42%, ${colors.primary[700]} 0%, ${colors.primary[900]} 72%)`,
        }}
      />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: isPortrait ? "0 90px" : "0 200px",
          gap: 20,
        }}
      >
        <EddyMascot variant="green" size={isPortrait ? 200 : 168} />

        {/* EDDY SAYS + condition badge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div
            style={{
              fontFamily: fontFamilies.display,
              fontSize: isPortrait ? 34 : 30,
              fontWeight: 500,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: colors.accent[400],
            }}
          >
            Eddy Says
          </div>
          <div
            style={{
              opacity: badgeIn,
              transform: `scale(${interpolate(badgeIn, [0, 1], [0.8, 1])})`,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 24px",
              borderRadius: 999,
              border: `2px solid ${FLOW}`,
              background: "rgba(113,201,137,0.12)",
              color: FLOW,
              fontSize: isPortrait ? 30 : 26,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: 999, background: FLOW, boxShadow: `0 0 14px ${FLOW}` }} />
            {CONDITION}
          </div>
        </div>

        {/* The quote — words reveal in sequence */}
        <div
          style={{
            position: "relative",
            marginTop: 10,
            fontFamily: fontFamilies.display,
            fontSize: isPortrait ? 52 : 46,
            fontWeight: 500,
            lineHeight: 1.28,
            color: "#fff",
            textAlign: "center",
            maxWidth: isPortrait ? 900 : 1250,
            textShadow: "0 0 30px rgba(113,201,137,0.28)",
          }}
        >
          <span style={{ color: FLOW, opacity: 0.5 }}>“</span>
          {words.map((w, i) => {
            const wOpacity = interpolate(frame, [20 + i * 7, 20 + i * 7 + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span key={i} style={{ opacity: wOpacity }}>
                {w}
                {i < words.length - 1 ? " " : ""}
              </span>
            );
          })}
          <span style={{ color: FLOW, opacity: 0.5 }}>”</span>
        </div>

        {/* Gauge attribution */}
        <div
          style={{
            opacity: gaugeIn,
            marginTop: 14,
            fontFamily: fontFamilies.mono,
            fontSize: isPortrait ? 26 : 22,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 0.5,
          }}
        >
          {GAUGE_LINE}
        </div>
      </AbsoluteFill>
      <Watermark format={format} />
    </AbsoluteFill>
  );
};
