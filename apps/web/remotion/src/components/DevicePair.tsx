import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { BrowserFrame } from "./BrowserFrame";
import { PhoneFrame } from "./PhoneFrame";
import { GENTLE } from "../lib/spring-presets";

interface DevicePairProps {
  /** Desktop screenshot filename in public/screenshots/ */
  desktopScreenshot: string;
  /** Mobile screenshot filename in public/screenshots/ */
  mobileScreenshot: string;
  /** URL shown in the browser toolbar */
  desktopUrl: string;
  /** Frame at which the phone fades in */
  phoneDelay: number;
  /** Callouts/overlays rendered inside the BrowserFrame */
  desktopChildren?: React.ReactNode;
  /** Callouts/overlays rendered inside the PhoneFrame */
  mobileChildren?: React.ReactNode;
  /** Layout format — portrait falls back to phone-only */
  format?: "landscape" | "portrait";
}

/**
 * Side-by-side desktop + mobile device mockup.
 *
 * In landscape mode: BrowserFrame on the left (62% width),
 * PhoneFrame fades in + floats up on the right at `phoneDelay`.
 *
 * In portrait mode: PhoneFrame only (full centered layout).
 */
export const DevicePair: React.FC<DevicePairProps> = ({
  desktopScreenshot,
  mobileScreenshot,
  desktopUrl,
  phoneDelay,
  desktopChildren,
  mobileChildren,
  format = "landscape",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Portrait mode: phone only
  if (format === "portrait") {
    return (
      <PhoneFrame screenshotFile={mobileScreenshot}>
        {mobileChildren}
      </PhoneFrame>
    );
  }

  // Phone fade + float up animation
  const phoneProgress = spring({
    frame: frame - phoneDelay,
    fps,
    config: GENTLE,
  });

  const phoneOpacity = phoneProgress;
  const phoneTranslateY = interpolate(phoneProgress, [0, 1], [20, 0]);

  // Browser slightly scales down when phone appears
  const browserScale = interpolate(phoneProgress, [0, 1], [1, 0.98]);

  return (
    <div className="flex items-center justify-center gap-8 w-full h-full px-8">
      {/* Desktop — left side */}
      <div
        style={{
          width: "62%",
          transform: `scale(${browserScale})`,
          transformOrigin: "center left",
        }}
      >
        <BrowserFrame url={desktopUrl} screenshotFile={desktopScreenshot}>
          {desktopChildren}
        </BrowserFrame>
      </div>

      {/* Phone — right side, fades in + floats up */}
      <div
        style={{
          opacity: phoneOpacity,
          transform: `translateY(${phoneTranslateY}px)`,
        }}
      >
        <PhoneFrame screenshotFile={mobileScreenshot}>
          {mobileChildren}
        </PhoneFrame>
      </div>
    </div>
  );
};
