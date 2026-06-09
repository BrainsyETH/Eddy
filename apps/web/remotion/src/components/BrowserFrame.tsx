import React from "react";
import { Img, staticFile } from "remotion";

interface BrowserFrameProps {
  url: string;
  screenshotFile: string;
  children?: React.ReactNode;
}

/**
 * Chrome-style browser mockup wrapping a screenshot.
 * Uses Eddy's Organic Brutalist design tokens.
 */
export const BrowserFrame: React.FC<BrowserFrameProps> = ({
  url,
  screenshotFile,
  children,
}) => {
  return (
    <div
      className="relative rounded-xl overflow-hidden border-2 border-neutral-300"
      style={{
        boxShadow: "6px 6px 0 #6B6459",
        width: "90%",
        maxWidth: 1680,
      }}
    >
      {/* Browser toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-neutral-800 border-b-2 border-neutral-600">
        {/* Traffic lights */}
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-accent-500" />
          <div className="w-3 h-3 rounded-full bg-warning" />
          <div className="w-3 h-3 rounded-full bg-support-500" />
        </div>
        {/* URL bar */}
        <div className="flex-1 ml-2">
          <div className="bg-neutral-700 rounded-md px-4 py-1.5 text-neutral-300 text-sm font-mono">
            {url}
          </div>
        </div>
      </div>

      {/* Screenshot content */}
      <div className="relative">
        <Img
          src={staticFile(`screenshots/${screenshotFile}`)}
          style={{ width: "100%", display: "block" }}
        />
        {/* Overlay for callouts */}
        {children && (
          <div className="absolute inset-0">{children}</div>
        )}
      </div>
    </div>
  );
};
