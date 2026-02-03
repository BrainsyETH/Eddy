import React from "react";
import { Img } from "remotion";
import { EDDY_IMAGES } from "../lib/constants";

interface EddyOtterProps {
  variant?: "default" | "hero" | "wave" | "canoe" | "flood";
  width?: number;
  style?: React.CSSProperties;
}

export const EddyOtter: React.FC<EddyOtterProps> = ({
  variant = "default",
  width = 200,
  style = {},
}) => {
  const imageUrls: Record<string, string> = {
    default: EDDY_IMAGES.main,
    hero: EDDY_IMAGES.main,
    wave: EDDY_IMAGES.flag,
    canoe: EDDY_IMAGES.canoe,
    flood: EDDY_IMAGES.flood,
  };

  return (
    <Img
      src={imageUrls[variant]}
      style={{
        width,
        height: "auto",
        objectFit: "contain",
        ...style,
      }}
    />
  );
};
