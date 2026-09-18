// Public dogfood guard. Credentials must belong only to the disposable fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function assertTarget(mode, scope, { key, fetcher = fetch } = {}) {
  assert.ok(['plan', 'apply'].includes(mode));
  assert.equal(scope.repository, 'modernedi/configuration-example-dogfood');
  assert.ok(Number.isSafeInteger(scope.workspaceId) && scope.workspaceId > 0);
  assert.ok(typeof key === 'string' && key.trim().length > 0, 'Missing scoped Integration API key');
  async function read(route) {
    let response;
    try {
      response = await fetcher(`https://api.modernedi.com/v1/configuration/${route}`, {
        redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'application/json', 'x-api-key': key },
      });
    } catch { throw new Error('Workspace identity check failed; no plan/apply was started'); }
    assert.ok(response.ok, `Workspace identity check returned HTTP ${response.status}`);
    return response.json();
  }
  const context = await read('context');
  assert.equal(context.success, true);
  assert.equal(context.workspace?.id, scope.workspaceId, 'Key belongs to a different workspace');
  const scopes = mode === 'plan' ? ['configuration:read'] : ['configuration:read', 'configuration:write'];
  assert.deepEqual([...(context.apiKey?.scopes ?? [])].sort(), scopes, 'Only the exact configuration scopes are allowed');
  assert.ok(Number.isSafeInteger(context.apiKey?.id) && context.apiKey.id > 0);
  const external = await read('external-repository');
  assert.equal(external.success, true);
  assert.equal(external.connected, false, 'Automatic Git imports must not compete with CI apply');
  return { workspaceId: scope.workspaceId, apiKeyId: context.apiKey.id, scopes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scope = JSON.parse(readFileSync(new URL('../DOGFOOD.json', import.meta.url), 'utf8'));
  assert.equal(process.env.GITHUB_REPOSITORY, scope.repository, 'This workflow is only for the controlled synthetic fixture');
  assertTarget(process.argv[2], scope, { key: process.env.MODERNEDI_API_KEY })
    .then(value => console.log(JSON.stringify(value)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
