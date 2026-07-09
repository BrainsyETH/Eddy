import React from "react";
import { PromoScaffold, type PromoFormat } from "./PromoScaffold";
import { HighlightRing } from "./PromoMedia";
import { colors } from "../../design-tokens/colors";

const PHRASES = [
  "Too low? You drag. Too high? It's dangerous.",
  "Eddy reads the gauges for you —",
  "feet, flow, and the 7-day trend",
];

/** Beat 3 — river levels: threshold-band charts and Eddy's plain-English
 *  "good to float" verdict per river. */
export const PromoLevels: React.FC<{ format?: PromoFormat }> = ({ format }) => (
  <PromoScaffold
    format={format}
    eyebrow="River Levels"
    title="Good to float?"
    phrases={PHRASES}
    image="promo/gauges.png"
    url="eddy.guide/gauges"
    from={{ scale: 1.16, x: 150, y: 70 }}
    to={{ scale: 1.3, x: 172, y: 40 }}
    mascot="green"
    accent={colors.accent[400]}
    glow="rgba(240,112,82,0.4)"
    cta="Every river, read for you"
    overlay={<HighlightRing x={54} y={58} size={150} delay={70} />}
  />
);
