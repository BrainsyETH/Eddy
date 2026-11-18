// The admin and provider responses are local fixtures. Sending never leaves the test.
import assert from 'node:assert/strict';

export async function checkSocialReview(browser, origin, out) {
  for (const width of [1600, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const posts = ['instagram', 'tiktok'].map(platform => ({
      id: platform, post_type: 'manual', media_type: 'video', platform, status: 'review',
      caption: 'Table Rock Dam · November 18\nScheduled generation: Noon–8 PM.',
      video_url: origin + '/fixture-video.mp4', render_request: { compositionId: 'social-dam-schedule' },
      created_at: '2026-11-18T16:00:00Z',
    }));
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
        if (path.endsWith('/config')) return route.fulfill({ json: { id: 'fixture', disabled_rivers: [], highlight_conditions: [], river_schedules: {}, media_schedule: {} } });
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
    } finally {
      await context.close();
    }
  }
}
