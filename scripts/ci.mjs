// A thin CI adapter: all planning, verification, drift checks and apply behavior
// belong to the published provider-neutral runner, not this example.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runner = path.join(root, 'node_modules/@modernedi/configuration-runner/dist/main.js');

export function verificationRequestId(identity) {
  const hash = createHash('sha256').update(identity).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function runCi(mode, bundle, artifacts, { env = process.env, run, read = readFileSync } = {}) {
  assert.ok(['plan', 'apply'].includes(mode), 'Expected plan or apply');
  assert.match(env.MODERNEDI_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/, 'An exact source commit is required');
  assert.match(env.GITHUB_REPOSITORY_ID ?? '', /^\d+$/);
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/);
  assert.ok(env.MODERNEDI_API_KEY, 'Missing scoped Integration API key');
  const identity = `${env.GITHUB_REPOSITORY_ID}:${env.GITHUB_RUN_ID}:${env.MODERNEDI_SOURCE_SHA}`;
  const invoke = run ?? ((args) => {
    const result = spawnSync(process.execPath, [runner, ...args], {
      stdio: 'inherit', env: { ...env, MODERNEDI_API_URL: 'https://api.modernedi.com',
        MODERNEDI_APP_URL: 'https://app.modernedi.com', MODERNEDI_IDEMPOTENCY_KEY: `github:${identity}` },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Configuration runner exited ${result.status}; inspect the retained artifacts before retrying.`);
  });
  mkdirSync(artifacts, { recursive: true });
  const plan = path.join(artifacts, 'plan.json');
  const verification = path.join(artifacts, 'verification.json');
  const testCases = env.MODERNEDI_VERIFY_CASES === 'true';
  if (mode === 'plan') {
    invoke(['plan', '--bundle', bundle, '--plan-out', plan]);
    if (testCases) invoke(['verify', '--bundle', bundle, '--reviewed-plan', plan,
      '--request-id', verificationRequestId(identity), '--result-out', verification]);
  } else {
    const args = ['apply-reviewed', '--bundle', bundle, '--reviewed-plan', plan,
      '--result-out', path.join(artifacts, 'result.json'), '--timeout-seconds', '900'];
    if (testCases) {
      const report = JSON.parse(read(verification, 'utf8'));
      assert.equal(report.run?.status, 'PASSED', 'Saved cases did not pass');
      assert.equal(report.run?.freshness, 'CURRENT', 'Saved-case evidence is not current');
      assert.match(report.run?.runId ?? '', /^verify-[a-f0-9-]{36}$/);
      args.push('--verification-run-id', report.run.runId);
    }
    invoke(args);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, bundle, artifacts] = process.argv.slice(2);
  assert.ok(bundle && artifacts, 'Usage: node scripts/ci.mjs plan|apply <bundle> <artifacts>');
  runCi(mode, path.resolve(bundle), path.resolve(artifacts));
}
