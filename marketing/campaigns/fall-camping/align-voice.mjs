// Transcribe the actual generated take for caption/scene timing; never infer timestamps from word counts.
import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'out');
for (const entry of await readdir(out, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const dir = join(out, entry.name);
  const target = join(dir, 'alignment.json');
  try { await readFile(target); continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for audio alignment.');
  const form = new FormData();
  form.set('model', 'whisper-1');
  form.set('file', new Blob([await readFile(join(dir, 'narration.wav'))], { type: 'audio/wav' }), 'narration.wav');
  form.set('response_format', 'verbose_json');
  form.set('language', 'en');
  form.append('timestamp_granularities[]', 'word');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form, signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Alignment failed (HTTP ${response.status}).`);
  const result = await response.json();
  if (!Array.isArray(result.words) || result.words.length === 0 ||
      result.words.some(w => !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end < w.start)) {
    throw new Error('Audio alignment did not return valid word timestamps.');
  }
  await writeFile(target + '.tmp', JSON.stringify(result, null, 2) + '\n');
  await rename(target + '.tmp', target);
  console.log(`Saved actual-audio word timing for ${entry.name}; human listening review remains required.`);
}
