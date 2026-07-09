import React from "react";
import { PromoScaffold, type PromoFormat } from "./PromoScaffold";
import { HighlightRing } from "./PromoMedia";
import { colors } from "../../design-tokens/colors";

const PHRASES = [
  "Every river, painted by its live USGS gauges",
  "See what's flowing — at a glance",
  "Tap any river for today's floater's verdict",
];

/** Beat 2 — the live river map: painted rivers, the statewide verdict, the
 *  drag-to-replay timeline. */
export const PromoLiveMap: React.FC<{ video?: string | null; format?: PromoFormat }> = ({
  video,
  format,
}) => (
  <PromoScaffold
    format={format}
    eyebrow="Live River Map"
    title="See what's flowing"
    phrases={PHRASES}
    image="promo/river-map.png"
    video={video}
    url="eddy.guide/river-map"
    from={{ scale: 1.02, x: 0, y: 12 }}
    to={{ scale: 1.13, x: -18, y: -12 }}
    mascot="canoe"
    accent={colors.support[400]}
    glow="rgba(78,184,107,0.4)"
    cta="11 float rivers · 26 live gauges"
    overlay={<HighlightRing x={62} y={52} size={150} delay={40} />}
  />
);
