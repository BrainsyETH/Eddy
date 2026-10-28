// src/lib/social/guide-caption.test.ts
//
// The weekday river-guide Facebook post is a short, friendly note about one
// interesting thing in the guide, ending with a light nod to the guide. The
// social-caption model writes it from the guide's interesting parts (never
// its advice bullets), the accuracy lint keeps it honest and un-salesy, and
// the deterministic template posts when there is no model. Nothing here calls
// a model.
//
// The "robotic" fixture is the actual published post that prompted this work,
// so the lint is tested against the failure it exists to catch.

import assert from 'node:assert/strict';
import test from 'node:test';
import { GUIDE_CAPTION_CTA, GUIDE_OPENINGS, finalizeGuideBody } from './blog-voice';
import { guideMaterial } from './blog-highlights';
import {
  buildBlogCaption,
  composeBlogCaption,
  guideCaptionMaterial,
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
    hero: { lede: 'Granite scenery and whitewater give the St. Francis its character.' },
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
    hero: { lede: 'Visit the big spring on land, then choose your paddle downstream. The Arkansas Spring River changes character between Mammoth Spring and Hardy; the name alone doesn’t describe the trip.' },
    intro_html: '<p><strong>The Arkansas Spring River begins with a spring worth seeing before you ever unload a boat.</strong> Mammoth Spring State Park makes a memorable stop, and the cold water flowing out of that area sets the tone downstream.</p>',
    springs: [{ name: 'Mammoth Spring State Park', note: 'Visit the spring and historic park features on foot. The dam at the spring belongs to the sightseeing plan, not to the Hardy-to-LB paddle.' }],
    why_different: [
      { strong: 'A real spring-country visit.', body: 'Mammoth Spring State Park adds an easy focal point for the weekend, even if you float farther downstream.' },
      { strong: 'Cold water is part of the character.', body: 'The spring-fed setting makes a dry layer worthwhile even on a sunny day.' },
      { strong: 'Hardy divides the planning conversation.', body: 'An upper-river ledge run and a downstream float are different choices. Get the exact endpoint names before agreeing to a trip.' },
    ],
    pro_tips: [
      { strong: 'Visit the spring on land.', body: 'Keep the park’s dam and spillway out of your paddling plan. Enjoy the spring as a separate stop.' },
      { strong: 'Spell out Arkansas when searching.', body: 'Missouri also has a Spring River, near Carthage. An access or level report from that river will not help here.' },
    ],
    pre_launch_notes: [
      { strong: 'Name the reach, not just the river.', body: 'An upper ledge trip and the below-Hardy outing are different plans.' },
    ],
  },
};

const roboticSpringRiverPost = `Mammoth Spring is worth a stop before your Arkansas Spring River trip. The paddle can have its own chapter.

The spring itself is a land stop — walk the state park, take it in, and keep the dam and spillway out of your paddling plan entirely. They're not part of the float.

When you're ready to look at the water, know which reach you're actually planning. The upper ledge trips and the floats below Hardy are different outings, not interchangeable.`;

const friendlySpringRiverPost = `Here's a nice thing about the Spring River in Arkansas: it starts at a spring big enough to have a state park built around it.

Mammoth Spring is the kind of place you wander around for an hour before you ever see the river. The water coming out of it is cold, which you notice fast. There's more about it in the guide.`;

const ctx = (blog: BlogRow) => ({
  season: 'fall' as const, hasLiveData: false, allowLocation: true, grounding: guideCaptionMaterial(blog).join('\n'),
});

test('the model is shown the guide’s interesting parts and never its advice bullets', () => {
  const material = guideMaterial(springRiver.guide_data);
  assert.ok(material[0].startsWith('Visit the big spring on land'));
  assert.ok(material.some((m) => m.startsWith('The Arkansas Spring River begins with a spring')));
  assert.ok(material.some((m) => m.startsWith('Mammoth Spring State Park: Visit the spring')));
  assert.ok(material.some((m) => m.startsWith('Cold water is part of the character.')));
  assert.ok(!material.some((m) => /dam and spillway out of your paddling plan|Spell out Arkansas|Name the reach/.test(m)));
  assert.ok(!material.some((m) => m.includes('<')));
  // A legacy blog with no structured data falls back to its description.
  assert.deepEqual(guideCaptionMaterial({ ...springRiver, guide_data: null }), [springRiver.description]);
  assert.deepEqual(guideMaterial(null), []);
});

test('the guide prompt asks for one friendly thing and a light nod, with Eddy’s voice and nothing clip-specific', () => {
  const material = guideCaptionMaterial(springRiver);
  const prompt = buildGuidePrompt({ title: springRiver.title, material }, 'Spring River (Arkansas)',
    ['Yesterday’s guide post'], 'Wednesday, October 28, 2026', 'fall');
  assert.ok(prompt.includes(EDDY_VOICE));
  for (const m of material) assert.ok(prompt.includes(m));
  assert.match(prompt, /pick ONE thing/);
  assert.match(prompt, /nods to the guide without asking for anything/);
  assert.match(prompt, /No instructions and no warnings/);
  assert.match(prompt, /Do not explain WHY/);
  assert.match(prompt, /35 to 70 words/);
  assert.ok(prompt.includes('Facebook'));
  assert.ok(prompt.includes('ARTICLE TITLE (do not repeat)'));
  assert.ok(prompt.includes('Yesterday’s guide post'));
  assert.ok(!prompt.includes(GUIDE_OPENINGS['spring-river']));
  assert.ok(!prompt.includes('verbatim'));
  assert.ok(!prompt.includes('CLIP SHOWS'));
  assert.ok(!prompt.includes('ATTRIBUTION'));
  assert.ok(!prompt.includes('Instagram'));
  assert.ok(prompt.endsWith('HASHTAGS: none'));
});

test('the lint rejects the published robotic post and accepts a friendly post about one thing', () => {
  const c = ctx(springRiver);
  const violations = findAccuracyViolations({ caption: roboticSpringRiverPost, hashtags: [] }, c);
  assert.ok(violations.some((v) => /brochure wording|paddling jargon/.test(v)), violations.join('; '));
  assert.ok(violations.some((v) => v.startsWith('never mentions the guide')), violations.join('; '));
  // Its opening was the curated line pasted verbatim; against material that
  // contains that line, the copy check catches it too.
  assert.ok(copiedRun(roboticSpringRiverPost, GUIDE_OPENINGS['spring-river']));
  assert.deepEqual(findAccuracyViolations({ caption: friendlySpringRiverPost, hashtags: [] }, c), []);
  // Lifted wording is caught even when the surrounding sentence changed.
  assert.ok(copiedRun('Honestly, visit the spring and historic park features on foot, okay?', c.grounding));
  // A place name is never a copy on its own.
  assert.equal(copiedRun('Mammoth Spring State Park is a nice stop.', c.grounding), null);
});

test('the nod stays a nod: pitches, jargon, missing guide mention and long posts are rejected', () => {
  const c = ctx(springRiver);
  const nod = 'There’s more about it in the guide.';
  const only = (caption: string) => findAccuracyViolations({ caption, hashtags: [] }, c);
  assert.ok(only(`The spring is lovely. Check out the guide 👇`).some((v) => v.startsWith('pitches')));
  assert.ok(only(`The spring is lovely. Get the guide and plan it on Eddy.`).some((v) => v.startsWith('pitches')));
  assert.ok(only(`The spring is lovely. Download the app for the guide.`).some((v) => v.startsWith('pitches')));
  assert.ok(only(`The spring is lovely and the river is lovely too.`).some((v) => v.startsWith('never mentions the guide')));
  assert.ok(only(`Up top you're hopping ledges, then a lazy float. ${nod}`).some((v) => /jargon "ledges"/.test(v)));
  assert.ok(only(`The put-in is right by the park. ${nod}`).some((v) => /jargon/.test(v)));
  assert.ok(only(`It's a Class II river in spots. ${nod}`).some((v) => /jargon/.test(v)));
  assert.ok(only(`${'The river is lovely and the spring is lovely. '.repeat(11)}${nod}`).some((v) => /runs \d+ words/.test(v)));
  assert.deepEqual(only(`The spring is lovely. ${nod}`), []);
  // Without grounding (the clip path) none of the guide-only checks run.
  assert.deepEqual(findAccuracyViolations({ caption: 'Download the app. Different outings, not interchangeable, ledges.', hashtags: [] }, { ...c, grounding: undefined }), []);
});

test('the lint accepts figures and seasons the guide states and rejects invented ones', () => {
  const c = ctx(stFrancis);
  const grounded = { ...c, grounding: `${c.grounding}\nBlue Spring is 310 ft deep; late summer can run bony.` };
  const quoted = { caption: 'Blue Spring is 310 ft deep, and late summer can run low up top. More in the guide.', hashtags: [] };
  assert.deepEqual(findAccuracyViolations(quoted, grounded), []);
  const invented = { caption: 'The gauge sits at 2.4 ft and the water is 68° this summer. More in the guide.', hashtags: [] };
  const violations = findAccuracyViolations(invented, grounded);
  assert.ok(violations.some((v) => v.includes('2.4 ft')));
  assert.ok(violations.some((v) => v.includes('summer')));
  // Without grounding (the clip path) the quoted figure is still a fabrication.
  assert.ok(findAccuracyViolations(quoted, { ...c, grounding: undefined }).some((v) => v.includes('310 ft')));
  // Go / no-go language never passes, grounded or not.
  assert.ok(findAccuracyViolations({ caption: 'You’re good to go on the lower river. More in the guide.', hashtags: [] }, c).some((v) => v.includes('good to go')));
  assert.ok(findAccuracyViolations({ caption: 'Safe to launch below the shut-ins.', hashtags: [] }, c).some((v) => v.includes('Safe to launch')));
});

test('a model draft is tidied: no URL, hashtags, labels or em-dashes, and nothing appended', () => {
  const draft = parseDraft(`HOOK: The St. Francis has more than one mood.
CAPTION: The St. Francis has more than one mood.

The granite at Millstream Gardens is its own kind of scenery — you can see the whitewater from the trail without ever getting in a boat. https://eddy.guide/blog/st-francis-river-float-trips-missouri

There's more about it in the guide.
#floattrip #ozarks
HASHTAGS: none`);
  assert.equal(draft.source, 'model');
  assert.deepEqual(draft.hashtags, []);
  const body = finalizeGuideBody(draft.caption);
  assert.ok(body.endsWith("There's more about it in the guide."));
  assert.ok(!body.includes('http'));
  assert.ok(!body.includes('#'));
  assert.ok(!body.includes('—'));
  assert.ok(body.includes('scenery, you can see'));
  assert.ok(!/HOOK:|CAPTION:/.test(body));
  assert.ok(body.startsWith('The St. Francis has more than one mood.'));
  assert.ok(!body.includes('\n\n\n'));
  assert.ok(!body.includes(GUIDE_CAPTION_CTA));
  assert.equal(finalizeGuideBody(''), '');
});

test('the template keeps its opening, three advice points and soft closing line', () => {
  assert.equal(guideCaptionPoints(springRiver).points.length, 3);
  const caption = buildBlogCaption(springRiver);
  assert.equal(caption.split('\n\n').length, 5);
  assert.ok(caption.startsWith(GUIDE_OPENINGS['spring-river']));
  assert.ok(caption.endsWith(GUIDE_CAPTION_CTA));
  assert.ok(!/👇|get the guide/i.test(caption));
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
