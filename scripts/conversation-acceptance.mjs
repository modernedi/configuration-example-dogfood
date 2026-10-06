// Temporary, synthetic-only release acceptance. Normal plan/apply still uses
// ci.mjs and its protected approval gate. Expected API rejections are test passes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModernEdiClient, ConfigurationVerificationResponseToJSON } from '@modernedi/sdk';
import { loadConfigurationBundleDirectory, planConfiguration, verifyReviewedConfiguration } from '@modernedi/configuration-runner';
import { assertTarget } from './assert-dogfood-target.mjs';
import { verificationRequestId } from './ci.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async name => JSON.parse(await readFile(name, 'utf8'));
const suites = ['supplier-order-fulfillment', 'supplier-partial-fulfillment', 'motor-carrier-shipment'];

export function assertVerification(report, expectedStatus = 'PASSED') {
  const run = report.run;
  assert.equal(run.status, expectedStatus);
  assert.equal(run.freshness, 'CURRENT');
  assert.equal(run.appliedOperationId, null);
  assert.equal(run.cases.length, run.identity.caseCount);
  assert.equal(run.identity.mappings.length, 4);
  assert.equal(run.identity.untestedMappingCount, 0);
  assert.equal(run.identity.untestedScenarioBindingCount, 0);
  assert.equal(run.identity.scenarioBindings.length, 1);
  assert.equal(run.identity.scenarioBindings[0].caseCount, 4);
  const conversations = run.cases.filter(c => c.scenarioBindingResourceKey);
  assert.equal(conversations.length, 4, 'SDK must preserve every conversation result');
  assert.ok(conversations.every(c => c.mode === 'OFFLINE'));
  assert.ok(run.cases.filter(c => c.mappingResourceKey).every(c => c.status === 'PASSED'));
  if (expectedStatus === 'PASSED') assert.ok(conversations.every(c => c.status === 'PASSED'));
  else {
    const failed = conversations.filter(c => c.status === 'FAILED');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].id, 'full-order-with-855');
    assert.equal(failed[0].actualOutcome, 'PASSED');
    assert.equal(failed[0].diagnosticCode, 'EXPECTED_RESULT_MISMATCH');
  }
}

export async function expectRejection(api, request, expectedCode) {
  let accepted;
  try {
    accepted = await api.applyIntegrationConfiguration(request);
  } catch (error) {
    assert.equal(error.status, 412, 'Expected a semantic rejection, not an unrelated failure');
    assert.equal(error.code, expectedCode);
    return { status: error.status, code: error.code, requestId: error.requestId };
  }
  assert.fail(`Unexpected apply accepted: ${accepted.operation?.operationId ?? 'unknown operation'}. Stop and inspect before any retry.`);
}

async function main(mode, artifactDirectory) {
  assert.ok(['plan', 'rejections'].includes(mode));
  assert.equal(process.env.GITHUB_REPOSITORY, 'modernedi/configuration-example-dogfood');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  assert.equal(process.env.GITHUB_REF_PROTECTED, 'true');
  assert.match(process.env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
  assert.match(process.env.GITHUB_RUN_ID ?? '', /^\d+$/);
  const scope = await read(path.join(root, 'DOGFOOD.json'));
  assert.equal(scope.workspaceId, 46);
  await assertTarget(mode === 'plan' ? 'plan' : 'apply', scope, { key: process.env.MODERNEDI_API_KEY });
  const deadline = AbortSignal.timeout(8 * 60_000);
  const client = new ModernEdiClient({ apiKey: process.env.MODERNEDI_API_KEY,
    baseUrl: 'https://api.modernedi.com',
    fetch: (url, init) => {
      assert.equal(new URL(url).origin, 'https://api.modernedi.com');
      const signals = [deadline, AbortSignal.timeout(60_000), ...(init?.signal ? [init.signal] : [])];
      return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.any(signals) });
    },
  });
  const artifacts = path.resolve(artifactDirectory);
  const save = (name, value) => writeFile(path.join(artifacts, name), JSON.stringify(value, null, 2) + '\n');
  const load = async suite => (await loadConfigurationBundleDirectory(path.join(root, 'acceptance-fixtures', suite))).request;
  const reviewed = await read(path.join(artifacts, 'plan.json'));
  assert.deepEqual(reviewed.plan.operations.map(op => `${op.kind}:${op.action}`).sort(),
    ['Mapping:CREATE', 'Mapping:CREATE', 'Mapping:UPDATE', 'Mapping:UPDATE', 'ScenarioBinding:CREATE', 'ScenarioDefinition:CREATE'].sort(),
    'Only the reviewed four mapping and two scenario changes may be applied; partner and AS2 settings stay untouched');
  const positive = await read(path.join(artifacts, 'verification.json'));
  assertVerification(positive);
  assert.equal(positive.run.identity.planSha256, reviewed.planSha256);
  const baseline = await loadConfigurationBundleDirectory(path.join(root, 'modernedi'));
  const baselinePlan = await planConfiguration(client, baseline.request);
  assert.equal(baselinePlan.plan.operations.length, 0, 'Original configuration must match the untouched workspace');
  assert.equal(baselinePlan.plan.currentSnapshotEtag, reviewed.plan.currentSnapshotEtag);
  const failedRequest = await load('expected-failure');
  const failedPlan = await planConfiguration(client, failedRequest);
  if (mode === 'plan') await save('expected-failure-plan.json', failedPlan);
  assert.equal(failedPlan.plan.applicable, true, 'The negative-test fixture must be a valid configuration; inspect expected-failure-plan.json');
  assert.equal(failedPlan.plan.currentSnapshotEtag, reviewed.plan.currentSnapshotEtag);

  if (mode === 'plan') {
    await save('baseline-plan.json', baselinePlan);
    for (const suite of suites.slice(1)) {
      const request = await load(suite);
      const plan = await planConfiguration(client, request);
      assert.equal(plan.plan.currentSnapshotEtag, reviewed.plan.currentSnapshotEtag);
      await save(`${suite}-plan.json`, plan);
      const report = await verifyReviewedConfiguration({ client, request, reviewedPlan: plan,
        requestId: verificationRequestId(`${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_SHA}:${suite}`) });
      await save(`${suite}-verification.json`, ConfigurationVerificationResponseToJSON(report));
      assertVerification(report);
      console.log(`${suite}: ${report.run.cases.length} mapping/conversation cases passed; no apply or EDI.`);
    }
    const report = await verifyReviewedConfiguration({ client, request: failedRequest, reviewedPlan: failedPlan,
      requestId: verificationRequestId(`${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_SHA}:expected-failure`) });
    await save('expected-failure-verification.json', ConfigurationVerificationResponseToJSON(report));
    assertVerification(report, 'FAILED');
    console.log('Deliberately incorrect conversation expectation was detected; this is a successful negative check.');
  } else {
    const failed = await read(path.join(artifacts, 'expected-failure-verification.json'));
    assertVerification(failed, 'FAILED');
    assert.equal(failed.run.identity.planSha256, failedPlan.planSha256);
    const results = [];
    for (const [name, runId, code] of [
      ['failed-result', failed.run.runId, 'verification_not_current_pass'],
      ['mismatched-result', positive.run.runId, 'verification_plan_mismatch'],
    ]) {
      const result = await expectRejection(client.configurationAsCode, {
        idempotencyKey: `conversation-acceptance:${process.env.GITHUB_RUN_ID}:${name}`,
        ifMatch: failedPlan.plan.currentSnapshotEtag,
        configurationApplyRequest: { files: failedRequest.files, planSha256: failedPlan.planSha256, verificationRunId: runId },
      }, code);
      results.push({ name, ...result });
      await save('expected-rejections.json', results);
    }
    const unchanged = await planConfiguration(client, baseline.request);
    assert.equal(unchanged.plan.currentSnapshotEtag, baselinePlan.plan.currentSnapshotEtag);
    assert.equal(unchanged.plan.operations.length, 0);
    console.log('Failed and mismatched evidence rejected with HTTP 412; original configuration remains unchanged.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(...process.argv.slice(2)).catch(error => {
    console.error(`${error.name}: ${error.code ?? ''} ${error.message}`);
    process.exitCode = 1;
  });
}
