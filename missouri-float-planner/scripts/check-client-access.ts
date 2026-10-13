import { spawnSync } from 'node:child_process';
import { CLIENT_ACCESS_SQL, parseClientAccessProblems } from './lib/client-access-contract';

const result = spawnSync('supabase', ['db', 'query', '--linked', '--output-format', 'json', CLIENT_ACCESS_SQL], { encoding: 'utf8' });
if (result.error || result.status !== 0) {
  console.error('Could not inspect client access on the linked Supabase project.');
  console.error(result.error?.message || result.stderr.trim() || result.stdout.trim());
  process.exit(1);
}
try {
  const problems = parseClientAccessProblems(JSON.parse(result.stdout));
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
  } else console.log('Client report writes and privileged RPC access match the reviewed contract.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
