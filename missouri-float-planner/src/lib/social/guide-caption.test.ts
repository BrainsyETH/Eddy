// src/lib/social/guide-caption.test.ts
//
// The weekday river-guide Facebook post is written by the social-caption model
// in Eddy's voice, grounded only on the guide's published points, and backed
// by the deterministic template. Nothing here calls a model: these tests pin
// what the model is told, what the lint lets through, how a draft is finished,
// and that the template still posts when there is no model.

import assert from 'node:assert/strict';
import test from 'node:test';
import { GUIDE_CAPTION_CTA, GUIDE_OPENINGS, finalizeGuideBody } from './blog-voice';
import { buildBlogCaption, composeBlogCaption, guideCaptionPoints, type BlogRow } from './blog-poster';
import { buildGuidePrompt, findAccuracyViolations, parseDraft } from './caption-generator';
import { EDDY_VOICE } from '@/lib/eddy/voice';
import { resolveConfiguredModels } from '@/lib/ai/resolve-models';

const stFrancis: BlogRow = {
  id: 'id', slug: 'st-francis-river-float-trips-missouri',
  title: 'St. Francis River Float Trip Guide: Shut-Ins Country & Quieter Reaches',
  description: 'Granite country and two very different kinds of river day.',
  og_image_url: null, featured_image_url: null, river_slug: 'st-francis', last_shared_at: null,
  guide_data: {
    why_different: [{ strong: 'The shut-ins are a destination.', body: 'Millstream Gardens gives the river a character unlike the broad gravel-bed floats elsewhere in Missouri.' }],
    pro_tips: [{ strong: 'See the whitewater from the trail first.', body: 'A visit to Millstream Gardens can be satisfying without putting a recreational canoe into the shut-ins.' }],
    pre_launch_notes: [{ strong: 'Know which experience you booked.', body: 'A shut-ins whitewater run is not interchangeable with a lower-river float. Blue Spring is 310 ft deep; late summer can run bony.' }],
  },
};

test('the guide prompt carries Eddy’s voice, the grounding, and nothing clip-specific', () => {
  const { opening, points } = guideCaptionPoints(stFrancis);
  const prompt = buildGuidePrompt({ title: stFrancis.title, opening, points }, 'St. Francis River', GUIDE_CAPTION_CTA,
    ['Yesterday’s hook'], 'Wednesday, October 28, 2026', 'fall');
  assert.ok(prompt.includes(EDDY_VOICE));
  assert.ok(prompt.includes(GUIDE_OPENINGS['st-francis']));
  for (const point of points) assert.ok(prompt.includes(point));
  assert.ok(prompt.includes(`verbatim, on its own line: ${GUIDE_CAPTION_CTA}`));
  assert.ok(prompt.includes('Facebook'));
  assert.ok(prompt.includes('ARTICLE TITLE (do not repeat)'));
  assert.ok(prompt.includes('Yesterday’s hook'));
  assert.match(prompt, /evergreen guide, NOT today's conditions/);
  assert.match(prompt, /Do NOT output bullets, headings, bold labels/);
  assert.match(prompt, /"cleared", "good to go"/);
  assert.ok(!prompt.includes('CLIP SHOWS'));
  assert.ok(!prompt.includes('ATTRIBUTION'));
  assert.ok(!prompt.includes('Instagram'));
  assert.ok(prompt.endsWith('HASHTAGS: none'));
});

test('the lint accepts figures and seasons the guide states and rejects invented ones', () => {
  const grounding = guideCaptionPoints(stFrancis).points.join('\n');
  const ctx = { season: 'fall' as const, hasLiveData: false, allowLocation: true, grounding };
  const quoted = { caption: 'Blue Spring is 310 ft deep, and late summer can run bony up top.', hashtags: [] };
  assert.deepEqual(findAccuracyViolations(quoted, ctx), []);
  const invented = { caption: 'The gauge sits at 2.4 ft and the water is 68° this summer.', hashtags: [] };
  const violations = findAccuracyViolations(invented, ctx);
  assert.ok(violations.some((v) => v.includes('2.4 ft')));
  assert.ok(violations.some((v) => v.includes('summer')));
  // Without grounding (the clip path) the quoted figure is still a fabrication.
  assert.ok(findAccuracyViolations(quoted, { ...ctx, grounding: undefined }).some((v) => v.includes('310 ft')));
  // Go / no-go language never passes, grounded or not.
  const cleared = { caption: 'You’re good to go on the lower river this weekend.', hashtags: [] };
  assert.ok(findAccuracyViolations(cleared, ctx).some((v) => v.includes('good to go')));
  assert.ok(findAccuracyViolations({ caption: 'Safe to launch below the shut-ins.', hashtags: [] }, ctx).length > 0);
});

test('a model draft is finished into prose that ends on the CTA, with no URL, hashtags or labels', () => {
  const draft = parseDraft(`HOOK: The St. Francis has more than one mood.
CAPTION: The St. Francis has more than one mood.

The shut-ins at Millstream Gardens are their own kind of day, and you can see that whitewater from the trail without ever putting a canoe in it. https://eddy.guide/blog/st-francis-river-float-trips-missouri

Grab the guide on Eddy 👇
#floattrip #ozarks
HASHTAGS: none`);
  assert.equal(draft.source, 'model');
  assert.deepEqual(draft.hashtags, []);
  const body = finalizeGuideBody(draft.caption);
  assert.ok(body.endsWith(`\n\n${GUIDE_CAPTION_CTA}`));
  assert.equal(body.split(GUIDE_CAPTION_CTA).length, 2);
  assert.ok(!body.includes('http'));
  assert.ok(!body.includes('#'));
  assert.ok(!body.includes('Grab the guide'));
  assert.ok(!/HOOK:|CAPTION:/.test(body));
  assert.ok(body.startsWith('The St. Francis has more than one mood.'));
  assert.ok(!body.includes('\n\n\n'));
  assert.equal(finalizeGuideBody(''), GUIDE_CAPTION_CTA);
});

test('without a model key the template posts, unchanged, and the guide path never templates a clip', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const model = resolveConfiguredModels({ river_update: null, gauge_update: null, global_summary: null, social_caption: null }).social_caption;
    const result = await composeBlogCaption(stFrancis, model);
    assert.equal(result.source, 'template');
    assert.equal(result.caption, buildBlogCaption(stFrancis));
    assert.ok(result.caption.startsWith(GUIDE_OPENINGS['st-francis']));
    assert.ok(result.caption.endsWith(GUIDE_CAPTION_CTA));
    assert.ok(!result.caption.includes('🛶'));
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
