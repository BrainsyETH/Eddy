// Called by workspace-smoke.mjs. All admin requests are local fixtures.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function checkModelTests(browser, origin, out) {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const models = [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol' },
    ].map((model) => ({
      ...model, provider: model.id.startsWith('claude') ? 'Anthropic' : 'OpenAI',
      approved: model.id.startsWith('claude'), configured: true, envVar: 'FIXTURE_KEY',
      maxTokens: 1000, thinkingDisabled: true, promptCache: 'off',
    }));
    let productionId = 'claude-sonnet-5';
    const sampleId = '11111111-1111-4111-8111-111111111111';
    const written = { summaryText: 'Good at Van Buren.', eddyRead: 'Lower river.', quoteText: 'Good at Van Buren, below the optimal range.' };
    const sample = {
      id: sampleId, createdAt: '2026-11-17T12:00:00Z', riverSlug: 'current', riverName: 'Current River',
      sectionSlug: null, sectionName: null, conditionCode: 'good', conditionLabel: 'Good',
      outcome: 'model', reason: null, modelUsed: productionId, modelLabel: 'Claude Sonnet 5',
      published: written, systemPromptChanged: false,
    };
    const settings = () => ({ workloads: [{
      workload: 'river_update', label: 'River updates', description: 'River and section reports',
      effectiveModel: productionId, effectiveLabel: models.find((m) => m.id === productionId).label,
      stored: productionId, source: 'override', rejected: null, defaultModel: models[0].id,
      defaultLabel: models[0].label, fallbackLabel: null, options: models.filter((m) => m.approved),
    }] });
    // Gauge Reads: their own recorded mornings, model list and baseline.
    const gaugeSampleId = '22222222-2222-4222-8222-222222222222';
    const gaugeWritten = { summaryText: 'Floatable at Akers.', eddyRead: 'The pools hold.', quoteText: 'Akers is at 157 cfs.' };
    const gaugeSample = {
      id: gaugeSampleId, createdAt: '2026-11-19T17:10:00Z', workload: 'gauge_update', riverSlug: 'current', riverName: 'Current River',
      sectionSlug: null, sectionName: null, gaugeName: 'Current River above Akers, MO', conditionCode: 'good', conditionLabel: 'Good',
      outcome: 'model', reason: null, modelUsed: 'claude-haiku-4-5-20251001', modelLabel: 'Claude Haiku 4.5',
      published: gaugeWritten, systemPromptChanged: true,
    };
    const gaugeModels = models.filter((m) => m.id !== 'claude-sonnet-4-6');
    const gaugeCalls = [];
    const listed = [];
    const calls = [];
    let failHaiku = true;
    await context.route('**/api/admin/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const reply = (body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      if (path === '/api/admin/session') return reply({
        authenticated: true, identity: { id: null, name: 'Owner recovery', role: 'owner', legacy: true },
      });
      if (path === '/api/admin/stats') return reply({ stats: {} });
      if (path === '/api/admin/ai-models') {
        if (request.method() === 'POST') productionId = request.postDataJSON().river_update ?? models[0].id;
        return reply(settings());
      }
      if (path === '/api/admin/ai-models/test') {
        if (request.method() === 'GET') {
          const workload = new URL(request.url()).searchParams.get('workload');
          listed.push(workload);
          if (workload === 'gauge_update') return reply({
            workload, models: gaugeModels, baseline: gaugeModels.find((m) => m.id === 'claude-haiku-4-5-20251001'), samples: [gaugeSample],
          });
          return reply({ workload: 'river_update', models, baseline: models.find((m) => m.id === productionId), samples: [{ ...sample, workload: 'river_update' }] });
        }
        const { model, sampleId: requestedSample } = request.postDataJSON();
        if (requestedSample === gaugeSampleId) {
          gaugeCalls.push(model);
          return reply({
            model: { ...gaugeModels.find((m) => m.id === model), reasoningEffort: null }, sample: gaugeSample,
            ok: true, verdict: 'passed', written: gaugeWritten,
            rawText: '[SUMMARY]\nFloatable at Akers.\n[EDDY_READ]\nThe pools hold.\n[FULL]\nAkers is at 157 cfs.',
            latencyMs: 600, estimatedCostUsd: 0.0005,
          });
        }
        assert.equal(requestedSample, sampleId);
        calls.push(model);
        const failed = model === 'claude-haiku-4-5-20251001' && failHaiku;
        if (failed) failHaiku = false;
        return reply({
          model: { ...models.find((m) => m.id === model), reasoningEffort: null }, sample,
          ok: !failed, error: failed ? 'Fixture call failed.' : undefined,
          verdict: failed ? undefined : 'passed', written: failed ? null : written,
          rawText: failed ? null : '[SUMMARY]\nGood at Van Buren.\n[EDDY_READ]\nLower river.\n[FULL]\nGood at Van Buren.',
          latencyMs: 800, estimatedCostUsd: 0.001,
        });
      }
      return route.fulfill({ status: 500, body: 'Unexpected admin request' });
    });

    try {
      await page.goto(origin + '/admin/ai-models');
      const panel = page.getByRole('region', { name: 'Try a model' });
      const productionSelect = page.locator('div').filter({ has: page.getByRole('heading', { name: 'River updates', exact: true }) }).filter({ has: page.locator('select') }).last().locator('select');
      const run = async () => {
        await panel.getByRole('button', { name: 'Run test', exact: true }).click();
        await panel.getByRole('button', { name: 'Run test', exact: true }).waitFor();
      };
      const save = async (model) => {
        await productionSelect.selectOption(model);
        await page.getByRole('button', { name: 'Review changes', exact: true }).click();
        await page.getByRole('button', { name: 'Confirm', exact: true }).click();
        await page.getByText('Saved. Applies to the next generation.', { exact: true }).waitFor();
      };
      const reference = (label) => panel.getByRole('heading', { name: `${label}, re-run now`, exact: true });

      await panel.getByText(/This test also re-runs Claude Sonnet 5/).waitFor();
      await run();
      assert.deepEqual([...calls].sort(), ['claude-sonnet-5', 'gpt-6.2-sol']);
      await reference('Claude Sonnet 5').waitFor();

      // Drafts must not change the reference or spend on another baseline.
      await productionSelect.selectOption('claude-haiku-4-5-20251001');
      await run();
      assert.deepEqual(calls.slice(2), ['gpt-6.2-sol']);
      await reference('Claude Sonnet 5').waitFor();

      await save('claude-haiku-4-5-20251001');
      await panel.getByText(/This test also re-runs Claude Haiku 4.5/).waitFor();
      assert.equal(await reference('Claude Sonnet 5').count(), 0);
      await run();
      await panel.getByText(/Claude Haiku 4.5 could not be re-run: Fixture call failed/).waitFor();
      await run();
      await reference('Claude Haiku 4.5').waitFor();
      assert.equal(calls.filter((model) => model === 'claude-haiku-4-5-20251001').length, 2);

      // Testing the production model itself must make only one call.
      await save('claude-sonnet-4-6');
      await panel.getByLabel('Model', { exact: true }).selectOption('claude-sonnet-4-6');
      const before = calls.length;
      await run();
      assert.deepEqual(calls.slice(before), ['claude-sonnet-4-6']);
      await reference('Claude Sonnet 4.6').waitFor();

      // Returning to a previous production choice reuses its retained reference.
      await save('claude-sonnet-5');
      await reference('Claude Sonnet 5').waitFor();
      assert.equal(calls.length, before + 1);
      const downloadPromise = page.waitForEvent('download');
      await panel.getByRole('button', { name: 'Export results', exact: true }).click();
      const download = await downloadPromise;
      const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
      const report = exported.reports[0];
      assert.equal(report.baseline.model.id, 'claude-sonnet-5');
      assert.deepEqual(report.baselines.map((r) => r.model.id).sort(), models.filter((m) => m.approved).map((m) => m.id).sort());
      assert.equal(report.runs.length, 5);
      assert.deepEqual(report.baselineErrors, {});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByText('Saved. Applies to the next generation.', { exact: true }).waitFor({ state: 'hidden' });
      // Capture from the top so the sticky admin header is not painted across
      // the middle of a tall element screenshot on phones.
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => window.scrollY === 0);
      await page.screenshot({ path: `${out}/ai-models-${width}.png`, fullPage: true, style: 'nextjs-portal { display: none; }' });
      await panel.getByRole('button', { name: 'Clear this report', exact: true }).click();
      await panel.getByText(/This test also re-runs Claude Sonnet 5/).waitFor();
      assert.equal(await panel.getByRole('button', { name: 'Export results', exact: true }).count(), 0);

      // Gauge Reads: the switch lists that workload's mornings and models, and
      // a run is judged against the gauge workload's own current model.
      const kinds = panel.getByRole('group', { name: 'Kind of Read' });
      const river = kinds.getByRole('button', { name: 'River Reads', exact: true });
      const gaugeKind = kinds.getByRole('button', { name: 'Gauge Reads', exact: true });
      assert.equal(await river.getAttribute('aria-pressed'), 'true');
      await gaugeKind.click();
      const reportPicker = panel.getByLabel('Report', { exact: true });
      await reportPicker.locator('option', { hasText: 'Current River above Akers, MO · Good' }).waitFor({ state: 'attached' });
      assert.equal(await gaugeKind.getAttribute('aria-pressed'), 'true');
      assert.equal(await reportPicker.locator('option').count(), 1);
      // The river workload's Sonnet 4.6 is not offered for gauge Reads here.
      assert.deepEqual(
        await panel.getByLabel('Model', { exact: true }).locator('option').evaluateAll((options) => options.map((o) => o.value)),
        gaugeModels.map((m) => m.id),
      );
      await panel.getByText(/This test also re-runs Claude Haiku 4.5/).waitFor();
      await run();
      assert.deepEqual([...gaugeCalls].sort(), ['claude-haiku-4-5-20251001', 'gpt-6.2-sol']);
      await reference('Claude Haiku 4.5').waitFor();
      await panel.getByText('Floatable at Akers.', { exact: true }).first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const box = await gaugeKind.boundingBox();
      // admin.css gives every workspace button a 40px minimum.
      assert.ok(box && box.height >= 40, 'the Read switch keeps the workspace button height');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => window.scrollY === 0);
      await page.screenshot({ path: `${out}/ai-models-gauge-${width}.png`, fullPage: true, style: 'nextjs-portal { display: none; }' });
      // The export names the gauge report after the list has moved back.
      await river.click();
      await reportPicker.locator('option', { hasText: 'Current River · Good' }).waitFor({ state: 'attached' });
      const gaugeDownload = page.waitForEvent('download');
      await panel.getByRole('button', { name: 'Export results', exact: true }).click();
      const gaugeExport = JSON.parse(await readFile(await (await gaugeDownload).path(), 'utf8'));
      assert.equal(gaugeExport.reports.length, 1);
      assert.equal(gaugeExport.reports[0].workload, 'gauge_update');
      assert.equal(gaugeExport.reports[0].gauge, 'Current River above Akers, MO');
      assert.deepEqual(listed.slice(-2), ['gauge_update', 'river_update']);
      assert.deepEqual(errors, []);
    } catch (error) {
      await page.screenshot({ path: `${out}/ai-models-${width}-failure.png`, fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
  console.log('AI model panel: saved baseline, draft isolation, retries, retained references, gauge Reads, export and responsive layout passed');
}
