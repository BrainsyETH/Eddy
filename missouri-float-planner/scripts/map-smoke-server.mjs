// Resource limits belong to this local fixture server, not next.config.mjs.
import { createServer } from 'node:http';
import next from 'next';
import configured from '../next.config.mjs';

if (process.env.EDDY_PLANNER_SMOKE !== '1') throw new Error('Fixture server requires EDDY_PLANNER_SMOKE=1');
const base = typeof configured === 'function'
  ? await configured('phase-development-server', { defaultConfig: {} }) : configured;
const port = Number(process.argv[2]);
const app = next({ dev: true, webpack: true, hostname: '127.0.0.1', port, conf: {
  ...base,
  experimental: { ...base.experimental, webpackMemoryOptimizations: true, devMemoryThresholdRestart: false },
  webpack(config, context) {
    const result = base.webpack?.(config, context) ?? config;
    result.cache = false;
    return result;
  },
} });
const handle = app.getRequestHandler();
const server = createServer((req, res) => { void handle(req, res); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close();
  void app.close().finally(() => process.exit(0));
});
await app.prepare();
server.listen(port, '127.0.0.1', () => console.log(`Map fixture ready on ${port}`));
