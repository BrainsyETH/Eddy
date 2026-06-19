import { continueRender, delayRender, registerRoot } from "remotion";
import { loadFonts } from "./design-tokens/fonts";
import { RemotionRoot } from "./Root";

// Guarantee the brand fonts (Fredoka display + Geist) are ready before any frame
// is captured. The CSS @font-face in style.css covers the Studio, but the
// renderer needs an explicit delayRender gate or early frames can fall back to
// system fonts. Module-level, so it blocks every composition once; on failure we
// continue rather than hang the render (degrades to fallback fonts).
const fontHandle = delayRender("Loading Eddy brand fonts");
loadFonts()
  .then(() => continueRender(fontHandle))
  .catch(() => continueRender(fontHandle));

registerRoot(RemotionRoot);
