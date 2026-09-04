import React from "react";
import { AbsoluteFill, Img } from "remotion";
import { fontFamilies } from "../design-tokens/fonts";
import { SURFACES, severityGround, type SocialTone } from "../../../shared/social-brand";

interface ReelPageProps {
  /** `light` (default) for editorial reels; `dark` is the severity surface. */
  tone?: SocialTone;
  /** Dark tone only: wash the ground faintly toward a condition colour. */
  severity?: string;
  /** Optional photo behind everything, dimmed to a texture (light tone) or
   *  laid under a scrim (dark tone). A dead URL degrades to the solid ground. */
  backdrop?: { src: string; opacity?: number; scrim?: string };
  /** Whole-page opacity (the loop envelope). */
  opacity?: number;
  children: React.ReactNode;
}

/**
 * The page every social reel is drawn on: the tone's ground colour, the body
 * font and ink, clipped to the canvas. Compositions put a ReelMasthead at
 * REEL_SAFE.top, their own stage in the middle, and a ReelDock at the bottom.
 */
export const ReelPage: React.FC<ReelPageProps> = ({
  tone = "light",
  severity,
  backdrop,
  opacity = 1,
  children,
}) => {
  const s = SURFACES[tone];
  const ground = tone === "dark" && severity ? severityGround(severity) : s.ground;
  return (
    <AbsoluteFill
      style={{
        background: ground,
        color: s.ink,
        fontFamily: fontFamilies.body,
        overflow: "hidden",
        opacity,
      }}
    >
      {backdrop ? (
        <AbsoluteFill style={{ opacity: backdrop.opacity ?? (tone === "light" ? 0.07 : 1) }}>
          <SafeImg src={backdrop.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {backdrop.scrim ? <AbsoluteFill style={{ background: backdrop.scrim }} /> : null}
        </AbsoluteFill>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

/** An <Img> that renders nothing (instead of throwing the render) when its
 *  source can't load — a cover photo is decoration, never worth a failed post. */
export class SafeImg extends React.Component<{ src: string; style?: React.CSSProperties }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.failed) return null;
    return <Img src={this.props.src} onError={() => this.setState({ failed: true })} style={this.props.style} />;
  }
}
