// Generate measured, normalized speech before Remotion evaluates its duration.
// No credentials enter props, audio URLs, logs, or the browser bundle.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VOICE_SETTINGS = {
  model: 'gpt-4o-mini-tts-2025-12-15',
  voice: 'marin',
  response_format: 'mp3',
  speed: 1,
  instructions: 'Read the supplied text verbatim as Eddy, a kind, soft-spoken river guide. ' +
    'Use a warm, friendly, calm conversational voice with a gentle smile. Speak clearly at ' +
    'roughly 145 to 155 words per minute, with easy breaths and natural pauses between sentences. ' +
    'Keep your volume even. No whispering, exaggerated accent, announcer delivery, sales pitch, ' +
    'or rushed ending. Read all words and numbers. Say ft as feet and cfs as cubic feet per second. ' +
    'Do not add an introduction or commentary.',
};
export const CLOSING_SCRIPT = 'Plan it on the Eddy app.';

/** Stay below the speech endpoint limit without dropping or rewriting prose. */
export function speechChunks(text, limit = 3500) {
  const chunks = [];
  let chunk = '';
  for (const word of text.trim().split(/\s+/)) {
    if (word.length > limit) throw new Error('A word in the Read exceeds the speech input limit.');
    if (chunk && chunk.length + word.length + 1 > limit) { chunks.push(chunk); chunk = ''; }
    chunk += (chunk ? ' ' : '') + word;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function narrationCacheKey(text) {
  return createHash('sha256').update(JSON.stringify({ text: text.trim(), ...VOICE_SETTINGS, normalization: 1 })).digest('hex');
}

async function requestSpeech(input, apiKey) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for Eddy Read narration. Set the GitHub Actions secret; no music-only video will be published.');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VOICE_SETTINGS, input }), signal: AbortSignal.timeout(120_000),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`Eddy Read speech generation failed (HTTP ${response.status}).`);
  }
}

function audioFrames(path) {
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) throw new Error('Invalid narration duration.');
  return Math.ceil(duration * 30);
}

export async function prepareReadNarration({ propsPath, assetDir, cacheDir, apiKey = process.env.OPENAI_API_KEY, synthesize = requestSpeech }) {
  const props = JSON.parse(await readFile(propsPath, 'utf8'));
  if (typeof props.readingText !== 'string' || !props.readingText.trim()) throw new Error('A full Read is required for narration.');
  // Reject oversized requests instead of silently shortening the report.
  if (props.readingText.length > 20000) throw new Error('Read exceeds the narration request budget.');
  const audioDir = join(assetDir, 'audio', 'reads');
  await mkdir(audioDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  async function clip(text) {
    const hash = narrationCacheKey(text);
    const cached = join(cacheDir, `${hash}.mp3`);
    let frames;
    try { frames = audioFrames(cached); } catch {
      const raw = join(cacheDir, `${hash}.raw.mp3`);
      const bytes = await synthesize(text, apiKey);
      if (!bytes || bytes.length < 1000) throw new Error('Speech provider returned empty audio.');
      await writeFile(raw, bytes);
      const pending = join(cacheDir, `${hash}.pending.mp3`);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-ar', '48000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '192k', pending], { stdio: ['ignore', 'pipe', 'pipe'] });
      frames = audioFrames(pending);
      await rename(pending, cached);
    }
    await copyFile(cached, join(audioDir, `${hash}.mp3`));
    return { src: `audio/reads/${hash}.mp3`, durationFrames: frames };
  }
  const clips = [];
  for (const text of speechChunks(props.readingText)) clips.push(await clip(text));
  const words = props.readingText.trim().split(/\s+/).length;
  const seconds = clips.reduce((sum, item) => sum + item.durationFrames / 30, 0);
  if (words >= 30 && words / seconds * 60 > 190) throw new Error('Narration is too rushed; revise the voice instructions and regenerate. Audio will never be sped up to fit a reel.');
  props.voiceover = { clips, closing: await clip(CLOSING_SCRIPT) };
  await writeFile(propsPath, JSON.stringify(props));
  console.log(`Eddy Read narration prepared: ${words} words, ${seconds.toFixed(1)}s of full-report speech; normal playback speed.`);
  return props.voiceover;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const propsPath = resolve(process.argv[2] || '/tmp/props.json');
  if (process.argv.includes('--cache-key')) {
    const props = JSON.parse(await readFile(propsPath, 'utf8'));
    console.log(narrationCacheKey(`${props.readingText || ''}\n${CLOSING_SCRIPT}`));
  } else {
    await prepareReadNarration({ propsPath, assetDir: resolve(process.argv[3] || 'public'), cacheDir: resolve(process.env.READ_AUDIO_CACHE || '/tmp/eddy-read-audio') });
  }
}
