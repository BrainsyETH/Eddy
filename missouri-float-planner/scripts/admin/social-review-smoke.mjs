// The admin and provider responses are local fixtures. Sending never leaves the test.
import assert from 'node:assert/strict';

export async function checkSocialReview(browser, origin, out) {
  for (const width of [1600, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width < 400 ? 720 : 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    const posts = ['instagram', 'tiktok'].map(platform => ({
      id: platform, post_type: 'manual', media_type: 'video', platform, status: 'review',
      caption: 'Table Rock Dam · November 18\nScheduled generation: Noon–8 PM.',
      video_url: origin + '/fixture-video.mp4', render_request: { compositionId: 'social-dam-schedule' },
      created_at: '2026-11-18T16:00:00Z',
    }));
    let config = { id: 'fixture', updated_at: 'v1', posting_enabled: true, daily_report_auto_publish_enabled: true, disabled_rivers: [], highlight_conditions: [], river_schedules: {}, media_schedule: { section_guide: { mon: 'video', fri: 'video' }, daily_digest: { wed: 'image' }, river_highlight: { thu: 'video' }, weekly_forecast: {} }, video_features: {}, section_guide: { time_cst: '17:00' } };
    const drafts = [];
    const sends = [];
    const damDrafts = [];
    const dams = [
      { id: 'swl-table-rock-dam', name: 'Table Rock Dam', kind: 'schedule' },
      { id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', kind: 'schedule' },
      { id: 'ameren-bagnell-dam', name: 'Bagnell Dam', kind: 'release' },
    ];
    let refuse = true;
    try {
      await context.route('**/fixture-video.mp4', route => route.fulfill({ status: 204 }));
      await context.route('**/api/admin/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/session')) return route.fulfill({ json: { authenticated: true, identity: { name: 'Owner', role: 'owner' } } });
        if (path.endsWith('/posts')) {
          const q = new URL(route.request().url()).searchParams;
          if (q.get('view') === 'scheduled') {
            const scheduled = posts.filter(p => p.status === 'scheduled');
            return route.fulfill({ json: { posts: scheduled, total: scheduled.length } });
          }
          const matches = posts.filter(post => (!q.get('platform') || post.platform === q.get('platform')) &&
            (!q.get('status') || post.status === q.get('status')) && (!q.get('view') || (q.get('view') === 'history') === ['published', 'inbox', 'skipped'].includes(post.status)));
          return route.fulfill({ json: { posts: matches, total: matches.length } });
        }
        if (path.endsWith('/retry')) {
          const { id, action } = route.request().postDataJSON();
          if (action === 'schedule' || action === 'unschedule') {
            const post = posts.find(p => p.id === id);
            assert.equal(post.status, action === 'schedule' ? 'review' : 'scheduled');
            post.status = action === 'schedule' ? 'scheduled' : 'review';
            post.scheduled_at = action === 'schedule' ? '2027-01-16T15:30:00Z' : null;
            if (action === 'schedule') assert.equal(route.request().postDataJSON().time, '2027-01-16T09:30');
            return route.fulfill({ json: { success: true, scheduledAt: post.scheduled_at } });
          }
          if (id === 'measured') {
            if (action === 'approve') return route.fulfill({ status: 409, json: { error: 'A newer Ameren reading is available.', code: 'stale_release' } });
            assert.equal(action, 'regenerate');
            const post = posts.find(p => p.id === id);
            post.status = 'rendering';
            post.video_url = null;
            return route.fulfill({ status: 202, json: { success: true, rendering: true } });
          }
          assert.equal(action, 'approve');
          if (refuse) {
            refuse = false;
            return route.fulfill({ status: 409, json: { error: 'The schedule has changed. Create a new dam video.' } });
          }
          sends.push(id);
          const post = posts.find(p => p.id === id);
          post.status = id === 'tiktok' ? 'inbox' : 'published';
          return route.fulfill({ json: { success: true, delivery: post.status } });
        }
        if (path.endsWith('/dam-schedule')) {
          const query = new URL(route.request().url()).searchParams;
          if (query.has('catalog')) return route.fulfill({ json: { dams } });
          if (route.request().method() === 'POST') {
            damDrafts.push(route.request().postDataJSON());
            return route.fulfill({ status: 202, json: { results: [] } });
          }
          const dam = dams.find(option => option.id === query.get('damId'));
          assert.ok(dam);
          const dates = { today: '2026-11-19', tomorrow: '2026-11-20' };
          if (query.get('date') === dates.tomorrow) return route.fulfill({ status: 409, json: { ...dates, error: 'The generation schedule for this date has not been posted.' } });
          const snapshot = { dam, kind: dam.kind, scheduleDate: dates.today, checkedAt: '2026-11-19T15:00:00Z',
            ...(dam.kind === 'schedule' ? { hours: Array(24).fill(false), minimumFlow: dam.id === 'swl-bull-shoals-dam' } : { releaseCfs: 6500 }) };
          return route.fulfill({ json: { ...dates, snapshot } });
        }
        if (path.endsWith('/health')) return route.fulfill({ json: { videoPipelineHealthy: true, hoursSinceLastSuccessfulVideo: 1, byPlatform: [], recentFallbackReasons: [] } });
        if (path.endsWith('/config')) {
          if (route.request().method() === 'PATCH') {
            const change = route.request().postDataJSON();
            assert.equal(change.version, config.updated_at);
            assert.equal(change.action, 'save_rule');
            assert.deepEqual(change.previousDays, ['fri']); assert.deepEqual(change.days, ['fri']);
            config = { ...config, updated_at: 'v2', media_schedule: { ...config.media_schedule,
              delivery: { section_guide: { fri: change.delivery } } } };
          }
          return route.fulfill({ json: config });
        }
        if (path.endsWith('/quick-post')) {
          drafts.push(route.request().postDataJSON());
          return route.fulfill({ json: { rendering: 3 } });
        }
        if (path.endsWith('/tiktok/status')) return route.fulfill({ json: { configured: true, connected: true, directPost: false } });
        if (path.endsWith('/content')) return route.fulfill({ json: [{ id: 'tip', content_type: 'tip', text: 'Pack a dry bag', active: true, platforms: ['facebook'] }] });
        if (path.endsWith('/publish')) {
          const body = route.request().postDataJSON();
          assert.equal(body.mode, 'draft'); assert.equal(body.caption, 'Launch photos');
          posts.push({ id: 'custom', caption: body.caption, platform: 'facebook', post_type: 'manual', status: 'review', created_at: new Date().toISOString(), media_type: 'image' });
          return route.fulfill({ json: { results: [{ platform: 'facebook', success: true }] } });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto(origin + '/admin/social');
      await page.getByRole('heading', { name: 'Publishing schedule' }).waitFor();
      // Start collecting interaction errors after Next has hydrated the planner.
      page.on('pageerror', err => pageErrors.push(err.stack || err.message));
      const nav = page.getByRole('navigation', { name: 'Social publishing' });
      const day = page.getByRole('group', { name: 'Filter schedule by weekday' });
      await page.screenshot({ path: out + '/publishing-planner-' + width + '.png' });
      await day.getByRole('button', { name: 'fri', exact: true }).click();
      await page.getByRole('button', { name: 'Edit Float Pick schedule' }).click();
      const editor = page.getByRole('region', { name: 'Post editor' });
      await editor.getByRole('combobox', { name: 'Instagram', exact: true }).selectOption('story');
      await editor.getByRole('combobox', { name: 'Facebook', exact: true }).selectOption('both');
      await editor.getByLabel('Time (Central)').fill('09:30');
      await editor.screenshot({ path: out + '/publishing-editor-' + width + '.png' });
      await editor.getByRole('button', { name: 'Save schedule' }).click();
      await page.getByText('Schedule saved', { exact: true }).waitFor();
      assert.equal(config.media_schedule.delivery.section_guide.fri.instagram, 'story');
      await day.getByRole('button', { name: 'fri', exact: true }).click();
      await page.getByText('9:30 AM', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Create Float Pick draft' }).click();
      assert.equal(await editor.getByRole('combobox', { name: 'Instagram', exact: true }).inputValue(), 'story');
      await editor.getByRole('combobox', { name: 'Facebook', exact: true }).selectOption('story');
      await editor.getByRole('button', { name: 'Generate draft' }).click();
      assert.deepEqual(drafts.at(-1).placements, { instagram: 'story', facebook: 'story' });
      await page.getByRole('heading', { name: 'Publishing queue' }).waitFor();
      const table = page.getByRole('table', { name: 'Publishing queue' });
      await table.getByText('Instagram Story').waitFor();
      const tableWidth = (await table.boundingBox()).width;
      const bodyWidth = (await page.locator('#admin-content').boundingBox()).width;
      assert.ok(bodyWidth - tableWidth < 60, 'History uses the full admin workspace');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
      assert.ok(await table.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'No table overflow');
      await table.scrollIntoViewIfNeeded();
      await page.screenshot({ path: out + '/social-history-' + width + '.png' });
      const dialog = page.getByRole('dialog', { name: 'Review Post' });
      for (const post of posts) {
        const row = table.getByRole('row').filter({ hasText: post.platform === 'instagram' ? 'Instagram Story' : 'TikTok' });
        const review = row.getByRole('button', { name: 'Review draft' });
        await review.click();
        await dialog.getByRole('button', { name: 'Download MP4' }).waitFor();
        if (post.platform === 'instagram') {
          await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'hidden' });
          assert.equal(await review.evaluate(el => el === document.activeElement), true);
          await review.click();
          const sendBounds = await dialog.getByRole('button', { name: 'Approve & send' }).boundingBox();
          assert.ok(sendBounds.y + sendBounds.height <= page.viewportSize().height, 'Approval fits without scrolling');
          await page.screenshot({ path: out + '/social-review-' + width + '.png' });
          await dialog.getByRole('button', { name: 'Approve & send' }).click();
          await dialog.getByRole('alert').filter({ hasText: /schedule has changed/ }).waitFor();
        }
        await dialog.getByRole('button', { name: 'Approve & send' }).click();
        await dialog.waitFor({ state: 'hidden' });
        await row.waitFor({ state: 'hidden' });
        assert.equal(await review.count(), 0);
      }
      assert.deepEqual(sends, ['instagram', 'tiktok']);

      await nav.getByRole('button', { name: 'History', exact: true }).click();
      const history = page.getByRole('table', { name: 'Delivery history' });
      await history.getByText('Sent to TikTok inbox').waitFor();
      await history.getByText('Published', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Create post', exact: true }).click();
      await editor.getByRole('combobox', { name: 'Post type', exact: true }).selectOption('dam');
      const damSection = page.getByRole('region', { name: 'Dam generation video' });
      const picker = damSection.getByRole('combobox', { name: 'Dam', exact: true });
      const create = damSection.getByRole('button', { name: 'Create video' });
      await picker.selectOption('swl-bull-shoals-dam');
      await damSection.getByText('Only minimum flow scheduled').waitFor();
      await damSection.getByLabel('Schedule date (Central)').selectOption('2026-11-20');
      await damSection.getByText(/has not been posted/).waitFor();
      assert.equal(await create.isDisabled(), true);
      await picker.selectOption('ameren-bagnell-dam');
      await damSection.getByText('Measured release: 6,500 cfs').waitFor();
      assert.equal(await damSection.getByRole('combobox').count(), 1);
      await create.click();
      await page.getByRole('heading', { name: 'Publishing queue' }).waitFor();
      assert.deepEqual(damDrafts.at(-1), { damId: 'ameren-bagnell-dam', platforms: ['instagram', 'tiktok'] });

      posts.push({ id: 'measured', post_type: 'manual', platform: 'instagram', status: 'review', caption: 'Bagnell Dam',
        media_type: 'video', video_url: origin + '/fixture-video.mp4', created_at: new Date().toISOString(),
        render_request: { compositionId: 'social-dam-schedule', inputProps: { platform: 'instagram', snapshot: { kind: 'release', dam: dams[2] } } } });
      await page.getByRole('button', { name: 'Refresh posts' }).click();
      const measured = table.getByRole('row').filter({ hasText: 'Bagnell Dam' });
      await measured.getByRole('button', { name: 'Review draft' }).click();
      assert.equal(await dialog.getByRole('button', { name: 'Schedule for later' }).count(), 0);
      await dialog.getByRole('button', { name: 'Approve & send' }).click();
      await dialog.getByRole('alert').filter({ hasText: 'A newer Ameren reading is available.' }).waitFor();
      await dialog.screenshot({ path: out + '/bagnell-regenerate-' + width + '.png' });
      await dialog.getByRole('button', { name: 'Regenerate draft' }).click();
      await measured.getByText('Rendering', { exact: true }).waitFor();
      assert.deepEqual(sends, ['instagram', 'tiktok']);

      for (const placement of ['reel', 'story']) {
        posts.push({ id: 'fb-' + placement, platform: 'facebook', post_type: 'section_guide', status: 'review',
          media_type: 'video', video_url: origin + '/fixture-video.mp4', caption: 'Current River',
          created_at: '2026-11-18T16:00:00Z', render_request: { compositionId: 'social-route-portrait', inputProps: { placement } } });
      }
      await page.getByRole('button', { name: 'Refresh posts' }).click();
      const storyRow = table.getByRole('row').filter({ hasText: 'Facebook Story' });
      await storyRow.getByRole('button', { name: 'Review draft' }).click();
      await dialog.getByRole('button', { name: 'Schedule for later' }).click();
      await dialog.getByLabel('Send at (Central)', { exact: false }).fill('2027-01-16T09:30');
      await dialog.getByRole('button', { name: 'Approve & schedule' }).click();
      await storyRow.getByText('Scheduled', { exact: true }).waitFor();
      assert.deepEqual(sends, ['instagram', 'tiktok']);
      await nav.getByRole('button', { name: 'Planner' }).click();
      await page.getByRole('region', { name: 'Scheduled one-time posts' }).getByText(/Facebook Story/).waitFor();
      await page.getByRole('button', { name: 'Open queue' }).click();
      await storyRow.getByRole('button', { name: 'Return to review' }).click();
      await storyRow.getByRole('button', { name: 'Review draft' }).click();
      await dialog.getByText('Story preview').waitFor();
      await dialog.getByRole('button', { name: 'Approve & send' }).click();
      await storyRow.waitFor({ state: 'hidden' });
      assert.deepEqual(sends, ['instagram', 'tiktok', 'fb-story']);
      assert.equal(posts.find(row => row.id === 'fb-reel').status, 'review');

      await nav.getByRole('button', { name: 'Library' }).click();
      await page.getByRole('button', { name: 'Use in post' }).click();
      assert.equal(await page.getByLabel('Content snippet').inputValue(), 'tip');
      await nav.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('switch', { name: 'Automatic social posting' }).waitFor();
      await page.getByRole('button', { name: 'Create post', exact: true }).click();
      await editor.getByRole('combobox', { name: 'Post type' }).selectOption('custom');
      await page.getByLabel('Caption', { exact: true }).fill('Launch photos');
      await editor.getByRole('checkbox', { name: 'Instagram', exact: true }).uncheck();
      await editor.getByRole('button', { name: 'Save draft' }).click();
      await table.getByText('Launch photos').waitFor();
      await page.goBack();
      await editor.waitFor();
      await page.goForward();
      await table.getByText('Launch photos').waitFor();
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  }
}
