import React from "react";
import { Img, staticFile } from "remotion";

interface PhoneFrameProps {
  screenshotFile: string;
  children?: React.ReactNode;
}

/**
 * Phone-style frame for TikTok/vertical video format.
 * Renders a smartphone bezel around a screenshot.
 */
export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  screenshotFile,
  children,
}) => {
  return (
    <div
      className="relative rounded-[40px] overflow-hidden border-4 border-neutral-800 bg-neutral-900"
      style={{
        width: 380,
        height: 820,
        boxShadow: "6px 6px 0 #6B6459",
      }}
    >
      {/* Status bar / notch area */}
      <div className="flex items-center justify-center py-2 bg-neutral-900">
        <div className="w-28 h-6 rounded-full bg-neutral-800" />
      </div>

      {/* Screenshot content */}
      <div className="relative overflow-hidden" style={{ height: 770 }}>
        <Img
          src={staticFile(`screenshots/${screenshotFile}`)}
          style={{ width: "100%", display: "block" }}
        />
        {children && (
          <div className="absolute inset-0">{children}</div>
        )}
      </div>
    </div>
  );
};
