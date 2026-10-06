// Standalone campaign audition. No database, render callback, or social posting.
// Run without flags for an offline plan; --generate explicitly requests speech.
import { readFile, mkdir, writeFile, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(root, 'campaign.json'), 'utf8'));
const args = process.argv.slice(2);
const allowed = ['--generate', '--cut=long', '--cut=short', '--pace=relaxed', '--pace=brisk'];
if (args.some(arg => !allowed.includes(arg)) ||
    args.filter(arg => arg.startsWith('--cut=')).length > 1 ||
    args.filter(arg => arg.startsWith('--pace=')).length > 1) {
  throw new Error('Usage: node prepare-voice.mjs [--generate] [--cut=long|short] [--pace=relaxed|brisk]');
}
const cut = args.find(arg => arg.startsWith('--cut='))?.split('=')[1] || 'long';
const pace = args.find(arg => arg.startsWith('--pace='))?.split('=')[1] || 'relaxed';
const preset = config.pacePresets[pace];
const voice = { ...config.voice, instructions: config.voice.instructions +
  ` Aim for ${preset.minWpm} to ${preset.maxWpm} words per minute, with clear words and natural pauses. Never accelerate playback to meet a cut length.` };
const scenes = cut === 'short' ? config.shortScenes : config.scenes;
const script = scenes.map(scene => scene.text).join('\n\n');
const words = script.trim().split(/\s+/).length;
if (!words || script.length > 3500) throw new Error('Campaign must fit one speech request; do not truncate or split the approved script.');
const hash = createHash('sha256').update(JSON.stringify({ script, voice, cut, pace, normalization: 1 })).digest('hex').slice(0, 16);
console.log(`${cut}/${pace}: ${words} words; estimated ${(words / preset.maxWpm * 60).toFixed(0)}–${(words / preset.minWpm * 60).toFixed(0)} seconds before edit holds. Timing follows the actual audition.`);
if (!args.includes('--generate')) {
  console.log(script);
  console.log('\nOffline plan only. To create dry narration: OPENAI_API_KEY must be set, then pass --generate.');
} else {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing. Use an authorized runner; never paste keys into chat or commit them.');
  // Check local dependencies before making a paid request.
  for (const binary of ['ffmpeg', 'ffprobe']) execFileSync(binary, ['-version'], { stdio: 'ignore' });
  const out = join(root, 'out');
  await mkdir(out, { recursive: true });
  const destination = join(out, hash);
  try {
    await readFile(join(destination, 'review.json'));
    console.log(`Existing audition: ${destination}. Change voice instructions to create a new take.`);
    process.exit(0);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const work = await mkdtemp(join(out, '.voice-'));
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...voice, input: script }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Speech request failed (HTTP ${response.status}); no completed audition was saved.`);
    const audio = Buffer.from(await response.arrayBuffer());
    if (audio.length < 1000) throw new Error('Speech response was empty or too short.');
    await writeFile(join(work, 'source.wav'), audio);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(work, 'source.wav'),
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-ar', '48000', '-ac', '1',
      '-c:a', 'pcm_s16le', join(work, 'narration.wav')], { stdio: ['ignore', 'pipe', 'pipe'] });
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', join(work, 'narration.wav')], { encoding: 'utf8' }));
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 180) throw new Error('Invalid narration duration.');
    const wpm = words / seconds * 60;
    await writeFile(join(work, 'script.txt'), script + '\n');
    await writeFile(join(work, 'review.json'), JSON.stringify({
      campaign: config.id, hash, cut, pace, voice, words, seconds, wordsPerMinute: wpm,
      requiresVerifiedBioLink: config.publication.requiresVerifiedBioLink,
      requiresListeningReview: true,
      paceWarning: wpm > preset.reviewAbove ? 'Above audition review range; listen for clarity and screen readability. This is not a rejection.' :
        wpm < preset.reviewBelow ? 'Below audition review range; listen for energy and natural pauses. This is not a rejection.' : null,
      captionTiming: 'Not generated. Align captions and scene cuts to the approved audio; word-count estimates are not forced alignment.',
      nextStep: 'Review naturalness, pronunciation, word preservation and cadence before editing real app recordings.',
    }, null, 2) + '\n');
    await rename(work, destination);
    console.log(`Dry narration saved: ${destination}/narration.wav (${seconds.toFixed(1)}s; ${wpm.toFixed(0)} words/min). Human listening review required.`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
