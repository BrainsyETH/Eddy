// The admin and provider responses are local fixtures. Sending never leaves the test.
import assert from 'node:assert/strict';

export async function checkSocialReview(browser, origin, out) {
  for (const width of [1600, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width < 400 ? 720 : 900 } });
    const page = await context.newPage();
    const posts = ['instagram', 'tiktok'].map(platform => ({
      id: platform, post_type: 'manual', media_type: 'video', platform, status: 'review',
      caption: 'Table Rock Dam · November 18\nScheduled generation: Noon–8 PM.',
      video_url: origin + '/fixture-video.mp4', render_request: { compositionId: 'social-dam-schedule' },
      created_at: '2026-11-18T16:00:00Z',
    }));
    let config = { id: 'fixture', disabled_rivers: [], highlight_conditions: [], river_schedules: {}, media_schedule: {}, video_features: {}, section_guide: { time_cst: '17:00' } };
    const drafts = [];
    const sends = [];
    let refuse = true;
    try {
      await context.route('**/fixture-video.mp4', route => route.fulfill({ status: 204 }));
      await context.route('**/api/admin/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/session')) return route.fulfill({ json: { authenticated: true, identity: { name: 'Owner', role: 'owner' } } });
        if (path.endsWith('/posts')) return route.fulfill({ json: { posts, total: posts.length } });
        if (path.endsWith('/retry')) {
          const { id, action } = route.request().postDataJSON();
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
        if (path.endsWith('/health')) return route.fulfill({ json: { videoPipelineHealthy: true, hoursSinceLastSuccessfulVideo: 1, byPlatform: [], recentFallbackReasons: [] } });
        if (path.endsWith('/config')) {
          if (route.request().method() === 'POST') config = route.request().postDataJSON();
          return route.fulfill({ json: config });
        }
        if (path.endsWith('/quick-post')) {
          drafts.push(route.request().postDataJSON());
          return route.fulfill({ json: { rendering: 3 } });
        }
        if (path.endsWith('/tiktok/status')) return route.fulfill({ json: { configured: true, connected: true, directPost: false } });
        return route.fulfill({ json: path.endsWith('/content') ? [] : {} });
      });
      await page.goto(origin + '/admin/social');
      await page.getByRole('button', { name: 'Post History', exact: true }).click();
      const table = page.getByRole('table', { name: 'Post history' });
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
        const review = row.getByRole('button', { name: 'Review & send' });
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
        await row.getByText(post.platform === 'instagram' ? 'Published' : 'Sent to TikTok inbox', { exact: true }).waitFor();
        assert.equal(await review.count(), 0);
      }
      assert.deepEqual(sends, ['instagram', 'tiktok']);

      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const settings = page.getByRole('group', { name: 'Float Pick placement' });
      await settings.getByLabel('Instagram').selectOption('story');
      await settings.getByLabel('Facebook').selectOption('both');
      await settings.scrollIntoViewIfNeeded();
      await settings.screenshot({ path: out + '/float-pick-placement-' + width + '.png' });
      await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
      await page.getByText('Settings saved and verified').waitFor();
      assert.deepEqual(config.section_guide.placements, { instagram: 'story', facebook: 'both' });

      await page.getByRole('button', { name: 'Post History', exact: true }).click();
      await page.getByRole('button', { name: 'Quick Post', exact: true }).click();
      await page.getByLabel('Post Type').selectOption('section_guide');
      const quick = page.getByRole('group', { name: 'Float Pick placement' });
      assert.equal(await quick.getByLabel('Instagram').inputValue(), 'story');
      await quick.getByLabel('Facebook').selectOption('story');
      await page.getByRole('button', { name: 'Generate draft', exact: true }).click();
      await quick.waitFor({ state: 'hidden' });
      assert.deepEqual(drafts.at(-1).placements, { instagram: 'story', facebook: 'story' });
      assert.equal(config.section_guide.placements.facebook, 'both');

      for (const placement of ['reel', 'story']) {
        posts.push({ id: 'fb-' + placement, platform: 'facebook', post_type: 'section_guide', status: 'review',
          media_type: 'video', video_url: origin + '/fixture-video.mp4', caption: 'Current River',
          created_at: '2026-11-18T16:00:00Z', render_request: { compositionId: 'social-route-portrait', inputProps: { placement } } });
      }
      await page.getByRole('button', { name: 'Refresh post history' }).click();
      const storyRow = table.getByRole('row').filter({ hasText: 'Facebook Story' });
      await storyRow.getByRole('button', { name: 'Preview' }).click();
      await dialog.getByText('Story preview').waitFor();
      await dialog.getByRole('button', { name: 'Publish approved draft' }).click();
      await storyRow.getByText('Published', { exact: true }).waitFor();
      assert.deepEqual(sends, ['instagram', 'tiktok', 'fb-story']);
      assert.equal(posts.find(row => row.id === 'fb-reel').status, 'review');
    } finally {
      await context.close();
    }
  }
}
