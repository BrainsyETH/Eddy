import { staticFile } from "remotion";

export const fontFiles = {
  geistSans: staticFile("fonts/GeistVF.woff"),
  geistMono: staticFile("fonts/GeistMonoVF.woff"),
  fredoka: staticFile("fonts/Fredoka-Variable.ttf"),
} as const;

export const fontFamilies = {
  heading: "'Geist Sans', system-ui, sans-serif",
  body: "'Geist Sans', system-ui, sans-serif",
  mono: "'Geist Mono', monospace",
  display: "'Fredoka', system-ui, sans-serif",
} as const;

/**
 * Call this in a useEffect or delayRender to ensure fonts are loaded
 * before rendering frames.
 */
export async function loadFonts(): Promise<void> {
  const geistSans = new FontFace("Geist Sans", `url(${fontFiles.geistSans})`, {
    weight: "100 900",
    style: "normal",
  });

  const geistMono = new FontFace("Geist Mono", `url(${fontFiles.geistMono})`, {
    weight: "100 900",
    style: "normal",
  });

  const fredoka = new FontFace("Fredoka", `url(${fontFiles.fredoka})`, {
    weight: "300 700",
    style: "normal",
  });

  const loaded = await Promise.all([
    geistSans.load(),
    geistMono.load(),
    fredoka.load(),
  ]);

  loaded.forEach((font) => document.fonts.add(font));
}
