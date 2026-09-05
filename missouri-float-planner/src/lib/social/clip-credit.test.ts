// src/lib/social/clip-credit.test.ts
//
// A reposted clip's caption has two jobs the template used to do only halfway:
// tag the creator, and sell the app. Tagging on Instagram is an @mention of the
// creator's INSTAGRAM handle — the pipeline stores that handle (with its "@")
// in clip_library.source_creator when channels.json knows it, and the bare
// YouTube channel name otherwise. These tests pin the rule that keeps a
// YouTube name from ever being promoted to a mention of a stranger, the
// Facebook-only source link, the backstops that restore a credit or CTA the
// model dropped, and the resolver both pipeline paths share.

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
  clipSourceLine,
  ensureClipCredit,
  ensureClipCta,
} from './clip-credit';

const handleClip = {
  source_creator: '@ozarkmediaco',
  youtube_channel: 'Ozark Media Co',
  source_url: 'https://youtu.be/abc123XYZ_0',
};
const nameClip = {
  source_creator: 'Ozark Media Co',
  youtube_channel: 'Ozark Media Co',
  source_url: 'https://youtu.be/abc123XYZ_0',
};

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

test('the source link is Facebook-only and requires a real URL', () => {
  assert.equal(clipSourceLine(handleClip, 'facebook'), '▶️ Full video: https://youtu.be/abc123XYZ_0');
  assert.equal(clipSourceLine(handleClip, 'instagram'), null);
  assert.equal(clipSourceLine(handleClip, 'tiktok'), null);
  assert.equal(clipSourceLine({ ...handleClip, source_url: 'youtu.be/abc' }, 'facebook'), null);
  assert.equal(clipSourceLine({ ...handleClip, source_url: null }, 'facebook'), null);
});

test('a caption that dropped the credit gets it back; one that kept it is untouched', () => {
  const kept = 'Some water.\n\n🎥 Clip via @OzarkMediaCo\nmore';
  assert.equal(captionCreditsClip(kept, handleClip), true);
  assert.equal(ensureClipCredit(kept, handleClip), kept);

  const dropped = 'Some water.';
  assert.equal(ensureClipCredit(dropped, handleClip), 'Some water.\n\n🎥 Clip via @ozarkmediaco');
  assert.equal(ensureClipCredit(dropped, nameClip), 'Some water.\n\n🎥 Clip via Ozark Media Co on YouTube');
  // Nothing known → nothing to add.
  assert.equal(ensureClipCredit(dropped, { source_creator: null }), dropped);
});

test('the CTA is the download line with its typeable link, restored when missing', () => {
  assert.equal(CLIP_CAPTION_CTA, 'Download the Eddy River Guide on iOS → eddy.guide/ios');
  const has = 'Go paddle.\n\nDownload the Eddy River Guide on iOS → eddy.guide/ios';
  assert.equal(ensureClipCta(has), has);
  // Mentioning the site is not the same as telling people where to get the app.
  assert.equal(ensureClipCta('Check levels at eddy.guide'), `Check levels at eddy.guide\n\n${CLIP_CAPTION_CTA}`);
});

test('the template caption credits, tags, sells the app, and never says "plan this float"', () => {
  const tier1 = buildClipCaption('Current River', handleClip);
  assert.equal(
    tier1.body,
    '🛶 Current River.\n\n🎥 Clip via @ozarkmediaco\nDownload the Eddy River Guide on iOS → eddy.guide/ios',
  );
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

test('assembly adds the Facebook link before the hashtags, and only there', () => {
  const draft = buildClipCaption('Current River', handleClip);
  const fb = assembleClipCaption(draft.body, draft.hashtags, handleClip, 'facebook');
  const ig = assembleClipCaption(draft.body, draft.hashtags, handleClip, 'instagram');
  assert.equal(fb, `${draft.body}\n\n▶️ Full video: https://youtu.be/abc123XYZ_0\n\n${draft.hashtags.join(' ')}`);
  assert.equal(ig, `${draft.body}\n\n${draft.hashtags.join(' ')}`);
  // A model that wove tags into the body does not get a second block.
  const inline = assembleClipCaption('Water #kayaking', ['#float'], handleClip, 'instagram');
  assert.equal(inline, 'Water #kayaking');
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
