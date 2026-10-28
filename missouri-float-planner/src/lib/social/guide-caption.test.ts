// src/lib/social/guide-caption.test.ts
//
// The weekday river-guide Facebook post is written by the social-caption model
// in Eddy's voice, grounded only on the guide's published points, and backed
// by the deterministic template. Nothing here calls a model: these tests pin
// what the model is told, what the lint lets through, how a draft is finished,
// and that the template still posts when there is no model.
//
// The "robotic" fixtures are the actual published posts that prompted this
// work, so the lint is tested against the failure it exists to catch.

import assert from 'node:assert/strict';
import test from 'node:test';
import { GUIDE_CAPTION_CTA, GUIDE_OPENINGS, finalizeGuideBody } from './blog-voice';
import {
  MODEL_POINT_LIMIT,
  buildBlogCaption,
  composeBlogCaption,
  guideCaptionPoints,
  type BlogRow,
} from './blog-poster';
import { buildGuidePrompt, copiedRun, findAccuracyViolations, parseDraft } from './caption-generator';
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

// The Arkansas Spring River guide as published, and the model's first post
// from it (2026-10-28), which read like the bullets it came from.
const springRiver: BlogRow = {
  id: 'id', slug: 'spring-river-float-trips-arkansas',
  title: 'Spring River (Arkansas) Float Trip Guide: Mammoth Spring, Hardy & Day Floats',
  description: 'A spring-fed Arkansas river with two kinds of trip.',
  og_image_url: null, featured_image_url: null, river_slug: 'spring-river', last_shared_at: null,
  guide_data: {
    why_different: [
      { strong: 'A real spring-country visit.', body: 'Mammoth Spring State Park adds an easy focal point for the weekend, even if you float farther downstream.' },
      { strong: 'Cold water is part of the character.', body: 'The spring-fed setting makes a dry layer worthwhile even on a sunny day.' },
      { strong: 'Hardy divides the planning conversation.', body: 'An upper-river ledge run and a downstream float are different choices. Get the exact endpoint names before agreeing to a trip.' },
    ],
    pro_tips: [
      { strong: 'Visit the spring on land.', body: 'Keep the park’s dam and spillway out of your paddling plan. Enjoy the spring as a separate stop.' },
      { strong: 'Spell out Arkansas when searching.', body: 'Missouri also has a Spring River, near Carthage. An access or level report from that river will not help here.' },
      { strong: 'Ask about the specific ledges.', body: 'If booking an upper run, ask which drops it includes and how the trip suits your group at the current level.' },
    ],
    pre_launch_notes: [
      { strong: 'Name the reach, not just the river.', body: 'An upper ledge trip and the below-Hardy outing are different plans.' },
    ],
  },
};

const roboticSpringRiverPost = `Mammoth Spring is worth a stop before your Arkansas Spring River trip. The paddle can have its own chapter.

The spring itself is a land stop — walk the state park, take it in, and keep the dam and spillway out of your paddling plan entirely. They're not part of the float.

When you're ready to look at the water, know which reach you're actually planning. The upper ledge trips and the floats below Hardy are different outings, not interchangeable.`;

const humanSpringRiverPost = `Heading down to float the Spring River in Arkansas? Give yourself an hour at Mammoth Spring first.

It's a walk-around state park, not something you paddle, and the dam below it isn't part of any float. The water's spring-fed, so it stays cold even when the sun's out. Bring a dry layer.

One more thing: this river is really two trips. Ledge drops up top, an easier float below Hardy. Pick the one you mean before you book a shuttle.`;

function grounding(blog: BlogRow) {
  const { opening, points } = guideCaptionPoints(blog, MODEL_POINT_LIMIT);
  return [opening ?? '', ...points].join('\n');
}

test('the guide prompt carries Eddy’s voice, the angle, every point, and nothing clip-specific', () => {
  const { opening, points } = guideCaptionPoints(springRiver, MODEL_POINT_LIMIT);
  assert.equal(points.length, 7);
  const prompt = buildGuidePrompt({ title: springRiver.title, opening, points }, 'Spring River (Arkansas)', GUIDE_CAPTION_CTA,
    ['Yesterday’s guide post'], 'Wednesday, October 28, 2026', 'fall');
  assert.ok(prompt.includes(EDDY_VOICE));
  assert.ok(prompt.includes(`in your own words, not this sentence): ${GUIDE_OPENINGS['spring-river']}`));
  for (const point of points) assert.ok(prompt.includes(point));
  assert.ok(prompt.includes(`verbatim, on its own line: ${GUIDE_CAPTION_CTA}`));
  assert.ok(prompt.includes('Facebook'));
  assert.ok(prompt.includes('ARTICLE TITLE (do not repeat)'));
  assert.ok(prompt.includes('Yesterday’s guide post'));
  assert.match(prompt, /evergreen guide, NOT today's conditions/);
  assert.match(prompt, /string of commands/);
  assert.match(prompt, /Do not copy a sentence, a phrase, or a label/);
  assert.match(prompt, /ROBOTIC: .*\nHUMAN: /);
  assert.match(prompt, /"cleared", "good to go"/);
  assert.ok(!prompt.includes('CLIP SHOWS'));
  assert.ok(!prompt.includes('ATTRIBUTION'));
  assert.ok(!prompt.includes('Instagram'));
  assert.ok(prompt.endsWith('HASHTAGS: none'));
});

test('the lint rejects the published robotic post and accepts a human rewrite of the same facts', () => {
  const ctx = { season: 'fall' as const, hasLiveData: false, allowLocation: true, grounding: grounding(springRiver) };
  const violations = findAccuracyViolations({ caption: roboticSpringRiverPost, hashtags: [] }, ctx);
  assert.ok(violations.some((v) => v.startsWith('copies the guide')), violations.join('; '));
  assert.ok(violations.some((v) => /brochure wording/.test(v)), violations.join('; '));
  // The canned opening pasted as the first line is itself a copy.
  assert.equal(copiedRun(GUIDE_OPENINGS['spring-river'], grounding(springRiver)), 'mammoth spring is worth a stop before');
  // Lifted wording is caught even when the surrounding sentence changed.
  assert.ok(copiedRun('Please keep the dam and spillway out of your paddling plan, okay?', grounding(springRiver)));
  // A place name is never a copy on its own.
  assert.equal(copiedRun('Mammoth Spring State Park is a nice stop.', grounding(springRiver)), null);
  assert.deepEqual(findAccuracyViolations({ caption: humanSpringRiverPost, hashtags: [] }, ctx), []);
  // Without grounding (the clip path) neither check runs.
  assert.deepEqual(findAccuracyViolations({ caption: 'Different outings, not interchangeable.', hashtags: [] }, { ...ctx, grounding: undefined }), []);
});

test('the lint accepts figures and seasons the guide states and rejects invented ones', () => {
  const ctx = { season: 'fall' as const, hasLiveData: false, allowLocation: true, grounding: grounding(stFrancis) };
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

test('a model draft is finished into prose that ends on the CTA, with no URL, hashtags, labels or em-dashes', () => {
  const draft = parseDraft(`HOOK: The St. Francis has more than one mood.
CAPTION: The St. Francis has more than one mood.

The shut-ins at Millstream Gardens are their own kind of day — you can see that whitewater from the trail without ever putting a canoe in it. https://eddy.guide/blog/st-francis-river-float-trips-missouri

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
  assert.ok(!body.includes('—'));
  assert.ok(body.includes('kind of day, you can see'));
  assert.ok(!body.includes('Grab the guide'));
  assert.ok(!/HOOK:|CAPTION:/.test(body));
  assert.ok(body.startsWith('The St. Francis has more than one mood.'));
  assert.ok(!body.includes('\n\n\n'));
  assert.equal(finalizeGuideBody(''), GUIDE_CAPTION_CTA);
});

test('the template keeps three points while the model is shown them all', () => {
  assert.equal(guideCaptionPoints(springRiver).points.length, 3);
  assert.equal(guideCaptionPoints(springRiver, MODEL_POINT_LIMIT).points.length, 7);
  const caption = buildBlogCaption(springRiver);
  assert.equal(caption.split('\n\n').length, 5);
  assert.ok(caption.startsWith(GUIDE_OPENINGS['spring-river']));
  assert.ok(caption.endsWith(GUIDE_CAPTION_CTA));
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
