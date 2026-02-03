/**
 * ──────────────────────────────────────────────────────────────
 * Audio Generation Script for Eddy Promo Video
 * ──────────────────────────────────────────────────────────────
 *
 * This script generates the narration audio from the script
 * defined in src/lib/constants.ts.
 *
 * OPTION 1: OpenAI TTS (Recommended - high quality, easy API)
 * OPTION 2: ElevenLabs (best quality, requires account)
 * OPTION 3: Google Cloud TTS (good quality, free tier available)
 * OPTION 4: Manual recording (highest authenticity)
 *
 * ──────────────────────────────────────────────────────────────
 */

// ─── Full Narration Script ────────────────────────────────────────────

const NARRATION_LINES = [
  "Missouri's Ozark rivers are some of the most beautiful waterways in America.",
  "But planning a float trip? That's been the hard part. Until now.",
  "Meet Eddy — your Ozark float trip companion.",
  "A free tool that makes planning your next river adventure effortless.",
  "Pick your river. Choose your put-in and take-out.",
  "Eddy calculates distance and estimated float time instantly.",
  "Check real-time water levels powered by USGS gauges.",
  "Know if conditions are too low, optimal, or too high before you go.",
  "Over thirty curated access points across Missouri's best float rivers.",
  "Every launch mapped. Every detail covered.",
  "Plus in-depth river guides and blog posts to help you choose your perfect float.",
  "Trusted by Missouri floaters for live data and local knowledge.",
  "Plan your next float trip today.",
  "eddy dot guide. Your river. Your adventure.",
];

const FULL_SCRIPT = NARRATION_LINES.join(" ");

// ─── Option 1: OpenAI TTS ─────────────────────────────────────────────

async function generateWithOpenAI() {
  // npm install openai
  // Set OPENAI_API_KEY env variable
  const OpenAI = require("openai");
  const fs = require("fs");
  const path = require("path");

  const openai = new OpenAI();

  console.log("🎙️  Generating narration with OpenAI TTS...");
  console.log(`📝 Script: ${FULL_SCRIPT.substring(0, 80)}...`);

  const mp3 = await openai.audio.speech.create({
    model: "tts-1-hd", // Use tts-1-hd for higher quality
    voice: "onyx", // Options: alloy, echo, fable, onyx, nova, shimmer
    input: FULL_SCRIPT,
    speed: 0.95, // Slightly slower for clarity
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  const outputPath = path.join(__dirname, "../public/audio/narration.mp3");
  fs.writeFileSync(outputPath, buffer);

  console.log(`✅ Narration saved to: ${outputPath}`);
  console.log("💡 Tip: You can also generate per-line for tighter sync:");
  console.log("   Just loop over NARRATION_LINES and concat the results.");
}

// ─── Option 2: ElevenLabs ─────────────────────────────────────────────

async function generateWithElevenLabs() {
  // npm install elevenlabs
  // Set ELEVENLABS_API_KEY env variable
  console.log(`
  ┌──────────────────────────────────────────────┐
  │  ElevenLabs TTS Setup                        │
  ├──────────────────────────────────────────────┤
  │                                              │
  │  1. Sign up at elevenlabs.io                 │
  │  2. Get API key from settings               │
  │  3. Set env: ELEVENLABS_API_KEY=xxx          │
  │  4. Install: npm i elevenlabs                │
  │                                              │
  │  Recommended voice: "Adam" or "Antoni"       │
  │  for a warm, friendly male narrator          │
  │                                              │
  │  Usage:                                      │
  │  const { ElevenLabsClient } = require(       │
  │    "elevenlabs"                              │
  │  );                                          │
  │  const client = new ElevenLabsClient();      │
  │  const audio = await client.generate({       │
  │    voice: "Adam",                            │
  │    text: FULL_SCRIPT,                        │
  │    model_id: "eleven_turbo_v2_5",            │
  │  });                                         │
  │                                              │
  └──────────────────────────────────────────────┘
  `);
}

// ─── Option 3: Google Cloud TTS ───────────────────────────────────────

async function generateWithGoogleTTS() {
  console.log(`
  ┌──────────────────────────────────────────────┐
  │  Google Cloud TTS Setup                      │
  ├──────────────────────────────────────────────┤
  │                                              │
  │  1. Enable Text-to-Speech API in GCP         │
  │  2. Create service account key               │
  │  3. Set GOOGLE_APPLICATION_CREDENTIALS       │
  │  4. npm i @google-cloud/text-to-speech       │
  │                                              │
  │  Recommended voice:                          │
  │  en-US-Neural2-J (warm male)                 │
  │  en-US-Neural2-F (warm female)               │
  │                                              │
  └──────────────────────────────────────────────┘
  `);
}

// ─── Background Music Suggestions ─────────────────────────────────────

function printMusicSuggestions() {
  console.log(`
  ┌──────────────────────────────────────────────┐
  │  🎵 Background Music Options                 │
  ├──────────────────────────────────────────────┤
  │                                              │
  │  Royalty-Free Sources:                       │
  │  • Pixabay Music (free, no attribution)      │
  │    pixabay.com/music                         │
  │                                              │
  │  • Uppbeat (free tier, attribution)          │
  │    uppbeat.io                                │
  │                                              │
  │  • Artlist (paid, no attribution)            │
  │    artlist.io                                │
  │                                              │
  │  Search terms for the right vibe:            │
  │  "ambient nature" "acoustic chill"           │
  │  "adventure outdoors" "calm river"           │
  │  "uplifting acoustic" "summer adventure"     │
  │                                              │
  │  Target: ~45 seconds, starts soft,           │
  │  builds slightly mid-video, fades at end.    │
  │  Keep it under the narration (15% volume).   │
  │                                              │
  │  Place file at:                              │
  │  public/audio/background-music.mp3           │
  │                                              │
  └──────────────────────────────────────────────┘
  `);
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║  Eddy Promo Video — Audio Generation         ║");
  console.log("╚═══════════════════════════════════════════════╝");
  console.log();
  console.log("📝 Full narration script:");
  console.log("─".repeat(50));
  NARRATION_LINES.forEach((line, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${line}`);
  });
  console.log("─".repeat(50));
  console.log(`  Total: ${FULL_SCRIPT.split(" ").length} words (~45 seconds)`);
  console.log();

  const method = process.argv[2] || "info";

  switch (method) {
    case "openai":
      await generateWithOpenAI();
      break;
    case "elevenlabs":
      await generateWithElevenLabs();
      break;
    case "google":
      await generateWithGoogleTTS();
      break;
    default:
      console.log("Usage: npx ts-node scripts/generate-audio.ts [openai|elevenlabs|google]");
      console.log();
      printMusicSuggestions();
  }
}

main().catch(console.error);
