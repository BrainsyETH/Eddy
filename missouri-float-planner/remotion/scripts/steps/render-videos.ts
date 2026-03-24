/**
 * Step 4: Render videos using @remotion/renderer (server-side).
 *
 * Renders both landscape (16:9) and portrait (9:16) MP4 files
 * programmatically without needing the Remotion CLI.
 */

import path from "path";
import {
  bundle,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";

interface RenderTarget {
  compositionId: string;
  outputFile: string;
}

const RENDER_TARGETS: RenderTarget[] = [
  {
    compositionId: "tutorial-full",
    outputFile: "eddy-tutorial-landscape.mp4",
  },
  {
    compositionId: "tutorial-full-vertical",
    outputFile: "eddy-tutorial-vertical.mp4",
  },
];

export async function renderVideos(rootDir: string): Promise<void> {
  const outDir = path.join(rootDir, "out");
  const entryPoint = path.join(rootDir, "src", "index.ts");

  // Step 1: Bundle the Remotion project
  console.log("Bundling Remotion project...");
  const bundleLocation = await bundle({
    entryPoint,
    // The webpack override from remotion.config.ts is auto-detected
  });
  console.log(`Bundle created at: ${bundleLocation}\n`);

  // Step 2: Render each target
  for (const target of RENDER_TARGETS) {
    const outputPath = path.join(outDir, target.outputFile);
    console.log(`Rendering ${target.compositionId} -> ${target.outputFile}`);

    // Select the composition to get its props and duration
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: target.compositionId,
    });

    console.log(
      `  Resolution: ${composition.width}x${composition.height}, ` +
        `Duration: ${composition.durationInFrames} frames @ ${composition.fps}fps ` +
        `(${(composition.durationInFrames / composition.fps).toFixed(1)}s)`
    );

    // Render to MP4
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      // Quality settings
      crf: 18,
      // Progress logging
      onProgress: ({ progress }) => {
        if (Math.round(progress * 100) % 10 === 0) {
          process.stdout.write(
            `\r  Rendering: ${Math.round(progress * 100)}%`
          );
        }
      },
    });

    console.log(`\n  Saved: ${outputPath}\n`);
  }

  console.log("All videos rendered successfully!");
  console.log(`Output directory: ${outDir}`);
}
