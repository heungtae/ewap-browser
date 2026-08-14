import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agent = await readFile(new URL('../../src/chrome/src/agent/agent.js', import.meta.url), 'utf8');
const background = await readFile(new URL('../../src/chrome/src/background.js', import.meta.url), 'utf8');
assert.match(agent, /async stopCompanyRun\(tabId\)/);
assert.match(agent, /cdpClient\.detach\(tabId\)/);
assert.match(agent, /cdpClient\.disableDevDiagnostics\(tabId\)/);
assert.match(background, /await agent\.stopCompanyRun\(tabId\)/);
assert.match(background, /agent\.revokeCompanyPageProfile\(tabId\)/);
assert.match(agent, /revokeCompanyPageProfile\(tabId\)/);
console.log('company lifecycle contract tests passed');
