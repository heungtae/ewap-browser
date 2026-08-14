import assert from 'node:assert/strict';
import { buildAccessibilityFingerprint } from '../../src/chrome/src/company/page-profile/page-fingerprint.js';
import { PageProfileResolver, validatePageProfile } from '../../src/chrome/src/company/page-profile/page-profile-resolver.js';
import { ManagedPageProfileClient } from '../../src/chrome/src/company/page-profile/managed-page-profile-client.js';

const fingerprint = buildAccessibilityFingerprint({
  pageUrl: 'https://eda.company.net/equipment/7',
  elements: [{ role: 'textbox', name: 'Password', ref_id: 'ax-3', value: 'never-send' }, { role: 'button', name: 'Save', ref_id: 'ax-4' }],
});
assert.equal(fingerprint.origin, 'https://eda.company.net');
assert.equal(JSON.stringify(fingerprint).includes('never-send'), false);
assert.equal(JSON.stringify(fingerprint).includes('ax-3'), false);
assert.deepEqual(validatePageProfile({ id: 'equipment-edit', origin: fingerprint.origin, allowedTools: ['set_field', 'execute_js'], authoritativeFields: ['equipment.status'] }, fingerprint).allowedTools, ['set_field']);
const resolver = new PageProfileResolver({ client: { resolve: async () => ({ id: 'equipment-edit', origin: fingerprint.origin, allowedTools: ['set_field'] }) } });
assert.equal((await resolver.resolve(fingerprint)).status, 'resolved');
assert.equal((await new PageProfileResolver().resolve(fingerprint)).status, 'unknown');
assert.equal(await new ManagedPageProfileClient({ endpoint: 'https://outside.example/profile', fetchImpl: async () => { throw new Error('must not fetch'); } }).resolve(fingerprint), null);
console.log('company page profile tests passed');
