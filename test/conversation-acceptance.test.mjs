import test from 'node:test';
import assert from 'node:assert/strict';
import { assertVerification, expectRejection } from '../scripts/conversation-acceptance.mjs';
import { checkBundle } from '../scripts/check.mjs';
import { fileURLToPath } from 'node:url';

const report = () => ({ run: { status: 'PASSED', freshness: 'CURRENT', appliedOperationId: null,
  identity: { caseCount: 5, mappings: [{}, {}, {}, {}], untestedMappingCount: 0,
    untestedScenarioBindingCount: 0, scenarioBindings: [{ caseCount: 4 }] },
  cases: [{ mappingResourceKey: 'mapping', status: 'PASSED' }, ...Array.from({ length: 4 }, () => ({
    scenarioBindingResourceKey: 'binding', status: 'PASSED', mode: 'OFFLINE',
  }))],
} });

test('acceptance requires every preserved conversation result', () => {
  assertVerification(report());
  const missing = report(); missing.run.cases.pop();
  assert.throws(() => assertVerification(missing));
  const failedMap = report(); failedMap.run.cases[0].status = 'FAILED';
  assert.throws(() => assertVerification(failedMap));
});
test('expected failure must be the deliberately incorrect conversation expectation', () => {
  const failed = report(); failed.run.status = 'FAILED';
  Object.assign(failed.run.cases[1], { id: 'full-order-with-855', status: 'FAILED',
    actualOutcome: 'PASSED', diagnosticCode: 'EXPECTED_RESULT_MISMATCH' });
  assertVerification(failed, 'FAILED');
  failed.run.cases[1].diagnosticCode = 'DOCUMENT_EVALUATION_FAILED';
  assert.throws(() => assertVerification(failed, 'FAILED'));
});
test('rejection assertions never treat another error or accepted apply as success', async () => {
  const denied = { applyIntegrationConfiguration: async () => { throw { status: 412, code: 'verification_plan_mismatch' }; } };
  await expectRejection(denied, {}, 'verification_plan_mismatch');
  await assert.rejects(expectRejection(denied, {}, 'verification_not_current_pass'));
  await assert.rejects(expectRejection({ applyIntegrationConfiguration: async () => ({ operation: { operationId: 'unexpected' } }) }, {}, 'verification_plan_mismatch'));
});

test('every temporary fixture uses the current portable schema and saved cases', async () => {
  for (const suite of ['supplier-order-fulfillment', 'supplier-partial-fulfillment', 'motor-carrier-shipment', 'expected-failure']) {
    const bundle = await checkBundle(fileURLToPath(new URL(`../acceptance-fixtures/${suite}/`, import.meta.url)));
    const resources = bundle.request.files.filter(file => file.role === 'RESOURCE').map(file => file.content);
    assert.equal(resources.length, 8);
    const binding = resources.find(value => value.kind === 'ScenarioBinding');
    assert.equal(binding.spec.source.spec.environment, 'test');
    assert.equal(binding.spec.source.spec.regressionCases.length, 4);
    assert.ok(resources.filter(value => value.kind === 'Mapping').every(value => value.spec.regressionCases.length > 0));
  }
});
