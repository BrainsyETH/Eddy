import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareReadNarration, speechChunks, narrationCacheKey, VOICE_SETTINGS, CLOSING_SCRIPT } from '../scripts/prepare-read-narration.mjs';

test('long narration keeps every word within provider input limits', () => {
  const text='The water is steady, with 2.6 ft at the gauge. '.repeat(180);
  const chunks=speechChunks(text);
  assert.ok(chunks.length>1);
  assert.ok(chunks.every(chunk=>chunk.length<=3500));
  assert.equal(chunks.join(' '),text.trim());
  assert.notEqual(narrationCacheKey(text),narrationCacheKey(text+' Updated.'));
  assert.equal(VOICE_SETTINGS.speed,1,'never accelerate speech to fit');
});

test('speech is measured, normalized, reused, and written as local assets', async () => {
  const dir=await mkdtemp(join(tmpdir(),'eddy-read-voice-test-'));
  try {
    // A tone is only a test double for audio processing, never a voice preview.
    const tone=join(dir,'tone.mp3');
    execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=4','-c:a','libmp3lame',tone]);
    const bytes=await readFile(tone);
    const inputs=[];
    const synthesize=async text=>{inputs.push(text);return bytes;};
    const propsPath=join(dir,'props.json');
    await writeFile(propsPath,JSON.stringify({readingText:'A gentle river briefing.'}));
    const options={propsPath,assetDir:join(dir,'public'),cacheDir:join(dir,'cache'),synthesize};
    const voice=await prepareReadNarration(options);
    assert.deepEqual(inputs,['A gentle river briefing.',CLOSING_SCRIPT]);
    assert.ok(voice.clips[0].durationFrames>=120);
    assert.ok(voice.clips[0].durationFrames<130);
    assert.ok(voice.closing.durationFrames>=120);
    assert.ok((await readFile(join(dir,'public',voice.clips[0].src))).length>1000);
    await prepareReadNarration(options);
    assert.equal(inputs.length,2,'unchanged report and closing audio are cached');
    const saved=JSON.parse(await readFile(propsPath,'utf8'));
    assert.deepEqual(saved.voiceover,voice);
    assert.equal(saved.readingText,'A gentle river briefing.');
    assert.ok(!JSON.stringify(saved).includes('apiKey'));
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('missing speech credentials fail before a music-only result can be produced', async () => {
  const dir=await mkdtemp(join(tmpdir(),'eddy-read-voice-missing-'));
  try {
    const propsPath=join(dir,'props.json');
    await writeFile(propsPath,JSON.stringify({readingText:'Check the river before launch.'}));
    await assert.rejects(prepareReadNarration({propsPath,assetDir:join(dir,'public'),cacheDir:join(dir,'cache'),apiKey:''}),/OPENAI_API_KEY is required/);
    assert.equal(JSON.parse(await readFile(propsPath,'utf8')).voiceover,undefined);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('final social mux preserves the complete encoded voice and music track', async () => {
  const dir=await mkdtemp(join(tmpdir(),'eddy-read-mux-test-'));
  try {
    const video=join(dir,'voice.mp4');
    execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=teal:s=64x64:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac','-b:a','192k','-shortest',video]);
    const track=()=>execFileSync('ffmpeg',['-v','error','-i',video,'-map','0:a:0','-c:a','copy','-f','adts','pipe:1']);
    const before=track();
    execFileSync('bash',['scripts/mux-social-audio.sh',video,'social-eddy-read'],{stdio:['ignore','pipe','pipe']});
    assert.deepEqual(track(),before,'the voice track must not be replaced by music or re-encoded');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
