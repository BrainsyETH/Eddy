import React from "react";
import { fontFamilies } from "../design-tokens/fonts";
import {
  CALLOUT,
  calloutStyle,
  cardStyle,
  conditionInk,
  inkOn,
  pillStyle,
  SURFACES,
  tileStyle,
  TYPE,
  type SocialTone,
} from "../../../shared/social-brand";

// The card primitives of the social design system. Every panel on a reel is one
// of these — a card, a tile inside a card, a pill, or a callout with a coloured
// header — drawn from shared/social-brand.ts so the covers match by construction.

interface BrandCardProps {
  tone?: SocialTone;
  /** Border colour override (a condition colour on the dark tone). */
  accent?: string;
  padding?: number | string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** A panel: white (light) / deep teal (dark), thick rule, hard offset shadow. */
export const BrandCard: React.FC<BrandCardProps> = ({ tone = "light", accent, padding = 18, style, children }) => (
  <div style={{ ...cardStyle(tone, accent), padding, ...style }}>{children}</div>
);

interface StatTileProps {
  value: string;
  /** Unit drawn small and mono beside the value ("HRS", "MI"). */
  unit?: string;
  label: string;
  /** Value colour — a condition colour for the Conditions tile. Auto-darkened
   *  on the light surface so yellow / lime stay legible on cream. */
  color?: string;
  /** Word values ("Flowing", "Class I–II") use the smaller step. */
  compact?: boolean;
  tone?: SocialTone;
  minHeight?: number;
}

/** A stat inside a dock: a big number (or word) over a small uppercase caption. */
export const StatTile: React.FC<StatTileProps> = ({
  value,
  unit,
  label,
  color,
  compact = false,
  tone = "light",
  minHeight = 112,
}) => {
  const s = SURFACES[tone];
  const step = compact ? TYPE.statWord : TYPE.statValue;
  return (
    <div
      style={{
        ...tileStyle(tone),
        minHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "10px 8px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: fontFamilies.display,
          fontSize: step.size,
          lineHeight: step.lineHeight,
          fontWeight: step.weight,
          color: color ? conditionInk(color, tone) : s.ink,
          whiteSpace: "nowrap",
        }}
      >
        {value}
        {unit ? (
          <span
            style={{
              marginLeft: 5,
              fontFamily: fontFamilies.mono,
              fontSize: TYPE.statUnit.size,
              fontWeight: TYPE.statUnit.weight,
              color: s.inkMuted,
            }}
          >
            {unit}
          </span>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: TYPE.statLabel.size,
          fontWeight: TYPE.statLabel.weight,
          letterSpacing: TYPE.statLabel.tracking,
          textTransform: "uppercase",
          color: s.inkMuted,
        }}
      >
        {label}
      </div>
    </div>
  );
};

interface BrandPillProps {
  /** Fill colour; the text colour is chosen for contrast automatically. */
  fill: string;
  tone?: SocialTone;
  /** Type size (TYPE.label by default). */
  size?: number;
  /** A small leading glyph slot (a dot, an otter). */
  leading?: React.ReactNode;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** A filled, black-ruled chip — the series label, a condition badge. */
export const BrandPill: React.FC<BrandPillProps> = ({ fill, tone = "light", size = TYPE.label.size, leading, style, children }) => (
  <span
    style={{
      ...pillStyle(tone, fill),
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      padding: `${Math.round(size * 0.32)}px ${Math.round(size * 0.75)}px`,
      fontFamily: fontFamilies.display,
      fontSize: size,
      fontWeight: TYPE.label.weight,
      color: inkOn(fill),
      letterSpacing: TYPE.label.tracking,
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {leading}
    {children}
  </span>
);

interface BrandCalloutProps {
  tone?: SocialTone;
  /** Header fill; the header text is inked for contrast. */
  accent: string;
  /** Header contents (a kind glyph + an uppercase kind label). */
  header: React.ReactNode;
  /** Something drawn at the header's right edge (a badge). */
  headerAside?: React.ReactNode;
  width?: number;
  opacity?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/** A card with a coloured header strip — the route reel's stop callouts. */
export const BrandCallout: React.FC<BrandCalloutProps> = ({
  tone = "light",
  accent,
  header,
  headerAside,
  width,
  opacity = 1,
  style,
  children,
}) => (
  <div style={{ ...calloutStyle(tone), width, opacity, overflow: "hidden", ...style }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: headerAside ? "space-between" : "flex-start",
        gap: 10,
        padding: "9px 14px",
        background: accent,
        color: inkOn(accent),
        borderBottom: `${CALLOUT.border - 1}px solid ${SURFACES[tone].rule}`,
        fontFamily: fontFamilies.display,
        fontSize: TYPE.calloutHeader.size,
        fontWeight: TYPE.calloutHeader.weight,
        letterSpacing: TYPE.calloutHeader.tracking,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", textOverflow: "ellipsis" }}>
        {header}
      </span>
      {headerAside}
    </div>
    <div style={{ padding: "14px 17px 15px" }}>{children}</div>
  </div>
);

/** The small circled glyph a callout header opens with ("IN", "C", "!"). */
export const KindBadge: React.FC<{ children: React.ReactNode; tone?: SocialTone }> = ({ children, tone = "light" }) => {
  const s = SURFACES[tone];
  return (
    <span
      style={{
        minWidth: 30,
        height: 30,
        padding: "0 9px",
        display: "grid",
        placeItems: "center",
        borderRadius: 999,
        border: `2px solid ${s.chipRule}`,
        background: s.tone === "light" ? "#F7F6F3" : "#FFFFFF",
        color: "#2D2A24",
        fontFamily: fontFamilies.mono,
        fontSize: 13,
        fontWeight: 850,
        letterSpacing: 0,
      }}
    >
      {children}
    </span>
  );
};
