import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../../src/chrome/manifest.json', import.meta.url), 'utf8'));
assert.deepEqual(manifest.permissions, ['sidePanel', 'activeTab', 'tabs', 'scripting', 'storage', 'debugger']);
assert.deepEqual(manifest.host_permissions, ['https://*.company.net/*']);
assert.equal(manifest.content_security_policy.extension_pages.includes('connect-src *'), false);
assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
assert.equal(JSON.stringify(manifest).includes('downloads'), false);
assert.equal(JSON.stringify(manifest).includes('alarms'), false);
assert.equal(JSON.stringify(manifest).includes('social-media-downloader'), false);
console.log('company manifest snapshot tests passed');
