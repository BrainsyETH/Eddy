import React from "react";
import { PromoScaffold, type PromoFormat } from "./PromoScaffold";
import { HighlightRing } from "./PromoMedia";
import { colors } from "../../design-tokens/colors";

const PHRASES = [
  "Pick your put-in and take-out",
  "Float time · river miles · shuttle — in seconds",
];

/** Beat 4 — plan a float: a computed Akers Ferry → Pulltite Spring plan with
 *  distance, float time and condition. */
export const PromoPlan: React.FC<{ format?: PromoFormat }> = ({ format }) => (
  <PromoScaffold
    format={format}
    eyebrow="Plan a Float"
    title="Put-in to take-out"
    phrases={PHRASES}
    image="promo/plan-current.png"
    url="eddy.guide/plan"
    from={{ scale: 1.14, x: 150, y: 40 }}
    to={{ scale: 1.26, x: 168, y: 20 }}
    mascot="flag"
    accent={colors.primary[300]}
    glow="rgba(114,181,196,0.45)"
    cta="9.6 mi · ~4–6 hrs · Akers → Pulltite"
    overlay={<HighlightRing x={20} y={34} size={150} delay={50} />}
  />
);
