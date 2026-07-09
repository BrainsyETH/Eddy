/**
 * Generate promo voiceover MP3s from the single source of truth (promoScenes),
 * via OpenAI TTS. Writes public/audio/voiceover/promo-0*.mp3 and prints each
 * clip's measured duration so beat lengths can be synced to the narration.
 *
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-promo-vo.ts
 *   TTS_VOICE=nova  (default)   TTS_MODEL=tts-1-hd (default)
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { promoScenes, currentScenes } from "../src/lib/voiceover";

// Which reel's narration to (re)generate: SCENES=promo (default) or SCENES=current.
const SCENES = process.env.SCENES === "current" ? currentScenes : promoScenes;

const KEY = process.env.OPENAI_API_KEY;
// "marin" is OpenAI's newest, most human-sounding voice (from Advanced Voice);
// far less robotic than "nova". "coral"/"sage" are good documented fallbacks.
const VOICE = process.env.TTS_VOICE || "marin";
// gpt-4o-mini-tts follows a delivery `instructions` prompt, so the read is far
// more fluid/natural than tts-1. Override with TTS_MODEL=tts-1-hd if desired.
const MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const INSTRUCTIONS =
  process.env.TTS_INSTRUCTIONS ||
  "Speak like a real person — a warm, laid-back Ozark river guide chatting with " +
    "a friend, not a narrator reading ad copy. Natural conversational rhythm: " +
    "small, easy pauses at commas and dashes, gentle rises and falls, a relaxed " +
    "unhurried pace. Friendly and quietly excited about a good day on the water. " +
    "Soften the ends of sentences. Avoid any sing-song, clipped, or robotic cadence.";
const OUT = path.resolve(__dirname, "..", "public", "audio", "voiceover");

// Uses curl (macOS Secure Transport → trusts the system/proxy CA) instead of
// Node fetch, which fails on TLS-intercepting networks. The API key goes in a
// mode-0600 curl config file, never on the argv where `ps` could see it.
function tts(input: string, dest: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tts-"));
  const bodyFile = path.join(tmp, "body.json");
  const cfgFile = path.join(tmp, "curl.cfg");
  const body: Record<string, unknown> = { model: MODEL, voice: VOICE, input, response_format: "mp3" };
  if (MODEL.includes("gpt-4o")) body.instructions = INSTRUCTIONS;
  fs.writeFileSync(bodyFile, JSON.stringify(body));
  fs.writeFileSync(
    cfgFile,
    [
      `url = "https://api.openai.com/v1/audio/speech"`,
      `header = "Authorization: Bearer ${KEY}"`,
      `header = "Content-Type: application/json"`,
      `data = "@${bodyFile}"`,
      `output = "${dest}"`,
      `fail-with-body`,
    ].join("\n"),
    { mode: 0o600 }
  );
  try {
    execFileSync("curl", ["-sS", "--max-time", "60", "-K", cfgFile], { stdio: ["ignore", "ignore", "pipe"] });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  if (!KEY) throw new Error("OPENAI_API_KEY is required");
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Voice: ${VOICE} · Model: ${MODEL} · Scenes: ${process.env.SCENES || "promo"}\n`);

  for (const s of SCENES) {
    const dest = path.join(OUT, s.audioFile);
    tts(s.script, dest);
    const size = fs.statSync(dest).size;
    if (size < 2000) throw new Error(`TTS output too small for ${s.audioFile} (${size} B) — check response`);
    console.log(`  ✓ ${s.audioFile}  (${(size / 1024).toFixed(0)} KB)`);
  }
  console.log("\nDone. Probe durations with: ffprobe <file>");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
