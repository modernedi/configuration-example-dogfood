import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadConfigurationBundleDirectory } from '@modernedi/configuration-runner';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));

export async function checkBundle(directory = path.join(root, 'modernedi')) {
  // Reuse the published runner's containment, certificate, and canonical-hash rules.
  // This is offline structural validation; ModernEDI's plan/verify is authoritative.
  const bundle = await loadConfigurationBundleDirectory(directory);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(await read('schemas/configuration-plan-request.schema.json'));
  assert.ok(validate(bundle.request), JSON.stringify(validate.errors, null, 2));
  const resources = bundle.request.files.filter(file => file.role === 'RESOURCE').map(file => file.content);
  const keys = new Set(resources.map(resource => resource.metadata.key));
  for (const resource of resources) {
    for (const key of ['partnerKey', 'as2ConnectionKey']) {
      if (resource.spec[key]) assert.ok(keys.has(resource.spec[key]), `Missing ${key}: ${resource.spec[key]}`);
    }
  }
  return bundle;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bundle = await checkBundle(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`Offline bundle check passed: ${bundle.request.files.length} files; SHA-256 ${bundle.bundleSha256}.`);
  console.log('No API calls, configuration changes, EDI sends, or scenario runs were made.');
}
