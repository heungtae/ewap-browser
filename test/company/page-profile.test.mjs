import assert from 'node:assert/strict';
import { buildAccessibilityFingerprint } from '../../src/chrome/src/company/page-profile/page-fingerprint.js';
import { readFile } from 'node:fs/promises';
import { PageProfileResolver, validatePageProfile } from '../../src/chrome/src/company/page-profile/page-profile-resolver.js';
import { ManagedPageProfileClient } from '../../src/chrome/src/company/page-profile/managed-page-profile-client.js';
import { AuthoritativeBindingClient, resolveAuthoritativeField } from '../../src/chrome/src/company/page-profile/authoritative-binding.js';

const fingerprint = buildAccessibilityFingerprint({
  pageUrl: 'https://eda.company.net/equipment/7',
  elements: [{ role: 'textbox', name: 'Password', ref_id: 'ax-3', value: 'never-send' }, { role: 'button', name: 'Save', ref_id: 'ax-4' }],
});
assert.equal(fingerprint.origin, 'https://eda.company.net');
assert.equal(JSON.stringify(fingerprint).includes('never-send'), false);
assert.equal(JSON.stringify(fingerprint).includes('ax-3'), false);
assert.deepEqual(validatePageProfile({ version: 1, id: 'equipment-edit', origin: fingerprint.origin, allowedTools: ['set_field', 'execute_js'], authoritativeFields: ['equipment.status'] }, fingerprint).allowedTools, ['set_field']);
assert.equal(validatePageProfile({ id: 'old-profile', origin: fingerprint.origin, allowedTools: [] }, fingerprint), null);
const resolver = new PageProfileResolver({ client: { resolve: async () => ({ version: 1, id: 'equipment-edit', origin: fingerprint.origin, allowedTools: ['set_field'] }) } });
assert.equal((await resolver.resolve(fingerprint)).status, 'resolved');
assert.equal((await new PageProfileResolver().resolve(fingerprint)).status, 'unknown');
let calls = 0;
const cachedResolver = new PageProfileResolver({ client: { resolve: async () => ({ version: 1, id: `profile-${++calls}`, origin: fingerprint.origin, allowedTools: ['set_field'] }) } });
await cachedResolver.resolve(fingerprint);
await cachedResolver.resolve(fingerprint);
assert.equal(calls, 1);
cachedResolver.revokeOrigin(fingerprint.origin);
await cachedResolver.resolve(fingerprint);
assert.equal(calls, 2);
assert.equal(await new ManagedPageProfileClient({ endpoint: 'https://outside.example/profile', fetchImpl: async () => { throw new Error('must not fetch'); } }).resolve(fingerprint), null);
const profile = { id: 'equipment-edit', authoritativeFields: ['equipment.status'] };
assert.equal((await resolveAuthoritativeField({ profile, field: 'equipment.status', client: new AuthoritativeBindingClient() })).code, 'AUTHORITATIVE_BINDING_UNAVAILABLE');
assert.equal((await resolveAuthoritativeField({ profile, field: 'equipment.owner', client: new AuthoritativeBindingClient() })).code, 'AUTHORITATIVE_FIELD_NOT_DECLARED');
const content = await readFile(new URL('../../src/chrome/src/content/content.js', import.meta.url), 'utf8');
assert.match(content, /get_company_accessibility_fingerprint/);
assert.match(content, /Object\.values\(window\.__wbElementMap/);
assert.match(content, /getAttribute\?\.\('aria-label'\)/);
console.log('company page profile tests passed');
