import React from "react";
import {
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { colors } from "../../design-tokens/colors";
import { fontFamilies } from "../../design-tokens/fonts";

/** A framing "camera" — scale + pixel offset applied to the media. */
export interface Focus {
  scale: number;
  x: number;
  y: number;
}

interface PromoMediaProps {
  /** Screenshot path relative to public/screenshots/. */
  image: string;
  /** Optional motion clip relative to public/ (e.g. "video/promo-map.mp4"). If
   *  set, it plays instead of the still — the live-motion upgrade. */
  video?: string | null;
  /** Ken-Burns camera at the start / end of the beat. */
  from: Focus;
  to: Focus;
  /** Band (viewport) size in px. */
  width: number;
  height: number;
  /** URL shown in the faux browser chrome. */
  url: string;
  /** Overlay annotations (callouts, highlight rings) positioned over the media. */
  children?: React.ReactNode;
}

const CHROME_H = 46;

/**
 * A browser-chromed media band with a slow Ken-Burns move, matching Eddy's
 * Organic-Brutalist frames (hard offset shadow, teal chrome). Renders a live
 * motion clip when `video` is supplied, otherwise pans/zooms the still so a
 * screenshot still feels alive.
 */
export const PromoMedia: React.FC<PromoMediaProps> = ({
  image,
  video,
  from,
  to,
  width,
  height,
  url,
  children,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // The map clip is a static-camera recording of the live flow animation, so it
  // gets the same slow Ken-Burns push-in as a still — the flow supplies the
  // in-frame life, this supplies the camera move.
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = from.scale + (to.scale - from.scale) * t;
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;

  return (
    <div
      style={{
        width,
        height: height + CHROME_H,
        borderRadius: 20,
        overflow: "hidden",
        border: `3px solid ${colors.neutral[200]}`,
        boxShadow: "10px 12px 0 rgba(0,0,0,0.45)",
        background: colors.neutral[900],
      }}
    >
      {/* Faux browser chrome */}
      <div
        style={{
          height: CHROME_H,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 18px",
          background: colors.neutral[800],
          borderBottom: `2px solid ${colors.neutral[600]}`,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 13, height: 13, borderRadius: 99, background: colors.accent[500] }} />
          <div style={{ width: 13, height: 13, borderRadius: 99, background: colors.secondary[400] }} />
          <div style={{ width: 13, height: 13, borderRadius: 99, background: colors.support[500] }} />
        </div>
        <div
          style={{
            flex: 1,
            background: colors.neutral[700],
            borderRadius: 8,
            padding: "5px 14px",
            color: colors.neutral[300],
            fontFamily: fontFamilies.mono,
            fontSize: 20,
          }}
        >
          {url}
        </div>
      </div>

      {/* Media viewport */}
      <div style={{ position: "relative", width, height, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `scale(${scale}) translate(${x}px, ${y}px)`,
            transformOrigin: "center center",
          }}
        >
          {video ? (
            // OffthreadVideo in this Remotion version has no `loop` prop (it's
            // ignored), so the map recording must be captured at least as long as
            // its beat. Wrap in <Loop> if a shorter clip ever needs to repeat.
            <OffthreadVideo
              src={staticFile(video)}
              muted
              style={{ width, height, objectFit: "cover", display: "block" }}
            />
          ) : (
            <Img
              src={staticFile(`screenshots/${image}`)}
              style={{ width, display: "block" }}
            />
          )}
        </div>
        {children ? <div style={{ position: "absolute", inset: 0 }}>{children}</div> : null}
      </div>
    </div>
  );
};

/** A pulsing highlight ring that draws the eye to a spot on the media. */
export const HighlightRing: React.FC<{
  x: number;
  y: number;
  size?: number;
  delay?: number;
}> = ({ x, y, size = 130, delay = 0 }) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - delay);
  const pulse = 0.5 + 0.5 * Math.sin(local / 6);
  const appear = interpolate(local, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        borderRadius: 99,
        border: `4px solid ${colors.accent[400]}`,
        boxShadow: `0 0 ${18 + pulse * 22}px ${colors.accent[500]}`,
        opacity: appear * (0.55 + pulse * 0.45),
      }}
    />
  );
};
