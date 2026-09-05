// src/lib/social/clip-credit.test.ts
//
// A reposted clip's caption has two jobs the template used to do only halfway:
// tag the creator, and sell the app. Tagging on Instagram is an @mention of the
// creator's INSTAGRAM handle — the pipeline stores that handle (with its "@")
// in clip_library.source_creator when channels.json knows it, and the bare
// YouTube channel name otherwise. These tests pin the rule that keeps a
// YouTube name from ever being promoted to a mention of a stranger, the
// promised shape of the body (credit line verbatim, CTA last — whatever the
// model did with them), and the resolver both pipeline paths share.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CLIP_CAPTION_CTA,
  assembleClipCaption,
  buildClipCaption,
  captionCreditsClip,
  clipCreditHandle,
  clipCreditLine,
  finalizeClipBody,
} from './clip-credit';

const handleClip = { source_creator: '@ozarkmediaco', youtube_channel: 'Ozark Media Co' };
const nameClip = { source_creator: 'Ozark Media Co', youtube_channel: 'Ozark Media Co' };

test('only a leading "@" is treated as an Instagram handle to tag', () => {
  assert.equal(clipCreditHandle(handleClip), '@ozarkmediaco');
  assert.equal(clipCreditHandle({ source_creator: '@@Girl.Outdoors_becky' }), '@Girl.Outdoors_becky');
  assert.equal(clipCreditHandle(nameClip), null);
  // Not a username Instagram would accept → not a mention.
  assert.equal(clipCreditHandle({ source_creator: '@ozark media' }), null);
  assert.equal(clipCreditHandle({ source_creator: null }), null);
});

test('the credit line mentions a handle, or names the channel as a YouTube credit', () => {
  assert.equal(clipCreditLine(handleClip), '🎥 Clip via @ozarkmediaco');
  assert.equal(clipCreditLine(nameClip), '🎥 Clip via Ozark Media Co on YouTube');
  // Legacy rows: no source_creator, but the channel column is filled.
  assert.equal(
    clipCreditLine({ source_creator: null, youtube_channel: 'Show Me Creeks' }),
    '🎥 Clip via Show Me Creeks on YouTube',
  );
  assert.equal(clipCreditLine({ source_creator: null }), null);
});

test('only the canonical credit line counts as attribution — a passing mention does not', () => {
  assert.equal(captionCreditsClip('Some water.\n\n🎥 Clip via @OzarkMediaCo', handleClip), true);
  assert.equal(captionCreditsClip('Thanks @ozarkmediaco for the footage!', handleClip), false);
  assert.equal(captionCreditsClip('Ozark Media Co went out again.', nameClip), false);
});

test('finalizeClipBody: credit restored, CTA last, no matter what the draft did', () => {
  assert.equal(CLIP_CAPTION_CTA, 'Download the Eddy River Guide on iOS');

  // The draft kept the CTA but dropped the credit: the credit must go in
  // BEFORE the CTA, never after it.
  assert.equal(
    finalizeClipBody(`Some water.\n\n${CLIP_CAPTION_CTA}`, handleClip),
    `Some water.\n\n🎥 Clip via @ozarkmediaco\n${CLIP_CAPTION_CTA}`,
  );
  // A passing mention is not the credit; the canonical line is still added.
  assert.equal(
    finalizeClipBody('Thanks @ozarkmediaco!', handleClip),
    `Thanks @ozarkmediaco!\n\n🎥 Clip via @ozarkmediaco\n${CLIP_CAPTION_CTA}`,
  );
  // The draft had both, in the right order, with its own casing: untouched
  // apart from the CTA being normalised.
  assert.equal(
    finalizeClipBody(`Good stuff.\n\n🎥 Clip via @OzarkMediaCo\ndownload the eddy river guide on ios!`, handleClip),
    `Good stuff.\n\n🎥 Clip via @OzarkMediaCo\n${CLIP_CAPTION_CTA}`,
  );
  // The draft put the CTA first: it is lifted to the end.
  assert.equal(
    finalizeClipBody(`${CLIP_CAPTION_CTA}\n\nThen some water.\n🎥 Clip via Ozark Media Co on YouTube`, nameClip),
    `Then some water.\n🎥 Clip via Ozark Media Co on YouTube\n${CLIP_CAPTION_CTA}`,
  );
  // Nothing known about the creator → just the CTA.
  assert.equal(finalizeClipBody('Some water.', { source_creator: null }), `Some water.\n${CLIP_CAPTION_CTA}`);
  // Every result ends on the CTA line.
  for (const draft of ['x', `${CLIP_CAPTION_CTA}\nx`, 'x\n🎥 Clip via @ozarkmediaco']) {
    assert.ok(finalizeClipBody(draft, handleClip).endsWith(`\n${CLIP_CAPTION_CTA}`));
  }
});

test('the template caption credits, tags, sells the app, and never says "plan this float"', () => {
  const tier1 = buildClipCaption('Current River', handleClip);
  assert.equal(tier1.body, `🛶 Current River.\n\n🎥 Clip via @ozarkmediaco\n${CLIP_CAPTION_CTA}`);
  assert.deepEqual(tier1.hashtags.slice(0, 1), ['#CurrentRiver']);
  assert.ok(tier1.hashtags.includes('#Missouri'));

  const tier2 = buildClipCaption(null, nameClip);
  assert.match(tier2.body, /^🛶 Ozark paddling\./);
  assert.match(tier2.body, /Clip via Ozark Media Co on YouTube/);
  assert.ok(!tier2.hashtags.includes('#Missouri'), 'an unconfirmed location gets no Missouri tag');
  for (const body of [tier1.body, tier2.body]) {
    assert.doesNotMatch(body, /plan (this|your) float/i);
  }
});

test('assembly appends the hashtag block unless the body already carries tags', () => {
  const draft = buildClipCaption('Current River', handleClip);
  assert.equal(assembleClipCaption(draft.body, draft.hashtags), `${draft.body}\n\n${draft.hashtags.join(' ')}`);
  assert.equal(assembleClipCaption('Water #kayaking', ['#float']), 'Water #kayaking');
});

// ─── resolve-credit.py — the rule both pipeline paths run ──────────────────

const RESOLVER = join(process.cwd(), '..', 'scripts', 'clipengine', 'resolve-credit.py');
const CHANNELS = join(process.cwd(), '..', 'clipengine-local', 'channels.json');

function resolve(video: Record<string, unknown>, channelsPath = CHANNELS, ...extra: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'clip-credit-'));
  const heatmap = join(dir, 'heatmap-data.json');
  writeFileSync(heatmap, JSON.stringify(video));
  const run = spawnSync('python3', [RESOLVER, heatmap, channelsPath, ...extra], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
}

test('resolver: a channel with an Instagram in channels.json resolves to that @handle', () => {
  // The scraped handle's case never matches the file's exactly.
  assert.equal(
    resolve({ channel: 'Ozark Media Co', channel_handle: '@ozarkmediaco', channel_url: 'https://www.youtube.com/@ozarkmediaco' }),
    '@ozarkmediaco',
  );
  // No handle in the scrape, but the URL names it.
  assert.equal(
    resolve({ channel: 'Show Me Creeks', channel_handle: '', channel_url: 'https://www.youtube.com/@ShowMeCreeks' }),
    '@showmecreeks',
  );
});

test('resolver: a channel without an Instagram is credited by name, never by its YouTube handle', () => {
  // @AROwnBackyard is in channels.json with instagram "" — the YouTube handle
  // must NOT become an @mention (it would tag whoever owns that Instagram name).
  assert.equal(
    resolve({ channel: 'AR Own Backyard', channel_handle: '@AROwnBackyard', channel_url: 'https://www.youtube.com/@AROwnBackyard' }),
    'AR Own Backyard',
  );
  assert.equal(resolve({ channel: 'Nobody Listed', channel_handle: '@nobody' }), 'Nobody Listed');
});

test('resolver: --instagram wins, and channel id / path urls match too', () => {
  assert.equal(resolve({ channel: 'Nobody Listed', channel_handle: '@nobody' }, CHANNELS, '--instagram', '@Some.One'), '@some.one');

  const dir = mkdtempSync(join(tmpdir(), 'clip-credit-channels-'));
  const channels = join(dir, 'channels.json');
  writeFileSync(
    channels,
    JSON.stringify([
      { url: 'https://www.youtube.com/channel/UCabc', river_slug: '', instagram: 'byid' },
      { url: 'https://www.youtube.com/c/PaddleFolk', river_slug: '', instagram: 'bypath' },
      'https://www.youtube.com/@bare',
    ]),
  );
  assert.equal(resolve({ channel: 'X', channel_id: 'UCabc' }, channels), '@byid');
  assert.equal(resolve({ channel: 'Paddle Folk', channel_url: 'https://www.youtube.com/c/paddlefolk' }, channels), '@bypath');
  assert.equal(resolve({ channel: 'Bare', channel_handle: '@bare' }, channels), 'Bare');
  // A missing channels file is an empty one.
  assert.equal(resolve({ channel: 'Bare', channel_handle: '@bare' }, join(dir, 'missing.json')), 'Bare');
});
