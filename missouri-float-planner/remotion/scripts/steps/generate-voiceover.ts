/**
 * Step 3: Generate voiceover audio via OpenAI TTS API.
 *
 * Uses the tts-1-hd model for high quality speech synthesis.
 * Generates one MP3 file per scene.
 */

import path from "path";
import fs from "fs";
import OpenAI from "openai";

// Import scene scripts — these define the voiceover text for each scene
const SCENE_SCRIPTS = [
  {
    audioFile: "01-intro.mp3",
    script: "Meet Eddy — your guide to the best float trips in Missouri.",
  },
  {
    audioFile: "02-home.mp3",
    script:
      "Eddy gives you a daily river report with real-time conditions across Missouri's top floating rivers. See what's running good at a glance.",
  },
  {
    audioFile: "03-rivers.mp3",
    script:
      "Browse eight of Missouri's best float rivers. Each one shows live conditions so you know exactly what to expect before you go.",
  },
  {
    audioFile: "04-river-detail.mp3",
    script:
      "Dive into any river to see an interactive map with every access point, gauge station, and hazard marked.",
  },
  {
    audioFile: "05-float-planner.mp3",
    script:
      "Pick your put-in and take-out, and Eddy calculates your float time, distance, and shuttle drive — all in seconds.",
  },
  {
    audioFile: "06-gauges.mp3",
    script:
      "Track real-time water levels from USGS gauge stations. Sparkline charts show you the seven-day trend at a glance.",
  },
  {
    audioFile: "07-access-point.mp3",
    script:
      "Every access point has detailed info — parking, facilities, road conditions, and nearby outfitters.",
  },
  {
    audioFile: "08-share-plan.mp3",
    script:
      "Share your float plan with friends. One link, all the details — put-in, take-out, estimated time, and a map.",
  },
  {
    audioFile: "09-ask-eddy.mp3",
    script:
      "Got questions? Ask Eddy. He knows the rivers, the conditions, and can help you plan the perfect trip.",
  },
  {
    audioFile: "10-outro.mp3",
    script: "Start planning your next float at eddy dot guide.",
  },
];

export async function generateVoiceover(
  publicDir: string,
  apiKey: string,
  voice: string = "onyx"
): Promise<void> {
  const voiceoverDir = path.join(publicDir, "audio", "voiceover");
  fs.mkdirSync(voiceoverDir, { recursive: true });

  const openai = new OpenAI({ apiKey });

  for (const scene of SCENE_SCRIPTS) {
    const outputPath = path.join(voiceoverDir, scene.audioFile);

    // Skip if already generated
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      console.log(`  Skipping ${scene.audioFile} (already exists)`);
      continue;
    }

    console.log(`  Generating ${scene.audioFile}...`);
    console.log(`    "${scene.script.substring(0, 60)}..."`);

    try {
      const response = await openai.audio.speech.create({
        model: "tts-1-hd",
        voice: voice as "onyx" | "alloy" | "echo" | "fable" | "nova" | "shimmer",
        input: scene.script,
        response_format: "mp3",
        speed: 1.0,
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(outputPath, buffer);
      console.log(
        `    Saved ${scene.audioFile} (${(buffer.length / 1024).toFixed(1)} KB)`
      );
    } catch (err) {
      console.error(`  Failed to generate ${scene.audioFile}:`, err);
      throw err;
    }
  }

  console.log(`\nVoiceover audio generated in ${voiceoverDir}`);
}
