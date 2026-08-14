import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const panel = await readFile(new URL('../../src/chrome/src/ui/company-panel.js', import.meta.url), 'utf8');
const sidepanel = await readFile(new URL('../../src/chrome/src/ui/sidepanel.html', import.meta.url), 'utf8');
assert.match(panel, /get_company_panel_state/);
assert.match(panel, /approve_company_confirmation/);
assert.match(panel, /company_stop/);
assert.match(panel, /Redacted audit timeline/);
assert.doesNotMatch(panel, /args|pageText|typedValue/);
assert.doesNotMatch(sidepanel, /id="btn-mode-dev"/);
console.log('company control panel contract tests passed');
