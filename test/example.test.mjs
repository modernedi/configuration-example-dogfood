import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';
import { checkBundle } from '../scripts/check.mjs';
import { runCi, verificationRequestId } from '../scripts/ci.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(path.join(root, name), 'utf8');
function temporary(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'modernedi-example-'));
  t.after(() => { assert.ok(directory.startsWith(path.join(os.tmpdir(), 'modernedi-example-'))); rmSync(directory, { recursive: true, force: true }); });
  return directory;
}

test('the current bundle prepares consistently through the published runner', async () => {
  const bundle = await checkBundle();
  assert.equal(bundle.bundleSha256, (await checkBundle()).bundleSha256);
  assert.ok(bundle.request.files.some(file => file.role === 'MANIFEST'));
});

test('optional conversation uses the same partner/mappings and is a valid portable bundle', async t => {
  const directory = temporary(t);
  cpSync(path.join(root, 'modernedi'), directory, { recursive: true });
  const additions = JSON.parse(read('optional/manifest-additions.json'));
  const manifest = JSON.parse(read('modernedi/modernedi.json'));
  const source = JSON.parse(read(`optional/${additions.resources.find(resource => resource.kind === 'ScenarioBinding').path}`)).spec.source.spec;
  const existingKeys = new Set(manifest.resources.map(resource => resource.key));
  const references = [...source.actors.flatMap(actor => actor.endpoint.partnerKey ? [actor.endpoint.partnerKey] : []),
    ...source.steps.map(step => step.target.mappingKey)];
  if (references.some(key => !existingKeys.has(key))) {
    t.skip('The workspace uses different resource identities; adapt the optional example before including it.');
    return;
  }
  if (additions.resources.some(resource => existingKeys.has(resource.key))) {
    t.skip('Scenario resources are already included and validated by the current-bundle check.');
    return;
  }
  for (const key of ['resources', 'files']) manifest[key].push(...additions[key]);
  for (const name of ['scenario-definitions', 'scenario-bindings']) cpSync(path.join(root, 'optional', name), path.join(directory, name), { recursive: true });
  writeFileSync(path.join(directory, 'modernedi.json'), JSON.stringify(manifest));
  const bundle = await checkBundle(directory);
  const binding = bundle.request.files.find(file => file.content?.kind === 'ScenarioBinding').content.spec.source.spec;
  const resources = bundle.request.files.filter(file => file.role === 'RESOURCE').map(file => file.content);
  const keys = new Set(resources.map(value => value.metadata.key));
  assert.equal(binding.environment, 'test');
  assert.ok(keys.has(binding.actors[0].endpoint.partnerKey));
  for (const step of binding.steps) { assert.ok(keys.has(step.target.mappingKey)); assert.equal(step.syntaxTree, undefined); }
});

test('saved schema rejects a malformed mapping and runner rejects missing inventoried files', async t => {
  const directory = temporary(t);
  cpSync(path.join(root, 'modernedi'), directory, { recursive: true });
  const file = JSON.parse(read('modernedi/modernedi.json')).resources.find(resource => resource.kind === 'Mapping')?.path;
  if (!file) { t.skip('No mappings in the current bundle.'); return; }
  const mapping = JSON.parse(read(`modernedi/${file}`));
  mapping.spec.direction = 'SIDEWAYS';
  writeFileSync(path.join(directory, file), JSON.stringify(mapping));
  await assert.rejects(checkBundle(directory));
  rmSync(path.join(directory, file));
  await assert.rejects(checkBundle(directory));
});

const env = { MODERNEDI_API_KEY: 'synthetic-key', MODERNEDI_SOURCE_SHA: 'a'.repeat(40), GITHUB_REPOSITORY_ID: '1', GITHUB_RUN_ID: '2' };
test('CI stays a thin adapter with optional server verification and exact evidence on apply', t => {
  const directory = temporary(t);
  for (const verify of [false, true]) {
    const calls = [];
    const options = { env: { ...env, MODERNEDI_VERIFY_CASES: String(verify) }, run: args => calls.push(args),
      read: () => JSON.stringify({ run: { status: 'PASSED', freshness: 'CURRENT', runId: `verify-${verificationRequestId('test')}` } }) };
    runCi('plan', 'bundle', directory, options);
    assert.deepEqual(calls.map(args => args[0]), verify ? ['plan', 'verify'] : ['plan']);
    runCi('apply', 'bundle', directory, options);
    assert.equal(calls.at(-1)[0], 'apply-reviewed');
    assert.equal(calls.at(-1).includes('--verification-run-id'), verify);
    assert.ok(calls.at(-1).includes('--reviewed-plan'));
  }
});

test('CI refuses failed evidence, missing identity/key, or failed runner execution', t => {
  const directory = temporary(t);
  assert.throws(() => runCi('apply', 'bundle', directory, { env: { ...env, MODERNEDI_VERIFY_CASES: 'true' },
    read: () => '{"run":{"status":"FAILED"}}', run: () => assert.fail('must not apply') }), /did not pass/);
  assert.throws(() => runCi('plan', 'bundle', directory, { env: { ...env, MODERNEDI_SOURCE_SHA: 'main' } }), /commit/);
  assert.throws(() => runCi('plan', 'bundle', directory, { env: { ...env, MODERNEDI_API_KEY: '' } }), /key/);
  assert.throws(() => runCi('plan', 'bundle', directory, { env, run: () => { throw new Error('runner rejected'); } }), /rejected/);
  // Exercise the REAL published CLI entrypoint without any network or credentials.
  const result = spawnSync(process.execPath, ['node_modules/@modernedi/configuration-runner/dist/main.js', 'invalid-command'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 64, result.stderr);
  assert.equal(JSON.parse(read('node_modules/@modernedi/configuration-runner/package.json')).version, '0.5.1');
});

test('verification IDs are valid and stable across retries of one source/run', () => {
  assert.match(verificationRequestId('1:2:a'), /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(verificationRequestId('1:2:a'), verificationRequestId('1:2:a'));
  assert.notEqual(verificationRequestId('1:2:a'), verificationRequestId('1:3:a'));
});

test('public CI has no credentials, while live jobs require private opt-in and protected apply', () => {
  for (const name of ['ci', 'plan', 'deploy']) {
    const source = read(`.github/workflows/${name}.yml`);
    const workflow = parse(source);
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    for (const job of Object.values(workflow.jobs)) for (const step of job.steps.filter(step => step.uses)) {
      assert.match(step.uses, /@[a-f0-9]{40}$/);
      if (step.uses.startsWith('actions/checkout')) assert.equal(step.with['persist-credentials'], false);
    }
    if (name === 'ci') assert.doesNotMatch(source, /secrets\.|MODERNEDI_API_KEY|scripts\/ci/);
    else assert.match(workflow.jobs.plan.if, /repository.private == true.*MODERNEDI_LIVE_CI/s);
  }
  const deploy = parse(read('.github/workflows/deploy.yml'));
  assert.match(deploy.jobs.plan.if, /refs\/heads\/main.*github.ref_protected/);
  assert.equal(deploy.jobs.apply.environment, 'modernedi-apply');
  assert.equal(deploy.jobs.apply.needs, 'plan');
  assert.equal(deploy.concurrency['cancel-in-progress'], false);
});

test('privileged PR workflow runs only base tools; candidate content is never executed', () => {
  const workflow = parse(read('.github/workflows/plan.yml'));
  const steps = workflow.jobs.plan.steps;
  assert.match(workflow.jobs.plan.if, /head.repo.full_name == github.repository/);
  assert.equal(steps[0].with.ref, '${{ github.event.pull_request.base.sha }}');
  const candidate = steps.find(step => step.with?.path === 'candidate');
  assert.equal(candidate.with['sparse-checkout'], 'modernedi');
  assert.equal(candidate.with.ref, '${{ github.event.pull_request.head.sha }}');
  assert.ok(steps.findIndex(step => step.run?.startsWith('npm ci')) < steps.indexOf(candidate));
  assert.deepEqual(steps.filter(step => step.run).map(step => step.run), [
    'npm ci --ignore-scripts --registry https://registry.npmjs.org/',
    'node scripts/ci.mjs plan candidate/modernedi artifacts',
  ]);
});
