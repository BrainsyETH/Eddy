import { Composition } from "remotion";
import { EddyPromo } from "./EddyPromo";
import { VIDEO_CONFIG } from "./lib/constants";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Main promo video - 16:9 landscape */}
      <Composition
        id="EddyPromo"
        component={EddyPromo}
        durationInFrames={VIDEO_CONFIG.totalFrames}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
        defaultProps={{}}
      />

      {/* 
        Future: Add vertical format for social media
        
        <Composition
          id="EddyPromoVertical"
          component={EddyPromoVertical}
          durationInFrames={VIDEO_CONFIG.totalFrames}
          fps={VIDEO_CONFIG.fps}
          width={1080}
          height={1920}
          defaultProps={{}}
        />
      */}
    </>
  );
};
