// GitHub worker callback. Input is data; no command interpolation or public writes.
const {
  ADMIN_JOB_ID: id,
  SUPABASE_URL: url,
  SUPABASE_KEY: key,
  JOB_STATE: state,
  VIDEO_URL: video,
  GITHUB_REPOSITORY: repository,
  GITHUB_RUN_ID: run,
} = process.env;
if (!id) process.exit(0); // Existing scheduled callers need no admin job.
if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
  throw Error('Invalid admin job ID');
if (!['running', 'completed', 'failed', 'partial'].includes(state))
  throw Error('Invalid job state');
const output = {
  runUrl: `https://github.com/${repository}/actions/runs/${run}`,
  ...(video && /^https:\/\//.test(video) ? { videoUrl: video } : {}),
};
const res = await fetch(
  `${url}/rest/v1/admin_jobs?id=eq.${id}&state=in.(queued,running,unknown)`,
  {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      state,
      output,
      error:
        state === 'failed'
          ? 'Compilation failed. Check workflow logs.'
          : state === 'partial'
            ? 'The video was created, but the follow-up publish failed. Check workflow logs.'
            : null,
      updated_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(15000),
  },
);
if (!res.ok) throw Error(`Job update failed (${res.status})`);
const updated = await res.json();
if (!updated.length) console.warn('Job was already terminal or was not found.');
