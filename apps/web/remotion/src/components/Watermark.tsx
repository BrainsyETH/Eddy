import React from "react";

interface WatermarkProps {
  format?: "landscape" | "portrait";
}

/**
 * Subtle eddy.guide watermark in the corner.
 */
export const Watermark: React.FC<WatermarkProps> = ({
  format = "landscape",
}) => {
  return (
    <div
      className="absolute z-40"
      style={{
        right: format === "portrait" ? 16 : 24,
        top: format === "portrait" ? 16 : 12,
      }}
    >
      <span
        className="text-white/50 font-semibold tracking-wide"
        style={{
          fontFamily: "'Fredoka', system-ui, sans-serif",
          fontSize: format === "portrait" ? 14 : 16,
        }}
      >
        eddy.guide
      </span>
    </div>
  );
};
