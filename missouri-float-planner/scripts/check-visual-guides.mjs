// Real-browser checks for the private, offline-capable guide collection.
// npm run test:visual-guides (requires `npx playwright install chromium`).
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const root = resolve('content/admin-visuals');
const files = (await readdir(root)).filter(file => file.endsWith('.html'));
let checks = 0;
const expect = (value, message) => { assert.ok(value, message); checks++; };
async function slider(page, selector, value) {
  await page.locator(selector).evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function exercises(page, file) {
  switch (file) {
    case 'condition-ladder.html': {
      for (const unit of ['ft','cfs']) {
        await page.locator(`[data-u="${unit}"]`).click();
        for (const value of [.4,1.2,2.57,3.4,7,13.4]) {
          await slider(page, '#stage', value);
          expect((await page.locator('#v-display').innerText()).length > 10, 'rating rendered');
        }
      }
      await page.locator('[data-p="dead"]').click();
      expect((await page.locator('#v-strict').innerText()).includes('Unknown'), 'missing matching unit is unknown for alerts');
      await page.locator('.vx-missing summary').click();
      await page.locator('#deadCfs').check();
      expect((await page.locator('#v-display').innerText()).includes('Unknown'), 'both readings missing');
      await page.locator('[data-p="doc"]').click();
      await page.locator('#unrated').check();
      expect((await page.locator('#v-display').innerText()).includes('Unknown'), 'no ladder');
      await page.locator('[data-p="flood"]').click();
      expect((await page.locator('#v-strict').innerText()).includes('Flood'), 'flood override survives missing flow');
      break;
    }
    case 'float-board.html': {
      for (const river of await page.locator('#rivers button').all()) {
        await river.click();
        for (const level of await page.locator('#levels button').all()) {
          await level.click();
          const text = await page.locator('#result').innerText();
          expect(text.includes('Trip time') || text.includes('Paddling only'), 'trip result at each water level');
          if ((await level.innerText()).includes('Flood')) expect(text.includes('no float time'), 'withhold time in flood');
        }
        const options = await page.locator('#putin option').evaluateAll(nodes => nodes.filter(node => node.value !== '' && !node.disabled).map(node => node.value));
        await page.locator('#putin').selectOption(options[options.length - 1]);
        expect(!(await page.locator('#result').innerText()).includes('typical trip'), 'invalid downstream selection cannot retain old estimate');
      }
      break;
    }
    case 'below-the-dam.html': {
      for (const launch of ['300','360','540']) {
        await page.locator('#launch').selectOption(launch);
        expect(await page.locator('#scrub').inputValue() === launch, 'launch selection jumps to that time');
        expect((await page.locator('#play').innerText()).includes('Play'), 'launch choice pauses playback');
        for (const time of [0,540,720,960]) await slider(page, '#scrub', time);
        expect((await page.locator('#callout').innerText()).length > 20, 'launch outcome');
      }
      await page.locator('#restart').click();
      expect(await page.locator('#scrub').inputValue() === '0', 'restart resets the day');
      break;
    }
    case 'how-eddys-read-works.html': {
      for (const scenario of await page.locator('#scen button').all()) {
        await scenario.click();
        expect(await page.locator('#prev').isDisabled(), 'scenario starts at first step');
        for (let i=0;i<7;i++) {
          if (i) await page.locator('#next').click();
          expect((await page.locator('#detail').innerText()).length > 20, 'every scenario step renders');
          expect(await page.locator('#vx-step').inputValue() === String(i), 'mobile step selector stays in sync');
        }
        expect(await page.locator('#next').isDisabled(), 'last step stops');
        expect((await page.locator('#play').innerText()).includes('Replay'), 'last step offers replay');
      }
      break;
    }
    case 'ios-plumbing.html': {
      for (const offline of [false,true]) {
        if (offline) await page.locator('#b-off').click();
        for (const id of ['b-launch','b-map','b-buy','b-push','b-fg']) {
          await page.locator('#'+id).click();
          await page.waitForFunction(id => !document.getElementById(id).disabled, id);
          expect((await page.locator('#vx-result').innerText()).length > 20, 'each action has visible outcome');
          if (offline && id === 'b-buy') expect((await page.locator('#vx-result').innerText()).includes('needs a connection'), 'offline purchase cannot succeed');
          if (offline && id === 'b-map') expect((await page.locator('#vx-result').innerText()).includes('previously downloaded'), 'offline map availability is qualified');
        }
      }
      // Fall through to exercise every diagram node.
    }
    // eslint-disable-next-line no-fallthrough
    case 'watershed.html':
    case 'social-delta.html': {
      const count = await page.locator('#vx-section option').count();
      for(let i=0;i<count;i++) {
        await page.locator('#vx-section').selectOption(String(i));
        for (const button of await page.locator('.vx-nodes button').all()) {
          await button.click();
          expect(await button.getAttribute('aria-pressed') === 'true', 'selected node announced');
          expect((await page.locator('#detail h2').innerText()).length > 0, 'selected node has explanation');
        }
      }
      const toggle = page.locator('.vx-map-toggle');
      const before = await toggle.getAttribute('aria-expanded'); await toggle.click();
      expect(await toggle.getAttribute('aria-expanded') !== before, 'full diagram disclosure');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      for (const node of await page.locator('#map [role="button"]').all()) {
        await node.focus(); await node.press('Enter');
        expect(await node.getAttribute('aria-pressed') === 'true', 'diagram node works with keyboard');
      }
      if (file !== 'ios-plumbing.html') {
        const log = await page.locator('#log').innerText();
        await page.locator('#storm').click();
        expect(await page.locator('#log').innerText() !== log, 'storm gives immediate feedback');
        if ((await page.locator('#play').innerText()).includes('Play')) await page.locator('#play').click();
        expect((await page.locator('#play').innerText()).includes('Pause'), 'play starts the demo');
        await page.locator('#play').click();
      }
      break;
    }
    case 'eddys-day.html': {
      for(const timezone of ['central','standard','utc']) {
        await page.locator(`[data-tz="${timezone}"]`).click();
        for(let day=0;day<7;day++) {
          await page.locator(`[data-d="${day}"]`).click();
          for(const minute of [0,375,540,1439]) await slider(page,'#vx-time',minute);
          expect((await page.locator('#firing').innerText()).length > 0, 'day and timezone refresh firing state');
        }
      }
      await page.locator('.job').first().click();
      expect(await page.locator('.job').first().getAttribute('aria-pressed') === 'true', 'task highlights its runs');
      break;
    }
    case 'ios-tour.html': {
      const order = await page.locator('.tab').evaluateAll(nodes => nodes.map(node => node.dataset.tab));
      assert.deepEqual(order,['today','map','floats','favorites','alerts']);checks++;
      for (const tab of order) {
        await page.locator(`[data-tab="${tab}"]`).click();
        expect(await page.locator('.view.on').getAttribute('data-view') === tab, 'correct tour panel');
        for(const marker of await page.locator('.view.on .hs').all()) {
          await marker.click();
          expect(await page.locator('#vx-tour-tip').isVisible(), 'mobile marker explanation opens');
          await page.locator('#vx-tour-tip button').click();
          expect(await marker.evaluate(node => document.activeElement === node), 'focus returns to marker');
        }
      }
      await page.locator('[data-tab="today"]').focus(); await page.keyboard.press('ArrowRight');
      expect(await page.locator('[data-tab="map"]').getAttribute('aria-selected') === 'true', 'arrow navigation');
      for(const theme of ['dark','light','system']) await page.locator(`[data-a="${theme}"]`).click();
      break;
    }
  }
}
try {
  for(const file of files) {
    for(const colorScheme of ['light','dark']) {
      const page = await browser.newPage({viewport:{width:390,height:844},colorScheme,reducedMotion:'reduce'});
      const errors=[];const requests=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('request',request=>{if(/^https?:/.test(request.url())) requests.push(request.url());});
      await page.goto(pathToFileURL(resolve(root,file)).href);
      await page.evaluate(()=>document.fonts.ready);
      await exercises(page,file);
      for(const width of [320,390,1280]) {
        await page.setViewportSize({width,height:900});
        expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), `${file}: overflow at ${width} ${colorScheme}`);
      }
      assert.deepEqual(errors,[],`${file}: browser errors`);
      assert.deepEqual(requests,[],`${file}: standalone guide made an external request`);
      await page.close();
    }
    console.log(`PASS ${file}`);
  }
  console.log(`${checks} interaction/layout checks passed across ${files.length} guides, light/dark, 320/390/1280px.`);
} finally { await browser.close(); }
